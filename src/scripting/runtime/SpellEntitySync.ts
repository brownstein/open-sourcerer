import EventEmitter from "events";
import shortid from "shortid";

import {
  BaseEntityType,
  EntityAlignment,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { EntityInfo } from "src/scripting/entites/BaseEntityInfo";
import { entityBindingDefinitions } from "src/scripting/entites/EntityBindingDefinitionRegistry";

import { JSRunnerAPI } from "../core/api";
import { SpellVector } from "../modules/shared/spellVector";
import {
  ReInstantiator,
  SpellEntitySyncPseudoAPI,
  SpellEntitySyncRuntimeAPI,
  TrackedEntityPseudoAPI,
  TrackedEntityRuntimeAPI,
  TrackingIdentifier,
  TrackingInfoMessage,
  isDestroyedTrackingInfoMessage,
  kSpellEntitySync
} from "./SpellEntitySyncAPI";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "./SpellRuntimeAPI";

export const kTrackingFrequency = 100;

export class SpellEntitySyncRuntime implements SpellEntitySyncRuntimeAPI {
  public readonly events = createTypedEventEmitter<{
    incrementalUpdate: { info: TrackingInfoMessage[]; requestId?: string };
    methodCall: [TrackingIdentifier, string, unknown[]];
  }>();

  private ctx: SpellRuntimeModuleCtxAPI;

  private trackingCurrentLevel?: LevelAPI;
  private trackingHandleIdByEntityId = new Map<string, string>();
  private trackingByHandleId = new Map<string, TrackedEntityRuntimeAPI>();
  private synchingHandleIds = new Set<string>();
  private reInstantiatorByHandleId = new Map<string, ReInstantiator>();
  private pendingBindingsByHandleId = new Map<string, string>();
  private scheduler = new Scheduler();

  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.moduleEvents.on(
      SpellRuntimeModuleEvents.setLevel,
      this.setLevel.bind(this)
    );
    this.scheduler.add({
      id: "incrementalUpdate",
      duration: kTrackingFrequency,
      recurring: true,
      invokeFunctionAtComplete: this._incrementalUpdate.bind(this)
    });
    this._onStep = this._onStep.bind(this);
  }

  get<T extends BaseEntityType = BaseEntityType>(
    id: string | TrackingIdentifier
  ): TrackedEntityRuntimeAPI<T> | null {
    if (typeof id === "string") {
      const trackedByHandle = this.trackingByHandleId.get(id);
      if (trackedByHandle) return trackedByHandle as TrackedEntityRuntimeAPI<T>;
      const handleTrackedByEntityId = this.trackingHandleIdByEntityId.get(id);
      if (handleTrackedByEntityId) {
        return (this.trackingByHandleId.get(handleTrackedByEntityId) ??
          null) as TrackedEntityRuntimeAPI<T> | null;
      }
      return null;
    }
    return this._resolveTracked(id) as TrackedEntityRuntimeAPI<T> | null;
  }

  track<T extends BaseEntityType>(
    entity: T,
    bindToVariable?: string | null,
    skipSync = false,
    explicitHandleId?: string
  ): TrackedEntityRuntimeAPI<T> {
    this._ensureTracking();
    let handleId: string | undefined;
    if (explicitHandleId !== undefined) {
      handleId = explicitHandleId;
      this.trackingHandleIdByEntityId.set(entity.id, explicitHandleId);
    } else {
      handleId = this.trackingHandleIdByEntityId.get(entity.id);
      if (handleId === undefined) {
        handleId = shortid();
        this.trackingHandleIdByEntityId.set(entity.id, handleId);
      }
    }
    let tracked = this.trackingByHandleId.get(handleId);
    if (!tracked) {
      tracked = {
        trackingId: {
          entityId: entity.id,
          persistentHandleId: handleId
        },
        currentEntity: entity
      };
      this.trackingByHandleId.set(handleId, tracked);
    } else if (
      tracked.trackingId.entityId === undefined ||
      tracked.trackingId.persistentHandleId === undefined
    ) {
      tracked.trackingId.entityId = entity.id;
      tracked.trackingId.persistentHandleId = handleId;
    }
    if (bindToVariable) {
      this.pendingBindingsByHandleId.set(handleId, bindToVariable);
      tracked.boundToVariableName = bindToVariable;
    }
    tracked.skipSync = skipSync;
    return tracked as TrackedEntityRuntimeAPI<T>;
  }
  untrack(id: TrackingIdentifier) {
    const tracked = this._resolveTracked(id);
    if (!tracked) return;
    if (tracked.trackingId.entityId !== undefined)
      this.trackingHandleIdByEntityId.delete(tracked.trackingId.entityId);
    if (tracked.trackingId.persistentHandleId !== undefined)
      this.trackingByHandleId.delete(tracked.trackingId.persistentHandleId);
  }
  requestTrackMultiple(ids: TrackingIdentifier[]) {
    for (const id of ids) {
      if ((id.caster && !id.persistentHandleId) || !id.entityId) {
        const casterId = this.ctx.casterId;
        if (!casterId) continue;
        const caster = this.trackingCurrentLevel?.getEntity(casterId);
        if (!caster) continue;
        const tracking = this.track(caster);
        tracking.trackingId.caster = true;
        // Not sure I love this in-place mutation but it works.
        Object.assign(id, tracking.trackingId);
        continue;
      }
      if (id.entityId) {
        const entity = this.trackingCurrentLevel?.getEntity(id.entityId);
        if (!entity) continue;
        this.track(entity);
      }
    }
  }
  sync(id?: TrackingIdentifier | TrackingIdentifier[], requestId?: string) {
    let handleIds: string[] | undefined;
    if (id !== undefined) {
      if (Array.isArray(id)) {
        handleIds = id
          .map((id) => id.persistentHandleId)
          .filter((s): s is string => !!s);
      } else {
        const tracked = this._resolveTracked(id);
        if (tracked?.trackingId?.persistentHandleId)
          handleIds = [tracked.trackingId.persistentHandleId];
      }
    }
    this._incrementalUpdate(handleIds, requestId);
  }
  setReInstantiator(
    id: TrackingIdentifier,
    reInstantor: ReInstantiator | null
  ) {
    const tracked = this._resolveTracked(id);
    if (!tracked?.trackingId.persistentHandleId) return;
    if (reInstantor === null) {
      this.reInstantiatorByHandleId.delete(
        tracked.trackingId.persistentHandleId
      );
    } else {
      this.reInstantiatorByHandleId.set(
        tracked.trackingId.persistentHandleId,
        reInstantor
      );
    }
  }
  doPseudoMethod(id: TrackingIdentifier, methodName: string, args: unknown[]) {
    const tracked = this._resolveTracked(id);
    if (!tracked?.currentEntity)
      throw new Error("Unable to find the referenced entity.");
    this.events.emit("methodCall", [tracked.trackingId, methodName, args]);
  }

  // This is called by the runtime.
  doNativeMethod(
    id: TrackingIdentifier,
    methodName: string,
    args: unknown[],
    translateHandlesInArgs?: Record<string, string>
  ): unknown {
    const tracked = this._resolveTracked(id);
    if (!tracked?.currentEntity)
      throw new Error("Unable to find the referenced entity.");
    if (!(methodName in tracked.currentEntity))
      throw new Error(`Unable to find method "${methodName}" on obect.`);
    const func = (tracked.currentEntity as Record<string, unknown>)[methodName];
    if (typeof func !== "function")
      throw new Error(
        `${tracked.currentEntity.type}.${methodName} is not a function.`
      );
    let translatedArgs = args;
    if (translateHandlesInArgs !== undefined) {
      translatedArgs = args.map((arg) => {
        if (typeof arg === "string" && arg in translateHandlesInArgs) {
          const handleId = translateHandlesInArgs[arg];
          const handle = this.get(handleId);
          if (handle?.currentEntity?.id !== undefined) {
            return handle.currentEntity.id;
          }
        }
        return arg;
      });
    }
    return func.apply(tracked.currentEntity, translatedArgs);
  }

  teardown() {
    this.trackingCurrentLevel?.off(EntityLevelEvents.Step, this._onStep);
  }

  // Internal methods.
  private _resolveTracked(id: TrackingIdentifier) {
    let entityId = id.entityId;
    let handleId = id.persistentHandleId;
    if (
      entityId === undefined &&
      handleId === undefined &&
      id.caster === true
    ) {
      entityId = this.ctx.casterId;
    }
    if (entityId !== undefined && handleId === undefined) {
      handleId = this.trackingHandleIdByEntityId.get(entityId);
    }
    if (handleId === undefined) return null;
    return this.trackingByHandleId.get(handleId) ?? null;
  }

  private _ensureTracking() {
    if (this.trackingCurrentLevel === this.ctx.level) return;
    this.setLevel(this.ctx.level);
  }

  setLevel(level?: LevelAPI) {
    if (level !== undefined) {
      for (const handle of this.trackingByHandleId.values()) {
        if (handle.trackingId.persistentHandleId === undefined) continue;
        if (handle.trackingId.entityId !== undefined) {
          const levelEntity = level.getEntity(handle.trackingId.entityId);
          if (levelEntity !== handle.currentEntity) {
            const reInstantiator = this.reInstantiatorByHandleId.get(
              handle.trackingId.persistentHandleId
            );
            if (reInstantiator) {
              handle.currentEntity = reInstantiator(level) ?? undefined;
              handle.trackingId.entityId = handle.currentEntity?.id;
            }
          }
        }
      }
    }
    this.trackingCurrentLevel?.off(EntityLevelEvents.Step, this._onStep);
    this.trackingCurrentLevel = level;
    this.trackingCurrentLevel?.on(EntityLevelEvents.Step, this._onStep);
  }

  private _onStep(ms: number) {
    this.scheduler.step(ms);
  }

  private _incrementalUpdate(targetHandleIds?: string[], requestId?: string) {
    // No-op when there's nothing to track.
    if (!this.trackingCurrentLevel) return;
    if (
      requestId === undefined &&
      targetHandleIds === undefined &&
      this.trackingByHandleId.size === 0
    ) {
      return;
    }

    const handleIds = targetHandleIds ?? [...this.trackingByHandleId.keys()];
    const updates: TrackingInfoMessage[] = [];
    for (const handleId of handleIds) {
      const tracked = this.trackingByHandleId.get(handleId);
      if (!tracked?.currentEntity) continue;
      if (tracked.skipSync) {
        continue;
      }
      const currentEntityInLevel = !!this.trackingCurrentLevel.getEntity(
        tracked.currentEntity.id
      );
      if (currentEntityInLevel) {
        const requestedVariableBinding =
          this.pendingBindingsByHandleId.get(handleId);
        updates.push({
          id: tracked.trackingId,
          requestedVariableBinding,
          type: tracked.currentEntity.type,
          isEnemy: tracked.currentEntity.alignment === EntityAlignment.Enemy,
          position: {
            x: tracked.currentEntity.position.x,
            y: tracked.currentEntity.position.y
          },
          extra: tracked.currentEntity.extraSpellBindingData?.()
        });
      } else {
        updates.push({
          id: tracked.trackingId,
          destroyed: true
        });
        if (tracked.trackingId.entityId)
          this.trackingHandleIdByEntityId.delete(tracked.trackingId.entityId);
        if (tracked.trackingId.persistentHandleId)
          this.trackingByHandleId.delete(tracked.trackingId.persistentHandleId);
      }
    }
    this.pendingBindingsByHandleId.clear();
    this.events.emit("incrementalUpdate", {
      info: updates,
      requestId
    });
  }
}

