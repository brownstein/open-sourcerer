import { Collider } from "@dimforge/rapier2d-compat";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { damageCollisionGroup } from "src/engine/constants/collisionGroups";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { isLineOfSightClear } from "src/entities/shared/lineOfSight";

import { StatusBehavior } from "./behaviors/StatusBehavior";
import { hits } from "./hitAlignment";

/**
 * Callback that returns convex hull polygons for the current animation state.
 * Returns an array of Float32Array (flat [x,y,...] pairs in entity-relative
 * world coords), or an empty array when the tracked layer has no geometry on
 * the current frame.
 */
export type HullPointsProvider = () => Float32Array[];

/**
 * Callback that returns the world-space position the hit region should track.
 */
export type PositionProvider = () => { x: number; y: number };

export interface AnimatedHitRegionProps
  extends EntityProps,
    Partial<Omit<EntityHitDetails, "hittingEntity" | "sourceEntity">> {
  sourceEntity: BaseEntityType;
  /** Returns hull points each frame; empty array = no active geometry. */
  getHullPoints: HullPointsProvider;
  /** Returns the world position to place colliders at each frame. */
  getWorldPosition: PositionProvider;
  targetAlignment?: EntityAlignment;
  damageIntervalMs?: number;
  /** When true, checks line of sight from sourceEntity to the target before
   *  dealing damage. When false (default), no LOS check is performed. */
  shouldCheckLineOfSight?: boolean;
  screenShake?: number;
  killScreenShake?: number;
  hitStopMs?: number;
  killHitStopMs?: number;
  hitEntityHitDetailsHook?: (
    otherEntity: BaseEntityType,
    originalHitDetails: Readonly<EntityHitDetails>
  ) => EntityHitDetails;
}

/**
 * A hit region whose collider geometry updates every frame to stay in sync
 * with sprite animation data. Unlike HitArea (which spawns a fixed collider
 * with a lifetime), AnimatedHitRegion recreates its Rapier colliders whenever
 * the provided geometry changes and removes them immediately when the
 * geometry disappears.
 *
 * Intended for melee attacks, sweep arcs, and other effects where the damage
 * region should precisely track animated pixel art.
 */
export class AnimatedHitRegion extends CoreEntity {
  static type = "AnimatedHitRegion";
  public type = "AnimatedHitRegion";

  private hitDetails: EntityHitDetails;
  private targetEntityAlignment: EntityAlignment;
  private readonly damageIntervalMs: number;
  private readonly shouldCheckLineOfSight: boolean;
  private readonly screenShake: number;
  private readonly killScreenShake: number;
  private readonly hitStopMs: number;
  private readonly killHitStopMs: number;
  private readonly hitEntityHitDetailsHook: (
    otherEntity: BaseEntityType,
    originalHitDetails: Readonly<EntityHitDetails>
  ) => EntityHitDetails;

  private getHullPoints: HullPointsProvider;
  private getWorldPosition: PositionProvider;

  private colliders: Collider[] = [];
  private hitEntityIds = new Set<string>();

  /** Tracks the hull array reference to avoid unnecessary rebuilds. */
  private lastHulls: Float32Array[] = [];

  constructor(props: AnimatedHitRegionProps) {
    super(props);

    this.getHullPoints = props.getHullPoints;
    this.getWorldPosition = props.getWorldPosition;

    this.hitDetails = {
      hittingEntity: this,
      sourceEntity: props.sourceEntity,
      damage: props.damage ?? 0,
      damageType: props.damageType,
      elementalDamageType: props.elementalDamageType,
      hitImpulse: props.hitImpulse
    };

    this.targetEntityAlignment =
      props.targetAlignment ?? EntityAlignment.Player;
    this.damageIntervalMs = props.damageIntervalMs ?? Infinity;
    this.shouldCheckLineOfSight = props.shouldCheckLineOfSight ?? false;
    this.screenShake = props.screenShake ?? 0;
    this.killScreenShake = props.killScreenShake ?? 0;
    this.hitStopMs = props.hitStopMs ?? 0;
    this.killHitStopMs = props.killHitStopMs ?? 0;
    this.hitEntityHitDetailsHook =
      props.hitEntityHitDetailsHook ?? (() => this.hitDetails);
  }

