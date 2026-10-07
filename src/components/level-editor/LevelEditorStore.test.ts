import * as Y from "yjs";

import { allTilesets } from "src/levels/tilesets/allTilesets";

import { levelEditorStore as store } from "./LevelEditorStore";
import { REMOTE_ORIGIN, getDocMeta } from "./levelEditorDoc";
import { EditorLayer, TileLayer, TilePlacement } from "./levelEditorState";

// The entity registry (only used by the asset preloader, which these tests
// never start) drags in import.meta-based modules jest can't parse.
jest.mock("src/entities/allEntities", () => ({
  entityClassRegistry: { getAll: () => [], keys: () => [] }
}));

function freshLayers(): EditorLayer[] {
  return [
    {
      kind: "tile",
      id: "t1",
      name: "Main",
      visible: true,
      opacity: 1,
      tiles: new Map([["0,0", { gid: 1, tilesetName: "tiles16" }]])
    },
    {
      kind: "entity",
      id: "e1",
      name: "Entities",
      visible: true,
      entities: [{ type: "Slime", tileX: 2, tileY: 2, id: "slime-1" }]
    }
  ];
}

function tileLayer(): TileLayer {
  const layer = store.getState().layers.find((l) => l.id === "t1");
  if (layer?.kind !== "tile") throw new Error("tile layer missing");
  return layer;
}

