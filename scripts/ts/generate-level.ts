/**
 * generate-level.ts
 *
 * Generates a Tiled TMJ level file from ASCII art or JSON input.
 * Reads from stdin, writes to the specified output path.
 *
 * Usage:
 *   echo '<input>' | node scripts/ts/generate-level.js [--output <path>]
 *
 * ASCII format: each character = 1 tile (16px). Bottom row = tileY 0.
 *   Terrain: # = ground, = = platform, . or space = empty
 *   Shortcuts: P=Player, E=Slime, G=Gnull, D=Dummy, S=SavePoint, B=Bat, etc.
 *   Bracket syntax: [TypeName] places any entity class at that tile column.
 *     e.g. [GryphonWarrior]  [Bat]  [PlantShield]
 *
 * JSON format: { terrain: [...], entities: [...] }
 *   Coordinates in tile units (1 unit = 1 tile = 16px), Y increases upward.
 */

import fs from "fs";
import path from "path";

// --- Constants ---
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  "../../src/levels/tiled/maps/dev/GeneratedTest.tmj"
);
const TILE_SIZE = 16;

// --- Types ---
interface Chunk {
  data: number[];
  height: 16;
  width: 16;
  x: number;
  y: number;
}

interface TiledObject {
  height: number;
  id: number;
  name: string;
  rotation: number;
  type: string;
  visible: boolean;
  width: number;
  x: number;
  y: number;
  properties?: { name: string; type: string; value: unknown }[];
}

interface EntitySpec {
  type: string;
  tiledX: number;
  tiledY: number;
  width: number;
  height: number;
  name: string;
  properties?: Record<string, unknown>;
}

interface TerrainBlock {
  x: number;
  y: number;
  width: number;
  height?: number;
  type?: string;
}

interface JSONEntitySpec {
  type: string;
  x: number;
  y: number;
  name?: string;
  width?: number;
  height?: number;
  properties?: Record<string, unknown>;
}

interface LevelSpec {
  terrain?: TerrainBlock[];
  entities?: JSONEntitySpec[];
}

// --- Entity default sizes (pixels) ---
const ENTITY_DEFAULTS: Record<string, { width: number; height: number }> = {
  // Player
  Player: { width: 32, height: 48 },
  // Enemies - critters
  Slime: { width: 32, height: 32 },
  BigSlime: { width: 32, height: 32 },
  Bat: { width: 56, height: 47 },
  Bee: { width: 32, height: 32 },
  WallCrawler: { width: 32, height: 32 },
  EnemyRunner: { width: 48, height: 32 },
  WalkerThatShoot: { width: 48, height: 32 },
  Drill: { width: 32, height: 32 },
  Mimic: { width: 50, height: 42 },
  Gnull: { width: 19, height: 28 },
  PlantShield: { width: 32, height: 48 },
  IntroDeer: { width: 48, height: 32 },
  // Enemies - bipedals / bosses
  GryphonWarrior: { width: 32, height: 48 },
  GaianBoss: { width: 64, height: 64 },
  WorkerBee: { width: 32, height: 32 },
  WolfBandit: { width: 32, height: 48 },
  DeerBot: { width: 48, height: 32 },
  // Enemies - robots
  Dummy: { width: 24, height: 48 },
  DummyFloat: { width: 24, height: 48 },
  DummySword: { width: 24, height: 48 },
  UtilityBot: { width: 32, height: 32 },
  ForestBot: { width: 44, height: 44 },
  FlyingShooter: { width: 32, height: 32 },
  // Enemies - spawners
  Spawner: { width: 32, height: 32 },
  NestSpawner: { width: 32, height: 32 },
  HiveSpawner: { width: 32, height: 32 },
  // NPCs
  Adana: { width: 32, height: 48 },
  VillageNPC: { width: 32, height: 48 },
  BeanBot: { width: 20, height: 20 },
  // Items
  Currency: { width: 16, height: 16 },
  Potion: { width: 16, height: 16 },
  DroppedSpell: { width: 16, height: 16 },
  Chest: { width: 50, height: 42 },
  // Environment
  SavePoint: { width: 64, height: 68 },
  ManaFountain: { width: 64, height: 68 },
  RoomTransition: { width: 12, height: 48 },
  Doorway: { width: 32, height: 44 },
  Spikes: { width: 32, height: 16 },
  FallingTerrain: { width: 64, height: 32 },
  Piston: { width: 32, height: 32 },
  Switch: { width: 16, height: 32 },
  // Spells / projectiles
  ManaSpark: { width: 16, height: 16 },
  // UI / markers
  Text: { width: 64, height: 16 },
  AreaTrigger: { width: 32, height: 32 },
  Brute: { width: 32, height: 48 },
};

