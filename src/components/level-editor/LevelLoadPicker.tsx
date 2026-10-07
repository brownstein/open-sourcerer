import { Box, ButtonBase, TextField, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";

import {
  EmptyState,
  SearchAdornment,
  searchFieldSx
} from "./sharedEditorStyles";

const ROW_HEIGHT = 64;

type LevelEntry = {
  id: string;
  def: LevelDefinitionAPI | null;
  searchKey: string;
};

type LevelLoadListProps = {
  levelIds: string[];
  onSelect: (levelId: string) => void;
  autoFocusSearch?: boolean;
  /** If set, list area uses this CSS height; otherwise it fills its container. */
  height?: number | string;
};

/**
 * Search input + virtualized list with screenshot thumbnails. Shared by the
 * dev level-select modal and the Level Manager (browse + link/source pickers).
 */
export function LevelLoadList({
  levelIds,
  onSelect,
  autoFocusSearch,
  height
}: LevelLoadListProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // i18n keys are typed as a strict literal union; cast at the boundary so we
  // can pass dynamic level keys through. Runtime echoes unknown keys back.
  const translate = useCallback(
    (key: string | undefined): string =>
      key ? (t(key as never) as string) : "",
    [t]
  );

  const entries = useMemo<LevelEntry[]>(() => {
    const out: LevelEntry[] = [];
    for (const id of levelIds) {
      const def = levelLoaderContext.hotLoaders.levels.getResource(id);
      const localized = translate(def?.localizedName);
      out.push({
        id,
        def,
        searchKey: `${id} ${localized}`.toLowerCase()
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  }, [levelIds, translate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.searchKey.includes(q));
  }, [entries, query]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6
  });

  const listStyle: React.CSSProperties =
    height !== undefined ? { height } : { flex: 1, minHeight: 0 };

  return (
    <>
      <TextField
        size="small"
        autoFocus={autoFocusSearch}
        placeholder="Filter levels…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        slotProps={{ input: { startAdornment: <SearchAdornment /> } }}
        sx={searchFieldSx}
      />
      <Box ref={scrollRef} style={listStyle} sx={{ overflow: "auto" }}>
        {filtered.length === 0 ? (
          <EmptyState>No matches</EmptyState>
        ) : (
          <Box
            sx={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
              width: "100%"
            }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const entry = filtered[vi.index];
              const localized = translate(entry.def?.localizedName);
              return (
                <ButtonBase
                  key={vi.key}
                  onClick={() => onSelect(entry.id)}
                  sx={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 1,
                    px: 1,
                    transition: "background-color 150ms",
                    "&:hover, &.Mui-focusVisible": { bgcolor: "action.hover" }
                  }}
                >
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 52,
                      height: 52,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 0.5,
                      overflow: "hidden",
                      bgcolor: "common.black",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "text.disabled",
                      "& img": {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        imageRendering: "pixelated"
                      }
                    }}
                  >
                    {entry.def?.screenshotImage ? (
                      <img
                        src={entry.def.screenshotImage}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      "?"
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                    <Typography variant="body2" noWrap fontWeight={600}>
                      {entry.id}
                    </Typography>
                    {localized && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                        display="block"
                      >
                        {localized}
                      </Typography>
                    )}
                  </Box>
                </ButtonBase>
              );
            })}
          </Box>
        )}
      </Box>
    </>
  );
}
