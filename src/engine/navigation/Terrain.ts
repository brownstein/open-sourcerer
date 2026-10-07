import pointInPolygon from "point-in-polygon";

import {
  NavTerrainBlockType,
  ObstacleAABB,
  ObstaclePolygons,
  ObstacleShape
} from "src/api/navigation";
import { arr2 } from "src/engine/util/vecTypes";

import {
  DIAGONAL_FLIP_BIT,
  HORIZONTAL_FLIP_BIT,
  VERTICAL_FLIP_BIT
} from "../level/tiled/tiledJson";
import { IRBBox } from "./types";

/**
 * Internal terrain grid of raw integers.
 * Performs bounds checking.
 * Does not perform scaling.
 */
export class RawBlocks {
  public readonly width: number;
  public readonly height: number;
  protected readonly data: Uint8Array;
  constructor(width: number, height: number, data?: number[]) {
    this.width = width;
    this.height = height;
    if (data) {
      this.data = new Uint8Array(data);
    } else {
      this.data = new Uint8Array(width * height);
      this.data.fill(0);
    }
  }
  serialize() {
    return {
      width: this.width,
      height: this.height,
      data: [...this.data]
    };
  }
  static parse(data: ReturnType<RawBlocks["serialize"]>) {
    return new RawBlocks(data.width, data.height, data.data);
  }
  mark(x: number, y: number, value: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data[x + y * this.width] = value;
  }
  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    return this.data[x + y * this.width];
  }
  // Bumps a single cell's obstacle count, saturating at 255. Out-of-bounds
  // cells are ignored, mirroring `mark`.
  incrementBlock(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const pos = x + y * this.width;
    if (this.data[pos] < 255) this.data[pos]++;
  }
  // Lowers a single cell's obstacle count, flooring at 0. Out-of-bounds cells
  // are ignored, mirroring `mark`.
  decrementBlock(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const pos = x + y * this.width;
    if (this.data[pos] > 0) this.data[pos]--;
  }
  incrementRegion(xMin: number, yMin: number, xMax: number, yMax: number) {
    const width = this.width;
    const height = this.height;
    let bxMin = xMin;
    let byMin = yMin;
    let bxMax = xMax;
    let byMax = yMax;
    if (bxMin < 0) bxMin = 0;
    else if (bxMin >= width) bxMin = width - 1;
    if (byMin < 0) byMin = 0;
    else if (byMin >= height) byMin = height - 1;
    if (bxMax < 0) bxMax = 0;
    else if (bxMax >= width) bxMax = width - 1;
    if (byMax < 0) byMax = 0;
    else if (byMax >= height) byMax = height - 1;
    for (let x = bxMin; x < bxMax; x++) {
      for (let y = byMin; y < byMax; y++) {
        const pos = x + y * width;
        if (this.data[pos] < 255) this.data[pos]++;
      }
    }
  }
  decrementRegion(xMin: number, yMin: number, xMax: number, yMax: number) {
    const width = this.width;
    const height = this.height;
    let bxMin = xMin;
    let byMin = yMin;
    let bxMax = xMax;
    let byMax = yMax;
    if (bxMin < 0) bxMin = 0;
    else if (bxMin >= width) bxMin = width - 1;
    if (byMin < 0) byMin = 0;
    else if (byMin >= height) byMin = height - 1;
    if (bxMax < 0) bxMax = 0;
    else if (bxMax >= width) bxMax = width - 1;
    if (byMax < 0) byMax = 0;
    else if (byMax >= height) byMax = height - 1;
    for (let x = bxMin; x < bxMax; x++) {
      for (let y = byMin; y < byMax; y++) {
        const pos = x + y * width;
        if (this.data[pos] > 0) this.data[pos]--;
      }
    }
  }
  checkRegion(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    value: number
  ) {
    const width = this.width;
    const height = this.height;
    let bxMin = xMin;
    let byMin = yMin;
    let bxMax = xMax;
    let byMax = yMax;
    if (bxMin < 0) bxMin = 0;
    else if (bxMin >= width) bxMin = width - 1;
    if (byMin < 0) byMin = 0;
    else if (byMin >= height) byMin = height - 1;
    if (bxMax < 0) bxMax = 0;
    else if (bxMax >= width) bxMax = width - 1;
    if (byMax < 0) byMax = 0;
    else if (byMax >= height) byMax = height - 1;
    for (let x = bxMin; x < bxMax; x++) {
      for (let y = byMin; y < byMax; y++) {
        const pos = x + y * width;
        if (this.data[pos] !== value) return false;
      }
    }
    return true;
  }
  checkRegionMulti(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    values: Record<number, true>
  ) {
    const width = this.width;
    const height = this.height;
    let bxMin = xMin;
    let byMin = yMin;
    let bxMax = xMax;
    let byMax = yMax;
    if (bxMin < 0) bxMin = 0;
    else if (bxMin >= width) bxMin = width - 1;
    if (byMin < 0) byMin = 0;
    else if (byMin >= height) byMin = height - 1;
    if (bxMax < 0) bxMax = 0;
    else if (bxMax >= width) bxMax = width - 1;
    if (byMax < 0) byMax = 0;
    else if (byMax >= height) byMax = height - 1;
    for (let x = bxMin; x < bxMax; x++) {
      for (let y = byMin; y < byMax; y++) {
        const pos = x + y * width;
        const data = this.data[pos];
        if (!values[data]) return false;
      }
    }
    return true;
  }
  checkRegionContainsMulti(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    values: Record<number, true>
  ) {
    const width = this.width;
    const height = this.height;
    let bxMin = xMin;
    let byMin = yMin;
    let bxMax = xMax;
    let byMax = yMax;
    if (bxMin < 0) bxMin = 0;
    else if (bxMin >= width) bxMin = width - 1;
    if (byMin < 0) byMin = 0;
    else if (byMin >= height) byMin = height - 1;
    if (bxMax < 0) bxMax = 0;
    else if (bxMax >= width) bxMax = width - 1;
    if (byMax < 0) byMax = 0;
    else if (byMax >= height) byMax = height - 1;
    for (let x = bxMin; x < bxMax; x++) {
      for (let y = byMin; y < byMax; y++) {
        const pos = x + y * width;
        const data = this.data[pos];
        if (values[data]) return true;
      }
    }
    return false;
  }
  // debug helper.
  getDebugString() {
    const { data, height, width } = this;
    const resultLines = [];
    for (let y = 0; y < height; y++) {
      const values = [];
      for (let x = 0; x < width; x++) {
        const pos = x + y * width;
        values.push(data[pos]);
      }
      resultLines.push(values.join(""));
    }
    const result = resultLines.join("\n");
    return result;
  }
}

