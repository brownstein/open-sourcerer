import entityMetadataRaw from "src/entities/metadata/allEntitiesMetadata.json";
import { EntityTypeSignature } from "src/entities/metadata/metadataTypes";

import {
  EditorLayer,
  EntityPlacement,
  findEntityInLayers,
  flattenEntityLayers
} from "./levelEditorState";

const entityMetadata = entityMetadataRaw as EntityTypeSignature[];

const refPropNamesByType = new Map<string, Set<string>>(
  entityMetadata
    .map((signature): [string, Set<string>] => [
      signature.name,
      new Set(
        signature.args
          .filter((arg) => arg.schema?.kind === "entityRef")
          .map((arg) => arg.name)
      )
    ])
    .filter(([, propNames]) => propNames.size > 0)
);

/** Names of the props an entity type declares as `TiledObjectRef`. */
export function entityRefPropNames(
  entityType: string
): Set<string> | undefined {
  return refPropNamesByType.get(entityType);
}

// The editor stores an entityRef as the target's placement id (a string,
// unique by construction even across concurrent peers), so a link can never
// go ambiguous no matter how Tiled object ids collide or get repaired.
// Numbers exist only at the TMJ boundary; a numeric value that survives into
// editor state is a legacy or dangling ref carried verbatim for round-trip.
export function isEntityRefValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function findEntityByTiledObjectId(
  layers: EditorLayer[],
  tiledObjectId: number
): EntityPlacement | null {
  for (const layer of layers) {
    if (layer.kind !== "entity") continue;
    for (const entity of layer.entities) {
      if (entity.tiledObjectId === tiledObjectId) return entity;
    }
  }
  return null;
}

/** The placement an entityRef value points at, in either representation. */
export function resolveEntityRef(
  layers: EditorLayer[],
  value: unknown
): EntityPlacement | null {
  if (typeof value === "string") {
    return findEntityInLayers(layers, value) ?? null;
  }
  if (typeof value === "number" && value !== 0) {
    return findEntityByTiledObjectId(layers, value);
  }
  return null;
}

export type EntityRefLink = { from: EntityPlacement; to: EntityPlacement };

/** Every resolved entityRef in the map, source entity to target entity.
 *  Dangling references are dropped — there is nothing to point an arrow at. */
export function collectEntityRefLinks(layers: EditorLayer[]): EntityRefLink[] {
  const entities = flattenEntityLayers(layers);
  const links: EntityRefLink[] = [];
  for (const entity of entities) {
    const propNames = entityRefPropNames(entity.type);
    if (!propNames || !entity.properties) continue;
    for (const propName of propNames) {
      const target = resolveEntityRef(layers, entity.properties[propName]);
      if (target && target !== entity) links.push({ from: entity, to: target });
    }
  }
  return links;
}

/** Rewrite a pasted entity's refs so links between copied entities point at
 *  the copies (matching Tiled's copy-paste behavior); links to entities
 *  outside the copied set keep pointing at the originals. */
export function remapPastedEntityRefs(
  type: string,
  properties: Record<string, unknown> | undefined,
  copiedOriginals: EntityPlacement[],
  newIdByOriginalId: Map<string, string>
): Record<string, unknown> | undefined {
  const propNames = entityRefPropNames(type);
  if (!propNames || !properties) return properties;
  let remapped: Record<string, unknown> | null = null;
  for (const propName of propNames) {
    const value = properties[propName];
    let originalTargetId: string | undefined;
    if (typeof value === "string" && newIdByOriginalId.has(value)) {
      originalTargetId = value;
    } else if (typeof value === "number" && value !== 0) {
      originalTargetId = copiedOriginals.find(
        (e) => e.tiledObjectId === value
      )?.id;
    }
    if (originalTargetId === undefined) continue;
    const newTargetId = newIdByOriginalId.get(originalTargetId);
    if (newTargetId === undefined) continue;
    if (!remapped) remapped = { ...properties };
    remapped[propName] = newTargetId;
  }
  return remapped ?? properties;
}

/** Convert one entity's refs to runtime `TiledObjectRef` numbers for
 *  constructing live entities from placements. Unresolvable refs become 0
 *  (Tiled's "no object") so the runtime never receives a string. */
export function toRuntimeEntityRefProperties(
  type: string,
  properties: Record<string, unknown> | undefined,
  layers: EditorLayer[]
): Record<string, unknown> | undefined {
  const propNames = entityRefPropNames(type);
  if (!propNames || !properties) return properties;
  let converted: Record<string, unknown> | null = null;
  for (const propName of propNames) {
    const value = properties[propName];
    if (typeof value === "number" || value === undefined) continue;
    const target =
      typeof value === "string" ? findEntityInLayers(layers, value) : null;
    if (!converted) converted = { ...properties };
    converted[propName] = target?.tiledObjectId ?? 0;
  }
  return converted ?? properties;
}

/** Post-load integrity pass, mutating freshly parsed placements in place:
 *  duplicate Tiled object ids (from historical paste bugs or hand-edited
 *  files) keep the first occurrence and remint the rest, then numeric refs
 *  resolve to placement ids. Refs to a duplicated id follow the kept
 *  occurrence; refs to unknown ids stay numeric so they round-trip; refs of
 *  0 (Tiled's "no object") drop. Returns the map's next object id, raised
 *  past every id now in use. */
export function normalizeEntityRefsAfterLoad(
  layers: EditorLayer[],
  nextObjectId: number | undefined
): number {
  const entities = flattenEntityLayers(layers);
  let highestSeen = 0;
  for (const entity of entities) {
    if (entity.tiledObjectId !== undefined) {
      highestSeen = Math.max(highestSeen, entity.tiledObjectId);
    }
  }
  let counter = Math.max(nextObjectId ?? 1, highestSeen + 1);

  const keeperByObjectId = new Map<number, EntityPlacement>();
  for (const entity of entities) {
    if (entity.tiledObjectId === undefined) continue;
    if (keeperByObjectId.has(entity.tiledObjectId)) {
      console.warn(
        `[tmjLoader] duplicate Tiled object id ${entity.tiledObjectId} on ` +
          `"${entity.type}"; reassigned to ${counter}`
      );
      entity.tiledObjectId = counter++;
      keeperByObjectId.set(entity.tiledObjectId, entity);
    } else {
      keeperByObjectId.set(entity.tiledObjectId, entity);
    }
  }

  for (const entity of entities) {
    const propNames = entityRefPropNames(entity.type);
    if (!propNames || !entity.properties) continue;
    for (const propName of propNames) {
      const value = entity.properties[propName];
      if (typeof value !== "number") continue;
      if (value === 0) {
        delete entity.properties[propName];
        continue;
      }
      const target = keeperByObjectId.get(value);
      if (target) entity.properties[propName] = target.id;
    }
  }

  return counter;
}
