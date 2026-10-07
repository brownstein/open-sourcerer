import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tab,
  Tabs
} from "@mui/material";
import { Grid3x3, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { setEditorTestLevelId } from "src/redux/dev/slice";
import { useAppDispatch } from "src/redux/hooks";

import { EntityPalette } from "./EntityPalette";
import { LayerPanel } from "./LayerPanel";
import "./LevelEditor.less";
import { LevelEditorCanvas } from "./LevelEditorCanvas";
import { levelEditorStore } from "./LevelEditorStore";
import { LevelEditorToolbar, processLevelFile } from "./LevelEditorToolbar";
import { PropertiesPanel } from "./PropertiesPanel";
import { TilePalette } from "./TilePalette";
import { trackEditorKeyboardRoot } from "./editorKeyboard";
import {
  useLevelEditorSelector,
  useLevelEditorUIState
} from "./useLevelEditorStore";

const MIN_PANEL_WIDTH = 120;
const MIN_LAYER_HEIGHT = 60;

const sidebarTabSx = {
  minHeight: 38,
  py: 0.5,
  textTransform: "none",
  fontSize: 13,
  fontWeight: 600,
  gap: 0.75,
  transition: "background-color 150ms, color 150ms",
  "&:hover": { bgcolor: "action.hover" }
};

function useHorizontalResizeHandle(
  side: "left" | "right",
  width: number,
  setWidth: (w: number) => void
) {
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const onMouseMove = (me: MouseEvent) => {
        if (!isResizingRef.current) return;
        const dx = me.clientX - startXRef.current;
        const newWidth = Math.max(
          MIN_PANEL_WIDTH,
          startWidthRef.current + (side === "left" ? dx : -dx)
        );
        setWidth(newWidth);
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [width, side, setWidth]
  );

  return { onMouseDown, isResizing };
}

function useVerticalResizeHandle(
  height: number,
  setHeight: (h: number) => void
) {
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = height;

      const onMouseMove = (me: MouseEvent) => {
        if (!isResizingRef.current) return;
        const dy = me.clientY - startYRef.current;
        // Dragging up increases height (handle is above the panel)
        const newHeight = Math.max(
          MIN_LAYER_HEIGHT,
          startHeightRef.current - dy
        );
        setHeight(newHeight);
      };

      const onMouseUp = () => {
        isResizingRef.current = false;
        setIsResizing(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [height, setHeight]
  );

  return { onMouseDown, isResizing };
}

/** Find the nearest layer of a given kind to the current index. */
function findNearestLayerOfKind(
  layers: { id: string; kind: string }[],
  currentIdx: number,
  kind: string
): string | null {
  // Already on the right kind
  if (currentIdx >= 0 && layers[currentIdx]?.kind === kind)
    return layers[currentIdx].id;
  // Search outward from current position
  let best: string | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].kind === kind) {
      const dist = Math.abs(i - Math.max(0, currentIdx));
      if (dist < bestDist) {
        bestDist = dist;
        best = layers[i].id;
      }
    }
  }
  return best;
}

