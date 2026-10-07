import { Vector2, Vector3 } from "three";
import { IVector2 } from "three-aseprite";

import { EntityLevelAPI } from "src/api/entity";
import { NavTerrainBlockType } from "src/api/navigation";
import { SpellCtxEvents } from "src/api/spells";
import { vector3To2 } from "src/engine/util/vecTypes";
import { ManaFountain } from "src/entities/environment/ManaFountain";
import {
  ManaSpark,
  ManaSparkPositioning
} from "src/entities/spells/spark/ManaSpark";
import { ManaTransferBeam } from "src/entities/spells/spark/ManaTransferBeam";
import { isPlatform } from "src/entities/terrain/BaseTerrain";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";
import { TrackedEntityRuntimeAPI } from "src/scripting/runtime/SpellEntitySyncAPI";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";

/** Snaps to tile center (0.25 increments) so spark stays equidistant between maze walls. */
function snapToTileCenter(v: number): number {
  return Math.round(v * 4) / 4;
}

/** 1 tile = 0.5 world units (16px tile with standard scaling). */
const TILE_SIZE = 0.5;
/** Throttle for blocked-hint logging (ms). */
const BLOCKED_HINT_THROTTLE_MS = 2000;
/** Delay before first movement so spawn is visible (ms). */
const SPAWN_TO_MOVEMENT_DELAY_MS = 500;