const DEFAULT_ENTITY_SIZE = { width: 32, height: 32 };

// --- Tile GIDs (for adve/tiles16.tsj with firstgid=1) ---
// These are GIDs (tile id + 1 since firstgid=1, but tile ids are 0-based in the tileset)
const GROUND_GIDS = [43, 44, 45]; // repeating ground fill pattern
const PLATFORM_GIDS = [50, 51, 52]; // one-way platform pattern

function getGroundGid(col: number): number {
  return GROUND_GIDS[col % GROUND_GIDS.length];
}

function getPlatformGid(col: number): number {
  return PLATFORM_GIDS[col % PLATFORM_GIDS.length];
}

// --- ASCII character maps ---
const ASCII_TERRAIN: Record<string, (col: number) => number> = {
  "#": getGroundGid,
  "=": getPlatformGid,
};

const ASCII_ENTITIES: Record<string, string> = {
  P: "Player",
  E: "Slime",
  G: "Gnull",
  D: "Dummy",
  S: "SavePoint",
  B: "Bat",
  F: "ForestBot",
  W: "WallCrawler",
  R: "EnemyRunner",
  C: "Currency",
  X: "Brute",
};

// --- Parsing ---

function placeEntity(
  entityType: string,
  tileX: number,
  tileY: number,
  entities: EntitySpec[]
): void {
  const defaults = ENTITY_DEFAULTS[entityType] || DEFAULT_ENTITY_SIZE;
  // Entity bottom aligns with bottom of its tile cell
  // Bottom of tile cell in Tiled pixels = (tileY + 1) * 16
  const objX = tileX * TILE_SIZE + TILE_SIZE / 2 - defaults.width / 2;
  const objY = (tileY + 1) * TILE_SIZE - defaults.height;

  entities.push({
    type: entityType,
    tiledX: objX,
    tiledY: objY,
    width: defaults.width,
    height: defaults.height,
    name: entityType,
  });
}

function parseASCII(input: string): {
  tiles: Map<string, number>;
  entities: EntitySpec[];
} {
  const lines = input.split("\n").filter((line) => line.length > 0);
  const totalRows = lines.length;

  const tiles = new Map<string, number>();
  const entities: EntitySpec[] = [];

  for (let row = 0; row < totalRows; row++) {
    const line = lines[row];
    let col = 0;
    while (col < line.length) {
      const ch = line[col];

      // Skip empty
      if (ch === "." || ch === " ") {
        col++;
        continue;
      }

      // Bottom row of ASCII = tileY 0, top rows are negative
      const tileX = col;
      const tileY = row - (totalRows - 1);

      // Bracket syntax: [EntityType] places any entity class
      if (ch === "[") {
        const closeIdx = line.indexOf("]", col);
        if (closeIdx === -1) {
          console.warn(`Warning: unclosed bracket at row ${row}, col ${col}`);
          col++;
          continue;
        }
        const entityType = line.substring(col + 1, closeIdx);
        if (entityType.length > 0) {
          placeEntity(entityType, tileX, tileY, entities);
        }
        // Skip past the closing bracket
        col = closeIdx + 1;
        continue;
      }

      // Single-char terrain
      if (ASCII_TERRAIN[ch]) {
        const gid = ASCII_TERRAIN[ch](col);
        tiles.set(`${tileX},${tileY}`, gid);
        col++;
        continue;
      }

      // Single-char entity shortcut
      if (ASCII_ENTITIES[ch]) {
        placeEntity(ASCII_ENTITIES[ch], tileX, tileY, entities);
        col++;
        continue;
      }

      // Unknown character — skip
      col++;
    }
  }

  return { tiles, entities };
}

function parseJSON(input: LevelSpec): {
  tiles: Map<string, number>;
  entities: EntitySpec[];
} {
  const tiles = new Map<string, number>();
  const entities: EntitySpec[] = [];

  // Process terrain blocks
  for (const block of input.terrain ?? []) {
    const type = block.type ?? "ground";
    const height = block.height ?? 1;
    const gidFn = type === "platform" ? getPlatformGid : getGroundGid;

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < block.width; dx++) {
        // Input coords: tile units, Y up. Convert to Tiled tile coords (Y down).
        const tileX = Math.round(block.x) + dx;
        const tileY = -(Math.round(block.y) + dy);
        tiles.set(`${tileX},${tileY}`, gidFn(dx));
      }
    }
  }

  // Process entities
  for (const ent of input.entities ?? []) {
    const defaults = ENTITY_DEFAULTS[ent.type] || DEFAULT_ENTITY_SIZE;
    const w = ent.width ?? defaults.width;
    const h = ent.height ?? defaults.height;

    // Input: tile coords (Y up), entity center at (x, y)
    // Convert to Tiled pixel coords (Y down)
    const tiledPixelCenterX = ent.x * TILE_SIZE;
    const tiledPixelCenterY = -ent.y * TILE_SIZE;

    entities.push({
      type: ent.type,
      tiledX: tiledPixelCenterX - w / 2,
      tiledY: tiledPixelCenterY - h / 2,
      width: w,
      height: h,
      name: ent.name ?? ent.type,
      properties: ent.properties,
    });
  }

  return { tiles, entities };
}

