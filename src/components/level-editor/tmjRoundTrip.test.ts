import {
  DIAGONAL_FLIP_BIT,
  HORIZONTAL_FLIP_BIT,
  ITiledLevelJSON,
  ITiledLevelJSONInfiniteTileLayer,
  VERTICAL_FLIP_BIT
} from "src/engine/level/tiled/tiledJson";
import villageMap from "src/levels/tiled/maps/area1-village/village-3b-shrine-entrance.tmj";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import {
  DEFAULT_MAP_BACKGROUND_COLOR,
  EditorLayer,
  LevelEditorState
} from "./levelEditorState";
import { buildTMJFromState } from "./tmjBuilder";
import { loadTmjJsonIntoEditor } from "./tmjLoader";

// A dedicated stand-in type keeps these tests independent of which shipped
// entities happen to declare TiledObjectRef props.
jest.mock("src/entities/metadata/allEntitiesMetadata.json", () => [
  ...jest.requireActual("src/entities/metadata/allEntitiesMetadata.json"),
  {
    name: "EntityRefFixture",
    sourceFile: "src/entities/dev/EntityRefFixture",
    args: [
      {
        name: "target",
        type: "TiledObjectRef",
        optional: true,
        schema: { kind: "entityRef" }
      },
      {
        name: "label",
        type: "string",
        optional: true,
        schema: { kind: "string" }
      }
    ]
  }
]);

const TILES16_COUNT = allTilesets["tiles16"].tileSetJson.tilecount;
const FOREST_FIRST_GID = 1 + TILES16_COUNT;

/** The 8 (flipH, flipV, flipD) combos, indexed by bitmask i = H | V<<1 | D<<2. */
const FLIP_COMBOS = Array.from({ length: 8 }, (_, i) => ({
  flipH: !!(i & 1),
  flipV: !!(i & 2),
  flipD: !!(i & 4)
}));

function gidWithFlips(
  gid: number,
  flips: { flipH: boolean; flipV: boolean; flipD: boolean }
): number {
  let result = gid;
  if (flips.flipH) result = (result | HORIZONTAL_FLIP_BIT) >>> 0;
  if (flips.flipV) result = (result | VERTICAL_FLIP_BIT) >>> 0;
  if (flips.flipD) result = (result | DIAGONAL_FLIP_BIT) >>> 0;
  return result;
}

function buildFixture(): ITiledLevelJSON {
  const width = 12;
  const height = 12;
  const groundData = new Array(width * height).fill(0);
  // One tile per flip combo along the top row (tiles16 local id 5 → gid 6).
  for (let i = 0; i < FLIP_COMBOS.length; i++) {
    groundData[i] = gidWithFlips(6, FLIP_COMBOS[i]);
  }
  // A second-tileset tile in the far corner (also stretches content past the
  // small-level threshold so no _Borders layer is generated).
  groundData[11 + 11 * width] = FOREST_FIRST_GID + 3;

  const decoData = new Array(width * height).fill(0);
  decoData[0] = 6;

  return {
    width,
    height,
    infinite: false,
    orientation: "orthogonal",
    renderorder: "right-down",
    tiledversion: "1.11.0",
    tilewidth: 16,
    tileheight: 16,
    type: "map",
    version: "1.10",
    tilesets: [
      { firstgid: 1, source: "../../tilesets/tiles16.tsj" },
      {
        firstgid: FOREST_FIRST_GID,
        source: "../../tilesets/forest-tileset.tsj"
      }
    ],
    layers: [
      {
        type: "tilelayer",
        id: 1,
        name: "Ground",
        data: groundData,
        width,
        height,
        visible: true,
        opacity: 0.8,
        parallaxx: 0.9,
        x: 0,
        y: 0,
        properties: [{ name: "depth", type: "string", value: "bg" }]
      },
      {
        type: "tilelayer",
        id: 2,
        name: "Deco",
        data: decoData,
        width,
        height,
        visible: false,
        x: 0,
        y: 0
      },
      {
        type: "tilelayer",
        id: 4,
        name: "Scratch",
        data: new Array(width * height).fill(0),
        width,
        height,
        visible: true,
        x: 0,
        y: 0,
        properties: [{ name: "keep", type: "bool", value: true }]
      },
      {
        type: "objectgroup",
        id: 3,
        name: "Entities",
        draworder: "topdown",
        objects: [
          {
            id: 1,
            name: "Slime",
            type: "Slime",
            x: 40,
            y: 48,
            width: 32,
            height: 32,
            rotation: 0,
            point: false,
            visible: true
          },
          {
            id: 2,
            name: "Blobby",
            type: "Slime",
            x: 72,
            y: 80,
            width: 32,
            height: 32,
            rotation: 0,
            point: false,
            visible: true,
            properties: [
              { name: "speed", type: "float", value: 2.5 },
              { name: "aggro", type: "bool", value: true }
            ]
          },
          {
            id: 3,
            name: "WireConnector",
            type: "WireConnector",
            x: 64,
            y: 64,
            width: 0,
            height: 0,
            rotation: 0,
            point: false,
            visible: true,
            polyline: [
              { x: 0, y: 0 },
              { x: 32, y: 0 },
              { x: 32, y: -16 }
            ]
          },
          {
            id: 4,
            name: "MovingTerrain",
            type: "MovingTerrain",
            x: 96,
            y: 80,
            width: 0,
            height: 0,
            rotation: 0,
            point: false,
            visible: true,
            polygon: [
              { x: 0, y: 0 },
              { x: 48, y: 0 },
              { x: 48, y: 16 },
              { x: 0, y: 16 }
            ]
          }
        ]
      }
    ]
  };
}

