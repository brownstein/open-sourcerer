import {
  Box,
  Button,
  Checkbox,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
  alpha
} from "@mui/material";
import {
  ChevronDown,
  ChevronRight,
  Crosshair,
  Pencil,
  Plus,
  X
} from "lucide-react";
import { ReactNode, useCallback, useEffect, useState } from "react";

import { kLoaderAssignedEntityProps } from "src/engine/level/tiled/parseMap";
import entityMetadataRaw from "src/entities/metadata/allEntitiesMetadata.json";
import {
  EntityArgEntry,
  EntityTypeSignature,
  PrimitiveTypeName,
  ValueSchema
} from "src/entities/metadata/metadataTypes";
import { useAppDispatch } from "src/redux/hooks";
import { pushModalTyped } from "src/redux/shared/actions";

import { levelEditorStore } from "./LevelEditorStore";
import { ENTITY_DEFAULTS } from "./entityDefaults";
import { isEntityRefValue, resolveEntityRef } from "./entityRefs";
import {
  EditorLayer,
  TiledProperty,
  findEntityInLayers
} from "./levelEditorState";
import { PanelHeader } from "./sharedEditorStyles";
import { useLevelEditorSelector } from "./useLevelEditorStore";

const entityMetadata = entityMetadataRaw as EntityTypeSignature[];

// Args with their own rows above, plus the ones the loader overwrites on load,
// where offering an editor would only mislead.
const PANEL_MANAGED_ARG_NAMES = new Set<string>([
  "name",
  "x",
  "y",
  "angle",
  "width",
  "height",
  "position",
  "size",
  "opacity",
  ...kLoaderAssignedEntityProps
]);

const FIELD_INPUT_SX = {
  flex: 1,
  minWidth: 0,
  "& .MuiInputBase-input": { py: 0.6, px: 1, fontSize: 13 }
};

