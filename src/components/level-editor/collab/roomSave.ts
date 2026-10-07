import { StoredEditorMap } from "src/api/editorMap";

// Decides where an in-room save should land. Saves in a room match by the
// shared level uuid against the saver's own slots, prompting overwrite-vs-copy
// once per session; the creator's own seed save overwrites without asking.

export type RoomSaveDecision =
  | { action: "overwrite"; map: StoredEditorMap }
  | { action: "saveAsNew"; name: string }
  | { action: "askOverwrite"; map: StoredEditorMap };

export type RoomSaveContext = {
  levelUuid: string | undefined;
  levelName: string;
  savedMapId: string | undefined;
  /** The overwrite-vs-copy prompt was already answered this session. */
  saveDecisionMade: boolean;
  /** The slot whose save seeded the room (creator only). */
  seededSavedMapId: string | null;
  savedMaps: StoredEditorMap[];
};

export function decideRoomSave(context: RoomSaveContext): RoomSaveDecision {
  const { savedMaps } = context;

  if (context.saveDecisionMade && context.savedMapId) {
    const chosenSlot = savedMaps.find((map) => map.id === context.savedMapId);
    if (chosenSlot) return { action: "overwrite", map: chosenSlot };
  }

  const matches = context.levelUuid
    ? savedMaps.filter((map) => map.levelUuid === context.levelUuid)
    : [];
  // Several slots can share a uuid (in-room "save as a new copy"); the most
  // recently saved one is the copy the user is actually working from.
  const match = matches.length
    ? matches.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b))
    : null;

  if (!match) {
    return { action: "saveAsNew", name: context.levelName || "Untitled" };
  }
  if (match.id === context.seededSavedMapId) {
    return { action: "overwrite", map: match };
  }
  return { action: "askOverwrite", map: match };
}
