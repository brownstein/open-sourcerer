import {
  Box,
  Collapse,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import cx from "classnames";
import {
  ChevronRight,
  Eye,
  EyeOff,
  FileQuestion,
  Grid3x3,
  Image,
  Lightbulb,
  Plus,
  Users,
  X
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { getEmptyImage } from "react-dnd-html5-backend";

import { useAppDispatch } from "src/redux/hooks";
import { pushModal } from "src/redux/shared/actions";

import { levelEditorStore } from "./LevelEditorStore";
import { CollabIdentity } from "./collab/collabTypes";
import { useMemberLayerPresence } from "./collab/useMemberPresence";
import { EditorLayer, EntityPlacement } from "./levelEditorState";
import { panelHeaderTextSx, selectableRowSx } from "./sharedEditorStyles";
import { useLevelEditorSelector } from "./useLevelEditorStore";

const LAYER_KIND_META = {
  tile: { icon: Grid3x3, title: "Tile Layer", color: "info.main" },
  entity: { icon: Users, title: "Entity Layer", color: "success.main" },
  image: { icon: Image, title: "Image Layer", color: "warning.main" },
  unknown: {
    icon: FileQuestion,
    title: "Unknown layer type, preserved as-is and re-exported on save",
    color: "text.disabled"
  }
} as const;

type LayerEntityRowProps = {
  entity: EntityPlacement;
  layerId: string;
  isSelected: boolean;
};

const LayerEntityRow = memo(function LayerEntityRow({
  entity,
  layerId,
  isSelected
}: LayerEntityRowProps) {
  const name =
    typeof entity.properties?.name === "string"
      ? (entity.properties.name as string)
      : null;
  return (
    <ListItemButton
      dense
      selected={isSelected}
      sx={[
        selectableRowSx,
        { pl: 1.5, py: 0.4, gap: 1, alignItems: "baseline" }
      ]}
      onClick={(e) => {
        e.stopPropagation();
        levelEditorStore.setActiveLayer(layerId);
        levelEditorStore.selectEntity(entity.id);
      }}
    >
      <Typography variant="body2" noWrap>
        {name ?? entity.type}
      </Typography>
      {name && name !== entity.type && (
        <Typography variant="caption" color="text.secondary" flexShrink={0}>
          {entity.type}
        </Typography>
      )}
    </ListItemButton>
  );
});

type LayerPanelLayerProps = {
  layer: EditorLayer;
  layerIndex: number;
  isActive?: boolean;
  canDelete?: boolean;
  isExpanded?: boolean;
  selectedEntityIds: string[];
  /** Peers currently editing this layer (their dot shows on the row). */
  presentMembers: CollabIdentity[];
};

const NO_PRESENT_MEMBERS: CollabIdentity[] = [];

type LayerPanelDragData = {
  layerId: string;
};

type LayerPanelDropData = {
  layerIndex: number;
};

function LayerPanelLayer({
  layer,
  layerIndex,
  isActive,
  canDelete,
  isExpanded,
  selectedEntityIds,
  presentMembers
}: LayerPanelLayerProps) {
  const dispatch = useAppDispatch();
  const [renaming, setRenaming] = useState(false);
  const [renameTo, setRenameTo] = useState(layer.name);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const aboveWrapperRef = useRef<HTMLDivElement>(null);
  const belowWrapperRef = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, dragPreview] = useDrag<
    LayerPanelDragData,
    LayerPanelDropData,
    { isDragging: boolean }
  >(
    {
      type: "LevelEditorLayer",
      // While renaming, press-and-drag must select text, not lift the row.
      canDrag: () => !renaming,
      collect: (monitor) => ({
        isDragging: monitor.isDragging()
      }),
      item: () => ({
        layerId: layer.id
      }),
      end: (data, monitor) => {
        const { layerId } = data;
        const dropResult = monitor.getDropResult();
        if (!dropResult) return;
        levelEditorStore.reorderLayer(layerId, dropResult.layerIndex);
      }
    },
    [layer, renaming]
  );
  const [{ isOver }, drop] = useDrop<
    LayerPanelDragData,
    LayerPanelDropData,
    { isOver: boolean }
  >(
    {
      accept: "LevelEditorLayer",
      collect: (monitor) => ({
        isOver: monitor.isOver()
      }),
      drop: () => ({
        layerIndex: layerIndex + 1
      })
    },
    [layerIndex]
  );
  const [{ isOver: isOverBelow, dragging }, dropBelow] = useDrop<
    LayerPanelDragData,
    LayerPanelDropData,
    { isOver: boolean; dragging: boolean }
  >(
    {
      accept: "LevelEditorLayer",
      collect: (monitor) => ({
        dragging: !!monitor.getItem(),
        isOver: monitor.isOver()
      }),
      drop: () => ({
        layerIndex
      })
    },
    [layerIndex]
  );

  // Drag and drop anchor to the fixed-height header row, so an expanded
  // entity list doesn't distort the drop hit areas.
  drag(wrapperRef);
  drop(aboveWrapperRef);
  dropBelow(belowWrapperRef);

  // The browser's native drag snapshot includes the absolutely-positioned
  // drop-zone overlays and renders garbled — suppress it; the dimmed source
  // row plus the insertion line are the drag feedback.
  useEffect(() => {
    dragPreview(getEmptyImage(), { captureDraggingState: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!renaming) setRenameTo(layer.name);
  }, [layer, renaming]);

  const finishRename = () => {
    levelEditorStore.renameLayer(layer.id, renameTo);
    setRenaming(false);
  };

  const KindIcon = LAYER_KIND_META[layer.kind].icon;
  const isEntityLayer = layer.kind === "entity";
  const count =
    layer.kind === "tile"
      ? layer.tiles.size
      : isEntityLayer
        ? layer.entities.length
        : 0;

  return (
    <Box>
      <ListItemButton
        ref={wrapperRef}
        dense
        selected={isActive}
        className={cx("layer-item", { over: isOver, dragging })}
        sx={[
          selectableRowSx,
          {
            py: 0.5,
            pl: 0.5,
            pr: 1,
            gap: 0.75,
            position: "relative",
            opacity: isDragging ? 0.35 : 1,
            "& .layer-row-actions": {
              opacity: 0.55,
              transition: "opacity 150ms"
            },
            "&:hover .layer-row-actions, &.Mui-selected .layer-row-actions": {
              opacity: 1
            }
          }
        ]}
        onClick={() => levelEditorStore.setActiveLayer(layer.id)}
      >
        <IconButton
          size="small"
          sx={{ p: 0.25, visibility: isEntityLayer ? "visible" : "hidden" }}
          tabIndex={isEntityLayer ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            if (isEntityLayer) levelEditorStore.toggleLayerExpanded(layer.id);
          }}
        >
          <Box
            component={ChevronRight}
            size={14}
            sx={{
              transition: "transform 150ms",
              transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)"
            }}
          />
        </IconButton>
        <Tooltip title={LAYER_KIND_META[layer.kind].title}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              color: LAYER_KIND_META[layer.kind].color,
              flexShrink: 0
            }}
          >
            <KindIcon size={14} />
          </Box>
        </Tooltip>
        {renaming ? (
          <InputBase
            autoFocus
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            onBlur={finishRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") finishRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            // Keep cursor-placement clicks from rippling the row underneath.
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            sx={{
              flex: 1,
              fontSize: 13,
              px: 0.5,
              bgcolor: "action.hover",
              borderRadius: 0.5
            }}
          />
        ) : (
          <Typography
            variant="body2"
            noWrap
            sx={{ flex: 1 }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            {layer.name}
          </Typography>
        )}
        {presentMembers.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.4, flexShrink: 0 }}>
            {presentMembers.map((identity, i) => (
              <Tooltip key={i} title={`${identity.name} is editing this layer`}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: identity.color
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        )}
        {count > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              flexShrink: 0,
              bgcolor: "action.selected",
              borderRadius: 2,
              px: 0.75,
              fontSize: 10.5,
              lineHeight: 1.7
            }}
          >
            {count}
          </Typography>
        )}
        <IconButton
          size="small"
          className="layer-row-actions"
          sx={{ p: 0.25, color: layer.visible ? undefined : "text.disabled" }}
          title={layer.visible ? "Hide" : "Show"}
          onClick={(e) => {
            e.stopPropagation();
            levelEditorStore.setLayerVisible(layer.id, !layer.visible);
          }}
        >
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </IconButton>
        <IconButton
          size="small"
          className="layer-row-actions"
          sx={{ p: 0.25 }}
          title="Delete Layer"
          disabled={!canDelete}
          onClick={(e) => {
            e.stopPropagation();
            if (layer.kind === "unknown") {
              dispatch(
                pushModal({
                  modalName: "deleteUnknownLayer",
                  modalArg: { layerId: layer.id, layerName: layer.name }
                })
              );
              return;
            }
            levelEditorStore.removeLayer(layer.id);
          }}
        >
          <X size={14} />
        </IconButton>
        <div
          className={cx("layer-drag-above", { over: isOver })}
          ref={aboveWrapperRef}
        />
        <div
          className={cx("layer-drag-below", { over: isOverBelow })}
          ref={belowWrapperRef}
        />
      </ListItemButton>
      {isEntityLayer && (
        <Collapse in={isExpanded} timeout={150} unmountOnExit>
          <List
            dense
            disablePadding
            sx={{ ml: 2.25, borderLeft: 1, borderColor: "divider" }}
          >
            {layer.entities.length === 0 ? (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ pl: 2, py: 0.25, fontStyle: "italic", display: "block" }}
              >
                No entities
              </Typography>
            ) : (
              layer.entities.map((entity) => (
                <LayerEntityRow
                  key={entity.id}
                  entity={entity}
                  layerId={layer.id}
                  isSelected={selectedEntityIds.includes(entity.id)}
                />
              ))
            )}
          </List>
        </Collapse>
      )}
    </Box>
  );
}