// A single-line input can neither hold nor let you author control characters,
// so their presence marks a value that was authored in the multiline modal.
function isMultilineValue(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function collapseToPreview(value: string): string {
  const firstLine = value.split("\n", 1)[0];
  return value.length > firstLine.length ? `${firstLine} …` : firstLine;
}

// Single-line string editor with an attached button that opens the multiline
// modal. Once a value carries control characters it is shown read-only as a
// collapsed preview; editing is only possible through the modal until the
// property is reset.
function StringPropertyField({
  entityId,
  propName,
  index,
  path,
  value,
  placeholder,
  onChange
}: {
  entityId: string;
  propName: string;
  index?: number;
  path?: (string | number)[];
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const dispatch = useAppDispatch();
  const multiline = isMultilineValue(value);

  const openModal = () =>
    dispatch(
      pushModalTyped({
        modalName: "levelEditorPropText",
        modalArg: { entityId, propName, index, path, initialValue: value }
      })
    );

  const fieldSx = multiline
    ? {
        ...FIELD_INPUT_SX,
        "& .MuiInputBase-input": {
          ...FIELD_INPUT_SX["& .MuiInputBase-input"],
          fontStyle: "italic",
          opacity: 0.75
        }
      }
    : FIELD_INPUT_SX;

  return (
    <TextField
      size="small"
      sx={fieldSx}
      value={multiline ? collapseToPreview(value) : value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      slotProps={{
        input: {
          readOnly: multiline,
          endAdornment: (
            <InputAdornment position="end" sx={{ ml: 0 }}>
              <IconButton
                size="small"
                edge="end"
                color={multiline ? "primary" : "default"}
                sx={{ p: 0.25 }}
                title="Edit as multiline text"
                onClick={openModal}
              >
                <Pencil size={12} />
              </IconButton>
            </InputAdornment>
          )
        }
      }}
    />
  );
}

function PropertyRow({
  label,
  labelTitle,
  children,
  onDelete,
  propertyState = "builtIn"
}: {
  label: string;
  labelTitle?: string;
  children: ReactNode;
  onDelete?: () => void;
  propertyState?: "builtIn" | "overridden" | "unset";
}) {
  const isUnset = propertyState === "unset";
  const isOverridden = propertyState === "overridden";

  return (
    <Box
      sx={(theme) => ({
        display: "grid",
        // The label column grows with its content so property names are not
        // truncated; the control takes whatever width remains.
        gridTemplateColumns: onDelete
          ? "minmax(72px, max-content) minmax(80px, 1fr) auto"
          : "minmax(72px, max-content) minmax(80px, 1fr)",
        alignItems: "center",
        columnGap: 1,
        px: 1.5,
        py: 0.5,
        transition: theme.transitions.create(["opacity", "box-shadow"], {
          duration: theme.transitions.duration.shorter
        }),
        "& .MuiCheckbox-root": { justifySelf: "start" },
        ...(isUnset && {
          opacity: 0.45,
          "&:hover": { opacity: 0.7 },
          "&:focus-within": { opacity: 1 }
        }),
        ...(isOverridden && {
          // left accent bar for overriden props
          boxShadow: `inset 3px 0 0 0 ${theme.palette.primary.main}`
        })
      })}
    >
      <Typography
        variant="caption"
        color={isOverridden ? "text.primary" : "text.secondary"}
        title={labelTitle}
        sx={{
          overflowWrap: "anywhere",
          maxWidth: 190,
          fontWeight: isOverridden ? 600 : 400
        }}
      >
        {label}
      </Typography>
      {children}
      {onDelete && (
        <IconButton
          size="small"
          sx={{ p: 0.25 }}
          title="Delete"
          onClick={onDelete}
        >
          <X size={12} />
        </IconButton>
      )}
    </Box>
  );
}

const INLINE_BUTTON_SX = {
  textTransform: "none",
  minWidth: 0,
  py: 0,
  px: 0.75,
  fontSize: 12,
  "& .MuiButton-startIcon": { mr: 0.25 }
} as const;

// The accent bar sits at the left edge of a top-level prop, and a missing row
// nested inside one paints over that same column, so these have to agree.
const PANEL_GUTTER_PX = 12;
const RAIL_MARGIN_PX = 6;
const RAIL_BORDER_PX = 1;
const RAIL_PADDING_PX = 6;
const RAIL_INDENT_PX = RAIL_MARGIN_PX + RAIL_BORDER_PX + RAIL_PADDING_PX;
const ACCENT_WIDTH_PX = 3;

const RECORD_KEY_FIELD_SX = {
  width: 104,
  "& .MuiInputBase-input": { py: 0.3, px: 0.75, fontSize: 12, fontWeight: 600 }
};

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function defaultValueForSchema(schema: ValueSchema): unknown {
  switch (schema.kind) {
    case "boolean":
      return false;
    case "number":
      return 0;
    case "string":
      return "";
    case "array":
      return [];
    case "entityRef":
      return undefined;
    default:
      return {};
  }
}

function withoutKey(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const next = { ...record };
  delete next[key];
  return next;
}

function withRenamedKey(
  record: Record<string, unknown>,
  fromKey: string,
  toKey: string
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    next[key === fromKey ? toKey : key] = value;
  }
  return next;
}

function unusedRecordKey(record: Record<string, unknown>): string {
  let index = 1;
  while (`key${index}` in record) index++;
  return `key${index}`;
}

function commitSchemaValue(
  entityId: string,
  propName: string,
  path: (string | number)[],
  value: unknown
) {
  levelEditorStore.pushUndo();
  levelEditorStore.updateEntityPropertyAtPath(entityId, propName, path, value);
}

function SchemaRow({
  label,
  muted,
  strong,
  missing,
  children,
  actions
}: {
  label: ReactNode;
  muted?: boolean;
  strong?: boolean;
  missing?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Box
      sx={(theme) => ({
        display: "grid",
        gridTemplateColumns: "minmax(56px, max-content) minmax(72px, 1fr) auto",
        alignItems: "center",
        columnGap: 1,
        pr: 1.5,
        py: 0.25,
        minHeight: 30,
        transition: theme.transitions.create(["opacity"], {
          duration: theme.transitions.duration.shorter
        }),
        "& .MuiCheckbox-root": { justifySelf: "start" },
        ...(muted && {
          opacity: 0.5,
          "&:hover": { opacity: 0.85 },
          "&:focus-within": { opacity: 1 }
        })
      })}
    >
      {typeof label === "string" ? (
        <Typography
          variant="caption"
          color={
            missing ? "error.main" : muted ? "text.secondary" : "text.primary"
          }
          sx={{
            overflowWrap: "anywhere",
            maxWidth: 190,
            fontWeight: strong ? 600 : 400
          }}
        >
          {label}
        </Typography>
      ) : (
        label
      )}
      {children}
      <Stack direction="row" sx={{ alignItems: "center" }}>
        {actions}
      </Stack>
    </Box>
  );
}

function SchemaChildren({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(theme) => ({
        ml: `${RAIL_MARGIN_PX}px`,
        pl: `${RAIL_PADDING_PX}px`,
        borderLeft: `${RAIL_BORDER_PX}px solid ${alpha(
          theme.palette.text.primary,
          0.18
        )}`
      })}
    >
      {children}
    </Box>
  );
}

function SchemaContainerHeader({
  label,
  isSet,
  missing,
  summary,
  expanded,
  onToggleExpanded,
  onAdd,
  onDelete
}: {
  label: ReactNode;
  isSet: boolean;
  missing: boolean;
  summary?: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
}) {
  const muted = !isSet && !missing;
  return (
    <SchemaRow
      muted={muted}
      missing={missing}
      label={
        <Stack
          direction="row"
          spacing={0.25}
          sx={{ alignItems: "center", minWidth: 0 }}
        >
          <IconButton
            size="small"
            sx={{ p: 0.25 }}
            title={expanded ? "Collapse" : "Expand"}
            onClick={onToggleExpanded}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </IconButton>
          {typeof label === "string" ? (
            <Typography
              variant="caption"
              color={
                missing
                  ? "error.main"
                  : muted
                    ? "text.secondary"
                    : "text.primary"
              }
              sx={{ overflowWrap: "anywhere", fontWeight: 600 }}
            >
              {label}
            </Typography>
          ) : (
            label
          )}
        </Stack>
      }
      actions={
        <>
          {onAdd && (
            <Button
              size="small"
              startIcon={<Plus size={12} />}
              onClick={onAdd}
              sx={INLINE_BUTTON_SX}
            >
              Add
            </Button>
          )}
          {onDelete && (
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              title="Clear"
              onClick={onDelete}
            >
              <X size={12} />
            </IconButton>
          )}
        </>
      }
    >
      {summary && (
        <Typography variant="caption" color="text.secondary">
          {summary}
        </Typography>
      )}
    </SchemaRow>
  );
}

type SchemaFieldProps<S extends ValueSchema = ValueSchema> = {
  entityId: string;
  propName: string;
  /** Location of this value inside the top-level property. */
  path: (string | number)[];
  /** Nesting level, used to reach back to the prop's accent column. */
  depth: number;
  label: ReactNode;
  schema: S;
  value: unknown;
  /** Required in a container that exists, but absent. Flagged rather than
   *  blocked, so a half-built entity is still saveable. */
  missing: boolean;
  /** Shown in an empty field so a metadata default reads as the live value. */
  placeholder?: string;
  /** Top-level props are emphasized the way the built-in rows above are. */
  strong?: boolean;
  /** Clears this value, rewriting whatever contains it. */
  onDelete?: () => void;
};

function RecordKeyField({
  value,
  autoFocus,
  onRename
}: {
  value: string;
  autoFocus: boolean;
  onRename: (next: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    if (!next || !onRename(next)) setDraft(value);
  };

  return (
    <TextField
      size="small"
      autoFocus={autoFocus}
      sx={RECORD_KEY_FIELD_SX}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
        }
      }}
    />
  );
}

