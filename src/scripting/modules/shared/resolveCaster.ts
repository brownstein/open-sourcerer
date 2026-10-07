import { BaseEntityType } from "src/api/entity";
import { CasterEntityAPI } from "src/api/entitySpellCasting";
import { TrackingIdentifier } from "src/scripting/runtime/SpellEntitySyncAPI";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

export function resolveTrackedCaster<
  T extends BaseEntityType & CasterEntityAPI = BaseEntityType & CasterEntityAPI
>(ctx: SpellRuntimeModuleCtxAPI, override?: TrackingIdentifier | string) {
  if (override) {
    const resolved = ctx.sync.get<T>(override);
    if (resolved) return resolved;
    console.warn(
      "Unable to resolve specified spellcaster, falling back to context default"
    );
  }
  if (!ctx.casterTrackingId) return null;
  return ctx.sync.get<T>(ctx.casterTrackingId);
}
