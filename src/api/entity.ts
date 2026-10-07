import { Object3D, Vector2, Vector3 } from "three";

import { TerrainWithObstacles } from "src/engine/navigation/Terrain";
import { SignalNetwork } from "src/engine/signal/SignalNetwork";
import {
  ReadPositionAttributes,
  ReadSizeAttributes
} from "src/engine/util/vecTypes";

import { AssetConsumerType } from "./asset";
import { ControlsAPI } from "./controls";
import { GenericHotLoaderAPI } from "./hotLoader";
import { GenericLevelAPI, LevelSnapshot } from "./level";
import { ResourceDefinition } from "./loader";
import { RegistryProvider } from "./registry";
import { SpellsAPI } from "./spells";
import {
  ConfigDefType,
  ConfigDefTypeFor,
  EmitterEventsMap,
  PrimitiveType,
  TypedEventEmitter
} from "./util";

export type ReadConfig<CD extends ConfigDefType> = {
  readonly [K in keyof CD]?: PrimitiveType<CD[K]["type"]>;
};

/**
 * A Tiled object id referencing another map object; runtime entity id is
 * `tle-${value}`. Authored in Tiled as a custom property of type `object`;
 * rendered in the level editor as an entity picker.
 */
export type TiledObjectRef = number;

export enum EntityLifecycleEvents {
  AttachToLevel = "AttachToLevel",
  DetachFromLevel = "DetachFromLevel",
  Step = "Step",
  PostStep = "PostStep",
  Destroy = "Destroy",
  Hit = "Hit",
  Die = "Die",
  Teleport = "Teleport",
  BindToVariableName = "BindToVariableName"
}

export type EntityLifecycleEventTypes = {
  [EntityLifecycleEvents.AttachToLevel]: EntityLevelAPI;
  [EntityLifecycleEvents.DetachFromLevel]: EntityLevelAPI;
  [EntityLifecycleEvents.Destroy]: void;
  [EntityLifecycleEvents.Step]: number;
  [EntityLifecycleEvents.PostStep]: number;
  [EntityLifecycleEvents.Hit]: EntityHitDetails;
  [EntityLifecycleEvents.Die]: void;
  [EntityLifecycleEvents.Teleport]: Vector3;
  [EntityLifecycleEvents.BindToVariableName]: string;
};

export enum EntityAlignment {
  Environment = "Environment",
  EnvironmentalHazard = "EnvironmentalHazard",
  TemporaryTerrain = "TemporaryTerrain",
  Player = "Player",
  Enemy = "Enemy",
  NPC = "NPC"
}

export type BaseEntityType<BehaviorsMap extends EntityBehaviorMap = {}> = {
  readonly id: string;
  readonly type: string;
  readonly name?: string;
  readonly layerName?: string;
  position: Vector3;
  angle: number;
  readonly persist?: boolean;
  readonly size: ReadSizeAttributes;
  readonly initialProps: EntityProps;
  readonly lifetimeMs: number;
  readonly object3D?: Object3D;
  readonly behaviors: BehaviorsMap;
  readonly children?: BaseEntityType[];
  readonly events: TypedEventEmitter<EntityLifecycleEventTypes>;
  alignment?: EntityAlignment;
  elementalType?: ElementalType;
  readonly dead?: boolean;
  readonly canBindToVariable?: boolean;
  readonly boundToVariableName?: string;
  readonly bindingPrefix?: string;
  readonly step?: (deltaMs: number) => void;
  readonly postStep?: (deltaMs: number) => void;
  readonly destroy?: () => void;
  readonly getSnapshot?: () => EntitySnapshot;
  readonly applySnapshot?: (snapshot: EntitySnapshot) => void;
  readonly attachToLevel?: (level: EntityLevelAPI) => void;
  readonly detachFromLevel?: (level: EntityLevelAPI) => void;
  readonly attachToSpellApi?: (api: SpellsAPI) => void;
  readonly detachFromSpellApi?: (api: SpellsAPI) => void;
  readonly hit?: (hitDetails: EntityHitDetails) => void;
  readonly teleport?: (position: Vector3) => void;
  readonly shake?: (durationMs?: number, intensity?: number) => Promise<void>;
  readonly extraSpellBindingData?: () => Record<string, unknown>;
  readonly cursorOverrides?: () => Set<string>;
  readonly bindToVariable?: (variableName: string) => void;
  readonly area?: () => number | undefined;
};

export type EntityClassType<T extends BaseEntityType = BaseEntityType> = {
  new (props: EntityProps): T;
  type: string;
  matchAdditionalTypes?: string[];
  flags?: string[];
  configDef?: ConfigDefType;
} & ResourceDefinition &
  AssetConsumerType;

export interface EntityBehavior<EntityType = BaseEntityType> {
  readonly type: string;
  readonly init?: (entity: EntityType) => void;
  readonly step?: (ms: number) => void;
  readonly destroy?: () => void;
  readonly getSnapshot?: () => Record<string, unknown>;
  readonly applySnapshot?: (snapshot: EntitySnapshot) => void;
  readonly attachToLevel?: (level: EntityLevelAPI) => void;
  readonly detachFromLevel?: (level: EntityLevelAPI) => void;
  readonly attachToSpellApi?: (api: SpellsAPI) => void;
  readonly detachFromSpellApi?: (api: SpellsAPI) => void;
}

