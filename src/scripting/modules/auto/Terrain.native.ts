import { isAnyTerrain } from "src/entities/terrain/allTerrain";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";

export type TerrainQueryOpts = {
  min: { x: number; y: number };
  max: { x: number; y: number };
  relative?: boolean;
};

export type LineOfSightOpts = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  ignoreEntities?: boolean;
};

@assertAutoBindableNativeModule
export default class TerrainNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  checkLineOfSight(opts: LineOfSightOpts): boolean {
    const level = this.ctx.level;
    if (!level) throw new Error("No active level");
    const dx = opts.to.x - opts.from.x;
    const dy = opts.to.y - opts.from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return true;
    const ignoreEntities = opts.ignoreEntities ?? false;
    const ray = new level.rapier.Ray(
      { x: opts.from.x, y: opts.from.y },
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
        if (ignoreEntities) {
          const entityId = level.getEntityIdForCollider(collider.handle);
          if (entityId) {
            const entity = level.getEntity(entityId);
            if (entity && !isAnyTerrain(entity)) return false;
          }
        }
        return true;
      }
    );
    return hit === null;
  }

  queryGrid(opts: TerrainQueryOpts) {
    const level = this.ctx.level;
    if (!level?.navTerrain) throw new Error("No terrain available");

    const terrain = level.navTerrain;
    const res = terrain.defaultPlanningResolution;

    let min = opts.min;
    let max = opts.max;

    if (opts.relative) {
      const caster = resolveTrackedCaster(this.ctx)?.currentEntity;
      if (!caster) throw new Error("Caster not found");
      const pos = caster.position;
      min = { x: min.x + pos.x, y: min.y + pos.y };
      max = { x: max.x + pos.x, y: max.y + pos.y };
    }

    const xStart = Math.floor(min.x / res) * res;
    const yStart = Math.floor(min.y / res) * res;
    const xEnd = Math.ceil(max.x / res) * res;
    const yEnd = Math.ceil(max.y / res) * res;

    const grid: number[][] = [];
    for (let y = yStart; y < yEnd; y += res) {
      const row: number[] = [];
      for (let x = xStart; x < xEnd; x += res) {
        row.push(terrain.getBlockAt(x, y));
      }
      grid.push(row);
    }

    return { grid, resolution: res };
  }
}