// --- Chunk generation ---

function tilesToChunks(tiles: Map<string, number>): {
  chunks: Chunk[];
  startx: number;
  starty: number;
  width: number;
  height: number;
} {
  if (tiles.size === 0) {
    return { chunks: [], startx: 0, starty: 0, width: 16, height: 16 };
  }

  // Find bounding box
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

  // Compute chunk bounds (aligned to 16)
  const chunkMinX = Math.floor(minX / 16) * 16;
  const chunkMinY = Math.floor(minY / 16) * 16;
  const chunkMaxX = Math.floor(maxX / 16) * 16;
  const chunkMaxY = Math.floor(maxY / 16) * 16;

  const chunks: Chunk[] = [];

  for (let cy = chunkMinY; cy <= chunkMaxY; cy += 16) {
    for (let cx = chunkMinX; cx <= chunkMaxX; cx += 16) {
      const data = new Array(256).fill(0);
      let hasData = false;

      for (let ly = 0; ly < 16; ly++) {
        for (let lx = 0; lx < 16; lx++) {
          const gid = tiles.get(`${cx + lx},${cy + ly}`);
          if (gid) {
            data[lx + ly * 16] = gid;
            hasData = true;
          }
        }
      }

      if (hasData) {
        chunks.push({ data, height: 16, width: 16, x: cx, y: cy });
      }
    }
  }

  return {
    chunks,
    startx: chunkMinX,
    starty: chunkMinY,
    width: chunkMaxX + 16 - chunkMinX,
    height: chunkMaxY + 16 - chunkMinY,
  };
}

// --- TMJ builder ---

function buildTMJ(
  chunks: Chunk[],
  objects: TiledObject[],
  metadata: { width: number; height: number; startx: number; starty: number }
): object {
  const layers: object[] = [];

  // Tile layer (only if there are chunks)
  if (chunks.length > 0) {
    layers.push({
      chunks,
      height: metadata.height,
      id: 1,
      name: "Tiles",
      opacity: 1,
      startx: metadata.startx,
      starty: metadata.starty,
      type: "tilelayer",
      visible: true,
      width: metadata.width,
      x: 0,
      y: 0,
    });
  }

  // Entity layer
  layers.push({
    draworder: "topdown",
    id: 2,
    name: "Entities",
    objects,
    opacity: 1,
    type: "objectgroup",
    visible: true,
    x: 0,
    y: 0,
  });

  return {
    compressionlevel: -1,
    height: metadata.height,
    infinite: true,
    layers,
    nextlayerid: 3,
    nextobjectid: objects.length + 1,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.0",
    tileheight: 16,
    tilesets: [
      {
        firstgid: 1,
        source: "../../tilesets/adve/tiles16.tsj",
      },
    ],
    tilewidth: 16,
    type: "map",
    version: "1.10",
    width: metadata.width,
  };
}

function entitiesToObjects(entities: EntitySpec[]): TiledObject[] {
  return entities.map((ent, i) => {
    const obj: TiledObject = {
      height: ent.height,
      id: i + 1,
      name: ent.name,
      rotation: 0,
      type: ent.type,
      visible: true,
      width: ent.width,
      x: ent.tiledX,
      y: ent.tiledY,
    };
    if (ent.properties && Object.keys(ent.properties).length > 0) {
      obj.properties = Object.entries(ent.properties).map(([name, value]) => ({
        name,
        type: typeof value === "boolean" ? "bool" : typeof value === "number" ? "float" : "string",
        value,
      }));
    }
    return obj;
  });
}

// --- Auto-add player if missing ---