export class SpellEntitySyncPseudo implements SpellEntitySyncPseudoAPI {
  public readonly events = createTypedEventEmitter<{
    requestTracking: [string, TrackingIdentifier[]];
    nativeMethodCall: [
      string,
      TrackingIdentifier,
      string,
      unknown[],
      Record<string, string> | undefined
    ];
    nativeMethodCallResult: [string, unknown, string | undefined];
  }>();

  private runner?: JSRunnerAPI;
  private trackingByHandleId = new Map<string, TrackedEntityPseudoAPI>();
  private internalResponses = new EventEmitter();

  async requestTracking(
    identifiers: TrackingIdentifier | TrackingIdentifier[]
  ): Promise<TrackedEntityPseudoAPI[]> {
    const requestId = shortid();
    const ids = Array.isArray(identifiers) ? identifiers : [identifiers];
    const waiter = new Promise((resolve) =>
      this.internalResponses.once(requestId, resolve)
    );
    this.events.emit("requestTracking", [requestId, ids]);
    await waiter;
    return ids
      .map((id) => this.getTrackedWithoutRPC(id))
      .filter((value): value is TrackedEntityPseudoAPI => !!value);
  }

  getTrackedWithoutRPC(
    identifier: TrackingIdentifier
  ): TrackedEntityPseudoAPI | null {
    if (identifier.persistentHandleId)
      return this.trackingByHandleId.get(identifier.persistentHandleId) ?? null;
    if (identifier.entityId || identifier.caster) {
      for (const value of this.trackingByHandleId.values()) {
        if (
          identifier.entityId &&
          value.trackingId.entityId &&
          identifier.entityId === value.trackingId.entityId
        )
          return value;
        if (identifier.caster && value.trackingId.caster) return value;
      }
    }
    return null;
  }