@assertAutoBindableNativeModule
export default class SparkNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private tracked = new Set<TrackedEntityRuntimeAPI<ManaSpark>>();
  private spawnDelayedHandles = new Set<string>();
  private lastBlockedHintAt = 0;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.events.on(SpellCtxEvents.runTerminated, this.teardown.bind(this));
  }
  async createSpark(opts: {
    // Important: this must be specified by the pseudo runtime so it can
    // stub the entity in the sync store before it is set up here.
    useHandleId: string;
    mana: number;
    casterId?: string;
    offset?: IVector2;
    cameraFollow?: boolean;
  }) {
    if (this.tracked.size > 64) {
      throw new Error(
        "We hit the limits of magic - you can only have 64 sparks."
      );
    }
    const { casterId: casterIdIn, mana, offset, cameraFollow } = opts;
    const trackedCasterOverride = resolveTrackedCaster(this.ctx, casterIdIn);

    // If level has a SparkSpawnMarker (shrine-specific), spawn there.
    const level = this.ctx.level;
    const sparkSpawnMarker =
      level?.getEntityForName("SparkSpawnMarker") ?? null;
    const spawnAtMarker = sparkSpawnMarker
      ? new Vector3(sparkSpawnMarker.position.x, sparkSpawnMarker.position.y, 0)
      : null;

    let castPosition: Vector3;
    let castSequence: Awaited<ReturnType<typeof runtimeCastSequence>> | null =
      null;

    if (spawnAtMarker) {
      castPosition = spawnAtMarker;
      // Run cast sequence for animation when a caster is available.
      if (level && (trackedCasterOverride || this.ctx.casterTrackingId)) {
        try {
          castSequence = await runtimeCastSequence(this.ctx, {
            overrideTrackedCaster: trackedCasterOverride?.trackingId,
            color: 0x44ccff,
            speed: 1.5,
            manaCost: mana
          });
        } catch {
          // No caster or cast failed — spawn without animation.
        }
      }
    } else {
      castSequence = await runtimeCastSequence(this.ctx, {
        overrideTrackedCaster: trackedCasterOverride?.trackingId,
        color: 0x44ccff,
        speed: 1.5,
        manaCost: mana
      });
      if (!castSequence.trackedCaster.currentEntity)
        throw new Error(
          "[Spark]: Broken invariant - current caster not found."
        );
      castPosition = castSequence.trackedCaster.currentEntity.getCastOrigin();
      if (this._isPositionInsideTerrain(castPosition))
        throw new Error("[Spark]: Cannot cast Spark inside terrain.");
    }

    const sparkProps: ConstructorParameters<typeof ManaSpark>[0] = {
      position: castPosition,
      mana,
      cameraFollow
    };
    const vOffset = offset ? new Vector2(offset.x, offset.y) : undefined;
    const followCaster = castSequence?.trackedCaster;

    const instantiate = (lvl: EntityLevelAPI) => {
      const spark = new ManaSpark(sparkProps);
      lvl.addEntity(spark);
      if (spawnAtMarker) {
        spark.teleport(
          new Vector3(castPosition.x, castPosition.y, spark.position.z)
        );
        spark.park();
      } else if (followCaster?.currentEntity) {
        let currentCasterEntity = followCaster.currentEntity;
        if (!lvl.getEntity(currentCasterEntity.id)) {
          const fallbackCaster = resolveTrackedCaster(this.ctx)?.currentEntity;
          if (!fallbackCaster) {
            throw new Error(
              "[Spark]: The parent caster died and I have no idea where this new entity should appear in the level."
            );
          }
          currentCasterEntity = fallbackCaster;
        }
        spark.teleport(currentCasterEntity.getCastOrigin());
        spark.follow(currentCasterEntity.id, vOffset);
      }
      return spark;
    };

    if (!level) throw new Error("[Spark]: No active level.");
    const spark = instantiate(level);
    const tracked = this.ctx.sync.track(spark, null, false, opts.useHandleId);
    this.ctx.sync.setReInstantiator(tracked.trackingId, instantiate);
    this.ctx.sync.sync(tracked.trackingId);
    if (tracked.trackingId.persistentHandleId) this.tracked.add(tracked);
    return {
      id: tracked.trackingId
    };
  }
  destroySpark(handleId: string) {
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    if (!tracked?.currentEntity) return;
    tracked.currentEntity.die();
    this._forget(handleId);
  }
  updateSparkOffset(handleId: string, offset: IVector2) {
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    const trackedCaster = resolveTrackedCaster(this.ctx);
    if (!tracked?.currentEntity || !trackedCaster?.currentEntity)
      throw new Error("[Spark]: Spark or caster not found.");
    tracked.currentEntity.follow(
      trackedCaster.currentEntity.id,
      new Vector2(offset.x, offset.y)
    );
  }
  async moveSpark(handleId: string, delta: { dx: number; dy: number }) {
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    if (!tracked?.currentEntity) throw new Error("[Spark]: Spark not found.");
    const spark = tracked.currentEntity;
    if (!this.spawnDelayedHandles.has(handleId)) {
      this.spawnDelayedHandles.add(handleId);
      await new Promise((r) => setTimeout(r, SPAWN_TO_MOVEMENT_DELAY_MS));
    }
    // Use intended parked position when Parked to avoid perturb drift between moves.
    // Snap to tile centers so spark stays equidistant between maze walls.
    let currentPos =
      spark.positioning.msp === ManaSparkPositioning.Parked &&
      "position" in spark.positioning
        ? spark.positioning.position.clone()
        : vector3To2(spark.position);
    currentPos.x = snapToTileCenter(currentPos.x);
    currentPos.y = snapToTileCenter(currentPos.y);
    const stepX = Math.sign(delta.dx);
    const stepY = Math.sign(delta.dy);
    // Interpret dx/dy as tiles; use half-tile steps (0.25) for fractional precision (e.g. moveRight(2.5)).
    const tilesX = Math.abs(delta.dx);
    const tilesY = Math.abs(delta.dy);
    const halfTile = 0.25;
    const stepsX = Math.round((tilesX * TILE_SIZE) / halfTile);
    const stepsY = Math.round((tilesY * TILE_SIZE) / halfTile);

    const pauseWhenBlockedMs = 250;
    const pauseWhenBlocked = () =>
      new Promise<void>((r) => setTimeout(r, pauseWhenBlockedMs));

    for (let i = 0; i < stepsX; i++) {
      const nextPos = currentPos.clone().add({
        x: stepX * halfTile,
        y: 0
      });
      nextPos.x = snapToTileCenter(nextPos.x);
      nextPos.y = snapToTileCenter(nextPos.y);
      if (this._isPositionBlocked(currentPos, nextPos, "X")) {
        this._logBlockedHint();
        await pauseWhenBlocked();
        continue;
      }
      await spark.zoomToWithCallback(nextPos);
      currentPos = nextPos;
    }

    for (let i = 0; i < stepsY; i++) {
      const nextPos = currentPos.clone().add({
        x: 0,
        y: stepY * halfTile
      });
      nextPos.x = snapToTileCenter(nextPos.x);
      nextPos.y = snapToTileCenter(nextPos.y);
      if (this._isPositionBlocked(currentPos, nextPos, "Y")) {
        this._logBlockedHint();
        await pauseWhenBlocked();
        continue;
      }
      await spark.zoomToWithCallback(nextPos);
      currentPos = nextPos;
    }
  }
  allocateSparkMana(handleId: string, mana: number) {
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    const trackedCaster = resolveTrackedCaster(this.ctx);
    if (!tracked?.currentEntity || !trackedCaster?.currentEntity)
      throw new Error("[Spark]: Spark or caster not found.");
    const debitSuccess = trackedCaster.currentEntity.subMana(mana);
    if (!debitSuccess) throw new Error("[Spark]: Not enough available mana!");
    const addSuccess = tracked.currentEntity.addMana(mana);
    if (!addSuccess) throw new Error("[Spark]: Cannot add mana to Spark!");
    // Spawn visual beam from caster to spark
    this._spawnTransferBeam(
      trackedCaster.currentEntity.id,
      tracked.currentEntity.id
    );
  }
  leechFromFountain(handleId: string, fountainHandleId: string) {
    const level = this.ctx.level;
    if (!level) throw new Error("[Spark]: No active level.");
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    if (!tracked?.currentEntity) throw new Error("[Spark]: Spark not found.");
    const fountain = this.ctx.sync.get<ManaFountain>(fountainHandleId);
    if (!fountain || !(fountain.currentEntity instanceof ManaFountain))
      throw new Error("[Spark]: Target is not a ManaFountain.");
    // Distance check
    const spark = tracked.currentEntity;
    const dx = spark.position.x - fountain.currentEntity.position.x;
    const dy = spark.position.y - fountain.currentEntity.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 2)
      throw new Error(
        "[Spark]: ManaFountain is too far away (must be within 2 units, currently " +
          dist.toFixed(2) +
          ")."
      );
    // Line of sight check (terrain only — entities are ignored)
    if (!this._hasLineOfSight(spark.position, fountain.currentEntity.position))
      throw new Error("[Spark]: No line of sight to ManaFountain.");
    // Max out mana at 500
    spark.mana = 500;
    // Spawn visual beam
    this._spawnTransferBeam(fountain.currentEntity.id, spark.id);
  }
  setSparkPosition(handleId: string, position: IVector2) {
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    if (!tracked?.currentEntity) throw new Error("[Spark]: Spark not found.");
    const targetPosition = new Vector2(position.x, position.y);
    if (this._isPositionInsideTerrain(targetPosition))
      throw new Error("[Spark]: Cannot place Spark inside terrain.");
    tracked.currentEntity.zoomTo(targetPosition);
  }
  async returnSparkToCaster(handleId: string) {
    const level = this.ctx.level;
    if (!level) throw new Error("[Spark]: No active level.");
    const tracked = this.ctx.sync.get<ManaSpark>(handleId);
    if (!tracked?.currentEntity) throw new Error("[Spark]: Spark not found.");
    const spark = tracked.currentEntity;
    // Resolve the caster entity for LOS check and beam
    const trackedCaster = resolveTrackedCaster(this.ctx);
    const casterEntity = trackedCaster?.currentEntity;
    // Line of sight check (terrain only — entities are ignored)
    if (casterEntity) {
      if (!this._hasLineOfSight(spark.position, casterEntity.position))
        throw new Error("[Spark]: No line of sight to caster.");
    }
    // Stream mana back to the caster via CasterEntityAPI.addMana
    if (spark.mana > 0 && casterEntity) {
      const amount = spark.mana;
      const RATE = 1000;
      const durationMs = (amount / RATE) * 1000;
      this._spawnTransferBeam(spark.id, casterEntity.id, durationMs);
      await spark.streamManaTo(casterEntity, amount, RATE);
    }
    // Zero out mana so die() doesn't double-add it
    spark.mana = 0;
    spark.die();
    this._forget(handleId);
  }
  async passMana(
    sourceHandleId: string,
    targetHandleId: string,
    amount: number
  ) {
    const level = this.ctx.level;
    if (!level) throw new Error("[Spark]: No active level.");
    const sourceTracked = this.ctx.sync.get<ManaSpark>(sourceHandleId);
    const targetTracked = this.ctx.sync.get<ManaSpark>(targetHandleId);
    if (!sourceTracked?.currentEntity)
      throw new Error("[Spark]: Source spark not found.");
    if (!targetTracked?.currentEntity)
      throw new Error("[Spark]: Target spark not found.");
    const source = sourceTracked.currentEntity;
    const target = targetTracked.currentEntity;
    // Line of sight check (terrain only — entities are ignored)
    if (!this._hasLineOfSight(source.position, target.position))
      throw new Error("[Spark]: No line of sight between sparks.");
    // Validate mana
    if (source.mana < amount)
      throw new Error("[Spark]: Source spark doesn't have enough mana.");
    // Stream mana gradually at 1000 mana/sec
    const RATE = 100;
    const durationMs = (amount / RATE) * 1000;
    this._spawnTransferBeam(source.id, target.id, durationMs);
    await source.streamManaTo(target, amount, RATE);
  }
  teardown() {
    for (const tracked of this.tracked) {
      if (tracked.currentEntity) {
        tracked.currentEntity?.die();
      }
      if (tracked.trackingId.persistentHandleId) {
        this.ctx.sync.setReInstantiator(tracked.trackingId, null);
        this.ctx.sync.untrack(tracked.trackingId);
      }
    }
    this.tracked = new Set();
    this.spawnDelayedHandles = new Set();
  }

  /** Drop tracking for a destroyed spark: clear its re-instantiator, untrack, and forget it locally. */
  private _forget(handleId: string) {
    this.ctx.sync.setReInstantiator({ persistentHandleId: handleId }, null);
    this.ctx.sync.untrack({ persistentHandleId: handleId });
    this.spawnDelayedHandles.delete(handleId);
    for (const tracked of this.tracked) {
      if (tracked.trackingId.persistentHandleId === handleId) {
        this.tracked.delete(tracked);
        break;
      }
    }
  }
  private _hasLineOfSight(
    sourcePos: { x: number; y: number },
    targetPos: { x: number; y: number }
  ): boolean {
    const level = this.ctx.level;
    if (!level) return false;
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return true;
    const ray = new level.rapier.Ray(
      { x: sourcePos.x, y: sourcePos.y },
      { x: dx / dist, y: dy / dist }
    );
    const hit = level.world.castRay(
      ray,
      dist,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        if (collider.isSensor()) return false;
        // Ignore non-terrain entity colliders (sparks, player, enemies)
        // but keep terrain entity colliders
        const entityId = level.getEntityIdForCollider(collider.handle);
        if (entityId) {
          const entity = level.getEntity(entityId);
          if (entity && !isAnyTerrain(entity)) return false;
        }
        return true;
      }
    );
    return hit === null;
  }
  /** Log a hint to the spell console when movement is blocked (shrine only, throttled). */
  private _logBlockedHint(): void {
    const level = this.ctx.level;
    const hasMarker = level?.getEntityForName("SparkSpawnMarker");
    if (!hasMarker) return;
    const now = Date.now();
    if (now - this.lastBlockedHintAt < BLOCKED_HINT_THROTTLE_MS) return;
    this.lastBlockedHintAt = now;
    const hint =
      "Hint: Move blocked. Try a different direction first. Route: right 4.5, down 4, right 5, up 4, right 6.";
    const line = { primitiveValue: hint };
    this.ctx.consoleOutput.push(line);
    this.ctx.events.emit(SpellCtxEvents.consoleLog, line);
  }
  /**
   * Returns true if movement to nextPos is blocked. Uses nav grid when available,
   * otherwise physics ray casts.
   */
  private _isPositionBlocked(
    currentPos: { x: number; y: number },
    nextPos: { x: number; y: number },
    _axis: string
  ): boolean {
    const level = this.ctx.level;
    if (!level) return true;

    if (level.navTerrain) {
      const block = level.navTerrain.getBlockAt(nextPos.x, nextPos.y);
      const passable =
        block === NavTerrainBlockType.Empty ||
        block === NavTerrainBlockType.Platform ||
        block === NavTerrainBlockType.Ladder ||
        block === NavTerrainBlockType.LadderPlatformIntersect;
      if (passable) return false;
    }
    if (this._isPositionInsideTerrain(nextPos)) return true;
    if (!this._hasLineOfSight(currentPos, nextPos)) return true;
    return false;
  }
  private _spawnTransferBeam(
    sourceEntityId: string,
    targetEntityId: string,
    durationMs?: number
  ) {
    const level = this.ctx.level;
    if (!level) return;
    const beam = new ManaTransferBeam({
      position: { x: 0, y: 0, z: 0 },
      sourceEntityId,
      targetEntityId,
      durationMs
    });
    level.addEntity(beam);
  }
  private _isPositionInsideTerrain(position: {
    x: number;
    y: number;
  }): boolean {
    const level = this.ctx.level;
    if (!level) return true;

    const probeDistance = 0.05;
    const probeRays = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    return probeRays.some((dir) => {
      const ray = new level.rapier.Ray(position, dir);
      const hit = level.world.castRay(
        ray,
        probeDistance,
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        (collider) => {
          if (collider.isSensor()) return false;
          const entityId = level.getEntityIdForCollider(collider.handle);
          if (!entityId) return false;
          const entity = level.getEntity(entityId);
          return !!entity && isAnyTerrain(entity) && !isPlatform(entity);
        }
      );
      return hit !== null;
    });
  }
}
