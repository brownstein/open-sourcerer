import { Vector2 } from "three";

import { BaseEntityType, ElementalType } from "src/api/entity";
import {
  CastProgressEventTypes,
  CasterEntityAPI,
  hasCasterEntityApi
} from "src/api/entitySpellCasting";
import {
  ColorRepresentation,
  createTypedEventEmitter,
} from "src/api/util";
import { ProjectileGuideConfig } from "src/entities/ui/AimHelper";
import {
  TrackedEntityRuntimeAPI,
  TrackingIdentifier
} from "src/scripting/runtime/SpellEntitySyncAPI";
import { RuntimeManaOverdrawnError } from "src/scripting/runtime/SpellErrors";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { RuntimeAimHelper } from "./runtimeAimHelper";

export type RuntimeCastSequenceResult = {
  trackedCaster: TrackedEntityRuntimeAPI<BaseEntityType & CasterEntityAPI>;
  aimedAt?: Vector2;
  cancelled?: boolean;
};

// This is a shared utility for cast sequencing to simplify casting with different
// types of casters, and continuation between levels.
export async function runtimeCastSequence(
  ctx: SpellRuntimeModuleCtxAPI,
  opts: {
    overrideTrackedCaster?: TrackingIdentifier;
    aim?: boolean;
    elementalType?: ElementalType;
    color?: ColorRepresentation;
    speed?: number;
    manaCost?: number;
    aimGuide?: ProjectileGuideConfig;
  }
): Promise<RuntimeCastSequenceResult> {
  const { overrideTrackedCaster, aim, elementalType, color, speed, manaCost } =
    opts;

  // Resolve the caster.
  const casterTrackingId = overrideTrackedCaster ?? ctx.casterTrackingId;
  if (!casterTrackingId)
    throw new Error(
      "[runtimeCastSequence]: Broken invariant - caster not found."
    );
  const trackedCaster = ctx.sync.get<BaseEntityType & CasterEntityAPI>(
    casterTrackingId
  );
  if (!trackedCaster)
    throw new Error(
      "[runtimeCastSequence]: Broken invariant - caster not found for specified ID."
    );

  // We instantiate this now so that we can cancel the aim sequence at any time.
  const progressEvents = createTypedEventEmitter<CastProgressEventTypes>();

  // Begin casting sequence.
  let aiming = false;
  return new Promise<RuntimeCastSequenceResult>((resolve, reject) => {
    let attemptStartCast: (() => void) | undefined;
    let teardown: (() => void) | undefined;
    const safeResolve = (result: RuntimeCastSequenceResult) => {
      if (attemptStartCast)
        ctx.moduleEvents.off(
          SpellRuntimeModuleEvents.setLevel,
          attemptStartCast
        );
      if (teardown)
        ctx.moduleEvents.off(SpellRuntimeModuleEvents.teardown, teardown);
      resolve(result);
    };
    const safeReject = (errMsg: string | Error) => {
      progressEvents.emit("abort");
      if (attemptStartCast)
        ctx.moduleEvents.off(
          SpellRuntimeModuleEvents.setLevel,
          attemptStartCast
        );
      if (teardown)
        ctx.moduleEvents.off(SpellRuntimeModuleEvents.teardown, teardown);
      reject(errMsg);
    };
    attemptStartCast = async () => {
      const caster = trackedCaster.currentEntity;
      if (!caster || !hasCasterEntityApi(caster)) {
        return safeReject(
          "[runtimeCastSequence]: Caster not found or able to cast this spell."
        );
      }
      const deferredCast = caster.doCast({
        hold: !!aim,
        elementalType,
        color,
        speed,
        progressEvents,
        manaCost
      });

      try {
        let aimedAt: Vector2 | undefined;
        if (aim) {
          aiming = true;
          const deferredAim = RuntimeAimHelper.fromContext(ctx).aim(
            trackedCaster,
            opts.aimGuide
          );
          aimedAt = await deferredAim.getPromise();
          aiming = false;
          progressEvents.emit("aimTrigger");
        }

        await deferredCast.getPromise();

        safeResolve({
          aimedAt,
          trackedCaster
        });
      } catch (err) {
        if (deferredCast.getCancelled() === "manaOverdrawn") {
          return safeReject(new RuntimeManaOverdrawnError("Mana Overdrawn!"));
        }
        if (deferredCast.getCancelled() === "cancel") {
          safeResolve({
            trackedCaster,
            cancelled: true
          });
        }
      }
    };
    teardown = () => safeReject("[runtimeCastSequence]: Spell has terminated.");
    ctx.moduleEvents.on(SpellRuntimeModuleEvents.setLevel, attemptStartCast);
    ctx.moduleEvents.on(SpellRuntimeModuleEvents.teardown, teardown);
    attemptStartCast();
  });
}
