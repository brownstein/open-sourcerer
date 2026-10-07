import { Vector2 } from "three";

import { BaseEntityType, ElementalType, EntityLevelAPI } from "src/api/entity";
import { ThreeSpine, ThreeSpineEvents } from "src/engine/spine/ThreeSpine";
import { ProjectilePhysicsEvents } from "src/entities/shared/behaviors/ProjectilePhysics";
import { FireballExplosion } from "src/entities/spells/blasts/FireballExplosion";
import { GenericProjectile } from "src/entities/spells/projectiles/GenericProjectile";
import { calculateProjectileAngleToInterncept } from "src/util/projectileMath";

import { EchoBone } from "./dataTypes";

/** Damage dealt by the big cannon projectile. */
const BIG_CANNON_DAMAGE = 10;
/** Damage dealt by each side cannon projectile (80% less than big cannon). */
const SMALL_CANNON_DAMAGE = 2;
/** Explosion radius for the big cannon's impact (world units). */
const BIG_CANNON_EXPLOSION_RADIUS = 1.5;
/** Speed of cannon projectiles (units per second). */
const PROJECTILE_SPEED = 15;
/** Perpendicular offset for each barrel of the dual side cannon (world units). */
const SMALL_CANNON_BARREL_OFFSET = 0.25;

export interface EchoProjectileSpawnerOpts {
  threeSpine: ThreeSpine;
  getPosition: () => { x: number; y: number };
  getLevel: () => EntityLevelAPI | undefined;
  findPlayer: () => BaseEntityType | null;
  getIgnoreEntityIds: () => string[];
  sourceEntity: BaseEntityType;
}

/**
 * Handles projectile spawning from Echo's cannon bones.
 * Listens for Spine attachment events to detect fire frames and spawns
 * the appropriate projectile type.
 */
export class EchoProjectileSpawner {
  private threeSpine: ThreeSpine;
  private getPosition: () => { x: number; y: number };
  private getLevel: () => EntityLevelAPI | undefined;
  private findPlayer: () => BaseEntityType | null;
  private getIgnoreEntityIds: () => string[];
  private sourceEntity: BaseEntityType;

  /** The cannon slot being watched for shoot-frame attachments. */
  public activeCannonSlot: string | null = null;
  /** The cannon bone to fire from. */
  public activeCannonBone: string | null = null;
  /** True while an attack animation is playing. */
  public isAttacking = false;
  /** Set to true when the current attack animation finishes. */
  public attackComplete = false;
  /** Guards against multiple projectiles within a single shot. */
  public projectileFiredThisShot = false;

  constructor(opts: EchoProjectileSpawnerOpts) {
    this.threeSpine = opts.threeSpine;
    this.getPosition = opts.getPosition;
    this.getLevel = opts.getLevel;
    this.findPlayer = opts.findPlayer;
    this.getIgnoreEntityIds = opts.getIgnoreEntityIds;
    this.sourceEntity = opts.sourceEntity;
  }

  /** Wire up the ThreeSpine attachment listener. */
  setupListeners() {
    this.threeSpine.events.on(
      ThreeSpineEvents.AddAttachment,
      this._onAttachmentAdded
    );
  }

  setActiveCannon(bone: string, slot: string) {
    this.activeCannonBone = bone;
    this.activeCannonSlot = slot;
    this.projectileFiredThisShot = false;
  }

  clearActiveCannon() {
    this.activeCannonBone = null;
    this.activeCannonSlot = null;
  }

  private _onAttachmentAdded = (data: {
    slotName: string;
    attachmentName: string;
  }) => {
    if (!this.isAttacking || this.attackComplete) return;
    if (this.projectileFiredThisShot) return;
    if (data.slotName !== this.activeCannonSlot) return;

    const name = data.attachmentName;
    if (
      name.includes("Cannon_shoot_big") ||
      name.includes("Cannon_small_shoot")
    ) {
      this.projectileFiredThisShot = true;
      this._fireProjectileFromBone(this.activeCannonBone!);
    }
  };

