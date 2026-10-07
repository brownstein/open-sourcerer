import { typedEmitterPromise } from "src/api/util";
import { Ping, PingEvents } from "src/entities/spells/ping/Ping";
import { TrackingIdentifier } from "src/scripting/runtime/SpellEntitySyncAPI";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";

@assertAutoBindableNativeModule
export default class PingNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  async doPing(): Promise<TrackingIdentifier[] | null> {
    if (!this.ctx.casterId || !this.ctx.level) return null;
    const caster = this.ctx.level.getEntity(this.ctx.casterId);
    if (!caster) return null;
    const ping = new Ping({
      position: caster.position
    });
    this.ctx.level.addEntity(ping);
    const foundEntities = await typedEmitterPromise(
      ping.events,
      PingEvents.Complete
    );
    const trackedEntityIds = foundEntities
      .map((found) => this.ctx.level?.getEntity(found.id))
      .filter((v) => !!v)
      .map((entity) => this.ctx.sync.track(entity).trackingId);
    this.ctx.sync.sync();
    return trackedEntityIds;
  }
}