export function LevelEditorTab() {
  const dispatch = useAppDispatch();
  const ui = useLevelEditorUIState();
  const rootRef = useRef<HTMLDivElement>(null);
  // While mounted, the editor competes with the game for keyboard shortcuts.
  useEffect(() => {
    if (!rootRef.current) return;
    return trackEditorKeyboardRoot(rootRef.current);
  }, []);

  const selectedTool = useLevelEditorSelector(
    (s) => s.getState().selectedTool,
    ["toolChanged"]
  );

  // Sync sidebar tab with selected tool
  useEffect(() => {
    if (selectedTool === "entity" || selectedTool === "polyline") {
      levelEditorStore.setLeftTab("entities");
    } else if (
      selectedTool === "paint" ||
      selectedTool === "erase" ||
      selectedTool === "fill"
    ) {
      levelEditorStore.setLeftTab("tiles");
    }
  }, [selectedTool]);

  // Tab clicks also switch to the matching tool and re-target the nearest
  // layer of that kind.
  const focusLeftTab = useCallback((tab: "tiles" | "entities") => {
    levelEditorStore.setLeftTab(tab);
    levelEditorStore.selectTool(tab === "tiles" ? "paint" : "entity");
    const state = levelEditorStore.getState();
    const activeIdx = state.layers.findIndex(
      (l) => l.id === state.activeLayerId
    );
    const nearest = findNearestLayerOfKind(
      state.layers,
      activeIdx,
      tab === "tiles" ? "tile" : "entity"
    );
    if (nearest) levelEditorStore.setActiveLayer(nearest);
  }, []);

  const leftPanel = useHorizontalResizeHandle("left", ui.leftWidth, (w) =>
    levelEditorStore.setLeftWidth(w)
  );
  const rightPanel = useHorizontalResizeHandle("right", ui.rightWidth, (w) =>
    levelEditorStore.setRightWidth(w)
  );
  const layerPanel = useVerticalResizeHandle(ui.layerHeight, (h) =>
    levelEditorStore.setLayerHeight(h)
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Reflect editor open/close state in the URL so a refresh reopens the editor.
  // Also clears the editor test level flag on close.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("mode", "level-editor");
    window.history.replaceState(null, "", "?" + params.toString());
    return () => {
      dispatch(setEditorTestLevelId(null));
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "level-editor") {
        params.delete("mode");
        const qs = params.toString();
        window.history.replaceState(
          null,
          "",
          qs ? "?" + qs : window.location.pathname
        );
      }
    };
  }, [dispatch]);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Pair TSJ files with their referenced PNGs (by image basename) and
    // register them as external tilesets at runtime.
    const tsjFiles = files.filter((f) => f.name.toLowerCase().endsWith(".tsj"));
    const pngFiles = files.filter((f) => f.name.toLowerCase().endsWith(".png"));

    if (tsjFiles.length > 0) {
      const pngByName = new Map<string, File>();
      for (const png of pngFiles) {
        pngByName.set(png.name, png);
        pngByName.set(png.name.toLowerCase(), png);
      }
      const newTilesets: Record<
        string,
        { tileSetJson: any; tileSetImage: string }
      > = {};
      for (const tsj of tsjFiles) {
        try {
          const text = await tsj.text();
          const json = JSON.parse(text);
          const imageName: string = json.image || "";
          const imageFile =
            pngByName.get(imageName) ?? pngByName.get(imageName.toLowerCase());
          if (!imageFile) {
            console.warn(
              `Dropped TSJ "${tsj.name}" references image "${imageName}" which was not dropped — skipping`
            );
            continue;
          }
          const imageUrl = URL.createObjectURL(imageFile);
          const tilesetName = (json.name || tsj.name).replace(/\.tsj$/i, "");
          newTilesets[tilesetName] = {
            tileSetJson: json,
            tileSetImage: imageUrl
          };
        } catch (err) {
          console.error(`Failed to parse dropped TSJ "${tsj.name}":`, err);
        }
      }
      if (Object.keys(newTilesets).length > 0) {
        levelEditorStore.addExternalTilesets(newTilesets);
        // Select the first newly-added tileset so the user sees what they
        // dropped immediately.
        const firstName = Object.keys(newTilesets)[0];
        levelEditorStore.selectTileset(firstName);
      }
      // Tileset drops never trigger level loading — return early even if some
      // PNG files were also dropped alongside.
      return;
    }

    // Otherwise, fall back to the legacy level-file path.
    const file = files[0];
    const name = file.name.toLowerCase();
    if (
      !name.endsWith(".tmj") &&
      !name.endsWith(".json") &&
      !name.endsWith(".zip")
    ) {
      return;
    }

    try {
      const missing = await processLevelFile(file);
      if (missing.length > 0) {
        levelEditorStore.setMissingTilesets(missing);
      }
    } catch (err) {
      console.error("Failed to load dropped file:", err);
    }
  }, []);

  return (
    <Box
      ref={rootRef}
      className={`level-editor ${isDragOver ? "drag-over" : ""}`}
      data-testid="level-editor"
      sx={{ bgcolor: "background.default", color: "text.primary" }}
      style={
        leftPanel.isResizing || rightPanel.isResizing || layerPanel.isResizing
          ? { userSelect: "none" }
          : undefined
      }
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            Drop .tmj or .zip to load a level, or .tsj + .png to add a tileset
          </div>
        </div>
      )}
      <Dialog
        open={!!ui.missingTilesets}
        onClose={() => levelEditorStore.setMissingTilesets(null)}
      >
        <DialogTitle>Missing Tilesets</DialogTitle>
        <DialogContent>
          <DialogContentText>
            The following tilesets could not be found. Tiles using these
            tilesets will not be displayed.
          </DialogContentText>
          <Box component="ul" sx={{ pl: 3, my: 1 }}>
            {(ui.missingTilesets ?? []).map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            variant="contained"
            onClick={() => levelEditorStore.setMissingTilesets(null)}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
      <LevelEditorToolbar />

      <div className="level-editor-body">
        <Box
          className="level-editor-left-sidebar"
          data-testid="level-editor-left-sidebar"
          style={{ width: ui.leftWidth }}
          sx={{
            bgcolor: "background.paper",
            borderRight: 1,
            borderColor: "divider"
          }}
        >
          <Tabs
            value={ui.leftTab}
            onChange={(_, tab: "tiles" | "entities") => focusLeftTab(tab)}
            variant="fullWidth"
            sx={{ minHeight: 38, borderBottom: 1, borderColor: "divider" }}
          >
            <Tab
              label="Tiles"
              value="tiles"
              icon={<Grid3x3 size={15} />}
              iconPosition="start"
              sx={sidebarTabSx}
            />
            <Tab
              label="Entities"
              value="entities"
              icon={<Users size={15} />}
              iconPosition="start"
              sx={sidebarTabSx}
            />
          </Tabs>

          {ui.leftTab === "tiles" ? <TilePalette /> : <EntityPalette />}

          <div
            className={`resize-handle-vertical ${
              layerPanel.isResizing ? "resizing" : ""
            }`}
            onMouseDown={layerPanel.onMouseDown}
          />
          <LayerPanel layerHeight={ui.layerHeight} />
        </Box>

        <div
          className={`resize-handle resize-handle-left ${
            leftPanel.isResizing ? "resizing" : ""
          }`}
          onMouseDown={leftPanel.onMouseDown}
        />

        <div className="level-editor-center">
          <LevelEditorCanvas />
        </div>

        <div
          className={`resize-handle resize-handle-right ${
            rightPanel.isResizing ? "resizing" : ""
          }`}
          onMouseDown={rightPanel.onMouseDown}
        />

        <Box
          className="level-editor-right-sidebar"
          data-testid="level-editor-right-sidebar"
          style={{ width: ui.rightWidth }}
          sx={{
            bgcolor: "background.paper",
            borderLeft: 1,
            borderColor: "divider"
          }}
        >
          <PropertiesPanel />
        </Box>
      </div>
    </Box>
  );
}
