import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState } from "react";

import { allTilesets } from "src/levels/tilesets/allTilesets";

import { levelEditorStore } from "./LevelEditorStore";
import { ConnectedTilesetPicker } from "./TilesetPicker";
import { useLevelEditorSelector } from "./useLevelEditorStore";

export function TilePalette() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(
    null
  );
  const [paletteScale, setPaletteScale] = useState(2);
  // Content point to keep under the cursor after a zoom redraw.
  const zoomAnchorRef = useRef<{
    contentX: number;
    contentY: number;
    cursorX: number;
    cursorY: number;
  } | null>(null);

  // Drag-select state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ col: 0, row: 0 });
  const [dragRect, setDragRect] = useState<{
    col: number;
    row: number;
    endCol: number;
    endRow: number;
  } | null>(null);

  const palette = useLevelEditorSelector(
    (s) => {
      const st = s.getState();
      return {
        selectedTilesetName: st.selectedTilesetName,
        selectedTileId: st.selectedTileId,
        selectedTileRegion: st.selectedTileRegion,
        externalTilesets: st.externalTilesets
      };
    },
    ["paletteChanged", "layersChanged"],
    (a, b) =>
      a.selectedTilesetName === b.selectedTilesetName &&
      a.selectedTileId === b.selectedTileId &&
      a.selectedTileRegion === b.selectedTileRegion &&
      a.externalTilesets === b.externalTilesets
  );

  const currentTileset =
    allTilesets[palette.selectedTilesetName] ??
    palette.externalTilesets?.[palette.selectedTilesetName];
  const tilesetJson = currentTileset?.tileSetJson;

  // Load tileset image
  useEffect(() => {
    if (!currentTileset) return;
    const img = new Image();
    img.src = currentTileset.tileSetImage;
    img.onload = () => setTilesetImage(img);
    return () => {
      setTilesetImage(null);
    };
  }, [currentTileset]);

  // Draw tileset grid
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tilesetImage || !tilesetJson) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = tilesetJson.columns;
    const tw = tilesetJson.tilewidth;
    const th = tilesetJson.tileheight;
    const rows = Math.ceil(tilesetJson.tilecount / cols);

    const scale = paletteScale;
    canvas.width = cols * tw * scale;
    canvas.height = rows * th * scale;

    const anchor = zoomAnchorRef.current;
    if (anchor && scrollRef.current) {
      zoomAnchorRef.current = null;
      scrollRef.current.scrollLeft = anchor.contentX * scale - anchor.cursorX;
      scrollRef.current.scrollTop = anchor.contentY * scale - anchor.cursorY;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tilesetImage, 0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(c * tw * scale, 0);
      ctx.lineTo(c * tw * scale, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * th * scale);
      ctx.lineTo(canvas.width, r * th * scale);
      ctx.stroke();
    }

    // Highlight selected region or single tile
    const region = palette.selectedTileRegion;
    if (region) {
      const startCol = region.startId % cols;
      const startRow = Math.floor(region.startId / cols);
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        startCol * tw * scale,
        startRow * th * scale,
        region.width * tw * scale,
        region.height * th * scale
      );
    } else if (
      palette.selectedTileId !== null &&
      palette.selectedTileId < tilesetJson.tilecount
    ) {
      const selCol = palette.selectedTileId % cols;
      const selRow = Math.floor(palette.selectedTileId / cols);
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        selCol * tw * scale,
        selRow * th * scale,
        tw * scale,
        th * scale
      );
    }

    // Draw drag-in-progress rectangle
    if (dragRect) {
      const minCol = Math.min(dragRect.col, dragRect.endCol);
      const minRow = Math.min(dragRect.row, dragRect.endRow);
      const maxCol = Math.max(dragRect.col, dragRect.endCol);
      const maxRow = Math.max(dragRect.row, dragRect.endRow);
      ctx.strokeStyle = "rgba(255, 255, 0, 0.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        minCol * tw * scale,
        minRow * th * scale,
        (maxCol - minCol + 1) * tw * scale,
        (maxRow - minRow + 1) * th * scale
      );
      ctx.setLineDash([]);
    }
  }, [
    tilesetImage,
    tilesetJson,
    palette.selectedTileId,
    palette.selectedTileRegion,
    dragRect,
    paletteScale
  ]);

  const getColRow = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!tilesetJson || !canvasRef.current) return null;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const scale = paletteScale;
      const cols = tilesetJson.columns;
      const rows = Math.ceil(tilesetJson.tilecount / cols);
      const col = Math.max(
        0,
        Math.min(cols - 1, Math.floor(x / (tilesetJson.tilewidth * scale)))
      );
      const row = Math.max(
        0,
        Math.min(rows - 1, Math.floor(y / (tilesetJson.tileheight * scale)))
      );
      return { col, row };
    },
    [tilesetJson, paletteScale]
  );

  // The wheel zooms the tileset view (right/middle-drag pans), like the
  // main canvas.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Some mouse/OS configs turn middle/right-button-drag panning into wheel
      // events (button-scroll emulation); pan with them instead of zooming.
      if ((e.buttons & 6) !== 0) {
        scroller.scrollLeft += e.deltaX;
        scroller.scrollTop += e.deltaY;
        return;
      }
      const rect = scroller.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      setPaletteScale((prev) => {
        const next = Math.min(
          8,
          Math.max(0.5, prev * (e.deltaY > 0 ? 1 / 1.15 : 1.15))
        );
        if (next !== prev) {
          zoomAnchorRef.current = {
            contentX: (scroller.scrollLeft + cursorX) / prev,
            contentY: (scroller.scrollTop + cursorY) / prev,
            cursorX,
            cursorY
          };
        }
        return next;
      });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  const onCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Right/middle-drag pans the tileset view; only left-drag selects.
      if (e.button !== 0) {
        const scroller = scrollRef.current;
        if (!scroller) return;
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = scroller.scrollLeft;
        const startTop = scroller.scrollTop;
        scroller.style.cursor = "grabbing";
        const onMouseMove = (me: MouseEvent) => {
          scroller.scrollLeft = startLeft - (me.clientX - startX);
          scroller.scrollTop = startTop - (me.clientY - startY);
        };
        const onMouseUp = () => {
          scroller.style.cursor = "";
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        return;
      }

      const pos = getColRow(e);
      if (!pos || !tilesetJson) return;

      isDraggingRef.current = true;
      dragStartRef.current = pos;
      setDragRect({
        col: pos.col,
        row: pos.row,
        endCol: pos.col,
        endRow: pos.row
      });

      const onMouseMove = (me: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const cur = getColRow(me);
        if (!cur) return;
        setDragRect({
          col: dragStartRef.current.col,
          row: dragStartRef.current.row,
          endCol: cur.col,
          endRow: cur.row
        });
      };

      const onMouseUp = (me: MouseEvent) => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);

        const end = getColRow(me);
        if (!end || !tilesetJson) {
          setDragRect(null);
          return;
        }

        const start = dragStartRef.current;
        const minCol = Math.min(start.col, end.col);
        const minRow = Math.min(start.row, end.row);
        const maxCol = Math.max(start.col, end.col);
        const maxRow = Math.max(start.row, end.row);
        const cols = tilesetJson.columns;
        const width = maxCol - minCol + 1;
        const height = maxRow - minRow + 1;
        const startId = minRow * cols + minCol;

        if (width === 1 && height === 1) {
          // Single tile click
          const tileId = startId;
          if (tileId >= 0 && tileId < tilesetJson.tilecount) {
            levelEditorStore.selectTile(tileId);
            levelEditorStore.selectTool("paint");
          }
        } else {
          // Multi-tile region
          levelEditorStore.selectTileRegion({ startId, width, height });
          levelEditorStore.selectTool("paint");
        }
        setDragRect(null);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [tilesetJson, getColRow]
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        overflow: "hidden"
      }}
    >
      <ConnectedTilesetPicker />
      <Box
        ref={scrollRef}
        className="tile-grid-scroll"
        sx={(theme) => ({
          flex: 1,
          overflow: "auto",
          m: 1,
          mt: 0.5,
          // Recessed well so the tileset reads as content, not panel surface.
          bgcolor: alpha(
            theme.palette.common.black,
            theme.palette.mode === "dark" ? 0.3 : 0.05
          ),
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" }
        })}
        onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
      >
        <canvas
          ref={canvasRef}
          className="tile-grid-canvas"
          data-testid="tile-palette-canvas"
          onMouseDown={onCanvasMouseDown}
        />
      </Box>
    </Box>
  );
}
