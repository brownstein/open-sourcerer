import { Object3D, Texture, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { ControlEvents } from "src/api/controls";
import {
  BaseEntityType,
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { EnemyProps } from "src/api/enemy";
import { vector3To2 } from "src/engine/util/vecTypes";
import { PlayerAPI, isPlayerAPI } from "src/entities/player/PlayerAPI";
import { ActionStack } from "src/entities/shared/ActionStack";
import { CharacterGroundPhysicsControlBehaviorStandard } from "src/entities/shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "src/entities/shared/behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import {
  PerceptionBehavior,
  PerceptionEvents
} from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

import slimeJson from "../sprites/slime/slime.json";
import slimePng from "../sprites/slime/slime.png";

export type SlimeProps = EntityProps & EnemyProps;

@addResourceLoader(new TextureResourceLoader("SlimeTexture", slimePng))
export class Slime extends CoreEntity implements BaseEntityType {
  static type = "Slime";
  public type = "Slime";
  public alignment = EntityAlignment.Enemy;
  public persist = false;
  public size = {
    width: 0.8,
    height: 0.6
  };
  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, null, 3)
      .setSpeedLimits(2),
    physics: new CharacterPhysicsBehavior()
      .setGroup(enemyCollisionGroup)
      .setDensity(1),
    physicsControl: new CharacterGroundPhysicsControlBehaviorStandard(),
    pathFollowing: new NavPathFollowingBehavior().setRetries(1),
    perception: new PerceptionBehavior(),
    status: new StatusBehavior().setMaxHealth(10),
    outOfBounds: new OutOfBoundsBehaviour()
  };
  public facingRight = false;

  public object3D = new Object3D();
  public sprite = new ThreeAseprite({
    sourceJSON: slimeJson,
    texture: getResource<Texture>(Slime, "SlimeTexture"),
    frameName: ({ frame }) => `${frame}`,
    layers: [""],
    offset: new Vector2(-4, -4)
  });

  private runSpeed = 0;
  private isDead = false;
  private seesPlayer?: PlayerAPI;

  private actionStack = new ActionStack(this, {
    idlePatrol: {
      default: true,
      resume(entity) {
        entity.behaviors.motionCapabilities.setSpeedLimits(1);
        entity.behaviors.pathFollowing.setMotionCapabilities(
          entity.behaviors.motionCapabilities.capabilities
        );
      },
      run: function* (entity) {
        let counter = 0;
        let facingRight = false;
        while (true) {
          facingRight = !facingRight;
          const goal = vector3To2(entity.position);
          goal.x += facingRight ? 4 : -4;
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(goal, 0.5);
          counter += yield;
          while (counter < 3000) counter += yield;
          counter = 0;
        }
      }
    },
    chasePlayer: {
      resume(entity) {
        entity.behaviors.motionCapabilities.setSpeedLimits(2);
        entity.behaviors.pathFollowing.setMotionCapabilities(
          entity.behaviors.motionCapabilities.capabilities
        );
      },
      run: function* (entity, arg?: unknown) {
        if (!arg || !isPlayerAPI(arg as BaseEntityType)) return;
        const playerArg = arg as PlayerAPI;
        let counter = 0;
        let roundsWithoutPlayer = 0;
        while (true) {
          while (counter < 1000) counter += yield;
          counter = 0;
          if (arg !== entity.seesPlayer) {
            roundsWithoutPlayer++;
          } else {
            roundsWithoutPlayer = 0;
          }
          if (roundsWithoutPlayer > 2) return;
          const goal = vector3To2(playerArg.position);
          entity.behaviors.pathFollowing.planAndFollowPathToPosition(goal);
        }
      }
    }
  });

  constructor(props: SlimeProps) {
    super(props);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.physicsControl
      .init(this)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .attachControlEvents(this.behaviors.pathFollowing.controlEvents);
    this.behaviors.perception.init(this);
    this.behaviors.perception.direction.x = this.facingRight ? 1 : -1;
    this.behaviors.status.setMaxHealth(props.health ?? 10);
    this.behaviors.status.init(this).attachSprite(this.sprite);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.physicsControl);
    this.behaviors.pathFollowing.jumpDelay = 400;
    this.behaviors.outOfBounds.init(this);

    this.behaviors.pathFollowing.controlEvents.on(
      ControlEvents.MoveHorizontally,
      (dx) => {
        if (dx !== 0) this.facingRight = dx > 0;
        this.runSpeed = dx;
        this.behaviors.perception.direction.x = this.facingRight ? 1 : -1;
      }
    );

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.isDead = true;
      this.sprite.gotoTag("Death");
      this.sprite.playingAnimation = true;
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.behaviors.pathFollowing.disableMotion();
      this.behaviors.pathFollowing.cancelPath();
      this.behaviors.pathFollowing.controlEvents.emit(
        ControlEvents.MoveHorizontally,
        0
      );
      const onDeathComplete = () => {
        this.level?.removeEntity(this.id);
      };
      this.sprite.addEventListener(
        StandardEvents.animationComplete,
        onDeathComplete
      );
    });

    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.PerceiveEntityStart,
      (entity) => {
        if (isPlayerAPI(entity)) {
          this.seesPlayer = entity;
          this.behaviors.pathFollowing.planAndFollowPathToPosition(
            vector3To2(entity.position)
          );
          if (!this.actionStack.hasActionInStack("chasePlayer"))
            this.actionStack.beginAction("chasePlayer", entity);
        }
      }
    );
    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.PerceiveEntityEnd,
      (entity) => {
        if (!this.seesPlayer) return;
        if (entity !== this.seesPlayer?.id) return;
        this.seesPlayer = undefined;
      }
    );

    // Hit things we collide with.
    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (entity.alignment === EntityAlignment.Player) {
          const hitImpulse = normal.clone().multiplyScalar(6);
          entity.hit?.({
            hittingEntity: this,
            sourceEntity: this,
            damage: props.attack ? props.attack : 5,
            hitImpulse
          });
          hitImpulse.multiplyScalar(-1 * 0.25);
          this.behaviors.physics.body?.applyImpulse(hitImpulse, true);
        }
      }
    );

    this.events.on(EntityLifecycleEvents.Hit, (_hitDetails) => {
      if (this.isDead) return;
      const player = [...(this.level?.getEntities().values() ?? [])].find(
        isPlayerAPI
      );
      if (!player) return;
      this.seesPlayer = player;
      if (!this.actionStack.hasActionInStack("chasePlayer"))
        this.actionStack.beginAction("chasePlayer", player);
      if (Math.random() > 0.5) {
        this.sprite.gotoTag("Hurt A");
        this.sprite.playingAnimation = true;
      } else {
        this.sprite.gotoTag("Hurt B");
        this.sprite.playingAnimation = true;
      }
    });

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      switch (this.sprite.getCurrentTag()) {
        case "Hurt A":
        case "Hurt B":
          this.sprite.gotoTag("Idle");
          break;
        default:
          break;
      }
    });
  }
  step(ms: number) {
    super.step(ms);
    this.actionStack.step(ms);
    this.syncSprite();
    this.sprite.animate(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  syncSprite() {
    if (this.isDead) return;

    const xScale = this.facingRight ? 1 : -1;
    this.sprite.mesh.scale.x = xScale * kInvPixelScale;
    const moving = Math.abs(this.runSpeed) > 0;
    const inTheAir = this.behaviors.physicsControl.inTheAir;
    const inTheWater = this.behaviors.physics.isInWater();
    const jumping = this.behaviors.pathFollowing.inJumpDelay;
    const jumpPastApex = this.behaviors.physicsControl.jumpPastApex;

    if (jumping && !inTheWater) {
      if (this.sprite.getCurrentTag() !== "Jump Ground") {
        this.sprite.gotoTag("Jump Ground");
        this.sprite.playingAnimation = true;
      }
      if (this.sprite.getCurrentTagFrame() ?? 0 > 4) {
        this.sprite.gotoFrame(4);
        this.sprite.playingAnimation = false;
      }
      return;
    }

    if (inTheAir && !inTheWater) {
      if (this.sprite.getCurrentTag() !== "Jump Ground") {
        this.sprite.gotoTag("Jump Ground");
      }
      if (jumpPastApex) {
        this.sprite.gotoTagFrame(5);
      } else {
        this.sprite.gotoTagFrame(4);
      }
      this.sprite.playingAnimation = false;
      return;
    }

    // If dead, die. This fixes a bug where we die during a jump.
    if (this.isDead && this.sprite.getCurrentTag() !== "Death") {
      this.sprite.gotoTag("Death");
      this.sprite.playingAnimation = true;
    }

    switch (this.sprite.getCurrentTag()) {
      case "Hurt A":
      case "Hurt B":
        return;
      default:
        break;
    }

    if (moving) {
      this.sprite.gotoTag("Walk");
      this.sprite.playingAnimation = true;
      return;
    }

    this.sprite.gotoTag("Idle");
    this.sprite.playingAnimation = true;
  }
}