/**
 * Internal terrain grid of raw integers.
 * Delegates bounds checking.
 * Performs scaling.
 */
export class ScaledTranslatedBlocks {
  public readonly width: number;
  public readonly height: number;
  public readonly xScale: number;
  public readonly yScale: number;
  public readonly xOffset: number;
  public readonly yOffset: number;
  protected readonly ixScale: number;
  protected readonly iyScale: number;
  protected readonly rawBlockTerrain: RawBlocks;
  constructor(
    width: number,
    height: number,
    xScale: number,
    yScale: number,
    xOffset: number,
    yOffset: number,
    data?: ReturnType<RawBlocks["serialize"]>
  ) {
    this.width = width;
    this.height = height;
    this.xScale = xScale;
    this.yScale = yScale;
    this.ixScale = 1 / xScale;
    this.iyScale = 1 / yScale;
    this.xOffset = xOffset;
    this.yOffset = yOffset;
    if (data) {
      this.rawBlockTerrain = RawBlocks.parse(data);
    } else {
      this.rawBlockTerrain = new RawBlocks(
        Math.ceil(Math.abs(width * this.ixScale)),
        Math.ceil(Math.abs(height * this.iyScale))
      );
    }
  }
  serialize() {
    return {
      width: this.width,
      height: this.height,
      xScale: this.xScale,
      yScale: this.yScale,
      xOffset: this.xOffset,
      yOffset: this.yOffset,
      data: this.rawBlockTerrain.serialize()
    };
  }
  static parse(data: ReturnType<ScaledTranslatedBlocks["serialize"]>) {
    return new ScaledTranslatedBlocks(
      data.width,
      data.height,
      data.xScale,
      data.yScale,
      data.xOffset,
      data.yOffset,
      data.data
    );
  }
  mark(x: number, y: number, value: number) {
    const sx = Math.floor((x - this.xOffset) * this.ixScale);
    const sy = Math.floor((y - this.yOffset) * this.iyScale);
    this.rawBlockTerrain.mark(sx, sy, value);
  }
  get(x: number, y: number) {
    const sx = Math.floor((x - this.xOffset) * this.ixScale);
    const sy = Math.floor((y - this.yOffset) * this.iyScale);
    return this.rawBlockTerrain.get(sx, sy);
  }
  // Bumps the obstacle count of the single cell containing the world point.
  incrementBlock(x: number, y: number) {
    const sx = Math.floor((x - this.xOffset) * this.ixScale);
    const sy = Math.floor((y - this.yOffset) * this.iyScale);
    this.rawBlockTerrain.incrementBlock(sx, sy);
  }
  // Lowers the obstacle count of the single cell containing the world point.
  decrementBlock(x: number, y: number) {
    const sx = Math.floor((x - this.xOffset) * this.ixScale);
    const sy = Math.floor((y - this.yOffset) * this.iyScale);
    this.rawBlockTerrain.decrementBlock(sx, sy);
  }
  incrementRegion(xMin: number, yMin: number, xMax: number, yMax: number) {
    const sxMin = Math.floor((xMin - this.xOffset) * this.ixScale);
    const syMin = Math.floor((yMin - this.yOffset) * this.iyScale);
    const sxMax = Math.floor((xMax - this.xOffset) * this.ixScale) + 1;
    const syMax = Math.floor((yMax - this.yOffset) * this.iyScale) + 1;
    this.rawBlockTerrain.incrementRegion(sxMin, syMin, sxMax, syMax);
  }
  decrementRegion(xMin: number, yMin: number, xMax: number, yMax: number) {
    const sxMin = Math.floor((xMin - this.xOffset) * this.ixScale);
    const syMin = Math.floor((yMin - this.yOffset) * this.iyScale);
    const sxMax = Math.floor((xMax - this.xOffset) * this.ixScale) + 1;
    const syMax = Math.floor((yMax - this.yOffset) * this.iyScale) + 1;
    this.rawBlockTerrain.decrementRegion(sxMin, syMin, sxMax, syMax);
  }
  checkRegion(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    value: number
  ) {
    const sxMin = Math.floor((xMin - this.xOffset) * this.ixScale);
    const syMin = Math.floor((yMin - this.yOffset) * this.iyScale);
    const sxMax = Math.floor((xMax - this.xOffset) * this.ixScale) + 1;
    const syMax = Math.floor((yMax - this.yOffset) * this.iyScale) + 1;
    return this.rawBlockTerrain.checkRegion(sxMin, syMin, sxMax, syMax, value);
  }
  checkRegionMulti(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    values: Record<number, true>
  ) {
    const sxMin = Math.floor((xMin - this.xOffset) * this.ixScale);
    const syMin = Math.floor((yMin - this.yOffset) * this.iyScale);
    const sxMax = Math.floor((xMax - this.xOffset) * this.ixScale) + 1;
    const syMax = Math.floor((yMax - this.yOffset) * this.iyScale) + 1;
    return this.rawBlockTerrain.checkRegionMulti(
      sxMin,
      syMin,
      sxMax,
      syMax,
      values
    );
  }
  checkRegionContainsMulti(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    values: Record<number, true>
  ) {
    const sxMin = Math.floor((xMin - this.xOffset) * this.ixScale);
    const syMin = Math.floor((yMin - this.yOffset) * this.iyScale);
    const sxMax = Math.floor((xMax - this.xOffset) * this.ixScale) + 1;
    const syMax = Math.floor((yMax - this.yOffset) * this.iyScale) + 1;
    return this.rawBlockTerrain.checkRegionContainsMulti(
      sxMin,
      syMin,
      sxMax,
      syMax,
      values
    );
  }
}