  attachToLevel(level: LevelAPI): void {
    super.attachToLevel(level);
    this.syncColliders();
  }

  detachFromLevel(level: LevelAPI): void {
    this.removeAllColliders();
    super.detachFromLevel(level);
    this.level?.removeEntityPhysicsHooks(this.id);
  }

  step(ms: number) {
    super.step(ms);
    this.syncColliders();
    this.checkIntersections();
  }

  private syncColliders() {
    const { level } = this;
    if (!level) return;

    const hulls = this.getHullPoints();
    const pos = this.getWorldPosition();

    // If geometry hasn't changed (same reference), just update positions.
    if (hulls === this.lastHulls && this.colliders.length > 0) {
      for (const collider of this.colliders) {
        collider.setTranslation(pos);
      }
      return;
    }

    // Geometry changed — rebuild colliders.
    this.removeAllColliders();
    this.lastHulls = hulls;

    if (hulls.length === 0) return;

    const { rapier, world } = level;
    const { ColliderDesc } = rapier;

    for (const hullPoints of hulls) {
      const desc = ColliderDesc.convexHull(hullPoints);
      if (desc === null) continue;
      desc.setTranslation(pos.x, pos.y);
      desc.setSensor(true);
      desc.setCollisionGroups(damageCollisionGroup);
      const collider = world.createCollider(desc);
      this.colliders.push(collider);
    }

    // Inform the level that these colliders belong to this entity.
    this.level?.updateEntityPhysicsHooks({
      entityId: this.id,
      colliderHandles: this.colliders.map((c) => c.handle)
    });
  }

  private removeAllColliders() {
    const { level } = this;
    if (!level) return;
    for (const collider of this.colliders) {
      level.world.removeCollider(collider, false);
    }
    this.colliders = [];
  }

  private checkIntersections() {
    const { level } = this;
    if (!level) return;

    for (const collider of this.colliders) {
      level.world.intersectionPairsWith(collider, (collider2) => {
        const otherEntityId = level.getEntityIdForCollider(collider2.handle);
        if (otherEntityId === undefined) return;
        if (this.hitEntityIds.has(otherEntityId)) return;

        this.hitEntityIds.add(otherEntityId);
        this.scheduler.add({
          startIn: this.damageIntervalMs,
          invokeFunctionAtComplete: () => {
            this.hitEntityIds.delete(otherEntityId);
          }
        });

        const otherEntity = level.getEntity(otherEntityId);
        if (!otherEntity) return;
        if (!hits(this.targetEntityAlignment, otherEntity.alignment)) return;

        if (
          this.shouldCheckLineOfSight &&
          !isLineOfSightClear(
            level,
            this.hitDetails.sourceEntity.position.x,
            this.hitDetails.sourceEntity.position.y,
            otherEntity.position.x,
            otherEntity.position.y
          )
        )
          return;

        if (otherEntity.hit) {
          const overridedHitDetails = this.hitEntityHitDetailsHook(
            otherEntity,
            this.hitDetails
          );
          otherEntity.hit(overridedHitDetails);

          this._applyScreenShakeAndHitStop(otherEntity);
        }
      });
    }
  }

  private _applyScreenShakeAndHitStop(hitEntity: BaseEntityType) {
    const cameraDirector = this.level?.cameraDirector;
    if (!cameraDirector) return;

    if (this.screenShake > 0) {
      cameraDirector.pushScriptedRequest({ shake: this.screenShake }, 0);
      cameraDirector.popScriptedRequest(500);
    }

    const statusBehavior = (hitEntity.behaviors as any)
      .status as StatusBehavior;
    if (statusBehavior && statusBehavior.dead && this.killScreenShake > 0) {
      cameraDirector.pushScriptedRequest({ shake: this.killScreenShake }, 0);
      cameraDirector.popScriptedRequest(500);
    }

    this.level?.hitStop(this.hitStopMs);

    if (statusBehavior && statusBehavior.dead)
      this.level?.hitStop(this.killHitStopMs);
  }
}
