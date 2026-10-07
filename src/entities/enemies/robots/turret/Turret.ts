import { ProtoSpriteSheetThree } from "protosprite-three";
import { Color, Object3D, Vector2 } from "three";

import { AINodeData, AIResult } from "src/api/ai";
import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps
} from "src/api/entity";
import { EnemyProps } from "src/api/enemy";
import {
  enemyCollisionGroup,
  inactiveCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { AIBehaviorTree } from "src/engine/entity/AIBehaviorTree";
import {
  Do,
  Execute,
  Selector,
  Sequence,
  Verify
} from "src/engine/entity/AICoreNodes";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { AIBehavior } from "src/entities/shared/behaviors/AIBehavior";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import {
  EnemyAggroBehavior,
  EnemyAggroEvents
} from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { OutOfBoundsBehaviour } from "src/entities/shared/behaviors/OutOfBoundsBehaviour";
import { PerceptionBehavior } from "src/entities/shared/behaviors/Perception";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";
import { GenericProjectile } from "src/entities/spells/projectiles/GenericProjectile";
import { LineRenderingBehavior } from "src/entities/ui/vfx/LineRenderingBehavior";

import * as turretTypes from "./sprites/turret";
import turretPrs from "./sprites/turret.prs";

export type TurretProps = EntityProps & EnemyProps;

const SHOOT_INTERVAL_MS = 1500;
const PROJECTILE_SPEED = 12;
const PROJECTILE_DAMAGE = 3;
const ATTACK_ANIM_DURATION_MS = 900;

@addResourceLoader(new ProtoSpriteLoader("turretPS", turretPrs))
export class Turret extends CoreEntity {
  static type = "Turret";
  public type = Turret.type;

  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();
  public dead = false;

  public behaviors = {
    physics: new CharacterPhysicsBehavior(),
    status: new StatusBehavior().setMaxHealth(10),
    perception: new PerceptionBehavior({
      sightDistance: 6,
      spreadAngle: Math.PI / 6,
      direction: new Vector2(0, -1),
      trackingTimeoutMs: 3000
    }),
    aggro: new EnemyAggroBehavior({
      aggroOnSight: true,
      loseAggroWithoutSight: true
    }),
    ai: new AIBehavior(),
    outOfBounds: new OutOfBoundsBehaviour()
  };

  private sprite = getResource<ProtoSpriteSheetThree>(
    Turret,
    "turretPS"
  ).getSprite<turretTypes.sprite_layers, turretTypes.sprite_animations>();

  attackDamage = PROJECTILE_DAMAGE;
  private aggroEntity?: BaseEntityType;
  private isOpen = false;
  private timeSinceLastShot = 0;
  private openingAnimElapsed = 0;
  private closingAnimElapsed = 0;
  private targetRotation = 0;
  private deathAnimDone = false;
  private deathHoldMs = 0;
  private deathFadeMs = 0;

  private lockOnLine = new LineRenderingBehavior({
    vertices: [new Vector2(0, -0.5), new Vector2(0, -2)]
  });

  constructor(props: TurretProps) {
    super(props);
    this.attackDamage = props.attack ? props.attack : this.attackDamage;
    this.targetRotation = props.angle ?? 0;

    this.sprite.hideLayers("Sprite Sheet");
    this.sprite.gotoAnimation("Idle");
    this.sprite.setAnimationSpeed(0);
    this.sprite.center();
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;

    this.object3D.add(this.sprite.mesh);

    // Lock-on laser line (local space, hidden until open)
    this.lockOnLine.setColor(new Color(1, 0, 0)).setOpacity(0.6);
    this.lockOnLine.mesh.visible = false;
    this.object3D.add(this.lockOnLine.mesh);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.rotation.z = this.angle ?? 0;

    this.behaviors.physics
      .init(this)
      .setGroup(enemyCollisionGroup)
      .setDensity(100)
      .setSize(new Vector2(1, 1))
      .setRotation(props.angle ?? 0)
      .setRotationLocked(false);

    this.behaviors.status.setMaxHealth(props.health ?? 10);
    this.behaviors.status.init(this).attachProtosSprite(this.sprite);
    this.behaviors.perception
      .init(this)
      .setSourceBody(this.behaviors.physics.body);
    this.behaviors.aggro.init(this);
    this.behaviors.outOfBounds.init(this);

    this.behaviors.aggro.events.on(EnemyAggroEvents.BeginAggro, (entity) => {
      this.aggroEntity = entity;
    });
    this.behaviors.aggro.events.on(EnemyAggroEvents.EndAggro, () => {
      this.aggroEntity = undefined;
    });

    this._setupBehaviorTree();
  }

  private _setupBehaviorTree(): void {
    // prettier-ignore
    this.behaviors.ai
    .init(this)
    .behaviorTree = new AIBehaviorTree(
      Selector(
        // PRIORITY 1: Death — play death anim, hold, fade, remove
        Sequence(
          Verify(() => this.dead),
          Execute((data: AINodeData) => {
            if (!this.deathAnimDone) {
              // First call: start death animation and lerp rotation to 0
              if (this.deathHoldMs === 0 && this.deathFadeMs === 0) {
                this.behaviors.physics.setGroup(inactiveCollisionGroup);
                this.behaviors.status.disableHealth();
                this.targetRotation = 0;
                this.sprite.gotoAnimation("Death");
                this.sprite.setAnimationSpeed(1);
                this.sprite.events.on("animationLooped", () => {
                  this.deathAnimDone = true;
                  this.sprite.setAnimationSpeed(0);
                });
              }
              return AIResult.Running;
            }
            // Hold last frame for 1 second
            if (this.deathHoldMs < 1000) {
              this.deathHoldMs += data.deltaMs;
              return AIResult.Running;
            }
            // Fade out over 500ms
            this.deathFadeMs += data.deltaMs;
            this.sprite.setOpacity(Math.max(0, 1 - this.deathFadeMs / 500));
            if (this.deathFadeMs >= 500) {
              this.level?.removeEntity(this.id);
              this.destroy();
            }
            return AIResult.Running;
          })
        ),

        // PRIORITY 2: Has aggro target — aim and attack
        Sequence(
          Verify(() => !!this.aggroEntity),
          Selector(
            // Already open: keep shooting on interval
            Sequence(
              Verify(() => this.isOpen),
              Execute((data: AINodeData) => {
                if (!this.aggroEntity) return AIResult.Failed;
                this.timeSinceLastShot += data.deltaMs;
                if (this.timeSinceLastShot >= SHOOT_INTERVAL_MS) {
                  this.shoot();
                  this.timeSinceLastShot = 0;
                }
                return AIResult.Running;
              })
            ),
            // Not open: play opening animation
            Execute((data: AINodeData) => {
              if (!this.aggroEntity) return AIResult.Failed;
              if (this.openingAnimElapsed === 0) {
                this.sprite.gotoAnimation("Attack");
                this.sprite.setAnimationSpeed(1);
              }
              this.openingAnimElapsed += data.deltaMs;
              if (this.openingAnimElapsed >= ATTACK_ANIM_DURATION_MS) {
                this.isOpen = true;
                this.openingAnimElapsed = 0;
                this.timeSinceLastShot = 0;
                this.shoot();
                this.sprite.setAnimationSpeed(0);
                return AIResult.Succeeded;
              }
              return AIResult.Running;
            }, () => { this.openingAnimElapsed = 0; })
          )
        ),

        // PRIORITY 3: No aggro target but open — close
        Sequence(
          Verify(() => this.isOpen),
          Execute((data: AINodeData) => {
            if (this.closingAnimElapsed === 0) {
              this.sprite.gotoAnimation("Attack");
              this.sprite.setAnimationSpeed(-1);
              this.sprite.gotoAnimationFrame(8);
            }
            this.closingAnimElapsed += data.deltaMs;
            if (this.closingAnimElapsed >= ATTACK_ANIM_DURATION_MS) {
              this.isOpen = false;
              this.closingAnimElapsed = 0;
              this.sprite.gotoAnimation("Idle");
              this.sprite.setAnimationSpeed(0);
              return AIResult.Succeeded;
            }
            return AIResult.Running;
          }, () => { this.closingAnimElapsed = 0; })
        ),

        // PRIORITY 4: Idle
        Do(() => {})
      )
    );
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.lockOnLine.destroy();
  }

  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    if (this.dead) return;
    if (this.behaviors.status.health <= 0) {
      this.dead = true;
      this.die();
    }
  }

  step(ms: number) {
    super.step(ms);
    const body = this.behaviors.physics.body;
    if (body) {
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setGravityScale(0, true);
    }
    this.sprite.advance(ms);

    // Update target rotation
    if (this.dead) {
      this.targetRotation = 0;
    } else if (
      this.aggroEntity &&
      (this.isOpen || this.openingAnimElapsed > 0)
    ) {
      const dx = this.aggroEntity.position.x - this.position.x;
      const dy = this.aggroEntity.position.y - this.position.y;
      const angle = Math.atan2(dy, dx);
      // Sprite faces up in image; scale.y=-1 flips to down (-π/2).
      // To aim at angle: rotation.z = angle + π/2
      this.targetRotation = angle + Math.PI / 2;
    } else {
      this.targetRotation = this.initialProps.angle ?? 0;
    }

    // Lerp current rotation toward target
    const currentRotation = this.behaviors.physics.body?.rotation() ?? 0;
    this.behaviors.perception.direction = this.getFacingDirection();
    const diff = this.targetRotation - currentRotation;
    // Normalize angle difference to [-π, π]
    const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.behaviors.physics.setAngVel(normalizedDiff * 2);

    // Update lock-on line
    if (this.isOpen && !this.dead) {
      this.lockOnLine.mesh.visible = true;
    } else {
      this.lockOnLine.mesh.visible = false;
    }
  }

  private getFacingDirection(): Vector2 {
    const angle =
      (this.behaviors.physics.body?.rotation() ?? 0) - Math.PI * 0.5;
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }

  private shoot() {
    const { level } = this;
    if (!level) return;

    const dir = this.getFacingDirection();
    const vel = dir.multiplyScalar(PROJECTILE_SPEED);

    const projectile = new GenericProjectile({
      position: this.position.clone().setZ(2),
      damage: this.attackDamage
    });
    projectile.ignoreEntity(this.id);
    projectile.setVelocity(vel);
    projectile.setGravity(0);
    projectile.setSourceEntity(this);

    level.addEntity(projectile);
  }
}