function SchemaPrimitiveField(
  props: SchemaFieldProps<Extract<ValueSchema, { kind: PrimitiveTypeName }>>
) {
  const {
    entityId,
    propName,
    path,
    label,
    schema,
    value,
    missing,
    placeholder,
    strong,
    onDelete
  } = props;
  const isSet = value !== undefined;
  const commit = (next: unknown) =>
    commitSchemaValue(entityId, propName, path, next);

  const enumValues = schema.enumValues;
  let control: ReactNode;
  if (schema.kind === "boolean") {
    control = (
      <Checkbox
        size="small"
        sx={{ p: 0.25 }}
        checked={Boolean(value)}
        onChange={(e) => commit(e.target.checked)}
      />
    );
  } else if (enumValues && enumValues.length > 0) {
    control = (
      <TextField
        size="small"
        select
        sx={FIELD_INPUT_SX}
        value={String(value ?? "")}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") onDelete?.();
          else commit(raw);
        }}
      >
        <MenuItem value="">{"< unset >"}</MenuItem>
        {enumValues.map((enumValue) => (
          <MenuItem key={enumValue} value={enumValue}>
            {enumValue}
          </MenuItem>
        ))}
      </TextField>
    );
  } else if (schema.kind === "number") {
    control = (
      <TextField
        size="small"
        type="number"
        sx={FIELD_INPUT_SX}
        value={value != null ? String(value) : ""}
        placeholder={placeholder}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (e.target.value === "" || Number.isNaN(parsed)) return;
          commit(parsed);
        }}
      />
    );
  } else {
    control = (
      <StringPropertyField
        entityId={entityId}
        propName={propName}
        path={path}
        value={value != null ? String(value) : ""}
        placeholder={placeholder}
        onChange={commit}
      />
    );
  }

  return (
    <SchemaRow
      label={label}
      muted={!isSet && !missing}
      strong={strong && isSet}
      missing={missing}
      actions={
        isSet && onDelete ? (
          <IconButton
            size="small"
            sx={{ p: 0.25 }}
            title="Clear"
            onClick={onDelete}
          >
            <X size={12} />
          </IconButton>
        ) : null
      }
    >
      {control}
    </SchemaRow>
  );
}

function SchemaEntityRefField(
  props: SchemaFieldProps<Extract<ValueSchema, { kind: "entityRef" }>>
) {
  const { entityId, propName, label, value, missing, strong, onDelete } = props;
  const layers = useLevelEditorSelector(
    (s) => s.getState().layers,
    ["layersChanged"]
  );
  const pick = useLevelEditorSelector(
    (s) => s.getState().entityRefPick,
    ["entityRefPickChanged"]
  );
  const isPicking = pick?.entityId === entityId && pick.propName === propName;

  const hasValue = isEntityRefValue(value);
  const target = hasValue ? resolveEntityRef(layers, value) : null;
  const targetId = target?.id ?? null;

  // Leaving the panel (deselect, delete, tool switch) has to leave pick mode
  // too, or the canvas keeps swallowing clicks for a prop nobody can see.
  useEffect(() => {
    if (!isPicking) return;
    return () => levelEditorStore.clearEntityRefPick({ entityId, propName });
  }, [isPicking, entityId, propName]);

  useEffect(() => {
    return () => {
      if (levelEditorStore.getState().entityRefHoverEntityId === targetId) {
        levelEditorStore.setEntityRefHoverEntityId(null);
      }
    };
  }, [targetId]);

  const targetName = target?.properties?.name;
  const chipText = target
    ? [
        target.type,
        typeof targetName === "string" && targetName ? `"${targetName}"` : null,
        target.tiledObjectId !== undefined ? `#${target.tiledObjectId}` : null
      ]
        .filter((segment) => segment !== null)
        .join(" · ")
    : hasValue
      ? `${typeof value === "number" ? `#${value}` : "target"} · missing`
      : "None";

  return (
    <SchemaRow
      label={label}
      muted={!hasValue && !missing}
      strong={strong && hasValue}
      missing={missing}
      actions={
        <>
          <IconButton
            size="small"
            sx={{ p: 0.25 }}
            color={isPicking ? "primary" : "default"}
            title="Pick a target entity in the viewport"
            onClick={() =>
              levelEditorStore.setEntityRefPick(
                isPicking ? null : { entityId, propName }
              )
            }
          >
            <Crosshair size={12} />
          </IconButton>
          {hasValue && onDelete && (
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              title="Clear"
              onClick={onDelete}
            >
              <X size={12} />
            </IconButton>
          )}
        </>
      }
    >
      <Box
        onClick={() => {
          if (!target) return;
          levelEditorStore.setCamera({
            x: target.tileX + 0.5,
            y: target.tileY + 0.5
          });
        }}
        onMouseEnter={() =>
          levelEditorStore.setEntityRefHoverEntityId(targetId)
        }
        onMouseLeave={() => levelEditorStore.setEntityRefHoverEntityId(null)}
        sx={(theme) => ({
          justifySelf: "start",
          maxWidth: "100%",
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          border: `1px solid ${alpha(theme.palette.text.primary, 0.25)}`,
          fontSize: 12,
          lineHeight: 1.6,
          overflowWrap: "anywhere",
          cursor: target ? "pointer" : "default",
          color:
            hasValue && !target
              ? theme.palette.error.main
              : target
                ? theme.palette.text.primary
                : theme.palette.text.disabled,
          ...(target && {
            "&:hover": { borderColor: theme.palette.primary.main }
          })
        })}
      >
        {chipText}
      </Box>
    </SchemaRow>
  );
}

