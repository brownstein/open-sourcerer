import {
  ColliderDesc,
  RigidBody,
  RigidBodyDesc
} from "@dimforge/rapier2d-compat";
import { Color, Object3D, Vector2 } from "three";

import { BaseEntityType, EntityAlignment, EntityProps } from "src/api/entity";
import { SpellCtx, SpellCtxConsoleLogLine, SpellsAPI } from "src/api/spells";
import { TILE_SIZE } from "src/components/level-editor/constants";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { MapTile } from "src/engine/level/tiled/api";
import { SpellExecutionListenerBehavior } from "src/entities/shared/behaviors/SpellExecutionListenerBehavior";
import { TerrainRenderBehavior } from "src/entities/terrain/BaseTerrain";
import {
  TerrainIntersectionBehavior,
  TerrainIntersectionEvents
} from "src/entities/terrain/behaviors/TerrainIntersectionBehavior";
import { distance3DTo2D } from "src/util/mathUtils";

export type ConsoleLogTerrainProps = EntityProps & {
  validCasterRange?: number;
};

export class ConsoleLogTerrain extends CoreEntity implements BaseEntityType {
  static readonly type = "ConsoleLogTerrain";
  public readonly type = ConsoleLogTerrain.type;

  public alignment = EntityAlignment.TemporaryTerrain;
  public object3D = new Object3D();

  public behaviors = {
    terrainIntersection: new TerrainIntersectionBehavior(),
    ghostRender: new TerrainRenderBehavior(),
    activeRender: new TerrainRenderBehavior(),
    spellListener: new SpellExecutionListenerBehavior()
  };

  private readonly validCasterRange: number;

  private readonly tileGrid: Map<string, MapTile> = new Map();

  private currentRow = 0;
  private activeBody?: RigidBody;

  private readonly INACTIVE_TILE_OPACITY = 0.25;
  private readonly INACTIVE_TILE_TINT = new Color(0.5, 0.5, 0.5);
  private readonly ACTIVE_TILE_DEPTH_OFFSET = 0.1;

  constructor(props: ConsoleLogTerrainProps) {
    super(props);

    this.validCasterRange = props.validCasterRange
      ? props.validCasterRange
      : 10;

    this.object3D.position.copy(this.position);

    this.behaviors.terrainIntersection.init(this);
    this.behaviors.ghostRender.init(this);
    this.behaviors.activeRender.init(this);

    this.behaviors.terrainIntersection.events.on(
      TerrainIntersectionEvents.TerrainIntersected,
      ({ mergedTerrain, body, colliders }) => {
        if (this.level) {
          for (const collider of colliders) {
            this.level.world.removeCollider(collider, false);
          }

          this.level.world.removeRigidBody(body);
        }

        this._indexTileGrid(mergedTerrain.decalTiles);

        this.behaviors.ghostRender
          .setTiles(mergedTerrain.decalTiles)
          .buildTileMeshes()
          .setOpacity(this.INACTIVE_TILE_OPACITY)
          .setTint(this.INACTIVE_TILE_TINT)
          .apply();
      }
    );

    this.behaviors.spellListener
      .onExecutionStart(this._onExecutionStart)
      .onConsoleLog(this._onConsoleLog);
  }

  attachToSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.attachToSpellApi(api);
  }

  detachFromSpellApi(api: SpellsAPI): void {
    this.behaviors.spellListener.detachFromSpellApi(api);
  }

  destroy(): void {
    this._resetGridState();
    super.destroy();
  }

  private _indexTileGrid(decalTiles: MapTile[]): void {
    if (decalTiles.length === 0) return;

    // top left origin, so row=0 can be the top-most row
    const tileGridOrigin = new Vector2(Infinity, -Infinity);
    for (const tile of decalTiles) {
      if (tile.pos.x < tileGridOrigin.x) tileGridOrigin.x = tile.pos.x;
      if (tile.pos.y > tileGridOrigin.y) tileGridOrigin.y = tile.pos.y;
    }

    const tileWidth = TILE_SIZE * kInvPixelScale;
    const tileHeight = TILE_SIZE * kInvPixelScale;

    for (const tile of decalTiles) {
      const tileCol = Math.round((tile.pos.x - tileGridOrigin.x) / tileWidth);
      const tileRow = Math.round((tileGridOrigin.y - tile.pos.y) / tileHeight);

      this.tileGrid.set(this._getTileGridKey(tileCol, tileRow), tile);
    }
  }

  private readonly _onExecutionStart = (ctx: SpellCtx): boolean => {
    if (!this.level) return false;

    const caster = ctx.getCaster();
    if (!caster) return false;
    if (distance3DTo2D(caster.position, this.position) > this.validCasterRange)
      return false;

    this._resetGridState();

    const { world } = this.level;
    this.activeBody = world.createRigidBody(RigidBodyDesc.fixed());
    this.activeBody.setTranslation(
      { x: this.position.x, y: this.position.y },
      true
    );

    return true;
  };

  private readonly _onConsoleLog = (logLine: SpellCtxConsoleLogLine): void => {
    const row = this.currentRow;
    this.currentRow += 1;

    const text =
      typeof logLine.primitiveValue === "string" ? logLine.primitiveValue : "";

    const revealedTiles: MapTile[] = [];

    for (let col = 0; col < text.length; col++) {
      if (text[col] !== "#") continue;

      const gridTile = this.tileGrid.get(this._getTileGridKey(col, row));
      if (!gridTile) continue;

      revealedTiles.push(gridTile);
      this._createTileCollider(gridTile);
    }

    if (revealedTiles.length === 0) return;

    this.behaviors.activeRender
      .setTiles(revealedTiles)
      .buildTileMeshes(this.ACTIVE_TILE_DEPTH_OFFSET)
      .apply();
  };

  private _createTileCollider(tile: MapTile): void {
    if (!this.level || !this.activeBody) return;

    const { collisionPolygon } = tile;
    if (!collisionPolygon) return;

    const { world } = this.level;
    const points = new Float32Array(collisionPolygon.length * 2);
    for (let i = 0; i < collisionPolygon.length; i++) {
      points[i * 2 + 0] = collisionPolygon[i].x;
      points[i * 2 + 1] = collisionPolygon[i].y;
    }
    const colliderDesc = ColliderDesc.convexHull(points);
    if (colliderDesc === null) return;

    colliderDesc.setCollisionGroups(terrainCollisionGroup);
    world.createCollider(colliderDesc, this.activeBody);

    this.level.updateEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.activeBody.handle
    });
  }

  private _resetGridState(): void {
    this.behaviors.activeRender.destroy();
    this.currentRow = 0;

    if (this.activeBody && this.level) {
      this.level.world.removeRigidBody(this.activeBody);
      this.level.removeEntityPhysicsHooks(this.id);
    }

    this.activeBody = undefined;
  }

  private _getTileGridKey(col: number, row: number): string {
    return `${col},${row}`;
  }
}
