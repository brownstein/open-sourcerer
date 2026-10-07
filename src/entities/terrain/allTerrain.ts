import { Vector3 } from "three";

import { BaseEntityType, EntityClassType } from "src/api/entity";
import { GameAssets } from "src/assets/allAssets";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

import { BaseTerrain } from "./BaseTerrain";
import { DestructableTerrain } from "./DestructableTerrain";
import { LadderTerrain } from "./LadderTerrain";
import { MovingTerrain } from "./MovingTerrain";
import { WaterTerrain } from "./WaterTerrain";

export type AnyTerrain = BaseTerrain | DestructableTerrain | MovingTerrain;

export function isAnyTerrain(entity: BaseEntityType): entity is AnyTerrain {
  switch (entity.type) {
    case BaseTerrain.type:
    case DestructableTerrain.type:
    case MovingTerrain.type:
      return true;
    default:
      return false;
  }
}

export function isAnyPlatform(entity: BaseEntityType) {
  if (!isAnyTerrain(entity)) return false;
  switch (entity.terrain?.tileType) {
    case TiledLevelAPI.TileType.platform:
    case TiledLevelAPI.TileType.platformStairsLeft:
    case TiledLevelAPI.TileType.platformStairsRight:
      return true;
    default:
      return false;
  }
}

// This is a kludge.
export function resolvePersistentTerrainAssets(): (keyof GameAssets)[] {
  return (
    (
      DestructableTerrain as unknown as EntityClassType
    ).getAssetDependencies?.() ?? []
  );
}

export function createEntityForMapTerrain(
  layer: TiledLevelAPI.MapLayer,
  terrain: TiledLevelAPI.MapTerrain
) {
  if (layer.type !== "tiles") return null;
  const layerOffset = new Vector3();
  if (layer.offset !== undefined) {
    layerOffset.x += layer.offset.x * (layer.parallax?.x ?? 1);
    layerOffset.y += layer.offset.y * (layer.parallax?.y ?? 1);
  }
  if (
    layer.properties?.destructable ||
    (terrain.polygon.length > 0 &&
      terrain.tileModifier === TiledLevelAPI.TileModifier.cracked)
  ) {
    return new DestructableTerrain({
      id: terrain.id,
      layerName: layer.name,
      position: new Vector3(terrain.pos.x, terrain.pos.y, layer.depth).add(
        layerOffset
      ),
      terrain
    });
  }
  if (terrain.tileType === TiledLevelAPI.TileType.water) {
    let color = layer.properties?.waterColor as string | undefined;
    if (color) color = `#${color.slice(3)}`; // format into string hex

    return new WaterTerrain({
      id: terrain.id,
      layerName: layer.name,
      position: new Vector3(terrain.pos.x, terrain.pos.y, layer.depth).add(
        layerOffset
      ),
      terrain,
      color
    });
  }
  if (terrain.tileType === TiledLevelAPI.TileType.ladder) {
    return new LadderTerrain({
      id: terrain.id,
      laterName: layer.name,
      position: new Vector3(terrain.pos.x, terrain.pos.y, layer.depth).add(
        layerOffset
      ),
      terrain
    });
  }
  return new BaseTerrain({
    id: terrain.id,
    layerName: layer.name,
    position: new Vector3(terrain.pos.x, terrain.pos.y, layer.depth).add(
      layerOffset
    ),
    terrain,
    opacity: layer.opacity,
    tint: layer.tint,
    npcBypass:
      typeof layer.properties?.npcBypass === "boolean"
        ? layer.properties.npcBypass
        : undefined,
    foreground:
      typeof layer.properties?.foreground === "boolean"
        ? layer.properties.foreground
        : undefined,
    parallax: layer.parallax,
    bounce:
      typeof layer.properties?.bounce === "number"
        ? layer.properties.bounce
        : undefined,
    bounceDir:
      typeof layer.properties?.bounceDir === "number"
        ? layer.properties.bounceDir
        : undefined
  });
}
