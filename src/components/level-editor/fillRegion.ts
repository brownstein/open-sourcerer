import { TilePlacement, tilePlacementsEqual } from "./levelEditorState";

export const FILL_CELL_CAP = 100000;

/** Flood-fill region of cells matching the start cell's content, 4-connected,
 *  bounded by the layer's content bounding box. Returns null when the start
 *  is outside the content area or the region grows past the safety cap. */
export function computeFillCells(
  tiles: Map<string, TilePlacement>,
  startX: number,
  startY: number,
  cellCap: number = FILL_CELL_CAP
): { x: number; y: number }[] | null {
  if (tiles.size === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of tiles.keys()) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (startX < minX || startX > maxX || startY < minY || startY > maxY) {
    return null;
  }

  const target = tiles.get(`${startX},${startY}`);
  const cells: { x: number; y: number }[] = [];
  const visited = new Set<string>([`${startX},${startY}`]);
  const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];
  while (stack.length > 0) {
    const cell = stack.pop()!;
    cells.push(cell);
    if (cells.length > cellCap) return null;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (tilePlacementsEqual(tiles.get(key), target)) {
        stack.push({ x, y });
      }
    }
  }
  return cells;
}
