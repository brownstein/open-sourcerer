import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grow,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Paper,
  Popper,
  Slider,
  Stack,
  TextField,
  ToggleButton,
  Tooltip,
  Typography
} from "@mui/material";
import { IJsonRowNode, IJsonTabSetNode } from "flexlayout-react";
import {
  Brush,
  Clapperboard,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  LucideIcon,
  Magnet,
  MousePointer2,
  PackagePlus,
  PaintBucket,
  Play,
  Redo2,
  RotateCcw,
  RotateCw,
  Spline,
  Undo2
} from "lucide-react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import shortid from "shortid";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { Icon } from "src/components/ui/icons/Icon";
import { ColorPickerField } from "src/components/util/ColorPickerField/ColorPickerField";
import { GameController } from "src/engine/controller/GameController";
import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import { allTilesets } from "src/levels/tilesets/allTilesets";
import { setEditorTestLevelId } from "src/redux/dev/slice";
import { gotoLevel } from "src/redux/gameState/slice";
import { useAppDispatch, useAppStore } from "src/redux/hooks";
import { pushModal } from "src/redux/shared/actions";
import { AppDispatch, AppStore } from "src/redux/store";
import { updateLayout } from "src/redux/ui/slice";
import { AnyJsonNode, isRowNode, isTabSetNode } from "src/redux/ui/util";

import { levelEditorStore } from "./LevelEditorStore";
import { RoomControls } from "./collab/RoomControls";
import { decideRoomSave } from "./collab/roomSave";
import { levelEditorSession } from "./collab/session";
import { releaseEditorKeyboard } from "./editorKeyboard";
import {
  openLevelInEditorAsNew,
  openSavedMapInEditor,
  recenterOnContent,
  saveEditorStateAsNewSlot,
  saveEditorStateOverExisting
} from "./editorMapActions";
import { parseMapFile } from "./editorMapIO";
import {
  getEditorMap,
  listEditorMaps,
  mergeAuthorableOverLink
} from "./editorMaps";
import { EditorTool } from "./levelEditorState";
import { buildTMJFromState } from "./tmjBuilder";
import { loadTmjJsonIntoEditor } from "./tmjLoader";
import { useLevelEditorSelector } from "./useLevelEditorStore";

type ToolDef = { tool: EditorTool; icon: LucideIcon; title: string };

const TOOLS: ToolDef[] = [
  { tool: "paint", icon: Brush, title: "Paint tiles (B)" },
  { tool: "erase", icon: Eraser, title: "Erase tiles (E)" },
  { tool: "fill", icon: PaintBucket, title: "Fill enclosed area (F)" },
  { tool: "entity", icon: PackagePlus, title: "Place entity (R)" },
  { tool: "polyline", icon: Spline, title: "Draw polyline/polygon (P)" },
  { tool: "select", icon: MousePointer2, title: "Select (S)" }
];

function findToolDef(tool: EditorTool): ToolDef {
  return TOOLS.find((t) => t.tool === tool)!;
}

/** On/off icon toggles get a tinted background when active, so state is
 *  legible beyond the icon color alone. */
const toggleIconButtonSx = (active: boolean) => ({
  borderRadius: 1,
  transition: "background-color 150ms, color 150ms",
  bgcolor: active ? "action.selected" : undefined
});

function ToolButton({
  def,
  selected,
  groupMark
}: {
  def: ToolDef;
  selected: boolean;
  groupMark?: boolean;
}) {
  const Icon = def.icon;
  return (
    <ToggleButton
      value={def.tool}
      selected={selected}
      color="primary"
      size="small"
      onChange={() => levelEditorStore.selectTool(def.tool)}
      data-testid={`tool-${def.tool}`}
      sx={(theme) => ({
        p: 0.9,
        minWidth: 36,
        position: "relative",
        border: 0,
        borderRadius: 1,
        transition: theme.transitions.create(["background-color", "color"], {
          duration: theme.transitions.duration.shortest
        }),
        // Filled selected state so the active tool reads at a glance.
        "&.Mui-selected": {
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:hover": { bgcolor: "primary.dark" }
        }
      })}
    >
      <Icon size={18} />
      {groupMark && <span className="tool-group-mark" />}
    </ToggleButton>
  );
}