// Members always show: editing one creates the objects above it.
function SchemaObjectField(
  props: SchemaFieldProps<Extract<ValueSchema, { kind: "object" }>>
) {
  const { entityId, propName, path, depth, label, schema, value, missing } =
    props;
  const [expanded, setExpanded] = useState(true);
  const members = isPlainObjectValue(value) ? value : undefined;

  return (
    <>
      <SchemaContainerHeader
        label={label}
        isSet={!!members}
        missing={missing}
        expanded={expanded}
        onToggleExpanded={() => setExpanded(!expanded)}
        onDelete={members ? props.onDelete : undefined}
      />
      {expanded && (
        <SchemaChildren>
          {schema.members.map((member) => (
            <SchemaField
              key={member.name}
              entityId={entityId}
              propName={propName}
              path={[...path, member.name]}
              depth={depth + 1}
              label={member.name}
              schema={member.schema}
              value={members?.[member.name]}
              missing={
                !member.optional &&
                members !== undefined &&
                members[member.name] === undefined
              }
              onDelete={
                members &&
                (() =>
                  commitSchemaValue(
                    entityId,
                    propName,
                    path,
                    withoutKey(members, member.name)
                  ))
              }
            />
          ))}
        </SchemaChildren>
      )}
    </>
  );
}

function SchemaArrayField(
  props: SchemaFieldProps<Extract<ValueSchema, { kind: "array" }>>
) {
  const { entityId, propName, path, depth, label, schema, value, missing } =
    props;
  const [expanded, setExpanded] = useState(true);
  const items = Array.isArray(value) ? value : undefined;

  return (
    <>
      <SchemaContainerHeader
        label={label}
        isSet={!!items}
        missing={missing}
        summary={
          items
            ? `${items.length} item${items.length === 1 ? "" : "s"}`
            : "not set"
        }
        expanded={expanded}
        onToggleExpanded={() => setExpanded(!expanded)}
        onAdd={() => {
          setExpanded(true);
          commitSchemaValue(entityId, propName, path, [
            ...(items ?? []),
            defaultValueForSchema(schema.element)
          ]);
        }}
        onDelete={items ? props.onDelete : undefined}
      />
      {expanded && items && items.length > 0 && (
        <SchemaChildren>
          {items.map((item, index) => (
            <SchemaField
              key={index}
              entityId={entityId}
              propName={propName}
              path={[...path, index]}
              depth={depth + 1}
              label={`${index}`}
              schema={schema.element}
              value={item}
              missing={false}
              onDelete={() =>
                commitSchemaValue(
                  entityId,
                  propName,
                  path,
                  items.filter((_, other) => other !== index)
                )
              }
            />
          ))}
        </SchemaChildren>
      )}
    </>
  );
}

function SchemaRecordField(
  props: SchemaFieldProps<Extract<ValueSchema, { kind: "record" }>>
) {
  const { entityId, propName, path, depth, label, schema, value, missing } =
    props;
  const [expanded, setExpanded] = useState(true);
  const [keyToFocus, setKeyToFocus] = useState<string | null>(null);
  const entries = isPlainObjectValue(value) ? value : undefined;
  const keys = entries ? Object.keys(entries) : [];

  const onAddKey = () => {
    const key = unusedRecordKey(entries ?? {});
    setExpanded(true);
    setKeyToFocus(key);
    commitSchemaValue(entityId, propName, path, {
      ...entries,
      [key]: defaultValueForSchema(schema.value)
    });
  };

  return (
    <>
      <SchemaContainerHeader
        label={label}
        isSet={!!entries}
        missing={missing}
        summary={
          entries
            ? `${keys.length} key${keys.length === 1 ? "" : "s"}`
            : "not set"
        }
        expanded={expanded}
        onToggleExpanded={() => setExpanded(!expanded)}
        onAdd={onAddKey}
        onDelete={entries ? props.onDelete : undefined}
      />
      {expanded && entries && keys.length > 0 && (
        <SchemaChildren>
          {keys.map((key, index) => (
            <SchemaField
              key={index}
              entityId={entityId}
              propName={propName}
              path={[...path, key]}
              depth={depth + 1}
              label={
                <RecordKeyField
                  value={key}
                  autoFocus={key === keyToFocus}
                  onRename={(next) => {
                    if (next in entries) return false;
                    commitSchemaValue(
                      entityId,
                      propName,
                      path,
                      withRenamedKey(entries, key, next)
                    );
                    return true;
                  }}
                />
              }
              schema={schema.value}
              value={entries[key]}
              missing={false}
              onDelete={() =>
                commitSchemaValue(
                  entityId,
                  propName,
                  path,
                  withoutKey(entries, key)
                )
              }
            />
          ))}
        </SchemaChildren>
      )}
    </>
  );
}