export interface EntityBehaviorClassType<
  EntityType extends BaseEntityType,
  T extends EntityBehavior<EntityType>,
  Props extends unknown[] = unknown[]
> extends AssetConsumerType {
  type?: T["type"];
  new (...props: Props): T;
}

export type EntityBehaviorMap<
  EntityType extends BaseEntityType = BaseEntityType<any>
> = Record<string, EntityBehavior<EntityType>>;

export type EntityProps = {
  id?: string;
  name?: string;
  inLevelDef?: boolean;
  position: ReadPositionAttributes;
  angle?: number;
  size?: ReadSizeAttributes;
  opacity?: number;
  polygon?: Vector2[];
  polyline?: Vector2[];
  layerName?: string;
  [key: string]: unknown;
};

export type EntitySnapshot = {
  id: string;
  position: ReadPositionAttributes;
  angle?: number;
  size?: ReadSizeAttributes;
  [key: string]: unknown;
};

export function isEntitySnapshot(
  sn: EntitySnapshotOrRemoved
): sn is EntitySnapshot {
  return !!(sn as EntitySnapshot).id;
}

export type RemovedEntitySnapshot = {
  removed: true;
};

export function isRemovedEntitySnapshot(
  sn: EntitySnapshotOrRemoved
): sn is RemovedEntitySnapshot {
  return !!(sn as RemovedEntitySnapshot).removed;
}

export type EntitySnapshotOrRemoved = EntitySnapshot | RemovedEntitySnapshot;

export type EntityCapability<T extends Record<string, string | boolean>> = {
  configDef?: ConfigDefTypeFor<T>;
  config?: T;
  events?: EmitterEventsMap;
};

export type EntityClassArray = EntityClassType[];

export enum ElementalType {
  Mana = "Mana",
  Fire = "Fire",
  Earth = "Earth",
  Ice = "Ice",
  Electricity = "Electricity",
  Nature = "Nature",
  Wind = "Wind"
}

export enum DamageType {
  Force = "Force",
  Blunt = "Blunt",
  Pierce = "Pierce",
  Slash = "Slash",
  Magic = "Magic",
  Explosion = "Explosion"
}

export type EntityHitDetails = {
  hittingEntity: BaseEntityType;
  sourceEntity: BaseEntityType;
  damage: number;
  damageType?: DamageType;
  elementalDamageType?: ElementalType;
  hitImpulse?: Vector2;
  hitShape?: HitShape;
};

export type HitShapeCircle = {
  type: "circle";
  center: Vector2;
  radius: number;
};

export type HitShape = HitShapeCircle;

export function castBaseEntity<EntityType extends BaseEntityType>(
  entity: BaseEntityType,
  typeName: EntityType["type"]
) {
  if (entity.type === typeName) return entity as EntityType;
  return null;
}

export function castEntityBehavior<BehaviorType extends EntityBehavior>(
  behavior: EntityBehavior,
  typeName: BehaviorType["type"]
) {
  if (behavior.type === typeName) return behavior as BehaviorType;
  return null;
}

export enum EntityLevelEvents {
  Pause = "Pause",
  Resume = "Resume",
  Step = "Step",
  OutOfSyncCameraUpdate = "OutOfSyncCameraUpdate",
  TransitionStep = "TransitionStep",
  AttachControls = "AttachControls",
  DetachControls = "DetachControls",
  PreloadComplete = "PreloadComplete",
  UpdateCursorOverrides = "UpdateCursorOverrides",
  Teardown = "Teardown",
  EntityAdded = "EntityAdded",
  EntityRemoved = "EntityRemoved"
}

export type EntityLevelEventTypes = {
  [EntityLevelEvents.Pause]: void;
  [EntityLevelEvents.Resume]: void;
  [EntityLevelEvents.Step]: number;
  [EntityLevelEvents.OutOfSyncCameraUpdate]: void;
  [EntityLevelEvents.TransitionStep]: void;
  [EntityLevelEvents.AttachControls]: ControlsAPI<BaseEntityType>;
  [EntityLevelEvents.DetachControls]: void;
  [EntityLevelEvents.PreloadComplete]: void;
  [EntityLevelEvents.UpdateCursorOverrides]: void;
  [EntityLevelEvents.Teardown]: void;
  [EntityLevelEvents.EntityAdded]: BaseEntityType;
  [EntityLevelEvents.EntityRemoved]: BaseEntityType;
};

export type EntityLevelAPIRegistryies = {
  entities?: RegistryProvider<EntityClassType>;
};

export type LevelAPI = GenericLevelAPI<
  BaseEntityType,
  EntityLevelEventTypes,
  EntityLevelAPIRegistryies,
  EntitySnapshotOrRemoved
> & {
  // Async method to create an entity of a given type, preloading resources if necessary.
  constructEntityAfterPreload<
    T extends BaseEntityType = BaseEntityType,
    P extends EntityProps = EntityProps
  >(
    typeName: string,
    props: P
  ): Promise<T | null>;
  readonly navTerrain?: TerrainWithObstacles;
  readonly signalNetwork: SignalNetwork;
};

export type EntityLevelAPI = LevelAPI;
export type EntityLevelSnapshot = LevelSnapshot<EntitySnapshotOrRemoved>;
export type EntityLevelHotLoaderAPI = GenericHotLoaderAPI<LevelAPI>;
