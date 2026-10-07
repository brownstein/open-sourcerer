import {
  Box,
  Button,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StoredEditorMap } from "src/api/editorMap";
import { ModalComponentPropsType, ModalDefinitionType } from "src/api/modal";
import { BaseModal } from "src/components/modals/BaseModal";
import { Icon } from "src/components/ui/icons/Icon";
import { useHotLoaderIds } from "src/components/util/useHotLoaderIds";
import { levelLoaderContext } from "src/engine/level/LevelLoaderContext";
import { useAppDispatch } from "src/redux/hooks";
import { closeCurrentModal } from "src/redux/ui/slice";

import { levelEditorStore } from "../LevelEditorStore";
import { LevelLoadList } from "../LevelLoadPicker";
import {
  newBlankMapInEditor,
  openLevelInEditorAsNew,
  openSavedMapInEditor
} from "../editorMapActions";
import {
  buildStoredMapFromImport,
  exportMapAsTmj,
  exportMapAsZip,
  parseMapFile
} from "../editorMapIO";
import {
  BLANK_THUMBNAIL,
  regenerateEditorMapThumbnail
} from "../editorMapThumbnails";
import {
  deleteEditorMap,
  duplicateEditorMap,
  editorMapsEvents,
  isEditorMapId,
  listEditorMaps,
  mintEditorMapId,
  renameEditorMap,
  saveEditorMap,
  setEditorMapLink
} from "../editorMaps";
import { useLevelEditorSelector } from "../useLevelEditorStore";
import "./LevelManager.less";

function useEditorMaps(): StoredEditorMap[] {
  const [maps, setMaps] = useState(() => listEditorMaps());
  useEffect(() => {
    const reread = () => setMaps(listEditorMaps());
    reread();
    editorMapsEvents.on("changed", reread);
    return () => editorMapsEvents.off("changed", reread);
  }, []);
  return useMemo(
    () => [...maps].sort((a, b) => b.updatedAt - a.updatedAt),
    [maps]
  );
}

type CardProps = {
  map: StoredEditorMap;
  isOpenMap: boolean;
  isRenaming: boolean;
  onOpen: (map: StoredEditorMap) => void;
  onStartRename: (map: StoredEditorMap) => void;
  onCommitRename: (map: StoredEditorMap, name: string) => void;
  onCancelRename: () => void;
  onDuplicate: (map: StoredEditorMap) => void;
  onExport: (map: StoredEditorMap, anchor: HTMLElement) => void;
  onEditLink: (map: StoredEditorMap, anchor: HTMLElement) => void;
  onDelete: (map: StoredEditorMap, anchor: HTMLElement) => void;
};

function LevelManagerCard({
  map,
  isOpenMap,
  isRenaming,
  onOpen,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDuplicate,
  onExport,
  onEditLink,
  onDelete
}: CardProps) {
  const [draftName, setDraftName] = useState(map.name);

  useEffect(() => {
    if (isRenaming) setDraftName(map.name);
  }, [isRenaming, map.name]);

  return (
    <Box
      className="level-manager-card"
      onClick={() => onOpen(map)}
      sx={{
        border: 1,
        borderColor: isOpenMap ? "primary.main" : "divider",
        bgcolor: "background.paper",
        "&:hover": { borderColor: "primary.main" }
      }}
    >
      <Box
        className="level-manager-thumb"
        sx={{ bgcolor: "common.black", color: "text.disabled" }}
      >
        <img src={map.screenshotImage ?? BLANK_THUMBNAIL} alt="" />
        {isOpenMap && (
          <Box
            className="level-manager-open-badge"
            sx={{ bgcolor: "primary.main", color: "primary.contrastText" }}
          >
            Open
          </Box>
        )}
      </Box>

      <Box className="level-manager-card-body">
        {isRenaming ? (
          <TextField
            size="small"
            autoFocus
            value={draftName}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => onCommitRename(map, draftName)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename(map, draftName);
              else if (e.key === "Escape") onCancelRename();
            }}
            slotProps={{ htmlInput: { sx: { py: 0.5, fontSize: 13 } } }}
          />
        ) : (
          <Typography
            className="level-manager-name"
            variant="body2"
            fontWeight={600}
            noWrap
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartRename(map);
            }}
          >
            {map.name}
          </Typography>
        )}

        <Tooltip
          title={
            map.sourceLevelId
              ? `Linked to ${map.sourceLevelId}. Click to change`
              : "Not linked. Click to link a built-in level"
          }
        >
          <Box
            className="level-manager-link-row"
            sx={{
              color: map.sourceLevelId ? "text.secondary" : "text.disabled"
            }}
            onClick={(e) => {
              e.stopPropagation();
              onEditLink(map, e.currentTarget);
            }}
          >
            <Icon icon={map.sourceLevelId ? "link" : "unlink"} size="font" />
            <Typography variant="caption" noWrap>
              {map.sourceLevelId ?? "Not linked"}
            </Typography>
          </Box>
        </Tooltip>

        <Typography variant="caption" color="text.disabled">
          {new Date(map.updatedAt).toLocaleDateString()}
        </Typography>
      </Box>

      <Box
        className="level-manager-card-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip title="Duplicate">
          <IconButton size="small" onClick={() => onDuplicate(map)}>
            <Icon icon="clone" size="font" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Export">
          <IconButton
            size="small"
            onClick={(e) => onExport(map, e.currentTarget)}
          >
            <Icon icon="download" size="font" />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Delete">
          <IconButton
            size="small"
            color="error"
            onClick={(e) => onDelete(map, e.currentTarget)}
          >
            <Icon icon="trash" size="font" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}

