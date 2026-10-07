import { arr2 } from "src/engine/util/vecTypes";
import { SpellAreaPreview } from "src/entities/spells/area-preview/SpellAreaPreview";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";

@assertAutoBindableNativeModule
export default class AreaPreviewNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private activeEntityIds = new Set<string>();
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.executionStopped, () => {
      for (const entityId of this.activeEntityIds) {
        const entity = this.ctx.level?.getEntity<SpellAreaPreview>(entityId);
        if (entity) entity.fadeAway();
      }
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.teardown, () => {
      for (const entityId of this.activeEntityIds) {
        const entity = this.ctx.level?.getEntity<SpellAreaPreview>(entityId);
        if (entity) entity.fadeAway();
      }
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.setLevel, () => {
      this.activeEntityIds.clear();
    });
  }

  createPreview(opts: {
    polygon: arr2[];
    attachToEntityId?: string | null;
    color?: { r: number; g: number; b: number } | null;
  }) {
    // Resolve the attach target through tracked entities.
    let resolvedAttachId: string | undefined;
    if (opts.attachToEntityId) {
      const tracked = this.ctx.sync.get(opts.attachToEntityId);
      if (tracked?.currentEntity) {
        resolvedAttachId = tracked.currentEntity.id;
      } else {
        // Try as a raw entity ID.
        const entity = this.ctx.level?.getEntity(opts.attachToEntityId);
        if (entity) resolvedAttachId = entity.id;
      }
    }

    // Position at caster or at origin if no caster.
    const casterPos = resolveTrackedCaster(this.ctx)?.currentEntity?.position;

    const preview = new SpellAreaPreview({
      position: casterPos ?? { x: 0, y: 0, z: 0 },
      previewPolygon: opts.polygon,
      attachToEntityId: resolvedAttachId,
      color: opts.color ?? undefined
    });
    this.ctx.level?.addEntity(preview);
    this.activeEntityIds.add(preview.id);
    return { id: preview.id };
  }

  recolorPreview(opts: {
    id: string;
    color: { r: number; g: number; b: number };
  }) {
    const entity = this.ctx.level?.getEntity<SpellAreaPreview>(opts.id);
    if (entity?.setColor) {
      entity.setColor(opts.color.r, opts.color.g, opts.color.b);
    }
  }

  destroyPreview(opts: { id: string }) {
    const entity = this.ctx.level?.getEntity<SpellAreaPreview>(opts.id);
    if (entity?.fadeAway) {
      entity.fadeAway();
    }
    this.activeEntityIds.delete(opts.id);
  }
}
