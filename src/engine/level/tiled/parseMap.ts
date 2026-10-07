import path from "path-browserify";
import { Box2, Color, Vector2, Vector3 } from "three";

import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";

import { LayerProviderAPI } from "./Layers";
import * as API from "./api";
import { unwrapTiledList } from "./listProperty";
import { buildTerrainFromTileGrid } from "./mergeTerrain";
import * as FORMAT from "./tiledJson";

export type ParseMapOptions = {
  levelJson: FORMAT.ITiledLevelJSON;
  tileSets: Record<string, API.TilesetTileDefs>;
  images?: Record<string, string>;
  layers?: LayerProviderAPI;
};

function parseDefaultFontSize(fontFamily: string | undefined) {
  if (!fontFamily) return null;
  const parts = /([0-9]+)/.exec(fontFamily);
  if (!parts?.length) return null;
  return Number.parseInt(parts[1]);
}

/** Entity props taken from the Tiled object itself. A custom property of the
 *  same name is overwritten on load, so tooling should not offer to edit one. */
export const kLoaderAssignedEntityProps = [
  "id",
  "name",
  "inLevelDef",
  "position",
  "angle",
  "size",
  "layerName"
] as const;

export type LoaderAssignedEntityProp =
  (typeof kLoaderAssignedEntityProps)[number];

export function parseObjectProperties(obj: FORMAT.ITiledLevelJSONObject) {
  const result: Record<string, unknown> = {};
  if (obj.text) {
    result.text = obj.text.text;
    result.textPixelSize =
      obj.text.pixelsize ?? parseDefaultFontSize(obj.text.fontfamily) ?? 12;
    result.textFont = obj.text.fontfamily;
    result.textWrap = obj.text.wrap;
    result.textColor = obj.text.color;
    result.textAlign = obj.text.halign;
    result.textAlignV = obj.text.valign;
  }
  if (obj.polygon)
    result.polygon = obj.polygon.map(
      ({ x, y }) => new Vector2(x * kInvPixelScale, -y * kInvPixelScale)
    );
  if (obj.polyline)
    result.polyline = obj.polyline.map(
      ({ x, y }) => new Vector2(x * kInvPixelScale, -y * kInvPixelScale)
    );
  if (!obj.properties) return result;
  for (const prop of obj.properties ?? []) {
    if (prop.type === "list") {
      result[prop.name] = unwrapTiledList(prop.value);
    } else if (prop.type === "class") {
      // Class values are plain JSON, unlike lists.
      result[prop.name] = prop.value ?? {};
    } else {
      result[prop.name] = prop.value;
    }
  }
  return result;
}

function expandLayerGroups(
  layers: FORMAT.TiledLevelJSONLayer[]
): FORMAT.TiledLevelJSONLayer[] {
  return layers.flatMap((layer) => {
    if (FORMAT.isGroupLayer(layer)) {
      return expandLayerGroups(layer.layers);
    }
    return [layer];
  });
}

