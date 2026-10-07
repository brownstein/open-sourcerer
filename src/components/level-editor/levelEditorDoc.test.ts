import * as Y from "yjs";

import { populateDoc, readDocLayersAsEditorLayers } from "./levelEditorDoc";
import { EditorLayer } from "./levelEditorState";

function buildLayers(): EditorLayer[] {
  return [
    {
      kind: "tile",
      id: "layer-ground",
      name: "Ground",
      visible: true,
      opacity: 0.8,
      parallaxx: 0.9,
      tintcolor: "#ffeecc",
      offsetx: 4,
      tiledProperties: [{ name: "depth", type: "string", value: "bg" }],
      tiles: new Map([
        ["0,0", { gid: 5, tilesetName: "tiles16" }],
        ["1,0", { gid: 5, tilesetName: "tiles16", flipH: true }],
        ["2,0", { gid: 5, tilesetName: "tiles16", flipV: true, flipD: true }],
        ["-3,-7", { gid: 12, tilesetName: "forest-tileset" }]
      ])
    },
    {
      kind: "entity",
      id: "layer-entities",
      name: "Entities",
      visible: false,
      opacity: 0.5,
      entities: [
        { type: "Slime", tileX: 3, tileY: 4, id: "ent-a" },
        {
          type: "Slime",
          tileX: 5,
          tileY: 6,
          id: "ent-b",
          width: 48,
          height: 24,
          angle: 90,
          properties: {
            name: "Blobby",
            speed: 2.5,
            aggro: true,
            lengths: [16, 0, 32]
          }
        },
        {
          type: "WireConnector",
          tileX: 4,
          tileY: 4,
          id: "ent-c",
          polyline: [
            { x: 0, y: 0 },
            { x: 32, y: -16 }
          ]
        },
        {
          type: "MovingTerrain",
          tileX: 6,
          tileY: 5,
          id: "ent-d",
          polygon: [
            { x: 0, y: 0 },
            { x: 48, y: 0 },
            { x: 48, y: 16 }
          ]
        }
      ]
    },
    {
      kind: "image",
      id: "layer-bg",
      name: "Backdrop",
      visible: true,
      imagePath: "../../backgrounds/caves/cave-bg-0.png",
      imageName: "cave-bg-0",
      imageUrl: "blob:fake",
      offsetx: -10,
      offsety: 20,
      opacity: 0.75,
      parallaxy: 0.4,
      repeatx: true,
      tiledProperties: [{ name: "loop", type: "bool", value: true }]
    },
    {
      kind: "unknown",
      id: "layer-mesh",
      name: "Future Mesh",
      visible: true,
      raw: {
        type: "meshlayer",
        name: "Future Mesh",
        meshData: { verts: [1, 2, 3], flavor: "chunky" }
      }
    }
  ];
}

describe("level editor Y.Doc round trip", () => {
  test("editor state round trips through the doc as a perfect identity", () => {
    const layers = buildLayers();
    const doc = new Y.Doc();
    doc.transact(() => {
      populateDoc(doc, {
        layers,
        levelName: "Fixture",
        backgroundColor: "#112233"
      });
    });
    expect(readDocLayersAsEditorLayers(doc)).toEqual(layers);
  });

  test("identity survives encode, transfer, and decode into a second doc", () => {
    const layers = buildLayers();
    const doc = new Y.Doc();
    doc.transact(() => {
      populateDoc(doc, {
        layers,
        levelName: "Fixture",
        backgroundColor: "#112233",
        sourceLevelId: "Forest_1"
      });
    });

    const received = new Y.Doc();
    Y.applyUpdate(received, Y.encodeStateAsUpdate(doc));

    expect(readDocLayersAsEditorLayers(received)).toEqual(layers);
    expect(received.getMap("meta").get("levelName")).toBe("Fixture");
    expect(received.getMap("meta").get("sourceLevelId")).toBe("Forest_1");
    expect(received.getMap("meta").get("levelUuid")).toBe(
      doc.getMap("meta").get("levelUuid")
    );
  });

  test("repopulating an existing doc replaces its contents wholesale", () => {
    const doc = new Y.Doc();
    doc.transact(() => {
      populateDoc(doc, {
        layers: buildLayers(),
        levelName: "First",
        backgroundColor: "#112233"
      });
    });
    const replacement: EditorLayer[] = [
      {
        kind: "tile",
        id: "only",
        name: "Main",
        visible: true,
        opacity: 1,
        tiles: new Map([["5,5", { gid: 1, tilesetName: "tiles16" }]])
      }
    ];
    doc.transact(() => {
      populateDoc(doc, {
        layers: replacement,
        levelName: "Second",
        backgroundColor: "#445566"
      });
    });
    expect(readDocLayersAsEditorLayers(doc)).toEqual(replacement);
    expect(doc.getMap("meta").get("levelName")).toBe("Second");
  });
});