function SchemaField(props: SchemaFieldProps) {
  const { schema, missing, strong, value, depth } = props;
  const field =
    schema.kind === "object" ? (
      <SchemaObjectField {...props} schema={schema} />
    ) : schema.kind === "record" ? (
      <SchemaRecordField {...props} schema={schema} />
    ) : schema.kind === "array" ? (
      <SchemaArrayField {...props} schema={schema} />
    ) : schema.kind === "entityRef" ? (
      <SchemaEntityRefField {...props} schema={schema} />
    ) : (
      <SchemaPrimitiveField {...props} schema={schema} />
    );

  return (
    <Box
      sx={(theme) => ({
        // Top-level props own the panel gutter and the gap to their neighbour,
        // both inside the bar so consecutive set props read as one run. The bar
        // spans everything the field renders, not just its header row.
        pl: strong ? `${PANEL_GUTTER_PX}px` : 0,
        py: strong ? 0.5 : 0,
        ...(strong && {
          boxShadow: missing
            ? `inset ${ACCENT_WIDTH_PX}px 0 0 0 ${theme.palette.error.main}`
            : value !== undefined
              ? `inset ${ACCENT_WIDTH_PX}px 0 0 0 ${theme.palette.primary.main}`
              : undefined
        }),
        // Reach back out to the prop's column so the red reads as that stretch
        // of the one bar rather than a mark of its own.
        ...(!strong &&
          missing && {
            position: "relative",
            "&::before": {
              content: '""',
              position: "absolute",
              left: `-${PANEL_GUTTER_PX + RAIL_INDENT_PX * depth}px`,
              top: 0,
              bottom: 0,
              width: `${ACCENT_WIDTH_PX}px`,
              backgroundColor: theme.palette.error.main
            }
          })
      })}
    >
      {field}
    </Box>
  );
}

// Editor for a prop whose entity metadata describes an object shape.
function SchemaPropertyInput({
  entityId,
  propName,
  schema,
  value,
  optional,
  defaultValue
}: {
  entityId: string;
  propName: string;
  schema: ValueSchema;
  value: unknown;
  optional: boolean;
  defaultValue?: EntityArgEntry["defaultValue"];
}) {
  return (
    <SchemaField
      entityId={entityId}
      propName={propName}
      path={[]}
      depth={0}
      label={propName}
      schema={schema}
      value={value}
      missing={!optional && defaultValue === undefined && value === undefined}
      placeholder={defaultValue != null ? String(defaultValue) : undefined}
      strong
      onDelete={() => {
        levelEditorStore.pushUndo();
        levelEditorStore.deleteEntityProperty(entityId, propName);
      }}
    />
  );
}

// Read-only: with no shape to edit against, the value has to survive intact.
function OpaqueValueRow({
  propName,
  value,
  onDelete
}: {
  propName: string;
  value: unknown;
  onDelete: () => void;
}) {
  return (
    <PropertyRow
      label={propName}
      labelTitle="No shape in entity metadata, preserved as-is"
      onDelete={onDelete}
      propertyState="overridden"
    >
      <TextField
        size="small"
        multiline
        maxRows={6}
        sx={FIELD_INPUT_SX}
        value={JSON.stringify(value, null, 2)}
        slotProps={{ input: { readOnly: true } }}
      />
    </PropertyRow>
  );
}

function LayerPropertyInput({
  prop,
  layerId
}: {
  prop: TiledProperty;
  layerId: string;
}) {
  const update = (value: unknown) => {
    levelEditorStore.pushUndo();
    levelEditorStore.updateLayerProperty(layerId, {
      name: prop.name,
      type: prop.type,
      value
    });
  };

  if (prop.type === "bool") {
    return (
      <Checkbox
        size="small"
        sx={{ p: 0.25 }}
        checked={!!prop.value}
        onChange={(e) => update(e.target.checked)}
      />
    );
  }

  if (prop.type === "float" || prop.type === "int") {
    return (
      <TextField
        size="small"
        type="number"
        sx={FIELD_INPUT_SX}
        value={(prop.value as number) ?? 0}
        slotProps={{ htmlInput: { step: prop.type === "float" ? 0.1 : 1 } }}
        onChange={(e) => {
          const raw = e.target.value;
          const parsed =
            prop.type === "float" ? parseFloat(raw) : parseInt(raw, 10);
          if (raw === "" || isNaN(parsed)) return;
          update(parsed);
        }}
      />
    );
  }

  if (prop.type === "string") {
    return (
      <TextField
        size="small"
        sx={FIELD_INPUT_SX}
        value={String(prop.value ?? "")}
        onChange={(e) => update(e.target.value)}
      />
    );
  }
  return null;
}

