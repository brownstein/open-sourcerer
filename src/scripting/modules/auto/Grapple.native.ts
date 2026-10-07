import { RayColliderIntersection } from "@dimforge/rapier2d-compat";

import { GrappleLine } from "src/entities/spells/grapple/GrappleLine";
import { isAnyTerrain } from "src/entities/terrain/allTerrain";
import {
  SpellRuntimeModuleCtxAPI,
  SpellRuntimeModuleEvents
} from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";

@assertAutoBindableNativeModule
export default class GrappleNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private activeEntityIds = new Set<string>();

  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.executionStopped, () => {
      this.destroyAll();
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.teardown, () => {
      this.destroyAll();
    });
    this.ctx.moduleEvents.on(SpellRuntimeModuleEvents.setLevel, () => {
      this.activeEntityIds.clear();
    });
  }

  private destroyAll() {
    for (const entityId of this.activeEntityIds) {
      const entity = this.ctx.level?.getEntity<GrappleLine>(entityId);
      if (entity) entity.detach();
    }
  }

  async createGrapple(props: {
    casterId?: string;
    sourceEntityId?: string;
    targetX: number;
    targetY: number;
    targetEntityId?: string;
    length?: number;
    springiness?: number;
  }) {
    let sourceEntity;
    if (props.sourceEntityId) {
      sourceEntity = this.ctx.level?.getEntity(props.sourceEntityId);
      if (!sourceEntity) throw new Error("[Grapple]: Source entity not found.");
    } else {
      const trackedCaster = resolveTrackedCaster(this.ctx, props.casterId);
      sourceEntity = trackedCaster?.currentEntity;
      if (!sourceEntity) throw new Error("[Grapple]: Caster entity not found.");
    }

    const sourcePos = sourceEntity.position;

    const dx = props.targetX - sourcePos.x;
    const dy = props.targetY - sourcePos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const grappleLine = new GrappleLine({
      position: { x: sourcePos.x, y: sourcePos.y, z: 0 },
      sourceEntityId: sourceEntity.id,
      targetPosition: { x: props.targetX, y: props.targetY },
      targetEntityId: props.targetEntityId,
      length: props.length ?? distance,
      springiness: props.springiness ?? 0.5
    });

    this.ctx.level?.addEntity(grappleLine);
    this.activeEntityIds.add(grappleLine.id);

    const tracked = this.ctx.sync.track(grappleLine);
    return {
      id: tracked.trackingId.persistentHandleId ?? "",
      length: grappleLine.length,
      springiness: grappleLine.springiness
    };
  }

  async setGrappleLength(
    handleId: string,
    length: number,
    transitionMs: number
  ) {
    const tracked = this.ctx.sync.get<GrappleLine>(handleId);
    if (!tracked?.currentEntity)
      throw new Error("[Grapple]: Grapple line no longer exists.");
    tracked.currentEntity.setLength(length, transitionMs);
  }

  async setGrappleSpringiness(
    handleId: string,
    springiness: number,
    transitionMs: number
  ) {
    const tracked = this.ctx.sync.get<GrappleLine>(handleId);
    if (!tracked?.currentEntity)
      throw new Error("[Grapple]: Grapple line no longer exists.");
    tracked.currentEntity.setSpringiness(springiness, transitionMs);
  }

  async destroyGrapple(handleId: string) {
    const tracked = this.ctx.sync.get<GrappleLine>(handleId);
    if (!tracked?.currentEntity) return;
    tracked.currentEntity.detach();
    this.activeEntityIds.delete(tracked.currentEntity.id);
  }

  async castRay(props: {
    casterId?: string;
    directionX: number;
    directionY: number;
    maxDistance?: number;
  }) {
    const level = this.ctx.level;
    if (!level) throw new Error("[Grapple]: No level available.");

    const trackedCaster = resolveTrackedCaster(this.ctx, props.casterId);
    const casterEntity = trackedCaster?.currentEntity;
    if (!casterEntity) throw new Error("[Grapple]: Caster entity not found.");

    const origin = casterEntity.position;
    const dirLen = Math.sqrt(
      props.directionX * props.directionX + props.directionY * props.directionY
    );
    if (dirLen < 0.001)
      return { hit: false, x: origin.x, y: origin.y, distance: 0 };

    const nx = props.directionX / dirLen;
    const ny = props.directionY / dirLen;
    const maxDist = props.maxDistance ?? 20;

    const ray = new level.rapier.Ray(
      { x: origin.x, y: origin.y },
      { x: nx, y: ny }
    );

    const result: {
      hit: boolean;
      x: number;
      y: number;
      distance: number;
      entityId?: string;
    } = { hit: false, x: origin.x, y: origin.y, distance: 0 };

    level.world.intersectionsWithRay(
      ray,
      maxDist,
      false,
      (hit: RayColliderIntersection) => {
        if (hit.collider.isSensor()) return true;

        const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
        if (!hitEntityId) return true;

        // Skip the caster itself
        if (hitEntityId === casterEntity.id) return true;

        const hitEntity = level.getEntity(hitEntityId);
        if (!hitEntity) return true;

        // Accept terrain (including platforms) and enemy entities
        const isTerrain = isAnyTerrain(hitEntity);
        const isEnemy =
          hitEntity.alignment !== undefined &&
          hitEntity.alignment !== casterEntity.alignment;
        if (!isTerrain && !isEnemy) return true;

        const dist = hit.timeOfImpact;
        if (!result.hit || dist < result.distance) {
          result.hit = true;
          result.x = origin.x + nx * dist;
          result.y = origin.y + ny * dist;
          result.distance = dist;
          result.entityId = isTerrain ? undefined : hitEntityId;
        }
        return true; // continue to find closest
      }
    );

    return result;
  }
}
