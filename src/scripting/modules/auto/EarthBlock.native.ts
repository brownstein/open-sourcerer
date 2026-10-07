import getNormals from "polyline-normals";
import { Vector2, Vector3 } from "three";

import { ElementalType } from "src/api/entity";
import { hasCasterEntityApi } from "src/api/entitySpellCasting";
import { arr2, vector2ToArr2 } from "src/engine/util/vecTypes";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";
import { SpellAreaPreview } from "src/entities/spells/area-preview/SpellAreaPreview";
import { EarthBlock as EarthBlockEntity } from "src/entities/spells/earth/EarthBlockEntity";
import { RasterShapeEvents } from "src/entities/shared/behaviors/RasterShapeBehavior";
import { DrawEvents, DrawHelper } from "src/entities/ui/DrawHelper";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";
import { arr2Polygon, getClosedPolygon } from "src/util/polygons";

import { assertAutoBindableNativeModule } from "../autoAPI";
import { resolveTrackedCaster } from "../shared/resolveCaster";
import { runtimeCastSequence } from "../shared/runtimeCastSequence";

@assertAutoBindableNativeModule
export default class EarthBlockNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  private entityIds = new Set<string>();
  private tornDown = false;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  teardown() {
    this.tornDown = true;
    for (const entityId of this.entityIds) {
      const entity = this.ctx.level?.getEntity<EarthBlockEntity>(entityId);
      if (entity) entity.clear();
      this.entityIds.delete(entityId);
    }
  }

  async castEarthBlockSync(opt: {
    useHandleId: string;
    casterId?: string;
    drawShape?: boolean;
    shape?: arr2[];
    holes?: arr2[][];
    angle?: number;
    offset?: arr2;
  }) {
    const {
      useHandleId,
      casterId: casterIdIn,
      shape,
      holes,
      angle = 0,
      offset,
      drawShape
    } = opt;
    const trackedCaster = resolveTrackedCaster(this.ctx, casterIdIn);
    const caster = trackedCaster?.currentEntity;

    let resolvedShape = shape;
    let resolvedOrigin: Vector2 | undefined;
    let drawShapeHelper: DrawHelper | undefined;
    if (caster && drawShape) {
      drawShapeHelper = new DrawHelper({
        position: caster.position.clone(),
        color: "#665544"
      });
      this.ctx.level?.addEntity(drawShapeHelper);
      drawShapeHelper.events.on(DrawEvents.LineComplete, (shapeVerts) => {
        resolvedOrigin = shapeVerts.at(0);
        if (!resolvedOrigin) return;
        const shapeArrs = shapeVerts.map((vtx) =>
          vector2ToArr2(vtx.clone().sub(resolvedOrigin ?? new Vector2()))
        );
        const closedPolygon = getClosedPolygon(shapeArrs);
        if (closedPolygon) {
          resolvedShape = closedPolygon;
        } else {
          const normals = getNormals(shapeArrs);
          resolvedShape = [];
          const leftWall: arr2Polygon = [];
          const rightWall: arr2Polygon = [];
          const r = 0.125;
          const firstNormal = normals.at(0);
          if (firstNormal === undefined) return;
          const firstNormalVector = new Vector2(firstNormal[0][0], firstNormal[0][1]);
          const firstNormalAngle = firstNormalVector.angle() + Math.PI;
          for (let i = 1; i <= 3; i++) {
            const angle = firstNormalAngle - i * Math.PI / 4;
            const vector = new Vector2(1, 0).rotateAround(new Vector2(), angle).multiplyScalar(r);
            resolvedShape.push([vector.x, vector.y]);
          }
          for (let i = 0; i < shapeArrs.length - 1; i++) {
            const pt = shapeArrs[i];
            const normal = normals[i];
            leftWall.push([
              pt[0] + normal[0][0] * normal[1] * r,
              pt[1] + normal[0][1] * normal[1] * r
            ]);
            rightWall.push([
              pt[0] - normal[0][0] * normal[1] * r,
              pt[1] - normal[0][1] * normal[1] * r
            ]);
          }
          resolvedShape.push(...leftWall);
          resolvedShape.push(shapeArrs[shapeArrs.length - 1]);
          rightWall.reverse();
          resolvedShape.push(...rightWall);
        }
      });
    }
    let castResult: Awaited<ReturnType<typeof runtimeCastSequence>> | undefined;
    try {
      castResult = await runtimeCastSequence(this.ctx, {
        overrideTrackedCaster: trackedCaster?.trackingId,
        aim: !!drawShape,
        elementalType: ElementalType.Earth,
        color: 0x665544,
        // Mana cost is 0 for this, as the actual required mana will be
        // identified asynchronously.
        manaCost: 0
      });
    } catch (err) {
      console.warn("Cast failed", err);
    }
    if (drawShapeHelper) {
      this.ctx.level?.removeEntity(drawShapeHelper.id);
    }
    if (!castResult?.trackedCaster.currentEntity) {
      throw new Error(
        "[Earth]: Broken invariant; no caster handle or caster entity."
      );
    }
    const castOffset = new Vector3();
    if (isPlayerAPI(castResult.trackedCaster.currentEntity)) {
      castOffset.x += castResult.trackedCaster.currentEntity.isFacingRight()
        ? 1
        : -1;
      castOffset.y = 0.25;
    }
    if (offset) {
      castOffset.x = offset[0];
      castOffset.y = offset[1];
    }
    const castPosition = castResult.trackedCaster.currentEntity.position
      .clone()
      .add(castOffset);
    if (resolvedOrigin) {
      castPosition.x = resolvedOrigin.x;
      castPosition.y = resolvedOrigin.y;
    }
    let acceptedArea = 0;
    try {
      const stoneBlock = new EarthBlockEntity({
        position: castPosition,
        shape: resolvedShape,
        holes,
        angle
      });
      stoneBlock.behaviors.shape.events.once(
        RasterShapeEvents.AcceptedWithArea,
        (area) => (acceptedArea = area)
      );
      this.ctx.level?.addEntity(stoneBlock);

      // Ensure we can actually cast this with a mana cost.
      const casterWithSpellApi = hasCasterEntityApi(caster)
        ? caster
        : undefined;

      const manaCost = acceptedArea * 16 + 10;
      if (acceptedArea === 0 || !casterWithSpellApi?.subMana(manaCost)) {
        stoneBlock.shatter();
        // Show a red area preview when mana was insufficient (but shape valid).
        if (acceptedArea > 0 && resolvedShape) {
          const previewPolygon: arr2[] = angle
            ? resolvedShape.map(([x, y]) => [
                x * Math.cos(angle) - y * Math.sin(angle),
                x * Math.sin(angle) + y * Math.cos(angle)
              ])
            : resolvedShape;
          const preview = new SpellAreaPreview({
            position: castPosition,
            previewPolygon,
            color: { r: 1, g: 0, b: 0 }
          });
          this.ctx.level?.addEntity(preview);
          preview.getScheduler().add({
            id: "delayedFade",
            startIn: 1000,
            invokeFunctionAtComplete: () => preview.fadeAway()
          });
        }
        const reason =
          acceptedArea > 0
            ? `Not enough mana: earth shape requires area ${acceptedArea.toFixed(
                2
              )}, costing ${manaCost} mana.`
            : undefined;
        return {
          id: null,
          reason
        };
      }

      await stoneBlock.successfulInitialGrowth.getPromise();

      this.entityIds.add(stoneBlock.id);

      const trackingInfo = this.ctx.sync.track(
        stoneBlock,
        null,
        false,
        useHandleId
      );
      this.ctx.sync.sync(trackingInfo.trackingId);

      if (this.tornDown) {
        stoneBlock.shatter();
        return {
          id: null
        };
      }
      return {
        id: trackingInfo.trackingId
      };
    } catch (err) {
      console.warn(err);
      return {
        id: null
      };
    }
  }

  destroyEarthBlock(id: string) {
    const entity = this.ctx.sync?.get<EarthBlockEntity>(id)?.currentEntity;
    entity?.shatter();
    return !!entity;
  }

  detachEarthBlock(id: string) {
    const entity = this.ctx.sync?.get<EarthBlockEntity>(id)?.currentEntity;
    entity?.detachFromTerrain();
    return !!entity;
  }
}
