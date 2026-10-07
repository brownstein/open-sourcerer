import {
  Box,
  List,
  ListItemButton,
  ListSubheader,
  TextField
} from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import { entityClassRegistry } from "src/entities/allEntities";
import entityMetadataRaw from "src/entities/metadata/allEntitiesMetadata.json";
import { EntityTypeSignature } from "src/entities/metadata/metadataTypes";

import { levelEditorStore } from "./LevelEditorStore";
import {
  EmptyState,
  SearchAdornment,
  searchFieldSx,
  selectableRowSx
} from "./sharedEditorStyles";
import { useLevelEditorSelector } from "./useLevelEditorStore";

const entityMetadata = entityMetadataRaw as EntityTypeSignature[];

// Derive category from sourceFile path in entity metadata
const PATH_CATEGORY_MAP: [string, string][] = [
  ["player", "Player"],
  ["enemies/bosses", "Bosses"],
  ["enemies/spawners", "Spawners"],
  ["enemies/major", "Enemies (Major)"],
  ["enemies", "Enemies"],
  ["npcs", "NPCs"],
  ["items", "Items"],
  ["environment/hazards", "Hazards"],
  ["environment", "Environment"],
  ["terrain", "Terrain"],
  ["spells", "Spells"],
  ["runes", "Runes"],
  ["ui", "UI"],
  ["dev", "Dev"],
  ["demo", "Demo"]
];

function getCategoryFromSourceFile(sourceFile: string): string {
  // sourceFile is like "src/entities/enemies/critters/Slime"
  const entitiesIdx = sourceFile.indexOf("entities/");
  if (entitiesIdx === -1) return "Other";
  const subPath = sourceFile.slice(entitiesIdx + "entities/".length);

  for (const [pathPrefix, category] of PATH_CATEGORY_MAP) {
    if (subPath.startsWith(pathPrefix)) return category;
  }
  return "Other";
}

// Build a name→sourceFile lookup from metadata
const entitySourceFiles = new Map<string, string>();
for (const meta of entityMetadata) {
  entitySourceFiles.set(meta.name, meta.sourceFile);
}

function categorizeEntities(allTypes: string[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>();

  for (const typeName of allTypes) {
    const sourceFile = entitySourceFiles.get(typeName) ?? "";
    const category = getCategoryFromSourceFile(sourceFile);
    let list = buckets.get(category);
    if (!list) {
      list = [];
      buckets.set(category, list);
    }
    list.push(typeName);
  }

  // Sort entries within each category
  for (const list of buckets.values()) {
    list.sort();
  }

  // Sort categories: Player first, Other last, rest alphabetical
  const sorted = new Map<string, string[]>();
  const playerList = buckets.get("Player");
  if (playerList) sorted.set("Player", playerList);

  const remaining = [...buckets.entries()]
    .filter(([k]) => k !== "Player" && k !== "Other")
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of remaining) sorted.set(k, v);

  const otherList = buckets.get("Other");
  if (otherList) sorted.set("Other", otherList);

  return sorted;
}

export function EntityPalette() {
  const [search, setSearch] = useState("");

  const selectedTool = useLevelEditorSelector(
    (s) => s.getState().selectedTool,
    ["toolChanged"]
  );
  const selectedEntityType = useLevelEditorSelector(
    (s) => s.getState().selectedEntityType,
    ["paletteChanged"]
  );

  const allTypes = useMemo(() => [...new Set(entityClassRegistry.keys())], []);
  const categorized = useMemo(() => categorizeEntities(allTypes), [allTypes]);

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categorized;

    const q = search.toLowerCase();
    const filtered = new Map<string, string[]>();

    for (const [category, types] of categorized) {
      const matching = types.filter((t) => t.toLowerCase().includes(q));
      if (matching.length > 0) {
        filtered.set(category, matching);
      }
    }

    return filtered;
  }, [categorized, search]);

  const onSelect = useCallback(
    (type: string) => {
      levelEditorStore.selectEntityType(type);
      // Shape entities (e.g. WireConnector, MotionPath) are defined by their
      // polyline/polygon, so drop straight into polyline drawing mode.
      const requiresShape = entityClassRegistry
        .get(type)
        ?.flags?.includes("requireShape");
      if (requiresShape) {
        levelEditorStore.selectTool("polyline");
      } else if (selectedTool !== "polyline") {
        // Don't switch away from polyline tool when selecting an entity type
        levelEditorStore.selectTool("entity");
      }
    },
    [selectedTool]
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
      <TextField
        size="small"
        placeholder="Search entities…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        slotProps={{
          htmlInput: { "data-testid": "entity-search" },
          input: { startAdornment: <SearchAdornment /> }
        }}
        sx={searchFieldSx}
      />
      <List
        dense
        disablePadding
        data-testid="entity-list"
        sx={{ flex: 1, overflowY: "auto", pb: 0.5 }}
      >
        {filteredCategories.size === 0 ? (
          <EmptyState>No matches</EmptyState>
        ) : (
          [...filteredCategories.entries()].map(([category, types]) => (
            <Box key={category}>
              <ListSubheader
                sx={{
                  lineHeight: 2.4,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  bgcolor: "background.paper"
                }}
              >
                {category}
              </ListSubheader>
              {types.map((type) => (
                <ListItemButton
                  key={type}
                  dense
                  selected={selectedEntityType === type}
                  sx={[selectableRowSx, { py: 0.4, fontSize: 13 }]}
                  onClick={() => onSelect(type)}
                >
                  {type}
                </ListItemButton>
              ))}
            </Box>
          ))
        )}
      </List>
    </Box>
  );
}
