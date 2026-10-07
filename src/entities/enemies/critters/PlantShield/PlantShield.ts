import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D, Vector2, Vector3 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityLevelAPI,
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
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
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
import {
  PerceptionBehavior,
  PerceptionEvents
} from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { Fireball } from "src/entities/spells/projectiles/Fireball";

import shieldplantPrs from "../../sprites/plant-shield/shieldplant.prs";
import { ShieldOfPlantShield } from "./ShieldOfPlantShield";

export type PlantShieldProps = EntityProps & EnemyProps & {
  facingRight?: boolean;
};

@addResourceLoader(new ProtoSpriteLoader("plantShieldSheet", shieldplantPrs))
export class PlantShield extends CoreEntity implements BaseEntityType {
  static type = "PlantShield";
  public type = PlantShield.type;
  public children: BaseEntityType[] = [];

  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public dead = false;
  private isDying = false;
  private hasFinishedDeathAnimation = false;

  public behaviors = {
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    status: new StatusBehavior().setMaxHealth(60),
    perception: new PerceptionBehavior(),
    aggro: new EnemyAggroBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  attackDamage = 4;
  private leftShield?: ShieldOfPlantShield;
  private rightShield?: ShieldOfPlantShield;

  public facingRight = false;

  private initialPosition: Vector2 = new Vector2();
  private aggroEntity?: BaseEntityType;

  private onBeginAggro = (entity: BaseEntityType) => {
    if (this.dead || this.isDying) return;

    this.aggroEntity = entity;
    this.plantActionStack.stopAction("idle");
    this.plantActionStack.beginAction("attack");

    this.shieldActionStack.beginAction("idle_no_shield");
  };

  private onPlayerNearby = (entity: BaseEntityType) => {
    if (this.dead || this.isDying) return;

    this.shieldActionStack.stopAction("idle_no_shield");
    if (this.facingRight) {
      this.shieldActionStack.beginAction("shield_idle_right");
    } else {
      this.shieldActionStack.beginAction("shield_idle_left");
    }
  };

  private onPlayerFar = () => {
    if (this.dead || this.isDying) return;

    this.shieldActionStack.stopAction("shield_idle_left");
    this.shieldActionStack.stopAction("shield_idle_right");
    this.shieldActionStack.beginAction("idle_no_shield");
  };

  private onEndAggro = () => {
    if (this.dead || this.isDying) return;

    this.aggroEntity = undefined;
    this.plantActionStack.stopAction("attack");
    this.plantActionStack.beginAction("idle");
    this.shieldActionStack.beginAction("idle_no_shield");
    this.onPlayerFar();
  };

  private spriteSheet = getResource<ProtoSpriteSheetThree>(
    PlantShield,
    "plantShieldSheet"
  );
  // Two sprites: plant (layers 0-3) and shield (layer 4, rendered on top)
  private plantSprite = this.spriteSheet.getSprite();
  private shieldSprite = this.spriteSheet.getSprite();

  private plantActionStack = new ActionStack(this, {
    idle: {
      default: true,
      run: function* (entity) {
        if (entity.dead || entity.isDying) return;
        entity.plantSprite.gotoAnimation("idle");
        while (true) yield;
      }
    },
    // Turret-style ranged attack with manual cooldown (ensures attack anim plays every shot)
    attack: {
      run: function* (entity) {
        if (entity.dead || entity.isDying) return;

        while (!entity.dead && !entity.isDying && entity.aggroEntity) {
          const target = entity.aggroEntity;
          if (target) {
            // Face target: right (target.x > entity.x) → facingRight=true, left → facingRight=false
            const newFacingRight = target.position.x > entity.position.x;
            if (newFacingRight !== entity.facingRight) {
              entity.facingRight = newFacingRight;
              const baseScaleX = Math.abs(entity.plantSprite.mesh.scale.x);
              entity.plantSprite.mesh.scale.x =
                baseScaleX * (entity.facingRight ? -1 : 1);
              entity.behaviors.perception.direction.x = entity.facingRight
                ? 1
                : -1;

              const currentShieldAction =
                entity.shieldActionStack.currentAction();
              if (
                currentShieldAction &&
                currentShieldAction.startsWith("shield_")
              ) {
                if (
                  entity.facingRight &&
                  currentShieldAction.endsWith("_left")
                ) {
                  entity.shieldActionStack.stopAction(
                    currentShieldAction ?? "shield_idle_left"
                  );
                  entity.shieldActionStack.beginAction(
                    currentShieldAction.replace(/_left$/, "_right") as any
                  );
                } else if (
                  !entity.facingRight &&
                  currentShieldAction.endsWith("_right")
                ) {
                  entity.shieldActionStack.stopAction(
                    currentShieldAction ?? "shield_idle_right"
                  );
                  entity.shieldActionStack.beginAction(
                    currentShieldAction.replace(/_right$/, "_left") as any
                  );
                }
              }
            }
          }

          const distance = target
            ? entity.position.clone().sub(target.position).length()
            : Infinity;
          if (distance > 12) {
            yield;
            continue;
          }
          const currentShieldAction = entity.shieldActionStack.currentAction();
          entity.shieldSprite.gotoAnimation(currentShieldAction);
          entity.plantSprite.gotoAnimation("attack");
          entity.plantSprite.setAnimationSpeed(1);

          let cooldownRemaining = 1500;
          while (
            cooldownRemaining > 0 &&
            !entity.dead &&
            !entity.isDying &&
            entity.aggroEntity
          ) {
            const dt = yield;
            cooldownRemaining -= dt;
          }

          if (!entity.dead && !entity.isDying && entity.aggroEntity) {
            entity.onShoot();
          }

          if (!entity.dead && !entity.isDying && entity.aggroEntity) {
            entity.plantSprite.gotoAnimation("idle");
            let idlePause = 100;
            while (
              idlePause > 0 &&
              !entity.dead &&
              !entity.isDying &&
              entity.aggroEntity
            ) {
              const dt = yield;
              idlePause -= dt;
            }
          }
        }

        if (!entity.dead && !entity.isDying) {
          entity.plantSprite.gotoAnimation("idle");
          yield "idle";
        }
      }
    },
    death: {
      run: function* (entity) {
        entity.plantSprite.gotoAnimation("death");
        entity.plantSprite.setAnimationSpeed(1);

        let deathAnimationComplete = false;
        const onDeathAnimationLooped = () => {
          if (deathAnimationComplete) return;

          const currentAnim =
            entity.plantSprite.data.animationState.currentAnimation?.name;
          if (currentAnim !== "death") return;

          deathAnimationComplete = true;
          entity.hasFinishedDeathAnimation = true;
          entity.plantSprite.events.off(
            "animationLooped",
            onDeathAnimationLooped
          );

          entity.plantSprite.gotoAnimation("death");
          entity.plantSprite.gotoAnimationFrame(30); // Snap to last frame
          entity.plantSprite.setAnimationSpeed(0); // Freeze

          entity.scheduler.add({
            id: "deathFadeOut",
            duration: 500,
            invokeFunction: (t) => {
              const opacity = 1 - t;
              entity.plantSprite.setOpacity(opacity);
              entity.shieldSprite.setOpacity(opacity);
              entity.behaviors.status.healthBar.setOpacity(opacity);
            },
            invokeFunctionAtComplete: () => {
              entity.level?.removeEntity(entity.id);
              entity.destroy();
            }
          });
        };

        entity.plantSprite.events.on("animationLooped", onDeathAnimationLooped);
        while (!deathAnimationComplete) yield;
        while (true) yield;
      }
    }
  });

  private shieldActionStack = new ActionStack(this, {
    idle_no_shield: {
      default: true,
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("idle_no_shield");
        entity.leftShield?.deactivate();
        entity.rightShield?.deactivate();
        while (true) yield;
      }
    },
    shield_idle_left: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_idle_left");
        entity.leftShield?.activate();
        while (true) yield;
      }
    },
    shield_idle_right: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_idle_right");
        entity.rightShield?.activate();
        while (true) yield;
      }
    },

    //TODO: Add the animation of the shield appearing and disappearing.
    shield_up_left: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_up_left");

        let animationComplete = false;
        const onComplete = () => {
          animationComplete = true;
        };
        entity.shieldSprite.events.on("animationLooped", onComplete);

        while (!animationComplete) yield;

        entity.shieldSprite.events.off("animationLooped", onComplete);
        yield "shield_idle_left";
      }
    },
    shield_up_right: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_up_right");

        let animationComplete = false;
        const onComplete = () => {
          animationComplete = true;
        };
        entity.shieldSprite.events.on("animationLooped", onComplete);

        while (!animationComplete) yield;

        entity.shieldSprite.events.off("animationLooped", onComplete);
        yield "shield_idle_right";
      }
    },
    shield_down_left: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_down_left");

        let animationComplete = false;
        const onComplete = () => {
          animationComplete = true;
        };
        entity.shieldSprite.events.on("animationLooped", onComplete);

        while (!animationComplete) yield;

        entity.shieldSprite.events.off("animationLooped", onComplete);
        yield "shield_idle_left";
      }
    },
    shield_down_right: {
      run: function* (entity) {
        entity.shieldSprite.gotoAnimation("shield_down_right");

        let animationComplete = false;
        const onComplete = () => {
          animationComplete = true;
        };
        entity.shieldSprite.events.on("animationLooped", onComplete);

        while (!animationComplete) yield;

        entity.shieldSprite.events.off("animationLooped", onComplete);
        yield "shield_idle_right";
      }
    }
  });

  constructor(props: PlantShieldProps) {
    super(props);

    this.size = {
      width: 32 * kInvPixelScale,
      height: 48 * kInvPixelScale
    };

    this.attackDamage = props.attack ? props.attack : this.attackDamage;
    this.facingRight = props.facingRight ?? false;
    this.initialPosition.set(this.position.x, this.position.y);

    this.behaviors.physics.init(this).setDensity(10);
    this.behaviors.physics.setGravityScale(0);
    this.behaviors.physics.controlObject3D = false;
    this.behaviors.status.setMaxHealth(props.health ?? 60);
    this.behaviors.status.init(this);

    this.behaviors.perception.init(this);
    this.behaviors.perception.sightDistance = 6;
    this.behaviors.perception.nearbyDistance = 3;
    this.behaviors.perception.farDistance = 4;
    this.behaviors.perception.spreadAngle = Math.PI / 3; // 60° cone
    this.behaviors.perception.direction.x = this.facingRight ? 1 : -1;
    this.behaviors.perception.setTrackingTimeout(2000);

    this.behaviors.aggro.init(this);
    this.behaviors.aggro.setAggroCooldown(2000);

    this.behaviors.outOfBounds.init(this);

    // Set up collision handler for player collisions
    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      this.handleCollision
    );

    //TODO Set up aggro when player hits it

    // Plant sprite: show layers 0-3, hide shield layer
    this.plantSprite.gotoAnimation("idle");
    this.plantSprite.setLayerOpacity(1, "Background_leaves");
    this.plantSprite.setLayerOpacity(1, "Stalk");
    this.plantSprite.setLayerOpacity(1, "flower_head");
    this.plantSprite.setLayerOpacity(1, "effect_01");
    try {
      this.plantSprite.setLayerOpacity(0, "shield");
    } catch {
      try {
        this.plantSprite.setLayerOpacity(0, "Layer 4");
      } catch {
        // Layer doesn't exist
      }
    }
    this.plantSprite.center();
    this.plantSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.plantSprite.mesh.scale.y *= -1;
    if (this.facingRight) this.plantSprite.mesh.scale.x *= -1;

    // Shield sprite: hide layers 0-3, show shield layer
    this.shieldSprite.gotoAnimation("idle_no_shield");
    this.shieldSprite.setLayerOpacity(0, "Background_leaves");
    this.shieldSprite.setLayerOpacity(0, "Stalk");
    this.shieldSprite.setLayerOpacity(0, "flower_head");
    this.shieldSprite.setLayerOpacity(0, "effect_01");
    try {
      this.shieldSprite.setLayerOpacity(1, "shield");
    } catch {
      try {
        this.shieldSprite.setLayerOpacity(1, "Layer 4");
      } catch {
        // Layer doesn't exist
      }
    }
    this.shieldSprite.center();
    this.shieldSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.shieldSprite.mesh.scale.y *= -1;
    if (this.facingRight) this.shieldSprite.mesh.scale.x *= -1;
    this.shieldSprite.mesh.position.set(0, -0.7, 0.01); // Slightly higher z for layering

    // Add both sprites to the object3D
    this.object3D.add(this.plantSprite.mesh);
    this.object3D.add(this.shieldSprite.mesh);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.behaviors.status.attachProtosSprite(this.plantSprite);

    this.events.on(EntityLifecycleEvents.Hit, (hitDetails) => {
      this.behaviors.aggro.onHit(hitDetails);
    });

    this.events.on(EntityLifecycleEvents.Die, () => {
      if (this.dead || this.isDying) return;

      this.dead = true;
      this.isDying = true;
      this.aggroEntity = undefined;
      this.behaviors.physics.setGroup(inactiveCollisionGroup);
      this.plantActionStack.stopAction("attack");
      this.plantActionStack.beginAction("death", undefined, true, true);
      this.shieldActionStack.beginAction(
        "idle_no_shield",
        undefined,
        true,
        true
      );
    });

    this.behaviors.aggro.events.on(
      EnemyAggroEvents.BeginAggro,
      this.onBeginAggro
    );
    this.behaviors.aggro.events.on(EnemyAggroEvents.EndAggro, this.onEndAggro);

    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.EntityNearbyStart,
      this.onPlayerNearby
    );
    this.behaviors.perception.perceptionEvents.on(
      PerceptionEvents.EntityNearbyEnd,
      this.onPlayerFar
    );

    this.plantActionStack.beginDefaultAction();
    this.shieldActionStack.beginDefaultAction();
  }

  destroy(): void {
    super.destroy();
    this.behaviors.physics.events.off(
      CharacterPhysicsEvents.CollideWithEntity,
      this.handleCollision
    );
    this.behaviors.aggro.events.off(
      EnemyAggroEvents.BeginAggro,
      this.onBeginAggro
    );
    this.behaviors.aggro.events.off(EnemyAggroEvents.EndAggro, this.onEndAggro);
    this.plantSprite.dispose();
    this.shieldSprite.dispose();
  }

  step(ms: number) {
    super.step(ms);

    const body = this.behaviors.physics.body;
    if (body) {
      body.setTranslation(this.initialPosition, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setAngvel(0, true);
    }

    this.plantActionStack.step(ms);
    this.shieldActionStack.step(ms);

    if (!this.hasFinishedDeathAnimation) {
      this.plantSprite.advance(ms);
    }
    this.shieldSprite.advance(ms);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }

  private _constructShields() {
    const { children, level } = this;
    if (!level) return;

    this.leftShield = new ShieldOfPlantShield({
      position: this.position.clone().add(new Vector3(-0.7, 0)),
      parent: this
    });

    this.rightShield = new ShieldOfPlantShield({
      position: this.position.clone().add(new Vector3(0.74, 0)),
      parent: this
    });

    children.push(this.leftShield, this.rightShield);

    for (const child of this.children) level.addEntity(child);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this._constructShields();
  }

  private handleCollision = ([entity, normal]: [BaseEntityType, Vector2]) => {
    if (entity.alignment !== EntityAlignment.Player) return;
    const hitImpulse = normal.clone().multiplyScalar(20);
    entity.hit?.({
      hittingEntity: this,
      sourceEntity: this,
      damage: this.attackDamage,
      hitImpulse
    });
  };

  private onShoot() {
    if (this.dead || this.isDying || !this.aggroEntity || !this.level) return;

    const spawnOffset = new Vector3(this.facingRight ? -0.5 : 0.5, 0.3, 2);
    const spawnPos = this.position.clone().add(spawnOffset);
    const targetPos = this.aggroEntity.position.clone();
    const direction2D = new Vector2(
      targetPos.x - this.position.x,
      targetPos.y - this.position.y
    ).normalize();

    const fireball = new Fireball({ position: spawnPos });
    fireball.setVelocity(direction2D.clone().multiplyScalar(12));
    fireball.setGravity(0);
    fireball.damage = 3;
    fireball.setSourceEntity(this);
    fireball.ignoreEntity(this.id);
    this.children.forEach((x) => {
      fireball.behaviors.projectilePhysics.ignoreEntityIds.add(x.id);
    });

    // Green-tinted projectile
    const trailRender = fireball.behaviors.trailRender;
    trailRender.colorInner.copy(new Color(0.2, 1.0, 0.2));
    trailRender.colorOuter.copy(new Color(0.1, 0.6, 0.1));
    trailRender.colorTrail.copy(new Color(0.0, 0.4, 0.0));

    this.level.addEntity(fireball);
  }
}