function stateWith(
  layers: EditorLayer[],
  nextObjectId?: number
): LevelEditorState {
  return {
    layers,
    nextObjectId,
    externalTilesets: undefined
  } as Partial<LevelEditorState> as LevelEditorState;
}

/** Strip the freshly-minted editor ids so two loads can be compared. */
function normalizeLayers(layers: EditorLayer[]) {
  return layers.map((layer) => {
    if (layer.kind === "tile") {
      return {
        ...layer,
        id: "",
        tiles: [...layer.tiles.entries()].sort(([a], [b]) => a.localeCompare(b))
      };
    }
    if (layer.kind === "entity") {
      return {
        ...layer,
        id: "",
        // Tiled's default opacity is 1; an absent value and 1 are equivalent.
        opacity: layer.opacity ?? 1,
        entities: layer.entities.map((e) => ({ ...e, id: "" }))
      };
    }
    return { ...layer, id: "" };
  });
}

function tileGidAt(
  layer: ITiledLevelJSONInfiniteTileLayer,
  x: number,
  y: number
): number {
  for (const chunk of layer.chunks) {
    if (
      x >= chunk.x &&
      x < chunk.x + chunk.width &&
      y >= chunk.y &&
      y < chunk.y + chunk.height
    ) {
      return chunk.data[x - chunk.x + (y - chunk.y) * chunk.width];
    }
  }
  return 0;
}

