import { BrushRegionRef } from "../brushStamps";
import { EditorTool, TileStamp } from "../levelEditorState";

export type CollabIdentity = {
  name: string;
  /** One of COLLAB_COLORS (joiners are bumped to a free swatch on collision). */
  color: string;
  /** Spell icon key from spellIconDefs, tinted with the color. */
  iconKey: string;
};

/** High-contrast, mutually distinguishable member colors. */
export const COLLAB_COLORS = [
  "#e5484d", // red
  "#f76b15", // orange
  "#ffc53d", // yellow
  "#46a758", // green
  "#00b3c2", // teal
  "#3e8ef7", // blue
  "#8e4ec6", // purple
  "#e93d82" // pink
] as const;

export const MAX_IDENTITY_NAME_LENGTH = 16;

/** Pick the requested color, or the nearest free swatch when it's taken. */
export function pickFreeColor(requested: string, taken: string[]): string {
  const takenSet = new Set(taken);
  if (!takenSet.has(requested)) return requested;
  const start = Math.max(
    COLLAB_COLORS.findIndex((c) => c === requested),
    0
  );
  for (let offset = 1; offset < COLLAB_COLORS.length; offset++) {
    const candidate = COLLAB_COLORS[(start + offset) % COLLAB_COLORS.length];
    if (!takenSet.has(candidate)) return candidate;
  }
  return requested;
}

export const ROOM_CODE_LENGTH = 8;
// No 0/O/1/I/L lookalikes, so codes are easy to read aloud.
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRoomCode(): string {
  const chars: string[] = [];
  // Rejection sampling keeps the distribution uniform across the alphabet.
  const limit = 256 - (256 % ROOM_CODE_ALPHABET.length);
  while (chars.length < ROOM_CODE_LENGTH) {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < limit && chars.length < ROOM_CODE_LENGTH) {
        chars.push(ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRoomCode(code: string): boolean {
  return new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(
    code
  );
}

/** The brush exactly as it paints, plus its centered bounds. Palette brushes
 *  travel as a region reference peers expand locally, so their size costs
 *  nothing on the wire; captured brushes carry raw cells up to a cap, beyond
 *  which only the bounds travel and peers see an outline. */
export type PresenceBrush = {
  minDx: number;
  minDy: number;
  w: number;
  h: number;
  region?: BrushRegionRef;
  cells?: TileStamp[];
};

/** Compact tool intent; peers reconstruct previews locally from this rather
 *  than receiving raw cell lists. Coordinates are tile units (Tiled, Y-down);
 *  fractions allowed. */
export type PresenceGhost =
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number }
  | {
      kind: "marquee";
      x: number;
      y: number;
      w: number;
      h: number;
      tool: "paint" | "erase" | "select";
    }
  | { kind: "polyline"; points: { x: number; y: number }[] }
  | { kind: "entityGhost"; tileX: number; tileY: number; entityType: string }
  | { kind: "tileDrag"; dx: number; dy: number; keys: string[] };

export type PresenceState = {
  /** Fractional tile coordinates, or null when the pointer left the canvas. */
  cursor: { x: number; y: number } | null;
  tool: EditorTool;
  activeLayerId: string | null;
  /** The active brush, for hover, line, and fill ghosts (paint/fill). */
  brush: PresenceBrush | null;
  ghost: PresenceGhost | null;
  selection: { tileKeys: string[]; entityIds: string[] } | null;
};

/** Awareness (never-in-doc) state each member broadcasts. */
export type CollabAwarenessState = {
  identity: CollabIdentity;
  buildId: string;
  /** True while the member has no editor tab open (doc still syncs). */
  away: boolean;
  /** Session join time; seniority for color-collision resolution. */
  joinedAt?: number;
  presence?: PresenceState;
};

export type CollabMember = {
  clientId: number;
  isSelf: boolean;
  /** No awareness activity for a while (cursor still, no edits). */
  idle: boolean;
  state: CollabAwarenessState;
};
