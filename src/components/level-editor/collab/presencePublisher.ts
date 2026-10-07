import { levelEditorStore } from "../LevelEditorStore";
import {
  currentBrushRegionRef,
  currentBrushStamps,
  stampBounds
} from "../brushStamps";
import { LevelEditorState } from "../levelEditorState";
import { PresenceBrush, PresenceGhost, PresenceState } from "./collabTypes";
import { levelEditorSession } from "./session";

// Publishes this client's presence (cursor, tool intent, selection) over the
// awareness channel at a fixed cadence. The canvas feeds it exact cursor
// positions and an in-progress-gesture snapshot; everything else derives from
// the store. Large previews are never streamed; peers reconstruct them
// locally from the compact intent.

const PUBLISH_INTERVAL_MS = 55; // ~18Hz
const SELECTION_KEY_CAP = 500;
// Awareness resends the full presence state on every cursor tick, so captured
// brush cells multiply steady bandwidth; palette brushes cost nothing because
// they travel by region reference.
const CAPTURED_BRUSH_CELL_CAP = 400;

/** The brush as peers need it to preview the real tiles: a region reference
 *  for palette brushes, raw cells for captured brushes up to the cap, and
 *  always the centered bounds. */
function presenceBrush(state: LevelEditorState): PresenceBrush | null {
  if (state.selectedTool !== "paint" && state.selectedTool !== "fill") {
    return null;
  }
  const stamps = currentBrushStamps(state);
  if (!stamps || stamps.length === 0) return null;
  const brush: PresenceBrush = stampBounds(stamps);
  if (state.capturedBrush) {
    if (stamps.length <= CAPTURED_BRUSH_CELL_CAP) brush.cells = stamps;
  } else {
    const region = currentBrushRegionRef(state);
    if (region) brush.region = region;
  }
  return brush;
}

function brushInputsChanged(a: LevelEditorState, b: LevelEditorState): boolean {
  return (
    a.selectedTool !== b.selectedTool ||
    a.capturedBrush !== b.capturedBrush ||
    a.selectedTileId !== b.selectedTileId ||
    a.selectedTileRegion !== b.selectedTileRegion ||
    a.selectedTilesetName !== b.selectedTilesetName ||
    a.flipH !== b.flipH ||
    a.flipV !== b.flipV ||
    a.flipD !== b.flipD
  );
}

function presenceSelection(
  state: LevelEditorState
): PresenceState["selection"] {
  if (
    state.selectedTileKeys.length === 0 &&
    state.selectedEntityIds.length === 0
  ) {
    return null;
  }
  return {
    tileKeys: state.selectedTileKeys.slice(0, SELECTION_KEY_CAP),
    entityIds: state.selectedEntityIds.slice(0, SELECTION_KEY_CAP)
  };
}

class PresencePublisher {
  private cursor: { x: number; y: number } | null = null;
  private gestureSource: (() => PresenceGhost | null) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  // The derived brush and selection keep their identity while their inputs
  // do, so the idle tick (and any state churn that leaves presence identical,
  // like camera pans) costs a few compares instead of a rebuild-and-send.
  private derivedForState: LevelEditorState | null = null;
  private derivedBrush: PresenceBrush | null = null;
  private derivedSelection: PresenceState["selection"] = null;
  private lastSentCursor: { x: number; y: number } | null = null;
  private lastSentGhostJson = "";
  private lastSentBrush: PresenceBrush | null = null;
  private lastSentSelection: PresenceState["selection"] = null;
  private lastSentTool: string | null = null;
  private lastSentActiveLayerId: string | null = null;
  private neverSent = true;

  constructor() {
    levelEditorSession.events.on("sessionChanged", () => {
      if (levelEditorSession.isInRoom()) {
        this.start();
      } else {
        this.stop();
      }
    });
    // This module may load after the session is already live (the editor tab
    // can mount mid-session).
    if (levelEditorSession.isInRoom()) this.start();
  }

  /** The cursor is never cleared: peers keep showing the last known position
   *  (faded once idle) even after the mouse leaves the canvas or the tab. */
  setCursor(x: number, y: number): void {
    this.cursor = { x, y };
  }

  /** The canvas registers a snapshot of its in-progress gesture (line,
   *  marquee, polyline, entity ghost, tile drag). Returns an unregister fn. */
  registerGestureSource(source: () => PresenceGhost | null): () => void {
    this.gestureSource = source;
    return () => {
      if (this.gestureSource === source) this.gestureSource = null;
    };
  }

  private start(): void {
    if (this.interval) return;
    this.neverSent = true;
    this.interval = setInterval(() => this.tick(), PUBLISH_INTERVAL_MS);
  }

  private stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  private tick(): void {
    const state = levelEditorStore.getState();
    const prev = this.derivedForState;
    if (prev !== state) {
      if (!prev || brushInputsChanged(prev, state)) {
        this.derivedBrush = presenceBrush(state);
      }
      if (
        !prev ||
        prev.selectedTileKeys !== state.selectedTileKeys ||
        prev.selectedEntityIds !== state.selectedEntityIds
      ) {
        this.derivedSelection = presenceSelection(state);
      }
      this.derivedForState = state;
    }
    let ghost: PresenceGhost | null = null;
    try {
      ghost = this.gestureSource?.() ?? null;
    } catch {
      ghost = null;
    }
    const ghostJson = ghost ? JSON.stringify(ghost) : "";
    const cursorUnchanged =
      this.cursor === this.lastSentCursor ||
      (this.cursor !== null &&
        this.lastSentCursor !== null &&
        this.cursor.x === this.lastSentCursor.x &&
        this.cursor.y === this.lastSentCursor.y);
    const activeLayerId = state.activeLayerId || null;
    if (
      !this.neverSent &&
      cursorUnchanged &&
      ghostJson === this.lastSentGhostJson &&
      this.derivedBrush === this.lastSentBrush &&
      this.derivedSelection === this.lastSentSelection &&
      state.selectedTool === this.lastSentTool &&
      activeLayerId === this.lastSentActiveLayerId
    ) {
      return;
    }
    this.neverSent = false;
    this.lastSentCursor = this.cursor;
    this.lastSentGhostJson = ghostJson;
    this.lastSentBrush = this.derivedBrush;
    this.lastSentSelection = this.derivedSelection;
    this.lastSentTool = state.selectedTool;
    this.lastSentActiveLayerId = activeLayerId;
    levelEditorSession.setLocalField("presence", {
      cursor: this.cursor,
      tool: state.selectedTool,
      activeLayerId,
      brush: this.derivedBrush,
      ghost,
      selection: this.derivedSelection
    });
  }
}

export const presencePublisher = new PresencePublisher();
