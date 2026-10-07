import { Vector2 } from "three";

import { BaseEntityType, ElementalType } from "src/api/entity";
import { vector3To2 } from "src/engine/util/vecTypes";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { ImpulseOpt } from "./validators/airValidators";

type ImpulseRPCOpt = ImpulseOpt & {
  casterId?: string;
};

@assertAutoBindableNativeModule
export default class AirNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  async applyAirBurst(opt: ImpulseRPCOpt) {
    const {
      casterId: casterIdIn,
      targetId: targetIdRaw,
      impulse: impulseVectorRaw
    } = opt;
    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    const casterEntity = trackedCaster?.currentEntity;
    const casterId = casterEntity?.id ?? casterIdIn ?? this.ctx.casterId;

    let targetId =
      typeof targetIdRaw === "string"
        ? targetIdRaw
        : targetIdRaw?.entityId
          ? targetIdRaw.entityId
          : targetIdRaw?.handleId;
    if (!casterId) throw new Error("Caster ID not specified.");
    if (!targetId) targetId = casterId;
    if (!targetId) throw new Error("Target ID not specified.");

    if (casterEntity && !casterEntity.subMana(10)) {
      return false;
    }

    let entity: BaseEntityType | null =
      this.ctx.sync.get(targetId)?.currentEntity ?? null;
    if (!entity) {
      entity = this.ctx.level?.getEntity(targetId) ?? null;
    }
    if (!entity) {
      console.warn("Target not found");
      return false;
    }

    const impulse = new Vector2();
    if (impulseVectorRaw) {
      impulse.x = impulseVectorRaw.x ?? 0;
      impulse.y = impulseVectorRaw.y ?? 0;
    } else if (casterId === targetId) {
      impulse.set(0, 10);
    } else if (casterEntity) {
      const delta = vector3To2(
        entity.position.clone().sub(casterEntity.position)
      );
      delta.normalize();
      delta.multiplyScalar(15);
      impulse.copy(delta);
    }

    entity.hit?.({
      hittingEntity: casterEntity ?? entity,
      sourceEntity: casterEntity ?? entity,
      damage: 0,
      elementalDamageType: ElementalType.Wind,
      hitImpulse: impulse
    });
    return true;
  }
}
