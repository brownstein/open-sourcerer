import { Vector2 } from "three";

import { BaseEntityType, ElementalType } from "src/api/entity";
import { HealingSparkle } from "src/entities/spells/projectiles/HealingSparkle";
import { delay } from "src/scripting/core/util";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";
import { ClampNumberToMinMax } from "src/util/mathUtils";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";
import { HealOpt } from "./validators/healValidators";

const MIN_CASTSPEED = 0.5;
const MAX_CASTSPEED = 3;
export const COLOR_LIMEGREEN = 0x79e326;

type HealRPCOpt = HealOpt & {
  casterId?: string;
  strength?: number;
  isOverTime?: boolean;
};

@assertAutoBindableNativeModule
export default class HealNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  async instantHeal(opt: HealRPCOpt) {
    const {
      casterId: casterIdIn,
      targetId: targetIdRaw,
      strength: strengthIn
    } = opt;

    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    const casterId =
      trackedCaster?.currentEntity?.id ?? casterIdIn ?? this.ctx.casterId;

    const manaCost = strengthIn ?? 50;
    const healAmount = manaCost / 5;

    const castSpeedMultiplier = ClampNumberToMinMax(
      5 / Math.sqrt(healAmount + 1),
      MIN_CASTSPEED,
      MAX_CASTSPEED
    );

    await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      color: COLOR_LIMEGREEN,
      elementalType: ElementalType.Nature,
      speed: castSpeedMultiplier,
      manaCost: manaCost
    });

    let targetId =
      typeof targetIdRaw === "string"
        ? targetIdRaw
        : targetIdRaw?.entityId
          ? targetIdRaw.entityId
          : targetIdRaw?.handleId;

    if (!casterId) throw new Error("Caster ID not specified.");
    if (!targetId) targetId = casterId;
    if (!targetId) throw new Error("Target ID not specified.");

    let entity: BaseEntityType | null =
      this.ctx.sync.get(targetId)?.currentEntity ?? null;
    if (!entity) {
      entity = this.ctx.level?.getEntity(targetId) ?? null;
    }

    if (!entity) return false;

    const casterEntity: BaseEntityType = trackedCaster?.currentEntity ?? entity;

    entity.hit?.({
      hittingEntity: casterEntity,
      sourceEntity: casterEntity,
      damage: -1 * healAmount,
      elementalDamageType: ElementalType.Nature
    });
    return true;
  }

  async healOverTime(opt: HealRPCOpt) {
    const {
      casterId: casterIdIn,
      targetId: targetIdRaw,
      strength: strengthIn
    } = opt;

    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    const casterId =
      trackedCaster?.currentEntity?.id ?? casterIdIn ?? this.ctx.casterId;

    let manaCost = strengthIn ?? 50;
    const durationInSeconds = 5;
    const healAmount = Math.ceil(manaCost / 5 / durationInSeconds);
    manaCost -= ClampNumberToMinMax(2 * durationInSeconds, 1, Infinity);

    const castSpeedMultiplier = ClampNumberToMinMax(
      5 / Math.sqrt(healAmount + 1),
      MIN_CASTSPEED,
      MAX_CASTSPEED
    );

    const castSequence = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      color: COLOR_LIMEGREEN,
      elementalType: ElementalType.Nature,
      speed: castSpeedMultiplier,
      manaCost: manaCost
    });

    if (!castSequence.trackedCaster.currentEntity)
      throw new Error("[Heal]: Broken inaviant - current caster not found.");

    const sparkle = new HealingSparkle({
      position: castSequence.trackedCaster.currentEntity.getCastOrigin(),
      healPower: healAmount,
      healDuration: durationInSeconds,
      casterEntity: castSequence.trackedCaster.currentEntity
    });

    const castVelocity: Vector2 = new Vector2();

    sparkle.setVelocity(castVelocity);
    sparkle.ignoreEntity(castSequence.trackedCaster.currentEntity.id);

    this.ctx.level?.addEntity(sparkle);

    let targetId =
      typeof targetIdRaw === "string"
        ? targetIdRaw
        : targetIdRaw?.entityId
          ? targetIdRaw.entityId
          : targetIdRaw?.handleId;

    if (!casterId) throw new Error("Caster ID not specified.");
    if (!targetId) targetId = casterId;
    if (!targetId) throw new Error("Target ID not specified.");

    let entity: BaseEntityType | null =
      this.ctx.sync.get(targetId)?.currentEntity ?? null;
    if (!entity) {
      entity = this.ctx.level?.getEntity(targetId) ?? null;
    }

    if (!entity) return false;

    const casterEntityHot: BaseEntityType =
      castSequence.trackedCaster.currentEntity ?? entity;

    for (let i = 0; i < durationInSeconds; i++) {
      entity.hit?.({
        hittingEntity: casterEntityHot,
        sourceEntity: casterEntityHot,
        damage: -1 * healAmount,
        elementalDamageType: ElementalType.Nature
      });
      if (i === durationInSeconds - 1) break;
      await delay(1000);
    }

    return true;
  }
}
