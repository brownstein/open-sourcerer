import { Vector3 } from "three";

import { ElementalType } from "src/api/entity";
import { arr2 } from "src/engine/util/vecTypes";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { IceBlock } from "src/entities/spells/ice/IceBlock";
import { ManaTransferBeam } from "src/entities/spells/spark/ManaTransferBeam";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";
import { getArea } from "src/util/polygons";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";

@assertAutoBindableNativeModule
export default class IceBlockNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private entityIds = new Set<string>();
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  teardown() {
    for (const entityId of this.entityIds) {
      const entity = this.ctx.level?.getEntity<IceBlock>(entityId);
      if (entity) entity.clear();
      this.entityIds.delete(entityId);
    }
  }

  async castIceBlock(opt: {
    useHandleId: string;
    casterId?: string;
    shape?: arr2[];
    holes?: arr2[][];
    angle?: number;
  }) {
    const { useHandleId, casterId: casterIdIn, shape, holes, angle = 0 } = opt;
    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    let manaCost = 10;
    if (shape) manaCost = getArea(shape);
    if (holes) {
      for (const hole of holes) {
        manaCost -= getArea(hole);
      }
    }
    const castResult = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      elementalType: ElementalType.Ice,
      color: 0x00aadd,
      manaCost
    });
    if (!castResult.trackedCaster.currentEntity)
      throw new Error(
        "[Ice]: Broken invariant; no caster handle or caster entity."
      );
    const castOffset = new Vector3();
    if (isPlayerAPI(castResult.trackedCaster.currentEntity)) {
      castOffset.x += castResult.trackedCaster.currentEntity.isFacingRight()
        ? 1
        : -1;
      castOffset.y = 0.25;
    }
    const castPosition = castResult.trackedCaster.currentEntity.position
      .clone()
      .add(castOffset);
    const iceBlock = new IceBlock({
      position: castPosition,
      shape,
      holes,
      angle
    });
    this.ctx.level?.addEntity(iceBlock);
    this.entityIds.add(iceBlock.id);
    const trackingInfo = this.ctx.sync.track(iceBlock, null, false, useHandleId);
    this.ctx.sync.sync(trackingInfo.trackingId);
    return {
      id: trackingInfo.trackingId
    };
  }

  destroyIceBlock(id: string) {
    const trackingInfo = this.ctx.sync.get<IceBlock>(id);
    const entity = trackingInfo?.currentEntity;
    if (entity) {
      entity.startShrinking();
    }
    return !!entity;
  }

  // Transfer mana from the caster into an ice block's reserve, which spends it
  // to resist ambient melting. Mirrors Spark's allocateSparkMana.
  feedIceBlock(id: string, mana: number) {
    const tracked = this.ctx.sync.get<IceBlock>(id);
    const trackedCaster = resolveTrackedCaster(this.ctx);
    if (!tracked?.currentEntity || !trackedCaster?.currentEntity)
      throw new Error("[Ice]: Ice block or caster not found.");
    const debitSuccess = trackedCaster.currentEntity.subMana(mana);
    if (!debitSuccess) throw new Error("[Ice]: Not enough available mana!");
    tracked.currentEntity.addMana(mana);
    const beam = new ManaTransferBeam({
      position: { x: 0, y: 0, z: 0 },
      sourceEntityId: trackedCaster.currentEntity.id,
      targetEntityId: tracked.currentEntity.id
    });
    this.ctx.level?.addEntity(beam);
    // Push the updated reserve back to the spell script's `mana` property.
    this.ctx.sync.sync(tracked.trackingId);
  }
}