/** Grouped tool button: a corner mark flags the group, hovering reveals the
 *  other members, and the face is whichever member was used last. */
function ToolGroupButton({
  tools,
  face,
  selectedTool
}: {
  tools: EditorTool[];
  face: EditorTool;
  selectedTool: EditorTool;
}) {
  const [hoverAnchor, setHoverAnchor] = useState<HTMLElement | null>(null);

  return (
    <Box
      sx={{ display: "inline-flex" }}
      onMouseEnter={(e) => setHoverAnchor(e.currentTarget)}
      onMouseLeave={() => setHoverAnchor(null)}
    >
      <ToolButton
        def={findToolDef(face)}
        selected={tools.includes(selectedTool)}
        groupMark
      />
      <Popper
        open={Boolean(hoverAnchor)}
        anchorEl={hoverAnchor}
        placement="bottom-start"
        disablePortal
        transition
        sx={{ zIndex: (theme) => theme.zIndex.tooltip }}
      >
        {({ TransitionProps }) => (
          // Quick grow on open only — close stays instant so the menu never
          // lingers after the cursor leaves the button+menu hover area.
          <Grow
            {...TransitionProps}
            timeout={{ enter: 120, exit: 0 }}
            style={{ transformOrigin: "top left" }}
          >
            <Paper elevation={6} sx={{ borderRadius: 1.5, overflow: "hidden" }}>
              <MenuList dense>
                {tools.map((tool) => {
                  const def = findToolDef(tool);
                  const Icon = def.icon;
                  return (
                    <MenuItem
                      key={tool}
                      selected={tool === selectedTool}
                      data-testid={`tool-option-${tool}`}
                      onClick={() => {
                        setHoverAnchor(null);
                        levelEditorStore.selectTool(tool);
                      }}
                    >
                      <ListItemIcon>
                        <Icon size={16} />
                      </ListItemIcon>
                      <ListItemText
                        slotProps={{ primary: { sx: { fontSize: 13 } } }}
                      >
                        {def.title}
                      </ListItemText>
                    </MenuItem>
                  );
                })}
              </MenuList>
            </Paper>
          </Grow>
        )}
      </Popper>
    </Box>
  );
}

/** Zoom slider + readout. Isolated so per-frame camera changes while
 *  panning/zooming don't re-render the rest of the toolbar. */
function ZoomControl() {
  const zoom = useLevelEditorSelector(
    (s) => s.getState().camera.zoom,
    ["cameraChanged"]
  );
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1 }}>
      <Slider
        size="small"
        min={Math.log2(0.25)}
        max={Math.log2(16)}
        step={0.05}
        value={Math.log2(zoom)}
        onChange={(_, value) =>
          levelEditorStore.setCamera({
            zoom: Math.pow(2, value as number)
          })
        }
        sx={{ width: 120 }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 34, textAlign: "center" }}
      >
        {Math.round(zoom * 100)}%
      </Typography>
    </Stack>
  );
}

/**
 * Select the viewport tab in whatever tabset it lives in (and make that
 * tabset the active one) so the game is visible when a level starts playing.
 * Returns null when the layout already shows the viewport.
 */