describe("level editor TMJ round trip", () => {
  test("loads all 8 flip combos into flags and re-encodes the same gid bits", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "fixture");
    expect(loaded.missingTilesets).toEqual([]);

    const ground = loaded.layers.find((l) => l.name === "Ground");
    if (ground?.kind !== "tile") throw new Error("Ground layer missing");
    for (let i = 0; i < FLIP_COMBOS.length; i++) {
      const placement = ground.tiles.get(`${i},0`);
      expect(placement).toBeTruthy();
      expect(placement!.tilesetName).toBe("tiles16");
      expect(placement!.gid).toBe(5);
      expect(!!placement!.flipH).toBe(FLIP_COMBOS[i].flipH);
      expect(!!placement!.flipV).toBe(FLIP_COMBOS[i].flipV);
      expect(!!placement!.flipD).toBe(FLIP_COMBOS[i].flipD);
    }
    expect(ground.tiles.get("11,11")).toMatchObject({
      gid: 3,
      tilesetName: "forest-tileset"
    });

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGround = tiledJson.layers.find(
      (l) => l.name === "Ground"
    ) as ITiledLevelJSONInfiniteTileLayer;
    expect(builtGround).toBeTruthy();
    for (let i = 0; i < FLIP_COMBOS.length; i++) {
      expect(tileGidAt(builtGround, i, 0)).toBe(
        gidWithFlips(6, FLIP_COMBOS[i])
      );
    }
    expect(tileGidAt(builtGround, 11, 11)).toBe(FOREST_FIRST_GID + 3);
  });

  test("reads, writes, and round-trips the map background color", async () => {
    // Tiled → editor
    const loaded = await loadTmjJsonIntoEditor(
      { ...buildFixture(), backgroundcolor: "#1b2a3c" },
      "fixture"
    );
    expect(loaded.backgroundColor).toBe("#1b2a3c");

    // editor → Tiled
    const { tiledJson } = buildTMJFromState({
      ...stateWith(loaded.layers),
      backgroundColor: loaded.backgroundColor
    });
    expect(tiledJson.backgroundcolor).toBe("#1b2a3c");

    // Tiled → editor again (round trip preserves it)
    const reloaded = await loadTmjJsonIntoEditor(tiledJson, "fixture");
    expect(reloaded.backgroundColor).toBe("#1b2a3c");

    // An #AARRGGBB value drops alpha; an absent value falls back to the default.
    const withAlpha = await loadTmjJsonIntoEditor(
      { ...buildFixture(), backgroundcolor: "#80aabbcc" },
      "fixture"
    );
    expect(withAlpha.backgroundColor).toBe("#aabbcc");
    const noBg = await loadTmjJsonIntoEditor(buildFixture(), "fixture");
    expect(noBg.backgroundColor).toBe(DEFAULT_MAP_BACKGROUND_COLOR);
  });

  test("round-trips entities, names, shapes, and layer attributes", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "fixture");

    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const [plainSlime, namedSlime, wire, terrain] = entityLayer.entities;

    expect(plainSlime.type).toBe("Slime");
    expect(plainSlime.properties?.name).toBeUndefined();
    expect(plainSlime.tileX).toBe(3);
    expect(plainSlime.tileY).toBe(4);

    expect(namedSlime.properties?.name).toBe("Blobby");
    expect(namedSlime.properties?.speed).toBe(2.5);
    expect(namedSlime.properties?.aggro).toBe(true);

    expect(wire.polyline).toEqual([
      { x: 0, y: 0 },
      { x: 32, y: 0 },
      { x: 32, y: -16 }
    ]);
    expect(wire.polygon).toBeUndefined();
    expect(terrain.polygon).toHaveLength(4);
    expect(terrain.polyline).toBeUndefined();

    const ground = loaded.layers.find((l) => l.name === "Ground");
    if (ground?.kind !== "tile") throw new Error("Ground layer missing");
    expect(ground.opacity).toBe(0.8);
    expect(ground.parallaxx).toBe(0.9);
    expect(ground.tiledProperties).toEqual([
      { name: "depth", type: "string", value: "bg" }
    ]);
    const deco = loaded.layers.find((l) => l.name === "Deco");
    expect(deco?.visible).toBe(false);

    // Empty tile layers keep their name and properties through the export.
    const builtScratch = buildTMJFromState(
      stateWith(loaded.layers)
    ).tiledJson.layers.find((l) => l.name === "Scratch");
    expect(builtScratch).toMatchObject({
      type: "tilelayer",
      properties: [{ name: "keep", type: "bool", value: true }]
    });

    // Build and inspect the written objects.
    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtObjects = tiledJson.layers.find((l) => l.name === "Entities");
    if (builtObjects?.type !== "objectgroup")
      throw new Error("objects missing");
    const [outPlain, outNamed, outWire, outTerrain] = builtObjects.objects;
    expect(outPlain.name).toBe("Slime");
    expect(outNamed.name).toBe("Blobby");
    expect(outNamed.properties?.some((p) => p.name === "name")).toBe(false);
    expect(outWire.polyline).toEqual(wire.polyline);
    expect(outWire.polygon).toBeUndefined();
    expect(outTerrain.polygon).toEqual(terrain.polygon);

    // Reload the built TMJ — editor state must match the first load.
    const reloaded = await loadTmjJsonIntoEditor(tiledJson, "fixture");
    expect(reloaded.missingTilesets).toEqual([]);
    expect(normalizeLayers(reloaded.layers)).toEqual(
      normalizeLayers(loaded.layers)
    );
  });

  test("round-trips Tiled list custom properties", async () => {
    const fixture = buildFixture();
    const entityGroup = fixture.layers.find((l) => l.type === "objectgroup");
    if (entityGroup?.type !== "objectgroup")
      throw new Error("Entities object group missing");
    entityGroup.objects.push({
      id: 99,
      name: "ArrayResizableTerrain",
      type: "ArrayResizableTerrain",
      x: 128,
      y: 96,
      width: 48,
      height: 32,
      rotation: 0,
      point: false,
      visible: true,
      properties: [
        {
          name: "initialLengths",
          type: "list",
          value: [
            { type: "int", value: 16 },
            { type: "int", value: 0 },
            { type: "int", value: 32 }
          ]
        },
        {
          name: "mixed",
          type: "list",
          value: [
            { type: "string", value: "hi" },
            { type: "color", value: "#ff000000" },
            { type: "int", value: -3 }
          ]
        }
      ]
    });

    const loaded = await loadTmjJsonIntoEditor(fixture, "lists");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const placed = entityLayer.entities.find(
      (e) => e.type === "ArrayResizableTerrain"
    );
    expect(placed?.properties?.initialLengths).toEqual([16, 0, 32]);
    expect(placed?.properties?.mixed).toEqual(["hi", "#ff000000", -3]);

    // Numbers preserve int/float; colors normalize to string on export.
    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    const builtObj = builtGroup.objects.find(
      (o) => o.type === "ArrayResizableTerrain"
    );
    expect(
      builtObj?.properties?.find((p) => p.name === "initialLengths")
    ).toEqual({
      name: "initialLengths",
      type: "list",
      value: [
        { type: "int", value: 16 },
        { type: "int", value: 0 },
        { type: "int", value: 32 }
      ]
    });
    expect(builtObj?.properties?.find((p) => p.name === "mixed")).toEqual({
      name: "mixed",
      type: "list",
      value: [
        { type: "string", value: "hi" },
        { type: "string", value: "#ff000000" },
        { type: "int", value: -3 }
      ]
    });
  });

  test("round-trips Tiled class custom properties", async () => {
    const conversationValue = {
      start: "intro",
      speakers: ["Adana", "Player"],
      speakerImages: { Adana: "adana.png" },
      steps: {
        intro: {
          speaker: "Adana",
          text: [
            "Welcome, traveler.\nMind the drop.",
            "It is a long way down."
          ],
          nextOptions: [
            { text: "Thanks.", next: "thanks" },
            { text: "Who are you?", next: "who" }
          ]
        },
        thanks: { speaker: "Adana", text: ["Safe travels."], done: true }
      }
    };
    const fixture = buildFixture();
    const entityGroup = fixture.layers.find((l) => l.type === "objectgroup");
    if (entityGroup?.type !== "objectgroup")
      throw new Error("Entities object group missing");
    entityGroup.objects.push({
      id: 98,
      name: "OverlayConversation",
      type: "OverlayConversation",
      x: 128,
      y: 96,
      width: 32,
      height: 32,
      rotation: 0,
      point: false,
      visible: true,
      properties: [
        {
          name: "conversation",
          type: "class",
          propertytype: "Conversation",
          value: conversationValue
        },
        {
          name: "unlabeled",
          type: "class",
          value: { depth: { deeper: "still a string" } }
        }
      ]
    });

    const loaded = await loadTmjJsonIntoEditor(fixture, "classes");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const placed = entityLayer.entities.find(
      (e) => e.type === "OverlayConversation"
    );
    expect(placed?.properties?.conversation).toEqual(conversationValue);
    expect(placed?.propertyClassNames).toEqual({
      conversation: "Conversation"
    });

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    const builtObj = builtGroup.objects.find(
      (o) => o.type === "OverlayConversation"
    );
    expect(
      builtObj?.properties?.find((p) => p.name === "conversation")
    ).toEqual({
      name: "conversation",
      type: "class",
      propertytype: "Conversation",
      value: conversationValue
    });
    expect(builtObj?.properties?.find((p) => p.name === "unlabeled")).toEqual({
      name: "unlabeled",
      type: "class",
      value: { depth: { deeper: "still a string" } }
    });
  });

  test("round-trips entityRef properties as Tiled object references", async () => {
    const fixture = buildFixture();
    const entityGroup = fixture.layers.find((l) => l.type === "objectgroup");
    if (entityGroup?.type !== "objectgroup")
      throw new Error("Entities object group missing");
    entityGroup.objects.push({
      id: 97,
      name: "EntityRefFixture",
      type: "EntityRefFixture",
      x: 128,
      y: 96,
      width: 16,
      height: 16,
      rotation: 0,
      point: false,
      visible: true,
      properties: [
        { name: "target", type: "object", value: 4 },
        { name: "label", type: "string", value: "to the platform" }
      ]
    });

    const loaded = await loadTmjJsonIntoEditor(fixture, "entityRefs");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const placed = entityLayer.entities.find(
      (e) => e.type === "EntityRefFixture"
    );
    // Numeric refs resolve to the target's placement id on load, so the link
    // is tracked by identity in the editor and only becomes a number again
    // at export.
    const refTarget = entityLayer.entities.find((e) => e.tiledObjectId === 4);
    expect(refTarget).toBeDefined();
    expect(placed?.properties?.target).toBe(refTarget!.id);

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    const builtObj = builtGroup.objects.find(
      (o) => o.type === "EntityRefFixture"
    );
    expect(builtObj?.properties?.find((p) => p.name === "target")).toEqual({
      name: "target",
      type: "object",
      value: 4
    });
    expect(builtObj?.properties?.find((p) => p.name === "label")).toEqual({
      name: "label",
      type: "string",
      value: "to the platform"
    });
  });

  test("keeps unresolvable entityRefs numeric and drops zero refs", async () => {
    const fixture = buildFixture();
    const entityGroup = fixture.layers.find((l) => l.type === "objectgroup");
    if (entityGroup?.type !== "objectgroup")
      throw new Error("Entities object group missing");
    entityGroup.objects.push(
      {
        id: 98,
        name: "dangling",
        type: "EntityRefFixture",
        x: 128,
        y: 96,
        width: 16,
        height: 16,
        rotation: 0,
        point: false,
        visible: true,
        properties: [{ name: "target", type: "object", value: 55 }]
      },
      {
        id: 99,
        name: "unset",
        type: "EntityRefFixture",
        x: 144,
        y: 96,
        width: 16,
        height: 16,
        rotation: 0,
        point: false,
        visible: true,
        properties: [{ name: "target", type: "object", value: 0 }]
      }
    );

    const loaded = await loadTmjJsonIntoEditor(fixture, "entityRefs");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const dangling = entityLayer.entities.find(
      (e) => e.properties?.name === "dangling"
    );
    const unset = entityLayer.entities.find(
      (e) => e.properties?.name === "unset"
    );
    expect(dangling?.properties?.target).toBe(55);
    expect(unset?.properties?.target).toBeUndefined();

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    const builtDangling = builtGroup.objects.find((o) => o.name === "dangling");
    expect(builtDangling?.properties?.find((p) => p.name === "target")).toEqual(
      { name: "target", type: "object", value: 55 }
    );
  });

  test("dedupes duplicate object ids on load, keeping refs on the first", async () => {
    const fixture = buildFixture();
    const entityGroup = fixture.layers.find((l) => l.type === "objectgroup");
    if (entityGroup?.type !== "objectgroup")
      throw new Error("Entities object group missing");
    // Object id 2 already exists in the fixture; this duplicate could come
    // from a hand-edited file or the historical paste bug.
    entityGroup.objects.push(
      {
        id: 2,
        name: "Impostor",
        type: "Slime",
        x: 160,
        y: 96,
        width: 32,
        height: 32,
        rotation: 0,
        point: false,
        visible: true
      },
      {
        id: 98,
        name: "linker",
        type: "EntityRefFixture",
        x: 128,
        y: 96,
        width: 16,
        height: 16,
        rotation: 0,
        point: false,
        visible: true,
        properties: [{ name: "target", type: "object", value: 2 }]
      }
    );

    const loaded = await loadTmjJsonIntoEditor(fixture, "dupIds");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");

    const objectIds = entityLayer.entities.map((e) => e.tiledObjectId);
    expect(new Set(objectIds).size).toBe(objectIds.length);
    const keeper = entityLayer.entities.find(
      (e) => e.properties?.name === "Blobby"
    );
    const impostor = entityLayer.entities.find(
      (e) => e.properties?.name === "Impostor"
    );
    expect(keeper?.tiledObjectId).toBe(2);
    expect(impostor?.tiledObjectId).toBe(99);
    expect(loaded.nextObjectId).toBe(100);

    const linker = entityLayer.entities.find(
      (e) => e.properties?.name === "linker"
    );
    expect(linker?.properties?.target).toBe(keeper!.id);
  });

  test("exports a dangling placement-id ref as 0 and a live one as the target's id", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "refExport");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    const blobby = entityLayer.entities.find(
      (e) => e.properties?.name === "Blobby"
    );
    entityLayer.entities.push(
      {
        type: "EntityRefFixture",
        tileX: 3,
        tileY: 3,
        id: "linked",
        properties: { name: "linked", target: blobby!.id }
      },
      {
        type: "EntityRefFixture",
        tileX: 4,
        tileY: 3,
        id: "orphaned",
        properties: { name: "orphaned", target: "deleted-placement" }
      }
    );

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    expect(
      builtGroup.objects
        .find((o) => o.name === "linked")
        ?.properties?.find((p) => p.name === "target")
    ).toEqual({ name: "target", type: "object", value: 2 });
    expect(
      builtGroup.objects
        .find((o) => o.name === "orphaned")
        ?.properties?.find((p) => p.name === "target")
    ).toEqual({ name: "target", type: "object", value: 0 });
  });

  test("export never writes duplicate object ids even from unrepaired state", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "dupExport");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    entityLayer.entities.push({
      type: "Slime",
      tileX: 5,
      tileY: 3,
      id: "collided",
      tiledObjectId: 2
    });

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    const ids = builtGroup.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(tiledJson.nextobjectid).toBeGreaterThan(Math.max(...ids));
  });

  test("keeps loaded object ids and allocates new ones from nextobjectid", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "objectIds");
    const entityLayer = loaded.layers.find((l) => l.kind === "entity");
    if (entityLayer?.kind !== "entity") throw new Error("Entity layer missing");
    expect(entityLayer.entities.map((e) => e.tiledObjectId)).toEqual([
      1, 2, 3, 4
    ]);

    entityLayer.entities.push({
      type: "Slime",
      tileX: 3,
      tileY: 3,
      id: "editor-placed"
    });

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers, 12));
    const builtGroup = tiledJson.layers.find((l) => l.type === "objectgroup");
    if (builtGroup?.type !== "objectgroup")
      throw new Error("built object group missing");
    expect(builtGroup.objects.map((o) => o.id)).toEqual([1, 2, 3, 4, 12]);
    expect(tiledJson.nextobjectid).toBe(13);
  });

  test("round-trips class properties on layers and the map", async () => {
    const fixture = {
      ...buildFixture(),
      properties: [
        {
          name: "ambience",
          type: "class",
          propertytype: "ambience",
          value: { track: "caves-theme", volume: 0.4 }
        }
      ]
    };
    const groundLayer = fixture.layers.find((l) => l.name === "Ground");
    if (groundLayer?.type !== "tilelayer")
      throw new Error("Ground tile layer missing");
    const groundProperties = [
      {
        name: "lighting",
        type: "class",
        propertytype: "lighting",
        value: { tint: "#221100", falloff: { near: 1, far: 8 } }
      }
    ];
    groundLayer.properties = groundProperties;

    const loaded = await loadTmjJsonIntoEditor(fixture, "classes");
    expect(loaded.mapProperties).toEqual(fixture.properties);
    const loadedGround = loaded.layers.find((l) => l.name === "Ground");
    if (loadedGround?.kind !== "tile")
      throw new Error("loaded Ground layer missing");
    expect(loadedGround.tiledProperties).toEqual(groundProperties);

    const { tiledJson } = buildTMJFromState({
      ...stateWith(loaded.layers),
      mapProperties: loaded.mapProperties
    });
    expect(tiledJson.properties).toEqual(fixture.properties);
    const builtGround = tiledJson.layers.find((l) => l.name === "Ground");
    if (builtGround?.type !== "tilelayer")
      throw new Error("built Ground layer missing");
    expect(builtGround.properties).toEqual(groundProperties);
  });

  test("build output is stable across a second round trip", async () => {
    const loaded = await loadTmjJsonIntoEditor(buildFixture(), "fixture");
    const built1 = buildTMJFromState(stateWith(loaded.layers)).tiledJson;
    const reloaded = await loadTmjJsonIntoEditor(built1, "fixture");
    const built2 = buildTMJFromState(stateWith(reloaded.layers)).tiledJson;
    expect(built2).toEqual(built1);
  });

  test("keeps tiles from unresolvable tilesets and re-exports them", async () => {
    const fixture = buildFixture();
    const mysteryFirstGid = 100000;
    fixture.tilesets.push({
      firstgid: mysteryFirstGid,
      source: "../../somewhere/else/mystery-tiles.tsj"
    });
    const ground = fixture.layers.find((l) => l.name === "Ground");
    if (ground?.type !== "tilelayer" || !("data" in ground))
      throw new Error("Ground layer missing");
    (ground.data as number[])[3 + 3 * 12] = mysteryFirstGid + 7;

    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    expect(loaded.missingTilesets).toEqual(["mystery-tiles"]);
    expect(loaded.unknownTilesetSources).toEqual({
      "mystery-tiles": "../../somewhere/else/mystery-tiles.tsj"
    });
    const loadedGround = loaded.layers.find((l) => l.name === "Ground");
    if (loadedGround?.kind !== "tile") throw new Error("Ground layer missing");
    expect(loadedGround.tiles.get("3,3")).toEqual({
      gid: 7,
      tilesetName: "mystery-tiles"
    });

    const { tiledJson } = buildTMJFromState({
      ...stateWith(loaded.layers),
      unknownTilesetSources: loaded.unknownTilesetSources
    });
    const mysteryRef = tiledJson.tilesets.find((t) =>
      t.source.includes("mystery-tiles")
    );
    expect(mysteryRef?.source).toBe("../../somewhere/else/mystery-tiles.tsj");
    const builtGround = tiledJson.layers.find(
      (l) => l.name === "Ground"
    ) as ITiledLevelJSONInfiniteTileLayer;
    expect(tileGidAt(builtGround, 3, 3)).toBe(mysteryRef!.firstgid + 7);

    // Reload the export: the placement survives a full second round trip.
    const reloaded = await loadTmjJsonIntoEditor(tiledJson, "fixture");
    const reloadedGround = reloaded.layers.find((l) => l.name === "Ground");
    if (reloadedGround?.kind !== "tile")
      throw new Error("Ground layer missing");
    expect(reloadedGround.tiles.get("3,3")).toEqual({
      gid: 7,
      tilesetName: "mystery-tiles"
    });
  });

  test("unresolvable tilesets sharing a basename stay distinct", async () => {
    const fixture = buildFixture();
    fixture.tilesets.push(
      { firstgid: 100000, source: "../a/deco.tsj" },
      { firstgid: 200000, source: "../b/deco.tsj" }
    );
    const ground = fixture.layers.find((l) => l.name === "Ground");
    if (ground?.type !== "tilelayer" || !("data" in ground))
      throw new Error("Ground layer missing");
    (ground.data as number[])[3 + 3 * 12] = 100000 + 7;
    (ground.data as number[])[4 + 3 * 12] = 200000 + 7;

    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    expect(loaded.unknownTilesetSources).toEqual({
      deco: "../a/deco.tsj",
      "deco-2": "../b/deco.tsj"
    });
    const loadedGround = loaded.layers.find((l) => l.name === "Ground");
    if (loadedGround?.kind !== "tile") throw new Error("Ground layer missing");
    expect(loadedGround.tiles.get("3,3")).toEqual({
      gid: 7,
      tilesetName: "deco"
    });
    expect(loadedGround.tiles.get("4,3")).toEqual({
      gid: 7,
      tilesetName: "deco-2"
    });

    // Both source paths survive the export as separate tileset references.
    const { tiledJson } = buildTMJFromState({
      ...stateWith(loaded.layers),
      unknownTilesetSources: loaded.unknownTilesetSources
    });
    const sources = tiledJson.tilesets.map((t) => t.source);
    expect(sources).toContain("../a/deco.tsj");
    expect(sources).toContain("../b/deco.tsj");
  });

  test("keeps out-of-range tile ids instead of dropping them", async () => {
    const fixture = buildFixture();
    const ground = fixture.layers.find((l) => l.name === "Ground");
    if (ground?.type !== "tilelayer" || !("data" in ground))
      throw new Error("Ground layer missing");
    // A gid past the end of the last tileset (forest) resolves to it with an
    // out-of-range local id.
    const forestCount = allTilesets["forest-tileset"].tileSetJson.tilecount;
    const pastEnd = forestCount + 5;
    (ground.data as number[])[5 + 5 * 12] = FOREST_FIRST_GID + pastEnd;

    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    const loadedGround = loaded.layers.find((l) => l.name === "Ground");
    if (loadedGround?.kind !== "tile") throw new Error("Ground layer missing");
    expect(loadedGround.tiles.get("5,5")).toEqual({
      gid: pastEnd,
      tilesetName: "forest-tileset"
    });

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const builtGround = tiledJson.layers.find(
      (l) => l.name === "Ground"
    ) as ITiledLevelJSONInfiniteTileLayer;
    const forestRef = tiledJson.tilesets.find((t) =>
      t.source.includes("forest")
    )!;
    expect(tileGidAt(builtGround, 5, 5)).toBe(forestRef.firstgid + pastEnd);
    // Any tileset placed after forest must start past the overflowing id so
    // the gid ranges don't overlap.
    for (const other of tiledJson.tilesets) {
      if (other === forestRef || other.firstgid <= forestRef.firstgid) {
        continue;
      }
      expect(other.firstgid).toBeGreaterThan(forestRef.firstgid + pastEnd);
    }
  });

  test("carries unknown layer types through as opaque blobs", async () => {
    const fixture = buildFixture();
    const weirdLayer = {
      type: "meshlayer",
      id: 77,
      name: "Future Mesh",
      visible: true,
      x: 0,
      y: 0,
      meshData: { verts: [1, 2, 3], flavor: "chunky" }
    };
    fixture.layers.splice(
      1,
      0,
      weirdLayer as unknown as (typeof fixture.layers)[number]
    );

    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    const unknown = loaded.layers.find((l) => l.kind === "unknown");
    if (unknown?.kind !== "unknown") throw new Error("unknown layer missing");
    expect(unknown.name).toBe("Future Mesh");
    // Preserved in position: after Ground, before the rest.
    expect(loaded.layers[1]).toBe(unknown);

    const { tiledJson } = buildTMJFromState(stateWith(loaded.layers));
    const rebuilt = tiledJson.layers.find(
      (l) => l.name === "Future Mesh"
    ) as unknown as typeof weirdLayer;
    expect(rebuilt).toBeTruthy();
    expect(rebuilt.type).toBe("meshlayer");
    expect(rebuilt.meshData).toEqual(weirdLayer.meshData);
    expect(tiledJson.layers.indexOf(rebuilt as never)).toBe(
      tiledJson.layers.findIndex((l) => l.name === "Ground") + 1
    );
  });

  test("unknown layer rename and visibility edits survive export", async () => {
    const fixture = buildFixture();
    const weirdLayer = {
      type: "meshlayer",
      id: 78,
      name: "Future Mesh",
      visible: true,
      x: 0,
      y: 0,
      meshData: { verts: [4, 5, 6] }
    };
    fixture.layers.push(
      weirdLayer as unknown as (typeof fixture.layers)[number]
    );

    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    const layers = loaded.layers.map((l) =>
      l.kind === "unknown" ? { ...l, name: "Mesh Renamed", visible: false } : l
    );

    const { tiledJson } = buildTMJFromState(stateWith(layers));
    const rebuilt = tiledJson.layers.find(
      (l) => l.name === "Mesh Renamed"
    ) as unknown as typeof weirdLayer;
    expect(rebuilt).toBeTruthy();
    expect(rebuilt.type).toBe("meshlayer");
    expect(rebuilt.visible).toBe(false);
    expect(rebuilt.meshData).toEqual(weirdLayer.meshData);
  });

  test("round-trips map-level custom properties", async () => {
    const fixture = {
      ...buildFixture(),
      properties: [
        { name: "music", type: "string", value: "caves-theme" },
        { name: "darkness", type: "float", value: 0.4 }
      ]
    };
    const loaded = await loadTmjJsonIntoEditor(fixture, "fixture");
    expect(loaded.mapProperties).toEqual(fixture.properties);

    const { tiledJson } = buildTMJFromState({
      ...stateWith(loaded.layers),
      mapProperties: loaded.mapProperties
    });
    expect(tiledJson.properties).toEqual(fixture.properties);
  });

  test("a real campaign map survives load → build → load → build unchanged", async () => {
    const loaded = await loadTmjJsonIntoEditor(
      villageMap as ITiledLevelJSON,
      "village-3b-shrine-entrance"
    );
    expect(loaded.missingTilesets).toEqual([]);
    const built1 = buildTMJFromState(stateWith(loaded.layers)).tiledJson;
    const reloaded = await loadTmjJsonIntoEditor(
      built1,
      "village-3b-shrine-entrance"
    );
    const built2 = buildTMJFromState(stateWith(reloaded.layers)).tiledJson;
    expect(built2).toEqual(built1);
  });
});