  setTracked(identifier: TrackingIdentifier, instance: TrackedEntityPseudoAPI) {
    if (!identifier.persistentHandleId)
      identifier.persistentHandleId = shortid();
    this.trackingByHandleId.set(identifier.persistentHandleId, instance);
  }

  handleUpdates(updates: TrackingInfoMessage[], requestId?: string) {
    for (const update of updates) {
      const { persistentHandleId } = update.id;
      if (!persistentHandleId) continue;
      let entityInfo = this.trackingByHandleId.get(persistentHandleId);
      if (entityInfo === undefined) {
        if (isDestroyedTrackingInfoMessage(update)) continue;
        let EntityInfoClazz = entityBindingDefinitions.get(update.type ?? "");
        if (!EntityInfoClazz) EntityInfoClazz = EntityInfo;
        entityInfo = new EntityInfoClazz();
        entityInfo.runner = this.runner;
        entityInfo.trackingId = update.id;
        entityInfo.type = update.type;
        this.trackingByHandleId.set(persistentHandleId, entityInfo);
      }
      if (isDestroyedTrackingInfoMessage(update)) {
        entityInfo.destroyed = true;
        this.trackingByHandleId.delete(persistentHandleId);
        continue;
      }
      entityInfo.position = new SpellVector(update.position);
      entityInfo.isEnemy = update.isEnemy;
      entityInfo.extra = update.extra;

      // Handle variable binding requests.
      if (update.requestedVariableBinding !== undefined) {
        if (!this.runner) continue;
        const pseudoEntityInfo =
          this.runner.translate.nativeToPseudo(entityInfo);
        this.runner.interpreter.setProperty(
          this.runner.interpreter.globalScope.object,
          update.requestedVariableBinding,
          pseudoEntityInfo
        );
      }
    }
    if (requestId !== undefined) this.internalResponses.emit(requestId);
  }