function ensurePlayer(
  entities: EntitySpec[],
  tiles: Map<string, number>
): void {
  const hasPlayer = entities.some((e) => e.type === "Player");
  if (hasPlayer) return;

  // Find the highest ground tile to place the player above
  let bestX = 2;
  let bestY = -2; // Tiled tile Y (negative = above origin)

  for (const key of tiles.keys()) {
    const [tx, ty] = key.split(",").map(Number);
    if (ty < bestY || (ty === bestY && tx < bestX)) {
      bestY = ty;
      bestX = tx;
    }
  }

  // Place player one tile above the best position
  const defaults = ENTITY_DEFAULTS.Player;
  const tileY = bestY - 1;
  entities.push({
    type: "Player",
    tiledX: bestX * TILE_SIZE + TILE_SIZE / 2 - defaults.width / 2,
    tiledY: (tileY + 1) * TILE_SIZE - defaults.height,
    width: defaults.width,
    height: defaults.height,
    name: "Player",
  });

  console.log(
    `Auto-added Player at tile (${bestX}, ${-tileY}) [above ground at tile Y ${-bestY}]`
  );
}

// --- Add border walls for camera bounds ---

const BORDER_PADDING = 14; // tiles of padding around content for camera room
const WALL_TILE_GID = 43; // solid ground tile for walls

function addBorderWalls(tiles: Map<string, number>, entities: EntitySpec[]): void {
  // Compute bounding box of all content (tiles + entities)
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

  for (const ent of entities) {
    // Convert entity Tiled pixel coords to tile coords
    const ex = Math.floor(ent.tiledX / TILE_SIZE);
    const ey = Math.floor(ent.tiledY / TILE_SIZE);
    const ew = Math.ceil(ent.width / TILE_SIZE);
    const eh = Math.ceil(ent.height / TILE_SIZE);
    minX = Math.min(minX, ex);
    minY = Math.min(minY, ey);
    maxX = Math.max(maxX, ex + ew);
    maxY = Math.max(maxY, ey + eh);
  }

  if (!isFinite(minX)) return; // no content at all

  // Expand bounds by padding
  const wallMinX = minX - BORDER_PADDING;
  const wallMaxX = maxX + BORDER_PADDING;
  const wallMinY = minY - BORDER_PADDING;
  const wallMaxY = maxY + BORDER_PADDING;

  // Left wall (1 tile thick column)
  for (let y = wallMinY; y <= wallMaxY; y++) {
    tiles.set(`${wallMinX},${y}`, WALL_TILE_GID);
  }
  // Right wall
  for (let y = wallMinY; y <= wallMaxY; y++) {
    tiles.set(`${wallMaxX},${y}`, WALL_TILE_GID);
  }
  // Top wall
  for (let x = wallMinX; x <= wallMaxX; x++) {
    tiles.set(`${x},${wallMinY}`, WALL_TILE_GID);
  }
  // Bottom wall
  for (let x = wallMinX; x <= wallMaxX; x++) {
    tiles.set(`${x},${wallMaxY}`, WALL_TILE_GID);
  }
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);
  let outputPath = DEFAULT_OUTPUT;

  // Parse --output flag
  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1 && args[outputIdx + 1]) {
    outputPath = path.resolve(args[outputIdx + 1]);
  }

  // Read stdin
  const input = fs.readFileSync(0, "utf-8").trim();

  if (!input) {
    console.error("Error: No input provided. Pipe ASCII art or JSON to stdin.");
    process.exit(1);
  }

  // Auto-detect format
  let parsed: { tiles: Map<string, number>; entities: EntitySpec[] };
  const trimmed = input.trimStart();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      let json = JSON.parse(trimmed);
      // If it's an array, treat as entities-only
      if (Array.isArray(json)) {
        json = { entities: json } as LevelSpec;
      }
      parsed = parseJSON(json as LevelSpec);
      console.log("Parsed JSON input");
    } catch (e) {
      // Not valid JSON, treat as ASCII
      parsed = parseASCII(input);
      console.log("Parsed ASCII input (JSON parse failed)");
    }
  } else {
    parsed = parseASCII(input);
    console.log("Parsed ASCII input");
  }

  // Auto-add player if missing
  ensurePlayer(parsed.entities, parsed.tiles);

  // Add border walls for camera bounds
  addBorderWalls(parsed.tiles, parsed.entities);

  // Generate chunks and objects
  const chunkData = tilesToChunks(parsed.tiles);
  const objects = entitiesToObjects(parsed.entities);

  // Build TMJ
  const tmj = buildTMJ(chunkData.chunks, objects, chunkData);

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(tmj, null, 1));

  console.log(`Generated TMJ at ${outputPath}`);
  console.log(
    `  Tiles: ${parsed.tiles.size}, Entities: ${parsed.entities.length}, Chunks: ${chunkData.chunks.length}`
  );
}

main();
