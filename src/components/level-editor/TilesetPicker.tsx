import {
  Box,
  ButtonBase,
  List,
  ListItemButton,
  Popover,
  TextField,
  Typography
} from "@mui/material";
import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { TilesetDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import { levelEditorStore } from "./LevelEditorStore";
import {
  EmptyState,
  SearchAdornment,
  searchFieldSx,
  selectableRowSx
} from "./sharedEditorStyles";
import { useLevelEditorSelector } from "./useLevelEditorStore";

const THUMB_SIZE = 32;

type TilesetEntry = {
  name: string;
  def: TilesetDefinitionAPI;
};

/**
 * Compute the source X/Y of the tile to use as a preview for a tileset.
 * Uses the first tile in `tiles[]` that has a `type` or `class` label, falling
 * back to tile 0 when no tile is labeled.
 */
function getPreviewTileSrc(def: TilesetDefinitionAPI): {
  srcX: number;
  srcY: number;
  tileWidth: number;
  tileHeight: number;
} {
  const json = def.tileSetJson;
  const tw = json.tilewidth;
  const th = json.tileheight;
  const cols = json.columns || 1;

  let id = 0;
  for (const tile of json.tiles ?? []) {
    if (tile.type || tile.class) {
      id = tile.id;
      break;
    }
  }
  const srcX = (id % cols) * tw;
  const srcY = Math.floor(id / cols) * th;
  return { srcX, srcY, tileWidth: tw, tileHeight: th };
}

/** A single-tile preview cropped from the tileset image via CSS. */
function TilesetThumbnail({ def }: { def: TilesetDefinitionAPI }) {
  const { srcX, srcY, tileWidth, tileHeight } = useMemo(
    () => getPreviewTileSrc(def),
    [def]
  );
  const json = def.tileSetJson;
  const scaleX = THUMB_SIZE / tileWidth;
  const scaleY = THUMB_SIZE / tileHeight;

  return (
    <Box
      sx={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        flexShrink: 0,
        borderRadius: 0.5,
        border: 1,
        borderColor: "divider",
        bgcolor: "common.black",
        backgroundImage: `url("${def.tileSetImage}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `${-srcX * scaleX}px ${-srcY * scaleY}px`,
        backgroundSize: `${json.imagewidth * scaleX}px ${
          json.imageheight * scaleY
        }px`,
        imageRendering: "pixelated"
      }}
    />
  );
}

type TilesetPickerProps = {
  selectedTilesetName: string;
  externalTilesets?: Record<string, TilesetDefinitionAPI>;
};

export function TilesetPicker({
  selectedTilesetName,
  externalTilesets
}: TilesetPickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Re-evaluate when externalTilesets changes so dropped tilesets appear.
  const entries = useMemo<TilesetEntry[]>(() => {
    const map = new Map<string, TilesetDefinitionAPI>();
    for (const [name, def] of Object.entries(allTilesets)) {
      map.set(name, def);
    }
    if (externalTilesets) {
      for (const [name, def] of Object.entries(externalTilesets)) {
        map.set(name, def);
      }
    }
    const out: TilesetEntry[] = [];
    for (const [name, def] of map) out.push({ name, def });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [externalTilesets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, query]);

  const selectedDef =
    allTilesets[selectedTilesetName] ?? externalTilesets?.[selectedTilesetName];

  const handleSelect = useCallback((name: string) => {
    levelEditorStore.selectTileset(name);
    setAnchorEl(null);
  }, []);

  return (
    <>
      <ButtonBase
        onClick={(e) => {
          setQuery("");
          setAnchorEl(e.currentTarget);
        }}
        title="Select tileset"
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 1,
          width: "calc(100% - 16px)",
          m: 1,
          mb: 0.5,
          p: 0.5,
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
          justifyContent: "flex-start",
          transition: theme.transitions.create(
            ["background-color", "border-color"],
            { duration: theme.transitions.duration.shortest }
          ),
          "&:hover": { bgcolor: "action.hover", borderColor: "text.disabled" },
          "&.Mui-focusVisible": { borderColor: "primary.main" }
        })}
      >
        {selectedDef ? (
          <TilesetThumbnail def={selectedDef} />
        ) : (
          <Box sx={{ width: THUMB_SIZE, height: THUMB_SIZE }}>?</Box>
        )}
        <Typography variant="body2" noWrap sx={{ flex: 1, textAlign: "left" }}>
          {selectedTilesetName}
        </Typography>
        <ChevronDown size={14} />
      </ButtonBase>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: { width: 300, display: "flex", flexDirection: "column" }
          }
        }}
        // Focus the filter as soon as the popover opens.
        onTransitionEnd={() => searchInputRef.current?.focus()}
      >
        <TextField
          size="small"
          placeholder="Filter tilesets…"
          value={query}
          inputRef={searchInputRef}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{ input: { startAdornment: <SearchAdornment /> } }}
          sx={searchFieldSx}
        />
        <List
          dense
          disablePadding
          sx={{ maxHeight: 360, overflowY: "auto", pb: 0.5 }}
        >
          {filtered.length === 0 ? (
            <EmptyState>No matches</EmptyState>
          ) : (
            filtered.map((entry) => (
              <ListItemButton
                key={entry.name}
                dense
                selected={entry.name === selectedTilesetName}
                sx={[selectableRowSx, { gap: 1 }]}
                onClick={() => handleSelect(entry.name)}
              >
                <TilesetThumbnail def={entry.def} />
                <Typography variant="body2" noWrap>
                  {entry.name}
                </Typography>
              </ListItemButton>
            ))
          )}
        </List>
      </Popover>
    </>
  );
}

/**
 * Wires the TilesetPicker to the editor store. Subscribes to the slice it
 * needs and forwards the resolved values.
 */
export function ConnectedTilesetPicker() {
  const data = useLevelEditorSelector(
    (s) => {
      const st = s.getState();
      return {
        selectedTilesetName: st.selectedTilesetName,
        externalTilesets: st.externalTilesets
      };
    },
    ["paletteChanged", "layersChanged"],
    (a, b) =>
      a.selectedTilesetName === b.selectedTilesetName &&
      a.externalTilesets === b.externalTilesets
  );
  return (
    <TilesetPicker
      selectedTilesetName={data.selectedTilesetName}
      externalTilesets={data.externalTilesets}
    />
  );
}