export function parseMap(options: ParseMapOptions): API.Map {
  const { levelJson, tileSets, layers } = options;

  const tileScale = 1 / levelJson.tilewidth;
  const dataScale = levelJson.tilewidth / kPixelScale;

  // Map IDs in the level JSON to tile definitions.
  const gidToTileDef = new Map<number, API.TileDef>();
  for (const tileSetRef of levelJson.tilesets) {
    const { firstgid, source: tileSetSource } = tileSetRef;
    const parsedTileSetSource = path.parse(tileSetSource);
    const tileSetName = parsedTileSetSource.name;
    const tileSet = tileSets[tileSetName];
    if (tileSet === undefined) {
      throw new Error(`[parseMap]: missing tileset "${tileSetName}".`);
    }
    for (const tileDef of Object.values(tileSet.defs)) {
      const gid = tileDef.src.id + firstgid;
      gidToTileDef.set(gid, tileDef);
    }
  }

  const expandedLayerGroups = expandLayerGroups(levelJson.layers);
  const modifierMap = new Map<string, API.TileModifier>();
  const getModifier = (x: number, y: number) => modifierMap.get(`${x}:${y}`);
  const setModifier = (x: number, y: number, modifier?: API.TileModifier) =>
    modifier !== undefined ? modifierMap.set(`${x}:${y}`, modifier) : undefined;

  // Build result.
  const result: API.Map = {
    id: "",
    src: levelJson,
    layers: [],
    bbox: new Box2()
  };

  // Note that we're iterating from high layers to low - this is so that we can
  // process modifiers like cracks in front of terrain before we process the terrain
  // below them.
  let layerDepth = Math.floor(expandedLayerGroups.length * 0.5);
  for (const layer of [...expandedLayerGroups].reverse()) {
    if (layers && !layers.includes(layer.name)) continue;
    if (FORMAT.isTileLayer(layer)) {
      if (!layer.visible) continue;

      const isParallax =
        (layer.parallaxx && layer.parallaxx !== 1) ||
        (layer.parallaxy && layer.parallaxy !== 1);
      const resultLayer: API.MapTileLayer = {
        type: "tiles",
        name: layer.name,
        depth: layerDepth,
        terrain: [],
        parallax: isParallax
          ? new Vector2(layer.parallaxx ?? 1, layer.parallaxy ?? 1)
          : undefined,
        offset:
          layer.offsetx || layer.offsety
            ? new Vector2(
                (layer.offsetx ?? 0) * kInvPixelScale,
                -(layer.offsety ?? 0) * kInvPixelScale
              )
            : undefined,
        opacity: layer.opacity,
        tint: layer.tintcolor ? new Color(layer.tintcolor) : undefined,
        properties: layer.properties?.reduce(
          (acc, val) => {
            if (!val.name) return acc;
            acc[val.name] = val.value;
            return acc;
          },
          {} as Record<string, unknown>
        )
      };
      if (levelJson.infinite) {
        if (FORMAT.isFiniteTileLayer(layer)) continue;
        for (const layerChunk of layer.chunks) {
          const layerChunkTerrain = buildTerrainFromTileGrid(
            layerChunk.data,
            layerChunk.width,
            gidToTileDef,
            new Vector2(layerChunk.x, layerChunk.y),
            dataScale,
            true,
            getModifier,
            setModifier
          );
          resultLayer.terrain.push(...layerChunkTerrain);
        }
      } else {
        if (!FORMAT.isFiniteTileLayer(layer)) continue;
        const layerTerrain = buildTerrainFromTileGrid(
          layer.data,
          layer.width,
          gidToTileDef,
          new Vector2(),
          dataScale,
          true,
          getModifier,
          setModifier
        );
        resultLayer.terrain.push(...layerTerrain);
      }
      result.layers.push(resultLayer);
    }
    if (FORMAT.isObjectLayer(layer)) {
      const resultLayer: API.MapObjectLayer = {
        type: "entities",
        name: layer.name,
        depth: layerDepth,
        visible: layer.visible ?? true,
        // eslint-disable-next-line no-loop-func
        entities: layer.objects.map((obj) => {
          const objectAngle = -(obj.rotation * Math.PI) / 180;
          const objectCenter = new Vector2(
            (obj.x + obj.width * 0.5) * tileScale * dataScale,
            -(obj.y + obj.height * 0.5) * tileScale * dataScale
          );
          if (objectAngle !== 0) {
            const objectOrigin = new Vector2(
              obj.x * tileScale * dataScale,
              -obj.y * tileScale * dataScale
            );
            objectCenter.rotateAround(objectOrigin, objectAngle);
          }
          let objType = obj.class ?? obj.type ?? "";
          if (objType === "" && obj.text) objType = "Text";
          const loaderAssigned = {
            id: `tle-${obj.id}`,
            name: obj.name,
            inLevelDef: true,
            position: new Vector3(objectCenter.x, objectCenter.y, layerDepth),
            angle: objectAngle,
            size: {
              width: obj.width * tileScale * dataScale,
              height: obj.height * tileScale * dataScale
            },
            layerName: layer.name
          } satisfies Record<LoaderAssignedEntityProp, unknown>;
          return {
            type: objType,
            props: { ...parseObjectProperties(obj), ...loaderAssigned }
          };
        }),
        expandBounds: !!layer.properties?.some(
          (prop) => prop.name === "expandTo" && !!prop.value
        )
      };
      result.layers.push(resultLayer);
    }
    if (FORMAT.isImageLayer(layer)) {
      if (!layer.visible) continue;
      const layerProps: Record<string, unknown> = {};
      for (const prop of layer.properties ?? []) {
        layerProps[prop.name] = prop.value;
      }
      const resultLayer: API.MapImageLayer = {
        type: "image",
        name: layer.name,
        depth: layerDepth,
        src: layer,
        imageName: path.parse(layer.image ?? "").name,
        offset: new Vector2(layer.offsetx, layer.offsety),
        parallax: new Vector2(
          1 - (layer.parallaxx ?? 1),
          1 - (layer.parallaxy ?? 1)
        ),
        repeatX: !!layer.repeatx,
        repeatY: !!layer.repeaty,
        extendX: !!layerProps.extendX,
        extendY: !!layerProps.extendY
      };
      result.layers.push(resultLayer);
    }
    layerDepth--;
  }

  // Resolve level bounding box.
  const tmpVtx = new Vector2();
  for (const layer of result.layers) {
    if (!API.isMapTileLayer(layer)) continue;
    if (layer.parallax) continue;
    for (const terrain of layer.terrain) {
      for (const vtx of terrain.polygon) {
        tmpVtx.copy(terrain.pos).add(vtx);
        result.bbox.expandByPoint(tmpVtx);
      }
    }
  }

  return result;
}