  private _fireProjectileFromBone(boneName: string) {
    const level = this.getLevel();
    if (!level) return;

    const bone = this.threeSpine.skeleton.findBone(boneName);
    if (!bone) return;

    const player = this.findPlayer();
    if (!player) return;

    const meshScale = this.threeSpine.mesh.scale.x;
    const pos = this.getPosition();
    const isBigCannon = boneName === EchoBone.InnerCannon1;

    // Compute the tip of the bone (end of the barrel) using bone length.
    // bone.a/b/c/d form the 2x2 world-transform matrix columns.
    const boneLen = bone.data.length;
    const tipWorldX = (bone.worldX + bone.a * boneLen) * meshScale + pos.x;
    const tipWorldY = (bone.worldY + bone.c * boneLen) * meshScale + pos.y;

    // Perpendicular direction to the barrel (used for dual-barrel offset)
    // bone.b and bone.d form the Y-axis of the bone's world transform
    const perpX = bone.b * meshScale;
    const perpY = bone.d * meshScale;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
    const perpNX = perpLen > 0 ? perpX / perpLen : 0;
    const perpNY = perpLen > 0 ? perpY / perpLen : 1;

    // Build spawn points: single for big cannon, dual for small cannon
    const spawnPoints: { x: number; y: number }[] = [];
    if (isBigCannon) {
      spawnPoints.push({ x: tipWorldX, y: tipWorldY });
    } else {
      // Two barrels offset perpendicular to the barrel direction
      spawnPoints.push({
        x: tipWorldX + perpNX * SMALL_CANNON_BARREL_OFFSET,
        y: tipWorldY + perpNY * SMALL_CANNON_BARREL_OFFSET
      });
      spawnPoints.push({
        x: tipWorldX - perpNX * SMALL_CANNON_BARREL_OFFSET,
        y: tipWorldY - perpNY * SMALL_CANNON_BARREL_OFFSET
      });
    }

    const ignoreIds = this.getIgnoreEntityIds();

    for (const spawn of spawnPoints) {
      let dir: Vector2;
      if (isBigCannon) {
        // Big cannon: fire element with gravity, arc compensated for drop
        const relativePos = new Vector2(
          player.position.x - spawn.x,
          player.position.y - spawn.y
        );
        const angle = calculateProjectileAngleToInterncept(
          relativePos,
          PROJECTILE_SPEED
        );
        if (angle !== null && !isNaN(angle)) {
          dir = new Vector2(
            Math.cos(angle) * PROJECTILE_SPEED,
            Math.sin(angle) * PROJECTILE_SPEED
          );
        } else {
          dir = relativePos.normalize().multiplyScalar(PROJECTILE_SPEED);
        }
      } else {
        // Small cannon: straight shot, no gravity
        dir = new Vector2(
          player.position.x - spawn.x,
          player.position.y - spawn.y
        )
          .normalize()
          .multiplyScalar(PROJECTILE_SPEED);
      }

      const damage = isBigCannon ? BIG_CANNON_DAMAGE : SMALL_CANNON_DAMAGE;
      const projectile = new GenericProjectile({
        position: { x: spawn.x, y: spawn.y, z: 2 },
        damage,
        elementalType: isBigCannon
          ? ElementalType.Fire
          : ElementalType.Electricity,
        gravity: isBigCannon ? 1 : 0
      });
      for (const id of ignoreIds) projectile.ignoreEntity(id);
      projectile.setVelocity(dir);
      projectile.setSourceEntity(this.sourceEntity);

      // Big cannon projectiles explode on impact
      if (isBigCannon) {
        projectile.behaviors.projectilePhysics.events.on(
          ProjectilePhysicsEvents.CollideWithEntity,
          ([, hitPos]) => {
            const explosion = new FireballExplosion({
              position: { x: hitPos.x, y: hitPos.y, z: 2 },
              power: damage,
              radius: BIG_CANNON_EXPLOSION_RADIUS,
              sourceEntity: this.sourceEntity
            });
            level.addEntity(explosion);
          }
        );
      }

      level.addEntity(projectile);
    }
  }
}
