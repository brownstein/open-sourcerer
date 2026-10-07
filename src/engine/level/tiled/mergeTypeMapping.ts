import { TileType } from "./api";

const mergeTypeMapping = new Map<string, Set<string>>();
const mergeTypes: TileType[][] = [
  [
    TileType.ground,
    TileType.slopeLeft,
    TileType.slopeRight,
    TileType.stairsLeft,
    TileType.stairsRight
  ],
  [TileType.platform, TileType.platformStairsLeft, TileType.platformStairsRight]
];

for (const row of mergeTypes) {
  const rowSet = new Set(row);
  for (const item of row) {
    mergeTypeMapping.set(item, rowSet);
  }
}

export function canMergeTerrainTypes(
  typeA: TileType | undefined,
  typeB: TileType | undefined
) {
  if (typeA === typeB) return true;
  if (typeA === undefined) return typeB === undefined;
  if (typeB === undefined) return false;
  return mergeTypeMapping.get(typeA)?.has(typeB) ?? false;
}

const solidTypes: TileType[] = [
  TileType.ground,
  TileType.slopeLeft,
  TileType.slopeRight,
  TileType.stairsLeft,
  TileType.stairsRight,
  TileType.platform,
  TileType.platformStairsLeft,
  TileType.platformStairsRight
];
export const solidTypesSet = new Set(solidTypes);