function buildLayoutWithViewportFocused(
  layout: IJsonRowNode
): IJsonRowNode | null {
  let changed = false;
  const transform = (node: AnyJsonNode): AnyJsonNode => {
    if (isTabSetNode(node)) {
      const viewportIndex =
        node.children?.findIndex((t) => t.id === "viewport") ?? -1;
      if (viewportIndex >= 0) {
        if ((node.selected ?? 0) === viewportIndex && node.active) return node;
        changed = true;
        return { ...node, selected: viewportIndex, active: true };
      }
      // Only one tabset may be active.
      if (node.active) {
        changed = true;
        return { ...node, active: false };
      }
      return node;
    }
    if (isRowNode(node)) {
      const newChildren = node.children?.map((child) => transform(child)) ?? [];
      if (newChildren.every((c, i) => c === node.children?.[i])) return node;
      return {
        ...node,
        children: newChildren as (IJsonRowNode | IJsonTabSetNode)[]
      };
    }
    return node;
  };

  const result = transform(layout);
  return changed && isRowNode(result) ? result : null;
}

/**
 * Process a dropped/opened file (.tmj, .json, or .zip) into the editor.
 * A zip's link sidecar (if any) is restored as the source level. Returns the
 * list of missing tileset names.
 */
export async function processLevelFile(file: File): Promise<string[]> {
  const parsed = await parseMapFile(file);
  const loaded = await loadTmjJsonIntoEditor(
    parsed.mapJson,
    parsed.name,
    parsed.embeddedTilesets
  );

  // External tilesets (not in allTilesets) must travel with the editor session.
  const externalOnly: Record<string, TilesetDefinitionAPI> = {};
  for (const [name, def] of Object.entries(parsed.embeddedTilesets)) {
    if (!allTilesets[name]) externalOnly[name] = def;
  }

  levelEditorStore.loadState({
    layers: loaded.layers,
    levelName: loaded.levelName,
    backgroundColor: loaded.backgroundColor,
    externalTilesets:
      Object.keys(externalOnly).length > 0 ? externalOnly : undefined,
    sourceLevelId: parsed.sourceLevelId,
    mapProperties: loaded.mapProperties,
    nextObjectId: loaded.nextObjectId,
    unknownTilesetSources: loaded.unknownTilesetSources
  });
  recenterOnContent(loaded.layers);
  return loaded.missingTilesets;
}

/** Register the current editor state as a hot-loaded level and play it.
 *  Also invoked by the canvas Ctrl+E handler. */
export function playEditorLevel(
  store: AppStore,
  dispatch: AppDispatch,
  controller: GameController | null
): void {
  const state = levelEditorStore.getState();
  const { tiledJson, usedTilesets } = buildTMJFromState(state);
  // A saved map plays under its persistent id so a refresh restores it via
  // replay; an unsaved map gets a transient id (gone on reload until saved).
  const levelId = state.savedMapId ?? `editor-${state.levelName}-${shortid()}`;

  // Evict the previous transient play level so repeated Plays don't pile up in
  // the registry. Saved maps (tracked in localStorage) are never evicted here.
  const prevPlayId = store.getState().dev.editorTestLevelId;
  if (prevPlayId && prevPlayId !== levelId && !getEditorMap(prevPlayId)) {
    levelLoaderContext.hotLoaders.levels.removeResource(prevPlayId);
  }

  const sourceLevelDef = state.sourceLevelId
    ? levelLoaderContext.hotLoaders.levels.getResource(state.sourceLevelId)
    : undefined;

  // Image layers the designer added override the link's images by name; the
  // rest of the non-authorable definition (setup/teardown, music, demo items,
  // …) flows from the link via mergeAuthorableOverLink.
  const images: Record<string, string> = {};
  for (const layer of state.layers) {
    if (layer.kind === "image" && layer.imageName && layer.imageUrl) {
      images[layer.imageName] = layer.imageUrl;
    }
  }

  levelLoaderContext.hotLoaders.levels.updateResource(
    levelId,
    mergeAuthorableOverLink(sourceLevelDef ?? {}, {
      id: levelId,
      localizedName: state.levelName,
      mapJson: tiledJson,
      tileSets: usedTilesets,
      images
    })
  );

  // Reveal the game viewport tab wherever it lives. Must dispatch before
  // gotoLevel — updateLayout no-ops while ui.preserveLayout is set.
  const focusedLayout = buildLayoutWithViewportFocused(
    store.getState().ui.layout
  );
  if (focusedLayout) {
    dispatch(updateLayout(focusedLayout));
  }

  dispatch(setEditorTestLevelId(levelId));

  // If this level is already the one in play its id won't change, so force a
  // reload to pick up the edits; otherwise switch to it.
  if (levelId === store.getState().gameState.levelId) {
    controller?.restartLevel();
  } else {
    dispatch(gotoLevel({ levelId }));
  }

  // The user is about to play — hand keyboard shortcuts to the game.
  releaseEditorKeyboard();
}