export function LevelManagerModal(
  props: ModalComponentPropsType<"levelManager">
) {
  const { opening, closing } = props;
  const dispatch = useAppDispatch();
  const maps = useEditorMaps();
  const allLevelIds = useHotLoaderIds(levelLoaderContext.hotLoaders.levels);
  const openMapId = useLevelEditorSelector(
    (s) => s.getState().savedMapId,
    ["metadataChanged"]
  );

  const builtinIds = useMemo(
    () => allLevelIds.filter((id) => !isEditorMapId(id)).sort(),
    [allLevelIds]
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [newAnchor, setNewAnchor] = useState<HTMLElement | null>(null);
  const [builtinPickerAnchor, setBuiltinPickerAnchor] =
    useState<HTMLElement | null>(null);
  const [exportTarget, setExportTarget] = useState<{
    map: StoredEditorMap;
    anchor: HTMLElement;
  } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{
    map: StoredEditorMap;
    anchor: HTMLElement;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    map: StoredEditorMap;
    anchor: HTMLElement;
  } | null>(null);

  const close = useCallback(() => dispatch(closeCurrentModal()), [dispatch]);

  const handleOpen = useCallback(
    (map: StoredEditorMap) => {
      openSavedMapInEditor(map);
      close();
    },
    [close]
  );

  const handleCommitRename = useCallback(
    (map: StoredEditorMap, name: string) => {
      const trimmed = name.trim();
      setRenamingId(null);
      if (!trimmed || trimmed === map.name) return;
      renameEditorMap(map.id, trimmed);
      if (levelEditorStore.getState().savedMapId === map.id) {
        levelEditorStore.setLevelName(trimmed);
      }
    },
    []
  );

  const handleDelete = useCallback((map: StoredEditorMap) => {
    deleteEditorMap(map.id);
    // Detach so the next save of the open map becomes a fresh Save As.
    if (levelEditorStore.getState().savedMapId === map.id) {
      levelEditorStore.setSavedMapId(undefined);
    }
    setDeleteTarget(null);
  }, []);

  const handleSetLink = useCallback(
    (map: StoredEditorMap, sourceLevelId: string | undefined) => {
      setEditorMapLink(map.id, sourceLevelId);
      if (levelEditorStore.getState().savedMapId === map.id) {
        levelEditorStore.setSourceLevelId(sourceLevelId);
      }
      setLinkTarget(null);
    },
    []
  );

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      try {
        const parsed = await parseMapFile(file);
        const imported = buildStoredMapFromImport(
          parsed,
          mintEditorMapId(parsed.name)
        );
        saveEditorMap(imported);
        void regenerateEditorMapThumbnail(imported);
      } catch (err) {
        console.error("Failed to import map file:", err);
      }
    },
    []
  );

  return (
    <BaseModal
      title="Level Manager"
      size="large"
      opening={opening}
      closing={closing}
    >
      <div className="level-manager">
        <div className="level-manager-toolbar">
          <Button
            variant="contained"
            size="small"
            sx={{ textTransform: "none" }}
            startIcon={<Icon icon="plus" size="font" />}
            onClick={(e) => setNewAnchor(e.currentTarget)}
          >
            New map
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            sx={{ textTransform: "none" }}
            startIcon={<Icon icon="upload" size="font" />}
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </Button>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {maps.length} {maps.length === 1 ? "map" : "maps"}
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tmj,.json,.zip"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </div>

        {maps.length === 0 ? (
          <div className="level-manager-empty">
            <Typography variant="h6" color="text.secondary">
              No saved maps yet
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Create a blank map, start from a built-in level, or import a
              .tmj/.zip file.
            </Typography>
            <Button
              variant="contained"
              size="small"
              sx={{ textTransform: "none" }}
              startIcon={<Icon icon="plus" size="font" />}
              onClick={(e) => setNewAnchor(e.currentTarget)}
            >
              New map
            </Button>
          </div>
        ) : (
          <div className="level-manager-grid">
            {maps.map((map) => (
              <LevelManagerCard
                key={map.id}
                map={map}
                isOpenMap={map.id === openMapId}
                isRenaming={renamingId === map.id}
                onOpen={handleOpen}
                onStartRename={(m) => setRenamingId(m.id)}
                onCommitRename={handleCommitRename}
                onCancelRename={() => setRenamingId(null)}
                onDuplicate={(m) => duplicateEditorMap(m.id)}
                onExport={(m, anchor) => setExportTarget({ map: m, anchor })}
                onEditLink={(m, anchor) => setLinkTarget({ map: m, anchor })}
                onDelete={(m, anchor) => setDeleteTarget({ map: m, anchor })}
              />
            ))}
          </div>
        )}
      </div>

      <Menu
        anchorEl={newAnchor}
        open={Boolean(newAnchor)}
        onClose={() => setNewAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            setNewAnchor(null);
            newBlankMapInEditor();
            close();
          }}
        >
          <ListItemIcon>
            <Icon icon="file" size="font" />
          </ListItemIcon>
          <ListItemText>Blank map</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={(e) => {
            setBuiltinPickerAnchor(e.currentTarget);
            setNewAnchor(null);
          }}
        >
          <ListItemIcon>
            <Icon icon="map" size="font" />
          </ListItemIcon>
          <ListItemText>From a built-in level…</ListItemText>
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(builtinPickerAnchor)}
        anchorEl={builtinPickerAnchor}
        onClose={() => setBuiltinPickerAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <div className="level-manager-link-popover">
          <LevelLoadList
            levelIds={builtinIds}
            autoFocusSearch
            onSelect={(levelId) => {
              setBuiltinPickerAnchor(null);
              openLevelInEditorAsNew(levelId);
              close();
            }}
          />
        </div>
      </Popover>

      <Menu
        anchorEl={exportTarget?.anchor ?? null}
        open={Boolean(exportTarget)}
        onClose={() => setExportTarget(null)}
      >
        <MenuItem
          onClick={() => {
            if (exportTarget) exportMapAsTmj(exportTarget.map);
            setExportTarget(null);
          }}
        >
          <ListItemIcon>
            <Icon icon="file" size="font" />
          </ListItemIcon>
          <ListItemText>Export .tmj</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (exportTarget) exportMapAsZip(exportTarget.map);
            setExportTarget(null);
          }}
        >
          <ListItemIcon>
            <Icon icon="download" size="font" />
          </ListItemIcon>
          <ListItemText>Export .zip</ListItemText>
        </MenuItem>
      </Menu>

      <Popover
        open={Boolean(linkTarget)}
        anchorEl={linkTarget?.anchor ?? null}
        onClose={() => setLinkTarget(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <div className="level-manager-link-popover">
          {linkTarget?.map.sourceLevelId && (
            <>
              <MenuItem
                onClick={() =>
                  linkTarget && handleSetLink(linkTarget.map, undefined)
                }
              >
                <ListItemIcon>
                  <Icon icon="unlink" size="font" />
                </ListItemIcon>
                <ListItemText>Remove link</ListItemText>
              </MenuItem>
              <Divider />
            </>
          )}
          <LevelLoadList
            levelIds={builtinIds}
            autoFocusSearch
            onSelect={(levelId) =>
              linkTarget && handleSetLink(linkTarget.map, levelId)
            }
          />
        </div>
      </Popover>

      <Popover
        open={Boolean(deleteTarget)}
        anchorEl={deleteTarget?.anchor ?? null}
        onClose={() => setDeleteTarget(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 1.5, maxWidth: 240 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Delete “{deleteTarget?.map.name}”? This cannot be undone.
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={() => deleteTarget && handleDelete(deleteTarget.map)}
            >
              Delete
            </Button>
          </Stack>
        </Box>
      </Popover>
    </BaseModal>
  );
}

export const LevelManagerModalDefinition: ModalDefinitionType<"levelManager"> =
  {
    modalName: "levelManager",
    component: LevelManagerModal
  };