type LayerPanelProps = {
  layerHeight?: number;
};

export function LayerPanel({ layerHeight }: LayerPanelProps) {
  const memberLayerPresence = useMemberLayerPresence();
  const { layers, activeLayerId, highlightActiveLayer, selectedEntityIds } =
    useLevelEditorSelector(
      (s) => {
        const st = s.getState();
        return {
          layers: st.layers,
          activeLayerId: st.activeLayerId,
          highlightActiveLayer: st.highlightActiveLayer,
          selectedEntityIds: st.selectedEntityIds
        };
      },
      ["layersChanged", "selectionChanged"],
      (a, b) =>
        a.layers === b.layers &&
        a.activeLayerId === b.activeLayerId &&
        a.highlightActiveLayer === b.highlightActiveLayer &&
        a.selectedEntityIds === b.selectedEntityIds
    );
  const expandedLayerIds = useLevelEditorSelector(
    (s) => s.getUI().expandedLayerIds,
    ["uiChanged"]
  );

  const onAddTileLayer = useCallback(() => {
    levelEditorStore.pushUndo();
    levelEditorStore.addLayer();
  }, []);

  const onAddEntityLayer = useCallback(() => {
    levelEditorStore.pushUndo();
    levelEditorStore.addEntityLayer();
  }, []);

  const tileLayerCount = layers.filter((l) => l.kind === "tile").length;
  const entityLayerCount = layers.filter((l) => l.kind === "entity").length;
  // Image layers can always be deleted (no minimum count)

  return (
    <Box
      data-testid="layer-panel"
      sx={{
        borderTop: 1,
        borderColor: "divider",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        maxHeight: layerHeight ?? 200,
        height: layerHeight
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          px: 1,
          py: 0.25,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "action.hover"
        }}
      >
        <Typography variant="overline" sx={[panelHeaderTextSx, { flex: 1 }]}>
          Layers
        </Typography>
        <Tooltip title="Highlight active layer (H)">
          <IconButton
            size="small"
            color={highlightActiveLayer ? "primary" : "default"}
            data-testid="layer-highlight-toggle"
            onClick={() => levelEditorStore.toggleLayerHighlight()}
          >
            <Lightbulb size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add tile layer">
          <IconButton size="small" onClick={onAddTileLayer}>
            <Grid3x3 size={15} />
            <Plus size={10} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add entity layer">
          <IconButton size="small" onClick={onAddEntityLayer}>
            <Users size={15} />
            <Plus size={10} />
          </IconButton>
        </Tooltip>
      </Stack>
      <List dense disablePadding sx={{ overflowY: "auto", flex: 1, py: 0.25 }}>
        {[...layers].reverse().map((layer, i) => {
          const isActive = layer.id === activeLayerId;
          const canDelete =
            layer.kind === "tile"
              ? tileLayerCount > 1
              : layer.kind === "entity"
                ? entityLayerCount > 1
                : true;
          return (
            <LayerPanelLayer
              key={layer.id}
              layer={layer}
              layerIndex={layers.length - 1 - i}
              isActive={isActive}
              canDelete={canDelete}
              isExpanded={expandedLayerIds.includes(layer.id)}
              selectedEntityIds={selectedEntityIds}
              presentMembers={
                memberLayerPresence.get(layer.id) ?? NO_PRESENT_MEMBERS
              }
            />
          );
        })}
      </List>
    </Box>
  );
}
