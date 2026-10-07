import { StoredEditorMap } from "src/api/editorMap";
import * as TiledFormat from "src/engine/level/tiled/tiledJson";

import { RoomSaveContext, decideRoomSave } from "./roomSave";

function makeMap(
  id: string,
  overrides: Partial<StoredEditorMap> = {}
): StoredEditorMap {
  return {
    id,
    name: id,
    mapJson: {} as TiledFormat.ITiledLevelJSON,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

function makeContext(
  overrides: Partial<RoomSaveContext> = {}
): RoomSaveContext {
  return {
    levelUuid: undefined,
    levelName: "My Level",
    savedMapId: undefined,
    saveDecisionMade: false,
    seededSavedMapId: null,
    savedMaps: [],
    ...overrides
  };
}

describe("decideRoomSave", () => {
  test("no level uuid saves to a new slot named after the level", () => {
    const decision = decideRoomSave(makeContext());
    expect(decision).toEqual({ action: "saveAsNew", name: "My Level" });
  });

  test("a blank level name falls back to Untitled", () => {
    const decision = decideRoomSave(makeContext({ levelName: "" }));
    expect(decision).toEqual({ action: "saveAsNew", name: "Untitled" });
  });

  test("a uuid with no matching slot saves to a new slot", () => {
    const decision = decideRoomSave(
      makeContext({
        levelUuid: "uuid-1",
        savedMaps: [makeMap("editor-a", { levelUuid: "uuid-other" })]
      })
    );
    expect(decision).toEqual({ action: "saveAsNew", name: "My Level" });
  });

  test("a matching slot that is not the seed asks before overwriting", () => {
    const match = makeMap("editor-a", { levelUuid: "uuid-1" });
    const decision = decideRoomSave(
      makeContext({ levelUuid: "uuid-1", savedMaps: [match] })
    );
    expect(decision).toEqual({ action: "askOverwrite", map: match });
  });

  test("the slot that seeded the room overwrites without asking", () => {
    const seed = makeMap("editor-a", { levelUuid: "uuid-1" });
    const decision = decideRoomSave(
      makeContext({
        levelUuid: "uuid-1",
        seededSavedMapId: "editor-a",
        savedMaps: [seed]
      })
    );
    expect(decision).toEqual({ action: "overwrite", map: seed });
  });

  test("several matching slots resolve to the most recently saved one", () => {
    const older = makeMap("editor-a", { levelUuid: "uuid-1", updatedAt: 100 });
    const newer = makeMap("editor-b", { levelUuid: "uuid-1", updatedAt: 200 });
    const decision = decideRoomSave(
      makeContext({ levelUuid: "uuid-1", savedMaps: [older, newer] })
    );
    expect(decision).toEqual({ action: "askOverwrite", map: newer });
  });

  test("an answered prompt pins later saves to the chosen slot", () => {
    const chosen = makeMap("editor-a", { levelUuid: "uuid-1", updatedAt: 100 });
    const other = makeMap("editor-b", { levelUuid: "uuid-1", updatedAt: 200 });
    const decision = decideRoomSave(
      makeContext({
        levelUuid: "uuid-1",
        savedMapId: "editor-a",
        saveDecisionMade: true,
        savedMaps: [chosen, other]
      })
    );
    expect(decision).toEqual({ action: "overwrite", map: chosen });
  });

  test("a deleted chosen slot falls back to uuid matching", () => {
    const other = makeMap("editor-b", { levelUuid: "uuid-1" });
    const decision = decideRoomSave(
      makeContext({
        levelUuid: "uuid-1",
        savedMapId: "editor-gone",
        saveDecisionMade: true,
        savedMaps: [other]
      })
    );
    expect(decision).toEqual({ action: "askOverwrite", map: other });
  });

  test("a newer copy sharing the uuid outranks the seed slot", () => {
    const seed = makeMap("editor-a", { levelUuid: "uuid-1", updatedAt: 100 });
    const copy = makeMap("editor-b", { levelUuid: "uuid-1", updatedAt: 200 });
    const decision = decideRoomSave(
      makeContext({
        levelUuid: "uuid-1",
        seededSavedMapId: "editor-a",
        savedMaps: [seed, copy]
      })
    );
    expect(decision).toEqual({ action: "askOverwrite", map: copy });
  });
});
