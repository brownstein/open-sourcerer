import { Object3D, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import { EnemyProps } from "src/api/enemy";
import {
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import {
  enemyCollisionGroup,
  inactiveEnemyCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "src/entities/shared/behaviors/CharacterPhysics";
import {
  MotionPathFollowingBehavior,
  MotionPathFollowingEvents
} from "src/entities/shared/behaviors/MotionPath";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";

import batJson from "../sprites/bat/bat.json";
import batPng from "../sprites/bat/bat.png";

export type BatProps = EntityProps & EnemyProps;

@addResourceLoader(new TextureResourceLoader("batTexture", batPng))
export class Bat extends CoreEntity {
  static type = "Bat";
  public type = "Bat";
  public alignment = EntityAlignment.Enemy;
  public dead = false;
  public object3D = new Object3D();
  public size = {
    width: 0.8,
    height: 0.6
  };
  public behaviors = {
    motionPathFollowing: new MotionPathFollowingBehavior(),
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior().setMaxHealth(10),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private sprite = new ThreeAseprite({
    texture: getResource(Bat, "batTexture"),
    sourceJSON: batJson,
    frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
  });
  private deadHitGround = false;
  private recentAttackConnected = false;

  constructor(props: BatProps) {
    super(props);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.gotoTag("Flap");
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // Init behaviors.
    this.behaviors.physics
      .init(this)
      .setGravityScale(0)
      .setGroup(enemyCollisionGroup);
    this.behaviors.status.setMaxHealth(props.health ?? 10);
    this.behaviors.status.init(this).attachSprite(this.sprite);
    this.behaviors.outOfBounds.init(this);

    // Set up path following.
    this.behaviors.motionPathFollowing
      .init(this)
      .setTraversalSpeed(3)
      .setTraversalDuration(Number(props.traversalDuration ?? 0));

    // Set up motion to path following position.
    this.behaviors.motionPathFollowing.events.on(
      MotionPathFollowingEvents.PositionUpdate,
      ([posUpdate]) => {
        if (this.dead) return;
        const body = this.behaviors.physics.body;
        if (!body) return;
        const posRaw = body.translation();
        const pos = new Vector2(posRaw.x, posRaw.y);
        const velRaw = body.linvel();
        const vel = new Vector2(velRaw.x, velRaw.y);
        const desiredPosDelta = posUpdate.clone().sub(pos);
        const desiredVelDelta = desiredPosDelta
          .clone()
          .clampLength(0, 1)
          .multiplyScalar(4);
        desiredVelDelta.sub(vel);
        if (desiredVelDelta.x > 0) {
          this.sprite.mesh.scale.x = kInvPixelScale;
        } else {
          this.sprite.mesh.scale.x = -kInvPixelScale;
        }
        body.applyImpulse(desiredVelDelta.multiplyScalar(body.mass()), true);
      }
    );

    // Set up death animation.
    this.events.on(EntityLifecycleEvents.Die, () => {
      this.dead = true;
      this.sprite.gotoTag("Death");
      this.behaviors.motionPathFollowing.disable();
      this.behaviors.physics
        .setGravityScale(1)
        .setGroup(inactiveEnemyCollisionGroup);
    });

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.dead) {
        switch (this.sprite.getCurrentTag()) {
          case "Death":
            this.sprite.gotoTagFrame(3);
            this.sprite.playingAnimation = false;
            break;
          case "DeathLand":
            this.sprite.gotoTagFrame(2);
            this.sprite.playingAnimation = false;
            this.scheduler.add({
              id: "deathFadeOut",
              duration: 500,
              invokeFunction: (t) => {
                this.sprite.setOpacity(1 - t);
              },
              invokeFunctionAtComplete: () => {
                this.level?.removeEntity(this.id);
                this.destroy();
              }
            });
            break;
        }
      }
    });

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        // TODO fix this kludge to effect all entities with different alignment.
        if (isPlayerAPI(entity)) {
          if (this.dead) return;
          if (this.recentAttackConnected) return;
          entity.hit?.({
            damage: props.attack ? props.attack : 5,
            hittingEntity: this,
            sourceEntity: this
          });
          this.recentAttackConnected = true;
          this.scheduler.add({
            startIn: 500,
            invokeFunctionAtComplete: () => {
              this.recentAttackConnected = false;
            }
          });
          return;
        }
        if (isAnyTerrain(entity) && normal.y < -0.5) {
          if (!this.dead || this.deadHitGround) return;
          this.deadHitGround = true;
          this.sprite.gotoTag("DeathLand");
          this.sprite.playingAnimation = true;
          return;
        }
      }
    );
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.animate(this.dead ? ms : ms * 2);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
}
