import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Texture,
  Vector2
} from "three";

import { BaseEntityType, EntityBehavior } from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kPixelScale } from "src/engine/constants/scaling";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

export type SheetInfo<M extends Material = Material> = {
  info: TiledLevelAPI.TiledJsonSheetSrcInfo;
  tiles: TileInfo[];
  geom: BufferGeometry;
  material: M;
};

export type TileInfo = {
  mapTile: TiledLevelAPI.MapTile;
  quadIndex: number;
  pos: Vector2;
  vel: Vector2;
  acc: Vector2;
  rot: number;
  angVel: number;
  scale: number;
};

const kInsetUVs = 0.001;

export class AdvancedTerrainRenderBehavior<
  MaterialType extends Material = Material
> implements EntityBehavior
{
  public type = "TileTrackedTerrainRenderBehavior";
  public entity?: BaseEntityType;
  public decalTiles?: TiledLevelAPI.MapTile[];
  public object3D = new Object3D();
  public opacity = 1;
  private mesh?: Mesh;
  private constructMaterial?: (texture: Texture) => MaterialType;
  protected sheets: SheetInfo[] = [];
  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }
  setTiles(decalTiles: TiledLevelAPI.MapTile[]) {
    this.decalTiles = decalTiles;
    return this;
  }
  setConstructMaterial(constructMaterial: typeof this.constructMaterial) {
    this.constructMaterial = constructMaterial;
    return this;
  }
  buildTileMeshes() {
    if (!this.entity || !this.decalTiles) return this;
    this.opacity = 1;

    const tilesByTileSet = new Map<string, TiledLevelAPI.MapTile[]>();
    for (const tile of this.decalTiles) {
      const sheetName = tile.def.src.sheet.name;
      if (!tilesByTileSet.has(sheetName)) tilesByTileSet.set(sheetName, []);
      tilesByTileSet.get(sheetName)?.push(tile);
    }

    for (const sheetTiles of tilesByTileSet.values()) {
      const sheet = sheetTiles[0].def.src.sheet;
      const quadCount = sheetTiles.length;

      const posDx = sheet.tileSize.x / kPixelScale;
      const posDy = -sheet.tileSize.y / kPixelScale;

      const geom = new BufferGeometry();
      const indexArr = new Uint16Array(quadCount * 6);
      const posArr = new Float32Array(quadCount * 12);
      const uvArr = new Float32Array(quadCount * 8);

      const uvDx = sheet.tileSize.x;
      const uvDy = sheet.tileSize.y;
      const invUvX = 1 / sheet.textureSize.x;
      const invUvY = 1 / sheet.textureSize.y;

      const tiles: TileInfo[] = [];
      for (let ti = 0; ti < sheetTiles.length; ti++) {
        const tile = sheetTiles[ti];
        const info: TileInfo = {
          mapTile: tile,
          quadIndex: ti,
          pos: tile.pos.clone(),
          vel: new Vector2(),
          acc: new Vector2(),
          rot: 0,
          angVel: 0,
          scale: 1
        };
        tiles.push(info);

        indexArr[ti * 6 + 0] = ti * 4 + 0;
        indexArr[ti * 6 + 1] = ti * 4 + 1;
        indexArr[ti * 6 + 2] = ti * 4 + 3;
        indexArr[ti * 6 + 3] = ti * 4 + 1;
        indexArr[ti * 6 + 4] = ti * 4 + 3;
        indexArr[ti * 6 + 5] = ti * 4 + 2;

        // apply flip transformations to the vertices
        const w = posDx;
        const h = Math.abs(posDy);

        const vTL = { x: 0, y: 0 };
        const vTR = { x: w, y: 0 };
        const vBR = { x: w, y: h };
        const vBL = { x: 0, y: h };

        let currentTileSize = { w: w, h: h };

        if (tile.flipOptions) {
          const shouldFlipDiagonal =
            tile.flipOptions[TiledLevelAPI.TileFlip.diagonal];
          const shouldFlipHorizontal =
            tile.flipOptions[TiledLevelAPI.TileFlip.horizontal];
          const shouldFlipVertical =
            tile.flipOptions[TiledLevelAPI.TileFlip.vertical];

          if (shouldFlipDiagonal) {
            const flipDiagonal = (vertex: { x: number; y: number }) => {
              [vertex.x, vertex.y] = [vertex.y, vertex.x];
            };

            flipDiagonal(vTL);
            flipDiagonal(vTR);
            flipDiagonal(vBL);
            flipDiagonal(vBR);

            [currentTileSize.w, currentTileSize.h] = [
              currentTileSize.h,
              currentTileSize.w
            ];
          }

          if (shouldFlipHorizontal) {
            const flipHorizontal = (vertex: { x: number }) => {
              vertex.x = currentTileSize.w - vertex.x;
            };

            flipHorizontal(vTL);
            flipHorizontal(vTR);
            flipHorizontal(vBL);
            flipHorizontal(vBR);
          }

          if (shouldFlipVertical) {
            const flipVertical = (vertex: { y: number }) => {
              vertex.y = currentTileSize.h - vertex.y;
            };

            flipVertical(vTL);
            flipVertical(vTR);
            flipVertical(vBL);
            flipVertical(vBR);
          }
        }

        posArr[ti * 12 + 0] = tile.pos.x + vTL.x;
        posArr[ti * 12 + 1] = tile.pos.y - vTL.y;
        posArr[ti * 12 + 3] = tile.pos.x + vTR.x;
        posArr[ti * 12 + 4] = tile.pos.y - vTR.y;
        posArr[ti * 12 + 6] = tile.pos.x + vBR.x;
        posArr[ti * 12 + 7] = tile.pos.y - vBR.y;
        posArr[ti * 12 + 9] = tile.pos.x + vBL.x;
        posArr[ti * 12 + 10] = tile.pos.y - vBL.y;

        uvArr[ti * 8 + 0] = (tile.def.srcPos.x + kInsetUVs) * invUvX;
        uvArr[ti * 8 + 1] = 1 - (tile.def.srcPos.y + kInsetUVs) * invUvY;
        uvArr[ti * 8 + 2] = (tile.def.srcPos.x + uvDx - kInsetUVs) * invUvX;
        uvArr[ti * 8 + 3] = 1 - (tile.def.srcPos.y + kInsetUVs) * invUvY;
        uvArr[ti * 8 + 4] = (tile.def.srcPos.x + uvDx - kInsetUVs) * invUvX;
        uvArr[ti * 8 + 5] = 1 - (tile.def.srcPos.y + uvDy - kInsetUVs) * invUvY;
        uvArr[ti * 8 + 6] = (tile.def.srcPos.x + kInsetUVs) * invUvX;
        uvArr[ti * 8 + 7] = 1 - (tile.def.srcPos.y + uvDy - kInsetUVs) * invUvY;
      }

      geom.setIndex(new BufferAttribute(indexArr, 1));
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
      geom.setAttribute("uv", new BufferAttribute(uvArr, 2));

      let material: MaterialType;
      if (this.constructMaterial && sheet.texture) {
        material = this.constructMaterial(sheet.texture);
      } else {
        // I don't love the type cast to material type, but I'll take it here.
        material = new MeshBasicMaterial({
          map: sheet.texture,
          transparent: true,
          side: DoubleSide,
          opacity: 1,
          alphaTest: 0.05
        }) as unknown as MaterialType;
      }

      const sheetInfo: SheetInfo = {
        info: sheet,
        tiles,
        geom,
        material
      };
      this.sheets.push(sheetInfo);

      this.mesh = new Mesh(geom, material);
      this.mesh.layers.set(RenderLayers.default);
      this.object3D.add(this.mesh);
    }
    return this;
  }
  destroy() {
    this.object3D.clear();
    this.mesh = undefined;
    for (const sheet of this.sheets) {
      sheet.geom.dispose();
      sheet.material.dispose();
    }
    this.sheets = [];
  }
  apply() {
    this.entity?.object3D?.add(this.object3D);
    return this;
  }
  setOpacity(opacity: number) {
    if (this.opacity === opacity) return;
    this.opacity = opacity;
    for (const sheet of this.sheets) sheet.material.opacity = opacity;
  }
  updateAllGeometry() {
    for (const sheetInfo of this.sheets) {
      const sheet = sheetInfo.info;
      const posArr = sheetInfo.geom.getAttribute("position")
        .array as Float32Array;
      const posDx = (0.5 * sheet.tileSize.x) / kPixelScale;
      const posDy = (0.5 * sheet.tileSize.y) / kPixelScale;
      for (const tileInfo of sheetInfo.tiles) {
        const quadIndex = tileInfo.quadIndex;
        const pos = tileInfo.pos;
        const dx = Math.cos(tileInfo.rot) * tileInfo.scale;
        const dy = Math.sin(tileInfo.rot) * tileInfo.scale;
        posArr[quadIndex * 12 + 0] = pos.x - posDx * dx - posDy * dy;
        posArr[quadIndex * 12 + 1] = pos.y + posDy * dx - posDx * dy;
        posArr[quadIndex * 12 + 3] = pos.x + posDx * dx - posDy * dy;
        posArr[quadIndex * 12 + 4] = pos.y + posDy * dx + posDx * dy;
        posArr[quadIndex * 12 + 6] = pos.x + posDx * dx + posDy * dy;
        posArr[quadIndex * 12 + 7] = pos.y - posDy * dx + posDx * dy;
        posArr[quadIndex * 12 + 9] = pos.x - posDx * dx + posDy * dy;
        posArr[quadIndex * 12 + 10] = pos.y - posDy * dx - posDx * dy;
      }
      sheetInfo.geom.getAttribute("position").needsUpdate = true;
    }
    return this;
  }
  updateAllTilesWithVelocity(ms: number) {
    const delta = new Vector2();
    for (const sheet of this.sheets) {
      for (const tile of sheet.tiles) {
        delta.copy(tile.vel).multiplyScalar(ms * 0.001);
        tile.pos.add(delta);
        delta.copy(tile.acc).multiplyScalar(ms * 0.001);
        tile.vel.add(delta);
        tile.rot += ms * tile.angVel * 0.001;
      }
    }
    this.updateAllGeometry();
  }
  applyToAllTiles(effector: (info: TileInfo) => void) {
    for (const sheet of this.sheets) {
      for (const tile of sheet.tiles) effector(tile);
    }
  }
  getSheets() {
    return this.sheets;
  }
}