const LAYER_FLAG_TYPES = ["bool", "int", "float", "string"];

function LayerProperties({ layer }: { layer: EditorLayer }) {
  const [newFlagName, setNewFlagName] = useState("");
  const [newFlagType, setNewFlagType] = useState("float");

  const kindLabel =
    layer.kind === "tile"
      ? "Tile Layer"
      : layer.kind === "image"
        ? "Image Layer"
        : layer.kind === "unknown"
          ? "Unknown Layer (preserved as-is)"
          : "Entity Layer";

  const hasOpacity = layer.kind === "tile" || layer.kind === "image";
  const hasParallax = layer.kind === "tile" || layer.kind === "image";
  const opacity = hasOpacity
    ? (layer as { opacity: number }).opacity
    : undefined;
  const parallaxx = hasParallax
    ? (layer as { parallaxx?: number }).parallaxx
    : undefined;
  const parallaxy = hasParallax
    ? (layer as { parallaxy?: number }).parallaxy
    : undefined;

  const onAddFlag = useCallback(() => {
    const name = newFlagName.trim();
    if (!name) return;
    const defaultValue =
      newFlagType === "bool" ? false : newFlagType === "string" ? "" : 0;
    levelEditorStore.pushUndo();
    levelEditorStore.updateLayerProperty(layer.id, {
      name,
      type: newFlagType,
      value: defaultValue
    });
    setNewFlagName("");
  }, [newFlagName, newFlagType, layer.id]);

  return (
    <>
      <PropertyRow label="Kind">
        <Typography variant="body2">{kindLabel}</Typography>
      </PropertyRow>

      <PropertyRow label="Name">
        <TextField
          size="small"
          sx={FIELD_INPUT_SX}
          value={layer.name}
          onChange={(e) =>
            levelEditorStore.renameLayer(layer.id, e.target.value)
          }
        />
      </PropertyRow>

      <PropertyRow label="Visible">
        <Checkbox
          size="small"
          sx={{ p: 0.25 }}
          checked={layer.visible}
          onChange={(e) =>
            levelEditorStore.setLayerVisible(layer.id, e.target.checked)
          }
        />
      </PropertyRow>

      {hasOpacity && (
        <PropertyRow label="Opacity">
          <TextField
            size="small"
            type="number"
            sx={FIELD_INPUT_SX}
            value={opacity ?? 1}
            slotProps={{ htmlInput: { step: 0.1, min: 0, max: 1 } }}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                levelEditorStore.setLayerOpacity(layer.id, val);
              }
            }}
          />
        </PropertyRow>
      )}

      {hasParallax && (
        <>
          <PropertyRow label="Parallax X">
            <TextField
              size="small"
              type="number"
              sx={FIELD_INPUT_SX}
              value={parallaxx ?? ""}
              placeholder="1"
              slotProps={{ htmlInput: { step: 0.1 } }}
              onChange={(e) => {
                const raw = e.target.value;
                levelEditorStore.setLayerParallax(
                  layer.id,
                  raw === "" ? undefined : parseFloat(raw) || undefined,
                  parallaxy
                );
              }}
            />
          </PropertyRow>
          <PropertyRow label="Parallax Y">
            <TextField
              size="small"
              type="number"
              sx={FIELD_INPUT_SX}
              value={parallaxy ?? ""}
              placeholder="1"
              slotProps={{ htmlInput: { step: 0.1 } }}
              onChange={(e) => {
                const raw = e.target.value;
                levelEditorStore.setLayerParallax(
                  layer.id,
                  parallaxx,
                  raw === "" ? undefined : parseFloat(raw) || undefined
                );
              }}
            />
          </PropertyRow>
        </>
      )}

      {layer.kind === "image" && (
        <>
          <PropertyRow label="Image" labelTitle={layer.imagePath}>
            <Typography variant="body2" noWrap>
              {layer.imageName}
            </Typography>
          </PropertyRow>
          <PropertyRow label="Offset X">
            <Typography variant="body2">{layer.offsetx}</Typography>
          </PropertyRow>
          <PropertyRow label="Offset Y">
            <Typography variant="body2">{layer.offsety}</Typography>
          </PropertyRow>
        </>
      )}

      {/* Flags on an unknown layer would be dropped by the verbatim
          re-export, so the editor doesn't offer them. */}
      {layer.kind !== "unknown" && (
        <>
          <Box sx={{ mt: 1 }}>
            <PanelHeader>Flags</PanelHeader>
          </Box>

          {layer.tiledProperties?.map((prop) => (
            <PropertyRow
              key={prop.name}
              label={prop.name}
              labelTitle={`type: ${prop.type}`}
              onDelete={() => {
                levelEditorStore.pushUndo();
                levelEditorStore.deleteLayerProperty(layer.id, prop.name);
              }}
            >
              <LayerPropertyInput prop={prop} layerId={layer.id} />
            </PropertyRow>
          ))}

          <Stack direction="row" spacing={0.5} sx={{ px: 1.5, py: 0.5 }}>
            <TextField
              size="small"
              placeholder="flag name"
              sx={FIELD_INPUT_SX}
              value={newFlagName}
              onChange={(e) => setNewFlagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddFlag();
              }}
            />
            <TextField
              size="small"
              select
              sx={{ ...FIELD_INPUT_SX, width: 80, flex: "none" }}
              value={newFlagType}
              onChange={(e) => setNewFlagType(e.target.value)}
            >
              {LAYER_FLAG_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
            <IconButton size="small" onClick={onAddFlag} title="Add flag">
              <Plus size={14} />
            </IconButton>
          </Stack>
        </>
      )}
    </>
  );
}

