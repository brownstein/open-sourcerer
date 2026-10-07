import RAPIER, { World } from "@dimforge/rapier2d-compat";
import { Box2, Color, Scene, Vector2 } from "three";

import { MusicAssets } from "src/assets/allMusicAssets";

import { CameraDirectorAPI } from "./camera";
import { CodingChallengeProviderAPI } from "./codingChallenge";
import { ControlsAPI } from "./controls";
import { Direction } from "./directions";
import { AsyncNavAPI } from "./navigation";
import { OverlayProviderAPI } from "./overlay";
import { PhysicsHooksAPI } from "./physics";
import { SpellCtx, SpellsAPI } from "./spells";
import { ColorRepresentation, TypedEventEmitter } from "./util";

export type LevelStateType = {
  getValue: <T = unknown>(key: string) => T;
  subValue: <T = unknown>(
    key: string,
    subscriptor: (value: T) => void
  ) => () => void;
  setValue: (key: string, value: unknown) => void;
};

export type LevelVariableBinding = {
  entityId: string;
  binding: string;
};

export type BaseSnapshotType = Record<string, unknown> & {
  removed?: boolean;
};

// This is currently unused.
// TODO: use or remove.
export type LevelScripting<
  EntityType,
  EventTypes extends Record<string, unknown>,
  RegistryType extends Record<string, unknown>,
  SnapshotType extends BaseSnapshotType = BaseSnapshotType
> = {
  initAfterEntities(
    level: GenericLevelAPI<EntityType, EventTypes, RegistryType, SnapshotType>
  ): void;
};

export type CachedCollInfo = {
  enabled: boolean;
  useCallback: boolean;
  totalCollCount: number;
  solidCollCount: number;
};

export type CachedPhysicsInfo = {
  translation: Vector2;
  velocity: Vector2;
  collByRigidBody: Map<number, CachedCollInfo>;
};

// This is how we inject global singletons into the level.
// The alternative is just using the module system to get
// references, but this is much better.
export type LevelCtxAPI<RegistryType> = {
  readonly overlayProvider?: OverlayProviderAPI;
  readonly spells?: SpellsAPI;
  readonly codingChallenges?: CodingChallengeProviderAPI;
  readonly saveStore?: {
    saveGame: () => void;
  };
  readonly registry?: RegistryType;
};

export type LevelSnapshot<T> = {
  state?: Record<string, unknown>;
  entities: Record<string, T>;
};

export type GenericLevelAPI<
  EntityType,
  EventTypes extends Record<string, unknown>,
  RegistryType extends Record<string, unknown>,
  SnapshotType extends BaseSnapshotType = BaseSnapshotType
> = TypedEventEmitter<EventTypes> & {
  readonly id: string;
  readonly rapier: typeof RAPIER;
  readonly world: World;
  readonly scene: Scene;
  readonly state: LevelStateType;
  readonly stepCount: number;
  readonly controls?: ControlsAPI<EntityType>;
  readonly cameraDirector: CameraDirectorAPI;
  readonly navigation?: AsyncNavAPI;
  readonly backgroundColor?: Color;
  readonly ctx?: LevelCtxAPI<RegistryType>;
  readonly fullyPreLoaded: boolean;
  readonly defaultMusic?: keyof MusicAssets;
  getWorldBoundaries(): Box2;
  getEntity(id: string): EntityType | null;
  getEntity<T extends EntityType>(id: string): T | null;
  getEntityForRigidBody<T extends EntityType = EntityType>(
    handle: number
  ): T | null;
  getEntityForName<T extends EntityType = EntityType>(name: string): T | null;
  getEntities(): Map<string, EntityType>;
  getEntitiesForType<T extends EntityType>(type: {
    new (props: any): T;
    type: string;
  }): T[];
  getRigidBodiesCollidingWith(rigidBodyHandle: number): number[];
  addEntity(entity: EntityType): void;
  removeEntity(id: string): void;
  storeEntitySnapshot(id: string, snapshot: SnapshotType): void;
  step(deltaMs: number): void;
  registerEntityPhysicsHooks(hooks: PhysicsHooksAPI<EntityType>): void;
  updateEntityPhysicsHooks(hooks: PhysicsHooksAPI<EntityType>): void;
  removeEntityPhysicsHooks(id: string): void;
  registerSensor(entityId: string, colliderHandle: number): void;
  getEntityIdForCollider(handle: number): string | undefined;
  isEntitySolid(entityId: string): boolean;
  disableActiveCollisionsBetween(entityId1: string, entityId2: string): void;
  enableActiveCollisionsBetween(entityId1: string, entityId2: string): void;
  setBackgroundColor(color: ColorRepresentation): void;
  getFullSnapshot(): LevelSnapshot<SnapshotType>;
  bindEntityToVariable(entityId: string): string | null;
  getEntityIdToBindings(): Record<string, string>;
  populateSpellCtxWithBindings(ctx: SpellCtx): void;

  // Step event emition, Rapier world steps, and entity steps are frozen
  // Camera steps and sound still proceed as normal
  hitStop(durationMs: number): void;
};

// TODO: use me.
export type LevelTransitionOptions = {
  linearDirection?: Direction;
};

// Interconnects between levels.
export const DefaultDoorId = "main";
export type LevelAdjacencies = {
  sides?: Partial<Record<Direction, string | string[]>>;
  doors?: Record<string, [string] | [string, string]>;
};
export type MapOfLevelAdjacencies = Record<string, LevelAdjacencies>;