export class TerrainWithObstacles {
  protected readonly baseBlocks: ScaledTranslatedBlocks;
  protected readonly obsBlocks: ScaledTranslatedBlocks;
  protected readonly obsIdToShape: Map<string, ObstacleShape> = new Map();
  protected readonly passableBlockTypes: Record<number, true> = {
    [NavTerrainBlockType.Empty]: true,
    [NavTerrainBlockType.Platform]: true,
    [NavTerrainBlockType.Ladder]: true,
    [NavTerrainBlockType.LadderPlatformIntersect]: true
  };
  protected readonly impassableBlockTypes: Record<number, true> = {
    [NavTerrainBlockType.Solid]: true,
    [NavTerrainBlockType.SlopeLeft]: true,
    [NavTerrainBlockType.SlopeRight]: true
  };
  protected readonly surfaceBlockTypes: Record<number, true> = {
    [NavTerrainBlockType.Solid]: true,
    [NavTerrainBlockType.Platform]: true,
    [NavTerrainBlockType.PlatformSlopeLeft]: true,
    [NavTerrainBlockType.PlatformSlopeRight]: true,
    [NavTerrainBlockType.SlopeLeft]: true,
    [NavTerrainBlockType.SlopeRight]: true
  };
  constructor(
    width: number,
    height: number,
    xScale: number,
    yScale: number,
    xOffset: number,
    yOffset: number,
    data?: ReturnType<TerrainWithObstacles["serialize"]>
  ) {
    if (data) {
      this.baseBlocks = ScaledTranslatedBlocks.parse(data.baseBlocks);
      this.obsBlocks = ScaledTranslatedBlocks.parse(data.obsBlocks);
      for (const [id, obs] of data.obstacles) {
        this.obsIdToShape.set(id, obs);
      }
    } else {
      this.baseBlocks = new ScaledTranslatedBlocks(
        width,
        height,
        xScale,
        yScale,
        xOffset,
        yOffset
      );
      this.obsBlocks = new ScaledTranslatedBlocks(
        width,
        height,
        xScale,
        yScale,
        xOffset,
        yOffset
      );
    }
  }
  serialize() {
    return {
      baseBlocks: this.baseBlocks.serialize(),
      obsBlocks: this.obsBlocks.serialize(),
      obstacles: [...this.obsIdToShape.entries()].map(([id, obs]) => [
        id, obs
      ]) as [string, ObstacleShape][]
    };
  }
  static parse(data: ReturnType<TerrainWithObstacles["serialize"]>) {
    return new TerrainWithObstacles(
      data.baseBlocks.width,
      data.baseBlocks.height,
      data.baseBlocks.xScale,
      data.baseBlocks.yScale,
      data.baseBlocks.xOffset,
      data.baseBlocks.yOffset,
      data
    );
  }
  // Manually mark a block.
  mark(x: number, y: number, value: NavTerrainBlockType) {
    this.baseBlocks.mark(x, y, value);
  }
  // Dumps a region of tile data into the terrain.
  dumpTileData(
    data: number[],
    dataRowWidth: number,
    dataXScale: number,
    dataYScale: number,
    dataXOffset: number,
    dataYOffset: number,
    dataValueMap: Record<number, NavTerrainBlockType>
  ) {
    const dataLength = data.length;
    let col = 0;
    let row = 0;
    for (let di = 0; di < dataLength; di++) {
      const x = dataXScale * (col + dataXOffset);
      const y = dataYScale * (row + dataYOffset);
      const dataValue = data[di];
      const existingDataValue = this.baseBlocks.get(x, y);
      let mappedDataValue =
        dataValueMap[dataValue] ?? NavTerrainBlockType.Empty;

      // Combine ladders and platforms into ladderPlatformIntersect. This is
      // important so that entities can either walk over or climb this block.
      switch (mappedDataValue) {
        case NavTerrainBlockType.Ladder:
          if (existingDataValue === NavTerrainBlockType.Platform) {
            mappedDataValue = NavTerrainBlockType.LadderPlatformIntersect;
          }
          break;
        case NavTerrainBlockType.Platform:
          if (existingDataValue === NavTerrainBlockType.Ladder) {
            mappedDataValue = NavTerrainBlockType.LadderPlatformIntersect;
          }
          break;
        default:
          break;
      }

      const flippedDataValue = this._getFlippedNavBlockType(
        dataValue,
        mappedDataValue
      );
      if (mappedDataValue !== NavTerrainBlockType.Empty) {
        this.baseBlocks.mark(x, y, flippedDataValue);
      }
      col++;
      if (col >= dataRowWidth) {
        col = 0;
        row++;
      }
    }
  }
  // Gets an obstacle by ID.
  getObstacle(obstacleId: string): ObstacleShape | null {
    return this.obsIdToShape.get(obstacleId) ?? null;
  }
  // Adds or moves an obstacle on the terrain. Handles both AABB and polygon
  // shapes: any previously-stored shape under this id is unmarked first, then
  // the new shape is recorded and marked.
  updateObstacle(obstacleId: string, obstacleShape: ObstacleShape) {
    const extantShape = this.obsIdToShape.get(obstacleId);
    if (extantShape !== undefined) {
      this.unmarkObstacleShape(extantShape);
    }
    this.obsIdToShape.set(obstacleId, obstacleShape);
    this.markObstacleShape(obstacleShape);
  }
  // Removes an obstacle from the terrain, unmarking whatever shape it occupied.
  clearObstacle(obstacleId: string) {
    const extantShape = this.obsIdToShape.get(obstacleId);
    if (extantShape !== undefined) {
      this.unmarkObstacleShape(extantShape);
      this.obsIdToShape.delete(obstacleId);
    }
  }
  // Increments the obstacle count of every cell the shape covers.
  private markObstacleShape(shape: ObstacleShape) {
    for (const [x, y] of this.obstacleShapeToBlockedCoordinates(shape)) {
      this.obsBlocks.incrementBlock(x, y);
    }
  }
  // Decrements the obstacle count of every cell the shape covers. Pairs with
  // `markObstacleShape`: because both walk the identical coordinate list for a
  // given shape, marking then unmarking the same shape is always balanced.
  private unmarkObstacleShape(shape: ObstacleShape) {
    for (const [x, y] of this.obstacleShapeToBlockedCoordinates(shape)) {
      this.obsBlocks.decrementBlock(x, y);
    }
  }
  // Reduces an obstacle shape to the flat list of world-space coordinates (one
  // per covered obstacle-grid cell) that should be marked blocked. This is the
  // shared intermediate stage used by both marking and unmarking, so the two
  // can never drift. Coordinates are deduplicated per cell so overlapping
  // polygons within one shape only contribute a single count to each cell.
  private obstacleShapeToBlockedCoordinates(
    shape: ObstacleShape
  ): arr2[] {
    const raw =
      shape.type === "aabb"
        ? this.aabbToBlockedCoordinates(shape)
        : this.polygonsToBlockedCoordinates(shape);
    const seen = new Set<string>();
    const coordinates: arr2[] = [];
    for (const coordinate of raw) {
      const key = `${coordinate[0]},${coordinate[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      coordinates.push(coordinate);
    }
    return coordinates;
  }
  // AABB fill: every cell whose center lies within the box extents.
  private aabbToBlockedCoordinates(shape: ObstacleAABB): arr2[] {
    const halfWidth = shape.width * 0.5;
    const halfHeight = shape.height * 0.5;
    return this.collectCellCoordinates(
      shape.x - halfWidth,
      shape.y - halfHeight,
      shape.x + halfWidth,
      shape.y + halfHeight
    );
  }
  // Polygon fill: every cell whose center lies inside one of the shape's
  // polygons, which are stored in local space and offset by the shape origin.
  private polygonsToBlockedCoordinates(shape: ObstaclePolygons): arr2[] {
    const coordinates: arr2[] = [];
    for (const localPolygon of shape.polygons) {
      if (localPolygon.length < 3) continue;
      const polygon = localPolygon.map(
        ([px, py]): arr2 => [px + shape.x, py + shape.y]
      );
      let xMin = Infinity;
      let yMin = Infinity;
      let xMax = -Infinity;
      let yMax = -Infinity;
      for (const [px, py] of polygon) {
        if (px < xMin) xMin = px;
        if (px > xMax) xMax = px;
        if (py < yMin) yMin = py;
        if (py > yMax) yMax = py;
      }
      const cells = this.collectCellCoordinates(
        xMin,
        yMin,
        xMax,
        yMax,
        (cx, cy) => pointInPolygon([cx, cy], polygon)
      );
      for (const cell of cells) coordinates.push(cell);
    }
    return coordinates;
  }
  // Walks the obstacle-grid cells spanning the given world-space rectangle and
  // returns the center coordinate of each (optionally filtered by `accept`).
  // The cell range matches the inclusive span used by `incrementRegion`, and
  // each returned center maps back to exactly that cell when re-scaled, so
  // marking these coordinates is equivalent to filling the rectangle.
  private collectCellCoordinates(
    xMin: number,
    yMin: number,
    xMax: number,
    yMax: number,
    accept?: (cx: number, cy: number) => boolean
  ): arr2[] {
    const { xScale, yScale, xOffset, yOffset } = this.obsBlocks;
    const sxMin = Math.floor((xMin - xOffset) / xScale);
    const sxMax = Math.floor((xMax - xOffset) / xScale);
    const syMin = Math.floor((yMin - yOffset) / yScale);
    const syMax = Math.floor((yMax - yOffset) / yScale);
    const coordinates: arr2[] = [];
    for (let sx = sxMin; sx <= sxMax; sx++) {
      const cx = (sx + 0.5) * xScale + xOffset;
      for (let sy = syMin; sy <= syMax; sy++) {
        const cy = (sy + 0.5) * yScale + yOffset;
        if (accept && !accept(cx, cy)) continue;
        coordinates.push([cx, cy]);
      }
    }
    return coordinates;
  }
  // Checks if a region is obstacle-free and empty.
  checkEmpty(bbox: IRBBox) {
    const { xMin, yMin, xMax, yMax } = bbox;
    if (!this.obsBlocks.checkRegion(xMin, yMin, xMax, yMax, 0)) return false;
    return this.baseBlocks.checkRegion(
      xMin,
      yMin,
      xMax,
      yMax,
      NavTerrainBlockType.Empty
    );
  }
  // Gets the block at a specified position.
  getBlockAt(x: number, y: number): NavTerrainBlockType {
    return this.baseBlocks.get(x, y);
  }
  // Checks if a region is (optionally) obstacle-free and empty of non-platforms.
  checkPassable(bbox: IRBBox, ignoreObstacles?: boolean) {
    const { xMin, yMin, xMax, yMax } = bbox;
    if (
      ignoreObstacles !== true &&
      !this.obsBlocks.checkRegion(xMin, yMin, xMax, yMax, 0)
    )
      return false;
    return this.baseBlocks.checkRegionMulti(
      xMin,
      yMin,
      xMax,
      yMax,
      this.passableBlockTypes
    );
  }
  // Checks if a bbox is on or near a surface.
  checkOnSurface(
    bbox: IRBBox,
    surfaceDistance: number,
    offsetDistance: number = 0
  ) {
    const { xMin, xMax, yMin: yMinIn } = bbox;
    const yMin = yMinIn - surfaceDistance - offsetDistance;
    const yMax = yMinIn - offsetDistance;
    if (!this.obsBlocks.checkRegion(xMin, yMin, xMax, yMax, 0)) return true;
    return this.baseBlocks.checkRegionContainsMulti(
      xMin,
      yMin,
      xMax,
      yMax,
      this.surfaceBlockTypes
    );
  }
  // Checks if we can ascend by going left. Assumes bbox area has been checked for emptiness.
  checkCanAscendLeft(bbox: IRBBox, checkDistance: number) {
    const { xMin, yMin, yMax } = bbox;
    if (
      this.baseBlocks.checkRegionContainsMulti(
        xMin - checkDistance,
        yMin + checkDistance,
        xMin,
        yMax + checkDistance,
        this.impassableBlockTypes
      )
    )
      return false;
    const slopeValue = this.baseBlocks.get(xMin - checkDistance, yMin);
    switch (slopeValue) {
      case NavTerrainBlockType.SlopeRight:
      case NavTerrainBlockType.PlatformSlopeRight:
        return true;
      default:
        return false;
    }
  }
  // Checks if we can ascend by going right. Assumes bbox area has been checked for emptiness.
  checkCanAscendRight(bbox: IRBBox, checkDistance: number) {
    const { yMin, xMax, yMax } = bbox;
    if (
      this.baseBlocks.checkRegionContainsMulti(
        xMax,
        yMin + checkDistance,
        xMax + checkDistance,
        yMax + checkDistance,
        this.impassableBlockTypes
      )
    )
      return false;
    const slopeValue = this.baseBlocks.get(xMax + checkDistance, yMin);
    switch (slopeValue) {
      case NavTerrainBlockType.SlopeLeft:
      case NavTerrainBlockType.PlatformSlopeLeft:
        return true;
      default:
        return false;
    }
  }
  checkContainsLadder(bbox: IRBBox) {
    const { xMin, xMax, yMin, yMax } = bbox;
    if (
      this.baseBlocks.checkRegionContainsMulti(xMin, yMin, xMax, yMax, {
        [NavTerrainBlockType.Ladder]: true,
        [NavTerrainBlockType.LadderPlatformIntersect]: true
      })
    )
      return true;
    return false;
  }
  checkContainsOnlyLadder(bbox: IRBBox) {
    const { xMin, xMax, yMin, yMax } = bbox;
    if (
      this.baseBlocks.checkRegionMulti(xMin, yMin, xMax, yMax, {
        [NavTerrainBlockType.Ladder]: true,
        [NavTerrainBlockType.LadderPlatformIntersect]: true
      })
    )
      return true;
  }
  checkBoundaries(bbox: IRBBox) {
    return (
      bbox.xMin >= this.baseBlocks.xOffset &&
      bbox.xMax <= this.baseBlocks.xOffset + this.baseBlocks.width &&
      bbox.yMin >= this.baseBlocks.yOffset &&
      bbox.yMax <= this.baseBlocks.yOffset + this.baseBlocks.height
    );
  }
  get defaultPlanningResolution() {
    return this.baseBlocks.xScale;
  }

  private _getFlippedNavBlockType(gid: number, navType: NavTerrainBlockType) {
    const _shouldFlipDiagonal = gid & DIAGONAL_FLIP_BIT;
    const shouldFlipHorizontal = gid & HORIZONTAL_FLIP_BIT;
    const _shouldFlipVertical = gid & VERTICAL_FLIP_BIT;

    // TODO:

    if (shouldFlipHorizontal) {
      switch (navType) {
        case NavTerrainBlockType.SlopeLeft: {
          navType = NavTerrainBlockType.SlopeRight;
          break;
        }
        case NavTerrainBlockType.SlopeRight: {
          navType = NavTerrainBlockType.SlopeLeft;
          break;
        }
        case NavTerrainBlockType.PlatformSlopeLeft: {
          navType = NavTerrainBlockType.PlatformSlopeRight;
          break;
        }
        case NavTerrainBlockType.PlatformSlopeRight: {
          navType = NavTerrainBlockType.PlatformSlopeLeft;
          break;
        }
        default:
          break;
      }
    }

    return navType;
  }
}