export function LevelEditorToolbar() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const controller = useContext(GameControllerContext);
  const [saveState, setSaveState] = useState<"idle" | "success" | "error">(
    "idle"
  );
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const saveStateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to the slices the toolbar actually renders against.
  const editor = useLevelEditorSelector(
    (s) => {
      const st = s.getState();
      return {
        selectedTool: st.selectedTool,
        canUndo: s.canUndo(),
        canRedo: s.canRedo(),
        gridVisible: st.gridVisible,
        snapEnabled: st.snapEnabled,
        liveMode: st.liveMode,
        levelName: st.levelName,
        backgroundColor: st.backgroundColor
      };
    },
    ["toolChanged", "undoChanged", "metadataChanged", "liveModeChanged"],
    (a, b) =>
      a.selectedTool === b.selectedTool &&
      a.canUndo === b.canUndo &&
      a.canRedo === b.canRedo &&
      a.gridVisible === b.gridVisible &&
      a.snapEnabled === b.snapEnabled &&
      a.liveMode === b.liveMode &&
      a.levelName === b.levelName &&
      a.backgroundColor === b.backgroundColor
  );

  const toolFaces = useLevelEditorSelector(
    (s) => {
      const ui = s.getUI();
      return { tile: ui.lastTileTool, shape: ui.lastShapeTool };
    },
    ["uiChanged"],
    (a, b) => a.tile === b.tile && a.shape === b.shape
  );

  const onPlay = useCallback(() => {
    playEditorLevel(store, dispatch, controller);
  }, [store, dispatch, controller]);

  const handleOpenManager = useCallback(() => {
    dispatch(pushModal({ modalName: "levelManager", modalArg: {} }));
  }, [dispatch]);

  // Flash the Save button green on a persisted save, red if the durable write
  // failed (e.g. storage full); never flash success on failure.
  const flashSaveResult = useCallback((ok: boolean) => {
    setSaveState(ok ? "success" : "error");
    if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
    saveStateTimer.current = setTimeout(
      () => setSaveState("idle"),
      ok ? 1200 : 2500
    );
  }, []);

  useEffect(
    () => () => {
      if (saveStateTimer.current) clearTimeout(saveStateTimer.current);
    },
    []
  );

  // Saves can also be performed by modals (the in-room overwrite prompt, the
  // room modal's save-and-join), so the flash listens to the store instead of
  // wrapping each call site.
  useEffect(() => {
    const onSaveCompleted = ({ ok }: { ok: boolean }) => flashSaveResult(ok);
    levelEditorStore.events.on("saveCompleted", onSaveCompleted);
    return () => {
      levelEditorStore.events.off("saveCompleted", onSaveCompleted);
    };
  }, [flashSaveResult]);

  const handleRoomSave = useCallback(() => {
    const state = levelEditorStore.getState();
    const decision = decideRoomSave({
      levelUuid: state.levelUuid,
      levelName: state.levelName,
      savedMapId: state.savedMapId,
      saveDecisionMade: levelEditorSession.isSaveDecisionMade(),
      seededSavedMapId: levelEditorSession.getSeededSavedMapId(),
      savedMaps: listEditorMaps()
    });
    if (decision.action === "overwrite") {
      saveEditorStateOverExisting(decision.map);
      levelEditorSession.markSaveDecisionMade();
    } else if (decision.action === "saveAsNew") {
      saveEditorStateAsNewSlot(decision.name);
      levelEditorSession.markSaveDecisionMade();
    } else {
      dispatch(
        pushModal({
          modalName: "collabSaveConflict",
          modalArg: { mapId: decision.map.id }
        })
      );
    }
  }, [dispatch]);

  // Overwrite the open map in place; a never-saved map falls back to Save As.
  const handleSave = useCallback(() => {
    if (levelEditorSession.isInRoom()) {
      handleRoomSave();
      return;
    }
    const state = levelEditorStore.getState();
    const existing = state.savedMapId ? getEditorMap(state.savedMapId) : null;
    if (existing) {
      saveEditorStateOverExisting(existing);
      return;
    }
    setSaveAsName(state.levelName || "Untitled");
    setSaveAsOpen(true);
  }, [handleRoomSave]);

  const handleSaveAsConfirm = useCallback(() => {
    const name = saveAsName.trim() || "Untitled";
    // Name first, so the saved record carries it and the save leaves the
    // editor clean instead of immediately re-dirtied by the rename.
    levelEditorStore.setLevelName(name);
    saveEditorStateAsNewSlot(name);
    setSaveAsOpen(false);
  }, [saveAsName]);

  // Ctrl+S (canvas) and the Save button share this path. A ref holds the
  // latest handler so the subscription doesn't churn each render.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  useEffect(() => {
    const onSaveRequested = () => handleSaveRef.current();
    levelEditorStore.events.on("saveRequested", onSaveRequested);
    return () => levelEditorStore.events.off("saveRequested", onSaveRequested);
  }, []);

  // On the first editor mount per page-load, pick up the level in play (or
  // ?level=): resume it if it's a saved map so Save overwrites it, otherwise
  // start a new map based on it. Gated to one attempt so remounting the tab
  // doesn't clobber in-progress edits.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get("level") ?? store.getState().gameState.levelId;
    if (!targetId) return;
    if (!levelEditorStore.consumeInitialUrlLoad()) return;
    const savedMap = getEditorMap(targetId);
    if (savedMap) {
      openSavedMapInEditor(savedMap);
    } else {
      openLevelInEditorAsNew(targetId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Paper
      square
      elevation={2}
      data-testid="level-editor-toolbar"
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 0.75,
        px: 1.5,
        py: 0.75,
        borderBottom: 1,
        borderColor: "divider",
        flexShrink: 0,
        zIndex: 2
      }}
    >
      <Stack
        direction="row"
        spacing={0.25}
        sx={{ bgcolor: "action.hover", borderRadius: 1.5, p: 0.25 }}
      >
        <ToolGroupButton
          tools={["paint", "erase", "fill"]}
          face={toolFaces.tile}
          selectedTool={editor.selectedTool}
        />
        <ToolGroupButton
          tools={["entity", "polyline"]}
          face={toolFaces.shape}
          selectedTool={editor.selectedTool}
        />
        <Tooltip title={findToolDef("select").title}>
          <span>
            <ToolButton
              def={findToolDef("select")}
              selected={editor.selectedTool === "select"}
            />
          </span>
        </Tooltip>
      </Stack>

      {(editor.selectedTool === "paint" || editor.selectedTool === "fill") && (
        <>
          <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />
          <Stack direction="row" data-testid="brush-orientation-tools">
            <Tooltip title="Flip brush horizontally (X)">
              <IconButton
                size="small"
                onClick={() => levelEditorStore.flipBrushH()}
              >
                <FlipHorizontal2 size={17} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Flip brush vertically (Y)">
              <IconButton
                size="small"
                onClick={() => levelEditorStore.flipBrushV()}
              >
                <FlipVertical2 size={17} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rotate brush clockwise (Z)">
              <IconButton
                size="small"
                onClick={() => levelEditorStore.rotateBrushCW()}
              >
                <RotateCw size={17} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rotate brush counter-clockwise (Shift+Z)">
              <IconButton
                size="small"
                onClick={() => levelEditorStore.rotateBrushCCW()}
              >
                <RotateCcw size={17} />
              </IconButton>
            </Tooltip>
          </Stack>
        </>
      )}

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <Stack direction="row">
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton
              size="small"
              disabled={!editor.canUndo}
              onClick={() => levelEditorStore.undo()}
            >
              <Undo2 size={17} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Shift+Z)">
          <span>
            <IconButton
              size="small"
              disabled={!editor.canRedo}
              onClick={() => levelEditorStore.redo()}
            >
              <Redo2 size={17} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip
          title={
            saveState === "error"
              ? "Save failed — local storage may be full"
              : "Save map (Ctrl+S)"
          }
        >
          <IconButton
            size="small"
            color={
              saveState === "success"
                ? "success"
                : saveState === "error"
                  ? "error"
                  : "default"
            }
            onClick={handleSave}
            data-testid="editor-save"
          >
            <Icon
              icon={
                saveState === "success"
                  ? "check"
                  : saveState === "error"
                    ? "exclamation"
                    : "save"
              }
              size="font"
            />
          </IconButton>
        </Tooltip>
      </Stack>

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <Stack direction="row">
        <Tooltip title="Toggle grid">
          <IconButton
            size="small"
            color={editor.gridVisible ? "primary" : "default"}
            sx={toggleIconButtonSx(editor.gridVisible)}
            onClick={() => levelEditorStore.toggleGrid()}
          >
            <Grid3x3 size={17} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Toggle snapping (half-tile grid)">
          <IconButton
            size="small"
            color={editor.snapEnabled ? "primary" : "default"}
            sx={toggleIconButtonSx(editor.snapEnabled)}
            onClick={() => levelEditorStore.toggleSnap()}
          >
            <Magnet size={17} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Toggle live mode (animate entities)">
          <IconButton
            size="small"
            color={editor.liveMode ? "primary" : "default"}
            sx={toggleIconButtonSx(editor.liveMode)}
            onClick={() => levelEditorStore.toggleLiveMode()}
          >
            <Clapperboard size={17} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <ZoomControl />

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <TextField
        size="small"
        label="Level"
        value={editor.levelName}
        onChange={(e) => levelEditorStore.setLevelName(e.target.value)}
        sx={{ width: 150 }}
        slotProps={{ htmlInput: { sx: { py: 0.5, fontSize: 13 } } }}
      />

      <Divider orientation="vertical" flexItem sx={{ my: 0.5 }} />

      <ColorPickerField
        value={editor.backgroundColor}
        onChange={(hex) => levelEditorStore.setBackgroundColor(hex)}
        swatchLabel="Map background color"
        tooltip="Map background color"
      />

      <Box sx={{ flex: 1 }} />

      <Stack direction="row" spacing={0.5} alignItems="center">
        <RoomControls />
        <Tooltip title="Open the level manager">
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            sx={{ textTransform: "none" }}
            onClick={handleOpenManager}
            startIcon={<Icon icon="folderOpen" size="font" />}
            data-testid="editor-open-manager"
          >
            Open
          </Button>
        </Tooltip>
        <Tooltip title="Play level (Ctrl+E)">
          <Button
            variant="contained"
            color="success"
            size="small"
            sx={{ textTransform: "none", px: 1.75, fontWeight: 600 }}
            onClick={onPlay}
            startIcon={<Play size={14} />}
            data-testid="editor-play"
          >
            Play
          </Button>
        </Tooltip>
      </Stack>

      <Dialog open={saveAsOpen} onClose={() => setSaveAsOpen(false)}>
        <DialogTitle>Save map as</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Map name"
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveAsConfirm();
            }}
            sx={{ mt: 1, minWidth: 280 }}
          />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setSaveAsOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveAsConfirm}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