  async doMethodOnTracked(
    id: TrackingIdentifier,
    methodName: string,
    args: unknown[],
    translateHandlesInArgs?: Record<string, string>
  ) {
    const requestId = shortid();
    const waiting = new Promise<[unknown, string | undefined]>((resolve) => {
      const cb = ([incomingRequestId, result, error]: [
        string,
        unknown,
        string | undefined
      ]) => {
        if (incomingRequestId === requestId) {
          this.events.off("nativeMethodCallResult", cb);
          resolve([result, error]);
        }
      };
      this.events.on("nativeMethodCallResult", cb);
    });
    this.events.emit("nativeMethodCall", [
      requestId,
      id,
      methodName,
      args,
      translateHandlesInArgs
    ]);
    const [result, error] = await waiting;
    if (error === undefined) return result;
    throw new Error(error);
  }

  handleTrackedPsudoCall(
    id: TrackingIdentifier,
    methodName: string,
    args: unknown[]
  ) {
    const { persistentHandleId } = id;
    if (!persistentHandleId) return;
    const entityInfo = this.trackingByHandleId.get(persistentHandleId);
    if (!entityInfo) return;
    if (!(methodName in entityInfo)) return;
    const func = (entityInfo as Record<string, unknown>)[methodName];
    if (typeof func === "function") {
      func.apply(entityInfo, args);
    }
  }

  // Control methods.

  setup(runner: JSRunnerAPI) {
    // Attach the sync helper to the IOC mapping.
    this.runner = runner;
    runner.ctx.ioc.mapping.set(kSpellEntitySync, this);
    return this;
  }

  // Internal methods.
}