describe("LevelEditorStore (Y.Doc-backed)", () => {
  beforeEach(() => {
    store.loadState({ layers: freshLayers(), levelName: "Test" });
  });

  test("loadState resets the view and clears undo history", () => {
    expect(store.getState().layers).toHaveLength(2);
    expect(store.getState().levelName).toBe("Test");
    expect(store.canUndo()).toBe(false);
    expect(tileLayer().tiles.get("0,0")).toEqual({
      gid: 1,
      tilesetName: "tiles16"
    });
  });

  test("paint / erase update the derived view with fresh identities", () => {
    const before = tileLayer();
    const beforeLayers = store.getState().layers;
    store.pushUndo();
    store.paintTile("t1", 4, 5, { gid: 7, tilesetName: "tiles16" });
    const after = tileLayer();
    expect(after).not.toBe(before);
    expect(after.tiles).not.toBe(before.tiles);
    expect(store.getState().layers).not.toBe(beforeLayers);
    expect(after.tiles.get("4,5")).toEqual({ gid: 7, tilesetName: "tiles16" });

    // The untouched entity layer keeps its identity for renderer caching.
    expect(store.getState().layers[1]).toBe(beforeLayers[1]);

    store.pushUndo();
    store.eraseTile("t1", 4, 5);
    expect(tileLayer().tiles.has("4,5")).toBe(false);
  });

  test("undo/redo group a gesture into one unit and only span local edits", () => {
    store.pushUndo();
    store.paintTile("t1", 1, 0, { gid: 2, tilesetName: "tiles16" });
    store.paintTile("t1", 2, 0, { gid: 2, tilesetName: "tiles16" });
    store.paintTile("t1", 3, 0, { gid: 2, tilesetName: "tiles16" });
    expect(tileLayer().tiles.size).toBe(4);

    store.undo();
    expect(tileLayer().tiles.size).toBe(1);
    expect(store.canRedo()).toBe(true);

    store.redo();
    expect(tileLayer().tiles.size).toBe(4);
    store.undo();
    expect(tileLayer().tiles.size).toBe(1);
  });

  test("cancelToLastUndoPoint rolls back only the in-progress gesture", () => {
    store.pushUndo();
    store.paintTile("t1", 1, 1, { gid: 3, tilesetName: "tiles16" });
    store.undo();
    expect(tileLayer().tiles.size).toBe(1);

    // No changes since the last boundary; cancel must not eat prior history.
    store.pushUndo();
    store.cancelToLastUndoPoint();
    expect(tileLayer().tiles.size).toBe(1);

    store.pushUndo();
    store.paintTile("t1", 6, 6, { gid: 3, tilesetName: "tiles16" });
    store.cancelToLastUndoPoint();
    expect(tileLayer().tiles.has("6,6")).toBe(false);
  });

  test("entity mutations round through the doc", () => {
    store.pushUndo();
    store.addEntity({ type: "Bat", tileX: 8, tileY: 9, id: "bat-1" });
    let entities = store.getState().layers[1];
    if (entities.kind !== "entity") throw new Error("entity layer missing");
    expect(entities.entities.map((e) => e.id)).toEqual(["slime-1", "bat-1"]);

    store.moveEntity("bat-1", 10, 11);
    store.updateEntityProperties("bat-1", { name: "Screech" });
    entities = store.getState().layers[1];
    if (entities.kind !== "entity") throw new Error("entity layer missing");
    const bat = entities.entities.find((e) => e.id === "bat-1")!;
    expect(bat.tileX).toBe(10);
    expect(bat.tileY).toBe(11);
    expect(bat.properties).toEqual({ name: "Screech" });

    store.selectEntity("bat-1");
    store.removeEntity("bat-1");
    entities = store.getState().layers[1];
    if (entities.kind !== "entity") throw new Error("entity layer missing");
    expect(entities.entities.map((e) => e.id)).toEqual(["slime-1"]);
    expect(store.getState().selectedEntityIds).toEqual([]);
  });

  test("placed entities take a Tiled object id from the doc counter", () => {
    store.loadState({
      layers: [
        {
          kind: "entity",
          id: "e1",
          name: "Entities",
          visible: true,
          entities: [
            {
              type: "Slime",
              tileX: 2,
              tileY: 2,
              id: "slime-1",
              tiledObjectId: 4
            }
          ]
        }
      ],
      levelName: "Test",
      nextObjectId: 5
    });

    store.addEntity({ type: "Bat", tileX: 1, tileY: 1, id: "bat-1" });
    store.removeEntity("bat-1");
    store.addEntity({ type: "Bat", tileX: 2, tileY: 1, id: "bat-2" });

    const layer = store.getState().layers[0];
    if (layer.kind !== "entity") throw new Error("entity layer missing");
    expect(layer.entities.map((e) => [e.id, e.tiledObjectId] as const)).toEqual(
      [
        ["slime-1", 4],
        ["bat-2", 6]
      ]
    );
    expect(getDocMeta(store.getDoc()).get("nextObjectId")).toBe(7);
  });

  test("nested property writes only rewrite the addressed path", () => {
    store.addEntity({
      type: "OverlayConversation",
      tileX: 3,
      tileY: 4,
      id: "convo-1"
    });
    store.updateEntityProperties("convo-1", {
      conversation: {
        start: "intro",
        steps: {
          intro: { speaker: "Adana", text: ["Hello."] },
          outro: { speaker: "Adana", text: ["Goodbye."] }
        }
      }
    });

    const conversationOf = (): Record<string, unknown> => {
      const layer = store.getState().layers[1];
      if (layer.kind !== "entity") throw new Error("entity layer missing");
      const entity = layer.entities.find((e) => e.id === "convo-1")!;
      return entity.properties?.conversation as Record<string, unknown>;
    };

    store.updateEntityPropertyAtPath(
      "convo-1",
      "conversation",
      ["steps", "intro", "text", 1],
      "Mind the drop."
    );
    expect(conversationOf()).toEqual({
      start: "intro",
      steps: {
        intro: { speaker: "Adana", text: ["Hello.", "Mind the drop."] },
        outro: { speaker: "Adana", text: ["Goodbye."] }
      }
    });

    store.updateEntityPropertyAtPath(
      "convo-1",
      "conversation",
      ["steps", "later", "nextOptions", 0, "next"],
      "outro"
    );
    expect(conversationOf().steps).toEqual({
      intro: { speaker: "Adana", text: ["Hello.", "Mind the drop."] },
      outro: { speaker: "Adana", text: ["Goodbye."] },
      later: { nextOptions: [{ next: "outro" }] }
    });

    store.updateEntityPropertyAtPath("convo-1", "conversation", [], undefined);
    expect(conversationOf()).toBeUndefined();
  });

  test("a nested edit keeps a peer's edit to another part of the same object", () => {
    store.addEntity({
      type: "OverlayConversation",
      tileX: 3,
      tileY: 4,
      id: "convo-2"
    });
    store.updateEntityProperties("convo-2", {
      conversation: {
        start: "intro",
        steps: { intro: { speaker: "Adana", text: ["Hello."] } }
      }
    });

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));
    const knownByStore = Y.encodeStateVector(store.getDoc());
    const peerEntities = (
      peer.getMap("layers").get("e1") as Y.Map<unknown>
    ).get("entities") as Y.Map<Record<string, unknown>>;
    const peerEntity = peerEntities.get("convo-2")!;
    peerEntities.set("convo-2", {
      ...peerEntity,
      properties: {
        conversation: {
          start: "intro",
          steps: {
            intro: { speaker: "Adana", text: ["Hello."] },
            outro: { speaker: "Bean", text: ["Bye."] }
          }
        }
      }
    });
    Y.applyUpdate(
      store.getDoc(),
      Y.encodeStateAsUpdate(peer, knownByStore),
      REMOTE_ORIGIN
    );

    store.updateEntityPropertyAtPath(
      "convo-2",
      "conversation",
      ["steps", "intro", "speaker"],
      "Player"
    );

    const layer = store.getState().layers[1];
    if (layer.kind !== "entity") throw new Error("entity layer missing");
    const entity = layer.entities.find((e) => e.id === "convo-2")!;
    expect(entity.properties?.conversation).toEqual({
      start: "intro",
      steps: {
        intro: { speaker: "Player", text: ["Hello."] },
        outro: { speaker: "Bean", text: ["Bye."] }
      }
    });
    peer.destroy();
  });

  test("layer operations: add, rename, reorder, remove", () => {
    store.pushUndo();
    store.addLayer("Deco");
    const added = store.getState().layers.find((l) => l.name === "Deco")!;
    expect(store.getState().activeLayerId).toBe(added.id);

    store.renameLayer(added.id, "Decor");
    expect(store.getState().layers.find((l) => l.id === added.id)?.name).toBe(
      "Decor"
    );

    store.reorderLayer(added.id, 0);
    expect(store.getState().layers[0].id).toBe(added.id);

    store.pushUndo();
    store.removeLayer(added.id);
    expect(
      store.getState().layers.find((l) => l.id === added.id)
    ).toBeUndefined();
    // The removed layer was active, so the view falls back to the first layer.
    expect(store.getState().activeLayerId).toBe(store.getState().layers[0].id);

    // Undo restores just the removal (its own gesture), not the earlier ops.
    store.undo();
    const restored = store.getState().layers.find((l) => l.id === added.id);
    expect(restored?.name).toBe("Decor");
    expect(store.getState().layers[0].id).toBe(added.id);
  });

  test("metadata edits are not undoable (matching the old snapshot undo)", () => {
    store.pushUndo();
    store.paintTile("t1", 2, 2, { gid: 9, tilesetName: "tiles16" });
    store.setLevelName("Renamed");
    store.setBackgroundColor("#aabbcc");
    store.undo();
    expect(tileLayer().tiles.has("2,2")).toBe(false);
    expect(store.getState().levelName).toBe("Renamed");
    expect(store.getState().backgroundColor).toBe("#aabbcc");
  });

  test("shared-doc mode loads in place, keeping the same doc instance", () => {
    const docBefore = store.getDoc();
    store.setSharedDocMode(true);
    try {
      store.loadState({
        layers: [
          {
            kind: "tile",
            id: "solo",
            name: "Solo",
            visible: true,
            opacity: 1,
            tiles: new Map()
          }
        ],
        levelName: "Shared Load"
      });
      expect(store.getDoc()).toBe(docBefore);
      expect(store.getState().levelName).toBe("Shared Load");
      expect(store.getState().layers.map((l) => l.id)).toEqual(["solo"]);
      expect(store.canUndo()).toBe(false);
    } finally {
      store.setSharedDocMode(false);
    }
    // Solo loads swap to a fresh doc.
    store.loadState({ layers: freshLayers(), levelName: "Fresh" });
    expect(store.getDoc()).not.toBe(docBefore);
  });

  test("mintEditorId is prefixed with the doc clientID", () => {
    const id = store.mintEditorId();
    expect(id.startsWith(store.getDoc().clientID.toString(36) + "-")).toBe(
      true
    );
  });

  test("clearAll mints a fresh identity and is not undoable", () => {
    const uuidBefore = store.getState().levelUuid;
    store.pushUndo();
    store.paintTile("t1", 1, 1, { gid: 2, tilesetName: "tiles16" });
    store.clearAll();
    expect(store.getState().levelUuid).toBeDefined();
    expect(store.getState().levelUuid).not.toBe(uuidBefore);
    expect(store.canUndo()).toBe(false);
    expect(store.getState().layers).toHaveLength(2);
  });

  test("a remote level switch invalidates the save slot and undo history", () => {
    store.setSavedMapId("slot-of-old-level");
    store.pushUndo();
    store.paintTile("t1", 3, 3, { gid: 5, tilesetName: "tiles16" });
    expect(store.canUndo()).toBe(true);

    let identityEvents = 0;
    const onIdentityChanged = () => identityEvents++;
    store.events.on("levelIdentityChanged", onIdentityChanged);
    store.getDoc().transact(() => {
      getDocMeta(store.getDoc()).set("levelUuid", "peer-loaded-level");
    }, REMOTE_ORIGIN);
    store.events.off("levelIdentityChanged", onIdentityChanged);

    expect(identityEvents).toBe(1);
    expect(store.getState().savedMapId).toBeUndefined();
    expect(store.canUndo()).toBe(false);
  });

  test("remote edits reach the view but stay out of local undo", () => {
    // A peer doc bootstrapped from the store's history, as join-adopts does.
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));

    store.pushUndo();
    store.paintTile("t1", 5, 5, { gid: 4, tilesetName: "tiles16" });

    const knownByStore = Y.encodeStateVector(store.getDoc());
    const peerTiles = (peer.getMap("layers").get("t1") as Y.Map<unknown>).get(
      "tiles"
    ) as Y.Map<TilePlacement>;
    peerTiles.set("7,7", { gid: 9, tilesetName: "tiles16" });
    Y.applyUpdate(
      store.getDoc(),
      Y.encodeStateAsUpdate(peer, knownByStore),
      REMOTE_ORIGIN
    );

    // The remote paint landed in the derived view without a local event.
    expect(tileLayer().tiles.get("7,7")).toEqual({
      gid: 9,
      tilesetName: "tiles16"
    });

    // Local undo reverts only this client's paint; the peer's cell survives.
    store.undo();
    expect(tileLayer().tiles.has("5,5")).toBe(false);
    expect(tileLayer().tiles.get("7,7")).toEqual({
      gid: 9,
      tilesetName: "tiles16"
    });
    expect(store.canUndo()).toBe(false);
    peer.destroy();
  });

  test("remote entity deletion prunes the local selection", () => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));

    store.selectEntity("slime-1");
    expect(store.getState().selectedEntityIds).toEqual(["slime-1"]);

    const knownByStore = Y.encodeStateVector(store.getDoc());
    const peerEntities = (
      peer.getMap("layers").get("e1") as Y.Map<unknown>
    ).get("entities") as Y.Map<unknown>;
    peerEntities.delete("slime-1");
    Y.applyUpdate(
      store.getDoc(),
      Y.encodeStateAsUpdate(peer, knownByStore),
      REMOTE_ORIGIN
    );

    expect(store.getState().selectedEntityIds).toEqual([]);
    peer.destroy();
  });

  test("remote tile erasure prunes the local tile selection", () => {
    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));

    store.pushUndo();
    store.paintTile("t1", 1, 0, { gid: 2, tilesetName: "tiles16" });
    store.selectTileKeys(["0,0", "1,0"]);

    const knownByStore = Y.encodeStateVector(store.getDoc());
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));
    const peerTiles = (peer.getMap("layers").get("t1") as Y.Map<unknown>).get(
      "tiles"
    ) as Y.Map<TilePlacement>;
    peerTiles.delete("0,0");
    Y.applyUpdate(
      store.getDoc(),
      Y.encodeStateAsUpdate(peer, knownByStore),
      REMOTE_ORIGIN
    );

    expect(store.getState().selectedTileKeys).toEqual(["1,0"]);
    peer.destroy();
  });

  test("a remote reload of the same level clears undo but keeps the slot", () => {
    store.setSavedMapId("slot-1");
    store.pushUndo();
    store.paintTile("t1", 3, 3, { gid: 5, tilesetName: "tiles16" });
    expect(store.canUndo()).toBe(true);

    store.getDoc().transact(() => {
      getDocMeta(store.getDoc()).set("loadStamp", "peer-reload");
    }, REMOTE_ORIGIN);

    expect(store.canUndo()).toBe(false);
    expect(store.getState().savedMapId).toBe("slot-1");
  });

  test("cancel after a peer wiped the gesture leaves prior gestures intact", () => {
    store.pushUndo();
    store.paintTile("t1", 1, 1, { gid: 2, tilesetName: "tiles16" });

    store.pushUndo();
    store.addEntity({ type: "Bat", tileX: 5, tileY: 5, id: "bat-cancel" });

    const peer = new Y.Doc();
    Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));
    const knownByStore = Y.encodeStateVector(store.getDoc());
    const peerEntities = (
      peer.getMap("layers").get("e1") as Y.Map<unknown>
    ).get("entities") as Y.Map<unknown>;
    peerEntities.delete("bat-cancel");
    Y.applyUpdate(
      store.getDoc(),
      Y.encodeStateAsUpdate(peer, knownByStore),
      REMOTE_ORIGIN
    );

    // The gesture's stack item is now a no-op; cancel must not fall through
    // into the paint gesture below it.
    store.cancelToLastUndoPoint();
    expect(tileLayer().tiles.get("1,1")).toEqual({
      gid: 2,
      tilesetName: "tiles16"
    });
    expect(store.canUndo()).toBe(true);
    store.undo();
    expect(tileLayer().tiles.has("1,1")).toBe(false);
    peer.destroy();
  });

  test("cancel after a mid-gesture undo leaves the previous gesture intact", () => {
    store.pushUndo();
    store.paintTile("t1", 1, 1, { gid: 2, tilesetName: "tiles16" });

    store.pushUndo();
    store.addEntity({ type: "Bat", tileX: 5, tileY: 5, id: "bat-undone" });
    store.undo();

    store.cancelToLastUndoPoint();
    expect(tileLayer().tiles.get("1,1")).toEqual({
      gid: 2,
      tilesetName: "tiles16"
    });
  });

  test("clearAll with a name applies it without re-dirtying the editor", () => {
    store.setLevelName("Something Else");
    store.clearAll("Untitled");
    expect(store.getState().levelName).toBe("Untitled");
    expect(store.isDirty()).toBe(false);
  });

  test("setLevelName skips same-value writes so a save stays clean", () => {
    store.setLevelName("Kept");
    store.markSaved();
    store.setLevelName("Kept");
    expect(store.isDirty()).toBe(false);
    store.setLevelName("Changed");
    expect(store.isDirty()).toBe(true);
  });

  test("session-registered tilesets survive a subsequent load", () => {
    store.addExternalTilesets({ "custom-set": allTilesets["tiles16"] });
    expect(store.getState().externalTilesets?.["custom-set"]).toBeDefined();
    store.loadState({ layers: freshLayers(), levelName: "Next" });
    expect(store.getState().externalTilesets?.["custom-set"]).toBeDefined();
  });

  describe("object id and entityRef repair", () => {
    const flushRepairs = () => new Promise((resolve) => setTimeout(resolve, 0));

    function soloEntityLayer() {
      const layer = store.getState().layers.find((l) => l.id === "e1");
      if (layer?.kind !== "entity") throw new Error("entity layer missing");
      return layer;
    }

    test("remints a Tiled object id duplicated by concurrent peers", async () => {
      store.loadState({
        layers: [
          {
            kind: "entity",
            id: "e1",
            name: "Entities",
            visible: true,
            entities: [
              {
                type: "Slime",
                tileX: 2,
                tileY: 2,
                id: "mine",
                tiledObjectId: 4
              }
            ]
          }
        ],
        levelName: "Test",
        nextObjectId: 5
      });
      await flushRepairs();

      // A peer that had not yet seen our placement allocated the same id.
      const peer = new Y.Doc();
      Y.applyUpdate(peer, Y.encodeStateAsUpdate(store.getDoc()));
      const knownByStore = Y.encodeStateVector(store.getDoc());
      const peerLayer = peer.getMap("layers").get("e1") as Y.Map<unknown>;
      (peerLayer.get("entities") as Y.Map<unknown>).set("theirs", {
        type: "Bat",
        tileX: 6,
        tileY: 2,
        id: "theirs",
        tiledObjectId: 4
      });
      (peerLayer.get("entityOrder") as Y.Array<string>).push(["theirs"]);
      Y.applyUpdate(
        store.getDoc(),
        Y.encodeStateAsUpdate(peer, knownByStore),
        REMOTE_ORIGIN
      );
      await flushRepairs();

      const layer = soloEntityLayer();
      expect(layer.entities.find((e) => e.id === "mine")?.tiledObjectId).toBe(
        4
      );
      expect(layer.entities.find((e) => e.id === "theirs")?.tiledObjectId).toBe(
        5
      );
      expect(getDocMeta(store.getDoc()).get("nextObjectId")).toBe(6);
    });

    test("rewrites a legacy numeric entityRef to the target's placement id", async () => {
      store.loadState({
        layers: [
          {
            kind: "entity",
            id: "e1",
            name: "Entities",
            visible: true,
            entities: [
              {
                type: "Slime",
                tileX: 2,
                tileY: 2,
                id: "the-target",
                tiledObjectId: 4
              },
              {
                type: "IOLinkNode",
                tileX: 5,
                tileY: 2,
                id: "the-link",
                tiledObjectId: 6,
                properties: { target: 4 }
              }
            ]
          }
        ],
        levelName: "Test",
        nextObjectId: 7
      });
      await flushRepairs();

      const link = soloEntityLayer().entities.find((e) => e.id === "the-link");
      expect(link?.properties?.target).toBe("the-target");
    });

    test("backfills object ids for placements that never got one", async () => {
      store.loadState({
        layers: [
          {
            kind: "entity",
            id: "e1",
            name: "Entities",
            visible: true,
            entities: [
              { type: "Slime", tileX: 2, tileY: 2, id: "legacy-a" },
              { type: "Bat", tileX: 4, tileY: 2, id: "legacy-b" }
            ]
          }
        ],
        levelName: "Test",
        nextObjectId: 9
      });
      await flushRepairs();

      const layer = soloEntityLayer();
      expect(
        layer.entities.find((e) => e.id === "legacy-a")?.tiledObjectId
      ).toBe(9);
      expect(
        layer.entities.find((e) => e.id === "legacy-b")?.tiledObjectId
      ).toBe(10);
      expect(getDocMeta(store.getDoc()).get("nextObjectId")).toBe(11);
    });
  });
});
