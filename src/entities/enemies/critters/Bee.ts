import { Object3D, Texture, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
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
import { toVector2, toVector3, vector3To2 } from "src/engine/util/vecTypes";
import { EnemyProps } from "src/api/enemy";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { ActionStack } from "src/entities/shared/ActionStack";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import {
  EnemyAggroBehavior,
  EnemyAggroEvents
} from "src/entities/shared/behaviors/EnemyAggroBehavior";
import {
  MotionPathFollowingBehavior,
  MotionPathFollowingEvents
} from "src/entities/shared/behaviors/MotionPath";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import {
  ControlProfile,
  ScriptedControlBehavior
} from "src/entities/shared/behaviors/ScriptedControlBehavior";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";
import { angleFrom0 } from "src/util/lerp";

import beeJson from "../sprites/bee/bee.json";
import beePng from "../sprites/bee/bee.png";

export type BeeProps = EntityProps & EnemyProps;

/**
 * "default" runs the bee's normal ActionStack (idle fly / attack); "path" hands
 * control to scripted motion-path following (used by cutscenes).
 */
type BeeControlMode = "default" | "path";

@addResourceLoader(new TextureResourceLoader("BeeTexture", beePng))
export class Bee extends CoreEntity implements BaseEntityType {
  static type = "Bee";
  public type = "Bee";
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public spriteObject3D = new Object3D();
  public dead = false;
  public facingRight = false;
  private sprite: ThreeAseprite;
  private deadHitGround = false;
  private attacking = false;
  private aggroEntity?: BaseEntityType;
  private recentAttackConnected = false;

  public behaviors = {
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior(),
    aggro: new EnemyAggroBehavior(),
    outOfBounds: new OutOfBoundsBehaviour(),
    motionPathFollowing: new MotionPathFollowingBehavior().setTraversalSpeed(3),
    scriptedControl: new ScriptedControlBehavior<BeeControlMode>()
  };

  private actionStack = new ActionStack(this, {
    idleFly: {
      default: true,
      run: function* (entity) {
        while (true) {
          if (entity.dead) break;
          const targetPosition = toVector3(entity.initialProps.position);
          targetPosition.x += (Math.random() - 0.5) * 8;
          targetPosition.y += (Math.random() - 0.5) * 4;
          let motionCounter = 3000;
          const toTheRight = targetPosition.x > entity.position.x;
          entity.facingRight = toTheRight;
          entity.updateSprite();
          while (motionCounter > 0) {
            motionCounter -= yield;
            if (entity.dead) break;
            if (!entity.behaviors.physics.body) return;
            const motionVect = vector3To2(
              targetPosition.clone().sub(entity.position)
            );
            const motionDist = motionVect.length();
            const motionDir = motionVect.clone().normalize();
            const currentVelRaw = entity.behaviors.physics.body.linvel();
            const mass = entity.behaviors.physics.body.mass();
            const currentVel = toVector2(currentVelRaw);
            const motionDelta = motionDir
              .clone()
              .multiplyScalar(4)
              .sub(currentVel);
            motionDelta.multiplyScalar(
              mass * Math.min(motionDist * 1, 1) * 0.05
            );
            entity.behaviors.physics.body?.applyImpulse(motionDelta, true);
          }
        }
      }
    },
    attack: {
      run: function* (entity) {
        while (true) {
          while (entity.recentAttackConnected) yield;
          if (entity.dead || !entity.aggroEntity) return;
          const targetPosition = entity.aggroEntity.position;
          const targetVector = targetPosition.clone().sub(entity.position);
          let targetDistance = targetVector.length();
          targetVector.normalize();
          const motionDelta = targetVector.clone();
          let speed = 3;
          if (targetDistance < 6) {
            speed = 6;
            entity.attacking = true;
          } else {
            targetDistance = targetDistance * 0.5;
          }
          motionDelta.multiplyScalar(speed);
          const approachTimeMs = 1000 * (targetDistance / speed);
          let attackDone = false;
          entity.scheduler.add({
            startIn: approachTimeMs,
            invokeFunctionAtComplete: () => {
              attackDone = true;
            }
          });
          while (!attackDone) {
            if (!entity.behaviors.physics.body) break;
            const currentVel = toVector2(
              entity.behaviors.physics.body.linvel()
            );
            const mass = entity.behaviors.physics.body.mass();
            const impulse = vector3To2(motionDelta)
              .sub(currentVel)
              .multiplyScalar(mass);
            entity.behaviors.physics.body.applyImpulse(impulse, true);
            yield;
            if (entity.recentAttackConnected) {
              attackDone = true;
            }
          }
          entity.attacking = false;
          yield;
        }
      }
    }
  });

  constructor(props: BeeProps) {
    super(props);

    this.object3D.add(this.spriteObject3D);
    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(Bee, "BeeTexture"),
      sourceJSON: beeJson,
      frameName: (p) => `(${p.layerName}) ${p.frame}`,
      offset: {
        x: -6,
        y: 0
      }
    });
    this.sprite.gotoTag("idle");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    this.spriteObject3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);

    this.behaviors.physics
      .init(this)
      .setGroup(enemyCollisionGroup)
      .setGravityScale(0)
      .setDamping(1.5)
      .setRotateObject3D(this.spriteObject3D)
      .setRotationLocked(false)
      .setSize(new Vector2(0.6, 1));

    this.behaviors.status.init(this).attachSprite(this.sprite).setMaxHealth(props.health ?? 10);

    this.behaviors.perception.init(this);
    this.behaviors.perception.spreadAngle = Math.PI * 0.5;

    this.behaviors.aggro.init(this);
    this.behaviors.outOfBounds.init(this);

    // Scripted motion-path following for cutscenes. Disabled by default so the
    // ActionStack drives the bee; a cutscene calls
    // `bee.behaviors.scriptedControl.followPath(provider)` to take over.
    this.behaviors.motionPathFollowing
      .init(this)
      .setTraversalDuration(Number(props.traversalDuration ?? 0));
    this.behaviors.scriptedControl
      .init(this)
      .attachMotionPathFollowing(this.behaviors.motionPathFollowing)
      .registerMode("default", ControlProfile.SelfDriven, true)
      .registerMode("path", ControlProfile.MotionPath)
      .setMode("default");

    // While scripted, drive the body toward the path point with impulses (the
    // ActionStack is suspended in step()).
    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PositionUpdate,
      ([posUpdate]) => {
        if (this.dead) return;
        const body = this.behaviors.physics.body;
        if (!body) return;
        const pos = toVector2(body.translation());
        const vel = toVector2(body.linvel());
        const desiredVelDelta = posUpdate
          .clone()
          .sub(pos)
          .clampLength(0, 1)
          .multiplyScalar(4)
          .sub(vel);
        body.applyImpulse(desiredVelDelta.multiplyScalar(body.mass()), true);
      }
    );

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.dead = true;
      this.behaviors.physics.setGravityScale(1);
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.behaviors.status.disableHealth();
      this.updateSprite();
    });

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (this.dead) {
          if (this.deadHitGround) return;
          if (isAnyTerrain(entity) && normal.y < -0.5) {
            this.deadHitGround = true;
            this.updateSprite();
            this.scheduler.add({
              startIn: 500,
              duration: 500,
              invokeFunction: (t) => {
                this.sprite.setOpacity(1 - t);
              },
              invokeFunctionAtComplete: () => {
                this.level?.removeEntity(this.id);
                this.destroy();
              }
            });
          }
        } else {
          // TODO: fix this kludge.
          if (isPlayerAPI(entity) && this.attacking) {
            entity.hit?.({
              damage: props.attack ? props.attack : 5,
              hittingEntity: this,
              sourceEntity: this
            });
            this.recentAttackConnected = true;
            this.scheduler.add({
              startIn: 1000,
              invokeFunctionAtComplete: () => {
                this.recentAttackConnected = false;
              }
            });
          }
        }
      }
    );

    this.behaviors.aggro.events.on(EnemyAggroEvents.BeginAggro, (entity) => {
      this.aggroEntity = entity;
      this.actionStack.beginAction("attack");
    });
    this.behaviors.aggro.events.on(EnemyAggroEvents.EndAggro, () => {
      this.aggroEntity = undefined;
      this.actionStack.stopAction("attack");
    });

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.deadHitGround) {
        this.sprite.playingAnimation = false;
        this.sprite.gotoTagFrame(6);
      }
    });

    this.updateSprite();
  }
  step(ms: number) {
    super.step(ms);
    // While a cutscene drives the bee via scripted motion-path following,
    // suspend the ActionStack so its idle/attack impulses don't fight the path.
    if (!this.behaviors.scriptedControl.isScripted) this.actionStack.step(ms);
    this.sprite.animate(this.sprite.getCurrentTag() === "idle" ? ms * 2 : ms);

    this.behaviors.perception.direction.x = this.facingRight ? 1 : -1;

    if (this.behaviors.physics.body) {
      const angleCorrection = this.dead ? 0.9 : 0.5;
      let angleOffset = 0;
      if (this.dead && !this.deadHitGround) {
        angleOffset = this.facingRight ? Math.PI * -0.3 : Math.PI * 0.3;
      } else {
        const linVel = this.behaviors.physics.body.linvel();
        const angularVector = new Vector2(-linVel.x, 2);
        if (this.attacking) angularVector.x *= -1;
        angleOffset = angularVector.angle() - Math.PI * 0.5;
      }
      const angle = this.behaviors.physics.body.rotation();
      const angVel = this.behaviors.physics.body.angvel();
      const desiredAngVel = angleFrom0(angle + angleOffset) * -angleCorrection;
      let angVelDelta = desiredAngVel - angVel * 0.1;
      angVelDelta = Math.max(-Math.PI, Math.min(Math.PI, angVelDelta));
      const mass = this.behaviors.physics.body.mass();
      this.behaviors.physics.body.applyTorqueImpulse(
        angVelDelta * mass * angleCorrection,
        true
      );
    }
  }
  hit(hitDetails: EntityHitDetails): void {
    super.hit(hitDetails);
    this.behaviors.physics.body?.applyImpulseAtPoint(
      hitDetails.hitImpulse ?? new Vector2(),
      hitDetails.hittingEntity.position,
      true
    );
  }
  updateSprite() {
    this.sprite.mesh.scale.x = kInvPixelScale * (this.facingRight ? 1 : -1);
    if (this.dead) {
      if (!this.deadHitGround) {
        this.sprite.playingAnimation = false;
      } else {
        this.sprite.playingAnimation = true;
        if (this.sprite.getCurrentTag() !== "die") {
          this.sprite.gotoTag("die");
        }
      }
    }
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
