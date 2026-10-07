import {
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { Sensor, SensorEvents } from "src/entities/spells/sensor/Sensor";
import { TrackingIdentifier } from "src/scripting/runtime/SpellEntitySyncAPI";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";
import { SensorConstructorArg } from "./validators/sensorValidators";

@assertAutoBindableNativeModule
export default class SensorNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private activeEntityIds = new Set<string>();
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.executionStopped, () => {
      for (const entityId of this.activeEntityIds) {
        const entity = this.ctx.level?.getEntity<Sensor>(entityId);
        if (entity) entity.fadeAway();
      }
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.teardown, () => {
      for (const entityId of this.activeEntityIds) {
        const entity = this.ctx.level?.getEntity<Sensor>(entityId);
        if (entity) entity.fadeAway();
      }
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.setLevel, () => {
      this.activeEntityIds.clear();
    });
  }

  async createSensor(opts: SensorConstructorArg & { useHandleId: string }) {
    const { spark, radius = 2, useHandleId } = opts ?? {};
    const trackedCaster = resolveTrackedCaster(this.ctx, spark?.id ?? undefined);
    const castResult = await runtimeCastSequence(this.ctx, {
      overrideTrackedCaster: trackedCaster?.trackingId,
      color: 0x0088ff,
      speed: 2,
      manaCost: 10
    });

    const makeSensor = (lvl: EntityLevelAPI) => {
      const caster = castResult.trackedCaster.currentEntity;
      if (!caster) return null;
      const sensor = new Sensor({
        position: caster.position.clone(),
        size: {
          width: radius,
          height: radius
        }
      });
      lvl.addEntity(sensor);
      this.activeEntityIds.add(sensor.id);
      sensor.followEntity(caster);
      return sensor;
    };

    const level = this.ctx.level;
    if (!level) throw new Error("[Sensor]: No active level.");
    const sensor = makeSensor(level);
    if (!sensor)
      throw new Error("Broken invariant - no current caster for sensor");

    // Wait a tick for the sensor to pick up nearby entities.
    if (this.ctx.level) {
      await typedEmitterPromise(this.ctx.level, EntityLevelEvents.Step);
    }

    const touchingTrackingIds: TrackingIdentifier[] = [];
    for (const entityId of sensor.contactingIdSet) {
      const entity = this.ctx.level?.getEntity(entityId);
      if (!entity) continue;
      const trackedEntity = this.ctx.sync.track(entity);
      touchingTrackingIds.push(trackedEntity.trackingId);
    }

    const tracked = this.ctx.sync.track(sensor, null, false, useHandleId);
    this.ctx.sync.sync([tracked.trackingId, ...touchingTrackingIds]);
    this.ctx.sync.setReInstantiator(tracked.trackingId, makeSensor);
    return {
      id: tracked.trackingId,
      nearbyTrackingIds: touchingTrackingIds.map(
        (id) => id.persistentHandleId ?? ""
      )
    };
  }

  registerSensorCallbacks(handleId: string) {
    const tracked = this.ctx.sync.get<Sensor>(handleId);
    if (!tracked?.currentEntity)
      throw new Error(
        "[Sensor]: Cannot register callbacks - sensor no longer exists."
      );
    const sensorTrackingId = tracked.trackingId;
    const sensor = tracked.currentEntity;
    // Contacts are delivered main -> worker via doPseudoMethod, invoking the
    // pseudo Sensor entity's _handleContact(event, trackingId).
    sensor.events.on(SensorEvents.EntityContactStart, (entityId) => {
      const entity = this.ctx.level?.getEntity(entityId);
      if (!entity) return;
      const { trackingId } = this.ctx.sync.track(entity);
      this.ctx.sync.sync(trackingId);
      this.ctx.sync.doPseudoMethod(sensorTrackingId, "_handleContact", [
        "enter",
        trackingId
      ]);
    });
    sensor.events.on(SensorEvents.EntityContactEnd, (entityId) => {
      const contactTracked = this.ctx.sync.get(entityId);
      const trackingId = contactTracked?.trackingId ?? { entityId };
      this.ctx.sync.doPseudoMethod(sensorTrackingId, "_handleContact", [
        "leave",
        trackingId
      ]);
    });
  }
}