export function PropertiesPanel() {
  const { layers, activeLayerId, selectedEntityIds } = useLevelEditorSelector(
    (s) => {
      const st = s.getState();
      return {
        layers: st.layers,
        activeLayerId: st.activeLayerId,
        selectedEntityIds: st.selectedEntityIds
      };
    },
    ["layersChanged", "selectionChanged"],
    (a, b) =>
      a.layers === b.layers &&
      a.activeLayerId === b.activeLayerId &&
      a.selectedEntityIds === b.selectedEntityIds
  );

  const entity =
    selectedEntityIds.length === 1
      ? findEntityInLayers(layers, selectedEntityIds[0])
      : null;

  const [newPropName, setNewPropName] = useState("");
  const [newPropValue, setNewPropValue] = useState("");

  const onAddProperty = useCallback(() => {
    if (!entity || !newPropName.trim()) return;
    levelEditorStore.pushUndo();
    let parsedValue: unknown = newPropValue;
    if (newPropValue === "true") parsedValue = true;
    else if (newPropValue === "false") parsedValue = false;
    else if (newPropValue !== "" && !isNaN(Number(newPropValue)))
      parsedValue = Number(newPropValue);
    levelEditorStore.updateEntityProperties(entity.id, {
      [newPropName.trim()]: parsedValue
    });
    setNewPropName("");
    setNewPropValue("");
  }, [entity, newPropName, newPropValue]);

  const onDeleteProperty = useCallback(
    (key: string) => {
      if (!entity) return;
      levelEditorStore.pushUndo();
      levelEditorStore.deleteEntityProperty(entity.id, key);
    },
    [entity]
  );

  const onRemove = useCallback(() => {
    if (!entity) return;
    levelEditorStore.pushUndo();
    levelEditorStore.removeEntity(entity.id);
  }, [entity]);

  const onChangePosition = useCallback(
    (axis: "tileX" | "tileY", value: string) => {
      if (!entity) return;
      const num = parseInt(value);
      if (isNaN(num)) return;
      levelEditorStore.pushUndo();
      levelEditorStore.moveEntity(
        entity.id,
        axis === "tileX" ? num : entity.tileX,
        axis === "tileY" ? num : entity.tileY
      );
    },
    [entity]
  );

  const onChangeAngle = useCallback(
    (value: string) => {
      if (!entity) return;
      const num = parseFloat(value);
      if (isNaN(num)) return;
      levelEditorStore.pushUndo();
      levelEditorStore.rotateEntity(entity.id, num);
    },
    [entity]
  );

  const onChangeSize = useCallback(
    (dim: "width" | "height", value: string) => {
      if (!entity) return;
      const num = parseInt(value);
      if (isNaN(num) || num < 16) return;
      const defaults = ENTITY_DEFAULTS[entity.type] || {
        width: 32,
        height: 32
      };
      const currentWidth = entity.width ?? defaults.width;
      const currentHeight = entity.height ?? defaults.height;
      levelEditorStore.pushUndo();
      levelEditorStore.resizeEntity(
        entity.id,
        dim === "width" ? num : currentWidth,
        dim === "height" ? num : currentHeight
      );
    },
    [entity]
  );

  // Multi-select: show count and delete button
  if (selectedEntityIds.length > 1) {
    return (
      <Box data-testid="properties-panel" sx={{ overflowY: "auto" }}>
        <PanelHeader>Properties</PanelHeader>
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5 }}>
          {selectedEntityIds.length} entities selected
        </Typography>
        <Button
          variant="outlined"
          color="error"
          size="small"
          sx={{ m: 1.5, textTransform: "none" }}
          onClick={() => {
            levelEditorStore.pushUndo();
            levelEditorStore.removeEntities([...selectedEntityIds]);
          }}
        >
          Delete {selectedEntityIds.length} Entities
        </Button>
      </Box>
    );
  }

  // When no entity is selected, show properties for the active layer
  if (!entity) {
    const activeLayer = layers.find((l) => l.id === activeLayerId);

    return (
      <Box data-testid="properties-panel" sx={{ overflowY: "auto" }}>
        <PanelHeader>Properties</PanelHeader>
        {activeLayer ? (
          <LayerProperties layer={activeLayer} />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5 }}>
            No layer selected
          </Typography>
        )}
      </Box>
    );
  }

  const defaults = ENTITY_DEFAULTS[entity.type] || { width: 32, height: 32 };
  const currentWidth = entity.width ?? defaults.width;
  const currentHeight = entity.height ?? defaults.height;
  const entityMeta = entityMetadata.find((m) => m.name === entity.type);
  const entityArgs = entityMeta?.args ?? [];
  const editableArgs = entityArgs.flatMap((arg) =>
    arg.schema && !PANEL_MANAGED_ARG_NAMES.has(arg.name)
      ? [{ ...arg, schema: arg.schema }]
      : []
  );
  const knownArgNames = new Set(entityArgs.map((arg) => arg.name));
  const hasOpacity =
    entity.properties != null && "opacity" in entity.properties;

  return (
    <Box data-testid="properties-panel" sx={{ overflowY: "auto" }}>
      <PanelHeader>Properties</PanelHeader>

      <PropertyRow label="Type">
        <Typography variant="body2">{entity.type}</Typography>
      </PropertyRow>

      <PropertyRow label="Name">
        <TextField
          size="small"
          sx={FIELD_INPUT_SX}
          placeholder="(unnamed)"
          value={(entity.properties?.name as string) ?? ""}
          onChange={(e) => {
            const val = e.target.value;
            if (val === "") {
              levelEditorStore.deleteEntityProperty(entity.id, "name");
            } else {
              levelEditorStore.updateEntityProperties(entity.id, { name: val });
            }
          }}
        />
      </PropertyRow>

      <PropertyRow label="X">
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={entity.tileX}
          onChange={(e) => onChangePosition("tileX", e.target.value)}
        />
      </PropertyRow>

      <PropertyRow label="Y">
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={entity.tileY}
          onChange={(e) => onChangePosition("tileY", e.target.value)}
        />
      </PropertyRow>

      <PropertyRow label="Angle">
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={entity.angle ?? 0}
          slotProps={{ htmlInput: { step: 15 } }}
          onChange={(e) => onChangeAngle(e.target.value)}
        />
      </PropertyRow>

      <PropertyRow label="Width">
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={currentWidth}
          slotProps={{ htmlInput: { step: 16, min: 16 } }}
          onChange={(e) => onChangeSize("width", e.target.value)}
        />
      </PropertyRow>
      <PropertyRow label="Height">
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={currentHeight}
          slotProps={{ htmlInput: { step: 16, min: 16 } }}
          onChange={(e) => onChangeSize("height", e.target.value)}
        />
      </PropertyRow>

      <PropertyRow
        label="Opacity"
        onDelete={hasOpacity ? () => onDeleteProperty("opacity") : undefined}
        propertyState={hasOpacity ? "overridden" : "unset"}
      >
        <TextField
          size="small"
          type="number"
          sx={FIELD_INPUT_SX}
          value={hasOpacity ? String(entity.properties?.opacity ?? "") : ""}
          placeholder="1"
          slotProps={{ htmlInput: { step: 0.1, min: 0, max: 1 } }}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value);
            if (e.target.value === "" || isNaN(parsed)) return;
            levelEditorStore.pushUndo();
            levelEditorStore.updateEntityProperties(entity.id, {
              opacity: parsed
            });
          }}
        />
      </PropertyRow>

      <Box sx={{ mt: 1 }}>
        <PanelHeader>Entity Props</PanelHeader>
      </Box>

      {editableArgs.length === 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", px: 1.5, py: 0.5 }}
        >
          This entity takes no editable props.
        </Typography>
      )}

      {editableArgs.map((arg) => (
        <SchemaPropertyInput
          key={arg.name}
          entityId={entity.id}
          propName={arg.name}
          schema={arg.schema}
          value={entity.properties?.[arg.name]}
          optional={arg.optional}
          defaultValue={arg.defaultValue}
        />
      ))}

      <Box sx={{ mt: 1 }}>
        <PanelHeader>Custom</PanelHeader>
      </Box>

      {entity.properties &&
        Object.entries(entity.properties)
          .filter(([key]) => {
            if (key === "name") return false;
            return !knownArgNames.has(key);
          })
          .map(([key, value]) =>
            typeof value === "object" && value !== null ? (
              <OpaqueValueRow
                key={key}
                propName={key}
                value={value}
                onDelete={() => onDeleteProperty(key)}
              />
            ) : (
              <PropertyRow
                key={key}
                label={key}
                onDelete={() => onDeleteProperty(key)}
                propertyState="overridden"
              >
                {typeof value === "boolean" ? (
                  <Checkbox
                    size="small"
                    sx={{ p: 0.25 }}
                    checked={value}
                    onChange={(e) => {
                      levelEditorStore.updateEntityProperties(entity.id, {
                        [key]: e.target.checked
                      });
                    }}
                  />
                ) : (
                  <StringPropertyField
                    entityId={entity.id}
                    propName={key}
                    value={String(value)}
                    onChange={(next) => {
                      levelEditorStore.updateEntityProperties(entity.id, {
                        [key]: next
                      });
                    }}
                  />
                )}
              </PropertyRow>
            )
          )}

      <Stack direction="row" spacing={0.5} sx={{ px: 1.5, py: 0.5 }}>
        <TextField
          size="small"
          placeholder="key"
          sx={FIELD_INPUT_SX}
          value={newPropName}
          onChange={(e) => setNewPropName(e.target.value)}
        />
        <TextField
          size="small"
          placeholder="value"
          sx={FIELD_INPUT_SX}
          value={newPropValue}
          onChange={(e) => setNewPropValue(e.target.value)}
        />
        <IconButton size="small" onClick={onAddProperty} title="Add property">
          <Plus size={14} />
        </IconButton>
      </Stack>

      <Button
        variant="outlined"
        color="error"
        size="small"
        sx={{ m: 1.5, textTransform: "none" }}
        onClick={onRemove}
      >
        Delete Entity
      </Button>
    </Box>
  );
}
