import { Object3D, Texture, Vector2 } from "three";
import { StandardEvents, ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  ElementalType,
  EntityAlignment,
  EntityHitDetails,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { kWorldGravity } from "src/engine/level/Level";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { toVector2, toVector3, vector3To2 } from "src/engine/util/vecTypes";
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
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import {
  ProjectilePhysicsBehavior,
  ProjectilePhysicsEvents
} from "src/entities/shared/behaviors/ProjectilePhysics";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { Fireball } from "src/entities/spells/projectiles/Fireball";

import flyingShooterJson from "../sprites/flying-shooter/flying-shooter.json";
import flyingShooterPng from "../sprites/flying-shooter/flying-shooter.png";

//TODO Move this to its own shader

export type FlyingShooterProps = EntityProps & EnemyProps;

@addResourceLoader(
  new TextureResourceLoader("flyingShooterTexture", flyingShooterPng)
)
export class FlyingShooter extends CoreEntity {
  static type = "FlyingShooter";
  public type = "FlyingShooter";
  public dead = false;
  public facingRight = false;
  public object3D = new Object3D(); //For the entire object including the healthbar
  public size = { width: 1.5, height: 1.0 }; //Debug collision box
  public projectileSpeed = 15;
  public projectileDamage = 2;
  public alignment = EntityAlignment.Enemy;
  public behaviors = {
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior(),
    perception: new PerceptionBehavior(),
    aggro: new EnemyAggroBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private deadHitGround = false;
  private attacking = false;
  private recentAttackConnected = false;
  private sprite: ThreeAseprite;
  private aggroEntity?: BaseEntityType;
  private approaching: boolean = true;

  private actionStack = new ActionStack(this, {
    idleFly: {
      default: true,
      run: function* (entity) {
        while (!entity.dead) {
          let deltaTimeIdleFly: number = 0;
          const targetPosition = toVector3(entity.initialProps.position);
          targetPosition.x += (Math.random() - 0.5) * 4;
          targetPosition.y += (Math.random() - 0.5) * 2;
          let motionCounter = 3000;
          entity.facingRight = targetPosition.x < entity.position.x;
          entity.updateSprite();

          //Moves the entity in a physics way
          while (motionCounter > 0) {
            deltaTimeIdleFly = yield;
            motionCounter -= deltaTimeIdleFly; // usually around 33.33
            if (entity.dead) break;
            if (!entity.behaviors.physics.body) return;
            const motionVect = vector3To2(
              targetPosition.clone().sub(entity.position)
            );
            const moveSpeed = 4;
            const motionDist = motionVect.length();
            const motionDir = motionVect.clone().normalize();
            const currentVelRaw = entity.behaviors.physics.body.linvel();
            const mass = entity.behaviors.physics.body.mass();
            const currentVel = toVector2(currentVelRaw);
            const motionDelta = motionDir
              .clone()
              .multiplyScalar(moveSpeed)
              .sub(currentVel);
            motionDelta.multiplyScalar(
              mass * motionDist * 0.05 * (deltaTimeIdleFly / 33.33)
            );
            entity.behaviors.physics.body?.applyImpulse(motionDelta, true);
          }
        }
      }
    },
    attack: {
      run: function* (entity) {
        while (!entity.dead && entity.aggroEntity) {
          //targetPosition/entity.aggroEntity.position isn't what you think it is. Its screenspace. moves as the camera moves.
          let targetPosition = entity.aggroEntity.position.clone();
          const close = 3;
          const far = 5;
          const diff = targetPosition.clone().sub(entity.position);
          const yDiff = Math.abs(diff.y);
          const xDiff = Math.abs(diff.x);

          //If not within the boundaries, approach or fly away
          if (xDiff < close || xDiff > far) {
            if (entity.approaching) {
              if (xDiff < close) {
                entity.approaching = false;
              }
            } else {
              if (xDiff > far) {
                entity.approaching = true;
              }
            }
          }
          //console.log("xDiff/approaching/c/f:", xDiff, entity.approaching, close, far);

          //Always aim a little higher than center of mass.
          targetPosition.y += 0.2;

          //Have entity hover a little away from player. (Zoned into overlapping areas of approach and leave)
          if (entity.approaching && xDiff > close + 0.75) {
            targetPosition.x += (close + 0.75) * (diff.x < 0 ? 1 : -1); //Check which direction to add distance to
          } else if (!entity.approaching && xDiff < far - 0.75) {
            targetPosition.x += (far - 0.75) * (diff.x < 0 ? 1 : -1);
          } else {
            targetPosition.x = entity.position.x;
          }

          const targetVector = targetPosition.clone().sub(entity.position);
          const targetDistance = targetVector.length();
          targetVector.normalize();
          if (yDiff < 0.18) {
            targetVector.y = 0;
          }

          //Start firing if at the right height
          if (yDiff <= 1 && !entity.scheduler.hasEvent("fsShootEverySecond")) {
            entity.scheduler.add({
              id: "fsShootEverySecond",
              startIn: 0,
              duration: 1500,
              invokeFunctionAtStart: () => {
                entity.sprite.gotoTag("Charged_attack");
              },
              invokeFunctionAtComplete: () => {
                if (!entity.aggroEntity) {
                  entity.scheduler.cancel("fsShootEverySecond");
                  entity.sprite.gotoTag("Idle2");
                }
              },
              recurring: true
            });
          }

          const motionDelta = targetVector.clone();
          let speed = 7;
          if (targetDistance < 6) {
            speed = 5;
            entity.attacking = true;
          }

          motionDelta.multiplyScalar(speed);
          if (!entity.behaviors.physics.body) break;
          const currentVel = toVector2(entity.behaviors.physics.body.linvel());
          const mass = entity.behaviors.physics.body.mass();
          const impulse = vector3To2(motionDelta)
            .sub(currentVel)
            .multiplyScalar(mass);
          entity.behaviors.physics.body.applyImpulse(impulse, true);

          //Update the visual sprite based on where the player is.
          entity.facingRight =
            entity.aggroEntity.position.x < entity.position.x;
          entity.updateSprite();

          yield;
        }

        if (entity.dead) {
          entity.updateSprite();
        }
      }
    }
  });

  constructor(props: FlyingShooterProps) {
    super(props);
    this.projectileDamage = props.attack ? props.attack : this.projectileDamage;

    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(FlyingShooter, "flyingShooterTexture"),
      sourceJSON: flyingShooterJson,
      offset: new Vector2(2, 7),
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
    });
    this.sprite.addTagFrameTrigger("Charged_attack", 16, "shoot");
    this.sprite.addEventListener("shoot", this.onShoot.bind(this));

    this.sprite.gotoTag("Idle2");
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.physics
      .init(this)
      .setGroup(enemyCollisionGroup)
      .setGravityScale(0)
      .setDamping(1.5)
      .setSize(new Vector2(1.5, 0.8));

    this.behaviors.status.init(this).attachSprite(this.sprite).setMaxHealth(props.health ?? 15);

    this.behaviors.perception.init(this);
    this.behaviors.perception.spreadAngle = Math.PI / 2;

    this.behaviors.aggro.init(this);
    this.behaviors.outOfBounds.init(this);

    this.events.on(EntityLifecycleEvents.Die, () => {
      this.dead = true;
      this.behaviors.physics.setGravityScale(0);
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.behaviors.physics.body?.setLinearDamping(100);
      this.behaviors.status.disableHealth();

      this.sprite.gotoTag("death2");
    });

    this.sprite.addEventListener(StandardEvents.animationComplete, () => {
      if (this.dead) {
        switch (this.sprite.getCurrentTag()) {
          case "death2":
            this.sprite.playingAnimation = false;
            this.sprite.gotoTagFrame(10);
            this.scheduler.add({
              id: "remove",
              duration: 500,
              invokeFunction: (t) => {
                this.level?.removeEntity(this.id);
                this.destroy();
              }
            });
            break;
        }
      }
    });

    this.behaviors.aggro.events.on(EnemyAggroEvents.BeginAggro, (entity) => {
      this.aggroEntity = entity;
      this.actionStack.stopAction("idleFly");
      this.actionStack.beginAction("attack");
    });
    this.behaviors.aggro.events.on(EnemyAggroEvents.EndAggro, (entity) => {
      this.aggroEntity = undefined;
      this.actionStack.stopAction("attack");
      this.actionStack.beginAction("idleFly");
    });

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      ([entity, normal]) => {
        if (!this.dead) {
          if (isPlayerAPI(entity) && this.attacking) {
            entity.hit?.({
              damage: 5,
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

    // Binding methods to use later as callbacks
    this.onShoot = this.onShoot.bind(this);
  }
  step(ms: number) {
    super.step(ms);
    this.actionStack.step(ms);
    this.sprite.animate(ms);
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
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
    let directionConstant: number = this.facingRight ? 1 : -1;
    this.sprite.mesh.scale.x = kInvPixelScale * directionConstant;
    this.behaviors.perception.direction.x = -directionConstant;
  }

  onShootTransition() {
    const { level } = this;
    if (!level) return;
  }

  onShoot() {
    const { level } = this;
    if (!level) return;

    //Make sure firing in the direction the sprite is facing.
    let vel2 = new Vector2(this.projectileSpeed, 0);
    if (this.facingRight) vel2.multiplyScalar(-1);

    //Instance and display the projectile
    const projectile = new Fireball({
      position: this.position.setZ(2)
    });
    projectile.ignoreEntity(this.id);
    projectile.setVelocity(vel2);
    projectile.setGravity(0);
    projectile.damage = this.projectileDamage;
    projectile.setSourceEntity(this);

    level.addEntity(projectile);
  }
}

export type PlasmaballProps = EntityProps & {
  damage?: number;
};

export class Plasmaball extends CoreEntity {
  static type = "Plasmaball";
  public type = "Plasmaball";

  public object3D = new Object3D();

  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior()
  };

  public damage = 10;
  private sourceEntity?: BaseEntityType;

  constructor(props: PlasmaballProps) {
    super(props);
    this.damage = props.damage ?? this.damage;

    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(1, 0);
    this.behaviors.projectilePhysics.events.on(
      ProjectilePhysicsEvents.CollideWithEntity,
      ([entity, pos, normal]) => {
        this.behaviors.projectilePhysics.enabled = false;
        this.scheduler.add({
          duration: 100,
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id);
            this.destroy();
          }
        });
        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this.sourceEntity ?? this,
          hitImpulse: this.behaviors.projectilePhysics.velocity
            .clone()
            .normalize()
            .multiplyScalar(2),
          damage: this.damage,
          elementalDamageType: ElementalType.Electricity
        });
      }
    );
    this.object3D.position.copy(this.position);
  }
  ignoreEntity(entityId: string) {
    this.behaviors.projectilePhysics.ignoreEntityIds.add(entityId);
    return this;
  }
  setSourceEntity(sourceEntity: BaseEntityType) {
    this.sourceEntity = sourceEntity;
    return this;
  }
  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    return this;
  }
  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  step(ms: number) {
    super.step(ms);
  }

  extraSpellBindingData() {
    return {};
  }
}
