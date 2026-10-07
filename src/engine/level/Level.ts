import RAPIER from "@dimforge/rapier2d-compat";
import { EventEmitter } from "events";
import { Box2, Color, Group, Scene, Vector2 } from "three";

import { CameraDirectorAPI, CameraRequestPriority } from "src/api/camera";
import { ControlsAPI } from "src/api/controls";
import {
  BaseEntityType,
  EntityLevelAPIRegistryies,
  EntityLevelEvents,
  EntityLevelSnapshot,
  EntityProps,
  EntitySnapshot,
  EntitySnapshotOrRemoved,
  LevelAPI,
  isEntitySnapshot,
  isRemovedEntitySnapshot
} from "src/api/entity";
import { ItemData } from "src/api/item";
import { CachedPhysicsInfo, LevelCtxAPI, LevelStateType } from "src/api/level";
import { AsyncNavAPI } from "src/api/navigation";
import { CollisionBehavior, PhysicsHooksAPI } from "src/api/physics";
import { SpellCtx, SpellsAPI } from "src/api/spells";
import { ColorRepresentation } from "src/api/util";
import { MusicAssets } from "src/assets/allMusicAssets";
import { TerrainWithObstacles } from "src/engine/navigation/Terrain";
import { SignalNetwork } from "src/engine/signal/SignalNetwork";

import { centralAssetManager } from "../asset/AssetManager";
import { CameraDirector } from "../camera/CameraDirector";
import { kInvPhysicsScale } from "../constants/scaling";
import { centralSoundManager } from "../sound/Sound";
import { LevelDefinitionAPI } from "./LevelLoaderAPI";

export class LevelState implements LevelStateType {
  private events = new EventEmitter();
  private values: Record<string, unknown> = {};
  constructor(currentValues?: Record<string, unknown>) {
    if (currentValues) this.values = currentValues;
  }
  getValue<T = unknown>(key: string) {
    return this.values[key] as T;
  }
  subValue<T = unknown>(key: string, subscriptor: (value: T) => void) {
    this.events.on(key, subscriptor);
    if (this.values[key] !== undefined) subscriptor(this.values[key] as T);
    return () => this.events.off(key, subscriptor);
  }
  setValue(key: string, value: unknown) {
    this.values[key] = value;
    this.events.emit(key, value);
  }
  getAllValues() {
    return this.values;
  }
}

export const kWorldGravity = {
  x: 0,
  y: -9.8 * kInvPhysicsScale
};

export class Level
  extends EventEmitter
  implements LevelAPI, RAPIER.PhysicsHooks
{
  public id: string;
  public rapier: typeof RAPIER;
  public world: RAPIER.World;
  public scene: Scene = new Scene();
  public state = new LevelState();
  public navigation?: AsyncNavAPI;
  public navTerrain?: TerrainWithObstacles;
  public signalNetwork = new SignalNetwork();
  public backgroundColor?: Color;
  public assetDependencies?: string[];

  public stepCount: number = 0;
  public controls?: ControlsAPI<BaseEntityType>;
  public cameraDirector: CameraDirectorAPI = new CameraDirector();
  public worldBBox = new Box2();

  public ctx?: LevelCtxAPI<EntityLevelAPIRegistryies>;
  public fullyPreLoaded = false;

  public defaultMusic?: keyof MusicAssets;
  public defaultMusicGain?: number;
  public demoItems?: ItemData[];

  private entities = new Map<string, BaseEntityType>();
  private entityLoadingProvider?: EntityLoadingProviderAPI;
  private entityLayerGroups = new Map<string, Group>();
  private hiddenEntityLayers = new Set<string>();

  // Level definition.
  private definition?: LevelDefinitionAPI;

  // Physics.
  private rapierEventQueue: RAPIER.EventQueue;
  private colliderHandleToEntityId = new Map<number, string>();
  private rigidBodyHandleToEntityId = new Map<number, string>();
  private rigidBodyHandleToPhysicsCache = new Map<number, CachedPhysicsInfo>();
  private entityIdToPhysicsHooks = new Map<
    string,
    PhysicsHooksAPI<BaseEntityType>
  >();

  // Persistence.
  private entitySnapshots: Map<string, EntitySnapshotOrRemoved> = new Map();

  // Spells.
  private spellApi?: SpellsAPI;

  // Spell variable bindings.
  private spellVariableBindings = new Map<string, Map<string, string>>();
  private lastDeltaMs = 0;
  private hitStopRemainingMs = 0;

  constructor(id: string, rapier: typeof RAPIER) {
    super();
    this.id = id;
    this.rapier = rapier;
    this.rapierEventQueue = new rapier.EventQueue(true);
    this.world = new rapier.World(kWorldGravity);
    this.world.timestep = 1 / 120;
    this.world.numSolverIterations = 4;
    this.scene.add(centralSoundManager.getListener());
    this.drainCollisionEvent = this.drainCollisionEvent.bind(this);
    this.drainContactForceEvent = this.drainContactForceEvent.bind(this);
    this.setMaxListeners(60);

    // send a request for the level bounds
    this.once(EntityLevelEvents.PreloadComplete, () => {
      const levelBounds = this.getWorldBoundaries();
      this.cameraDirector.sendRequest({
        id: crypto.randomUUID(),
        priority: CameraRequestPriority.LOWEST,
        bounds: levelBounds
      });
    });
  }
  setSpellApi(spellApi: SpellsAPI | undefined, attachEntities = true) {
    const prevSpellApi = this.spellApi;
    this.spellApi = spellApi;
    if (!attachEntities) return;
    if (spellApi !== undefined) {
      for (const entity of this.entities.values()) {
        entity.attachToSpellApi?.(spellApi);
      }
    } else if (prevSpellApi !== undefined) {
      for (const entity of this.entities.values()) {
        entity.detachFromSpellApi?.(prevSpellApi);
      }
    }
    return this;
  }
  setCtx(ctx: Partial<LevelCtxAPI<EntityLevelAPIRegistryies>>) {
    this.ctx = { ...this.ctx, ...ctx };
    return this;
  }
  setDefinition(definition: LevelDefinitionAPI) {
    this.definition = definition;
    return this;
  }
  // TODO: Implement me.
  getWorldBoundaries(): Box2 {
    return this.worldBBox.clone();
  }
  getEntity(id: string): BaseEntityType | null;
  getEntity<T extends BaseEntityType>(id: string): T | null;
  getEntity(id: string): BaseEntityType | null {
    return this.entities.get(id) ?? null;
  }
  getEntityForRigidBody<T extends BaseEntityType = BaseEntityType>(
    handle: number
  ) {
    const entityId = this.rigidBodyHandleToEntityId.get(handle);
    if (entityId === undefined) return null;
    return (this.entities.get(entityId) as T) ?? null;
  }
  getEntityForName<T extends BaseEntityType = BaseEntityType>(name: string) {
    for (const entity of this.entities.values()) {
      if (entity.name === name) return entity as T;
    }
    return null;
  }
  getEntities(): Map<string, BaseEntityType> {
    return this.entities;
  }
  getEntitiesForType<T extends BaseEntityType<{}>>(clazzType: {
    new (props: any): T;
    type: string;
  }): T[] {
    const results: T[] = [];
    for (const entity of this.entities.values()) {
      if (entity.type === clazzType.type) results.push(entity as T);
    }
    return results;
  }
  getRigidBodiesCollidingWith(rigidBodyHandle: number) {
    const physicsCache =
      this.rigidBodyHandleToPhysicsCache.get(rigidBodyHandle);
    if (!physicsCache) return [];

    return [...physicsCache.collByRigidBody.keys()];
  }
  private getEntityLayerGroup(layerName: string): Group {
    const existing = this.entityLayerGroups.get(layerName);
    if (existing) return existing;
    const group = new Group();
    group.visible = !this.hiddenEntityLayers.has(layerName);
    this.entityLayerGroups.set(layerName, group);
    this.scene.add(group);
    return group;
  }
  registerHiddenEntityLayer(layerName: string): void {
    this.hiddenEntityLayers.add(layerName);
    this.getEntityLayerGroup(layerName).visible = false;
  }
  setEntityLayerVisibility(layerName: string, visible: boolean): void {
    if (visible) this.hiddenEntityLayers.delete(layerName);
    else this.hiddenEntityLayers.add(layerName);
    this.getEntityLayerGroup(layerName).visible = visible;
  }
  addEntity(entity: BaseEntityType): void {
    this.entities.set(entity.id, entity);
    entity.attachToLevel?.(this);
    if (this.spellApi) entity.attachToSpellApi?.(this.spellApi);
    if (entity.object3D !== undefined) {
      if (entity.layerName)
        this.getEntityLayerGroup(entity.layerName).add(entity.object3D);
      else this.scene.add(entity.object3D);
    }
    this.emit(EntityLevelEvents.EntityAdded, entity);
  }
  removeEntity(id: string): void {
    const entity = this.entities.get(id);
    if (entity === undefined) return;
    const persist = entity.persist ?? entity.initialProps.inLevelDef;
    if (persist)
      this.entitySnapshots.set(entity.id, {
        removed: true
      });
    this.entities.delete(id);
    entity.detachFromLevel?.(this);
    if (this.spellApi) entity.detachFromSpellApi?.(this.spellApi);
    if (entity.object3D !== undefined) entity.object3D.removeFromParent();
    const hooks = this.entityIdToPhysicsHooks.get(id);
    if (hooks) {
      if (hooks.rigidBodyHandle) {
        this.rigidBodyHandleToPhysicsCache.delete(hooks.rigidBodyHandle);
      }
    }
    this.entityIdToPhysicsHooks.delete(id);
    this.emit(EntityLevelEvents.EntityRemoved, entity);
  }
  storeEntitySnapshot(id: string, snapshot: EntitySnapshot): void {
    this.entitySnapshots.set(id, snapshot);
  }
  hitStop(durationMs: number): void {
    this.hitStopRemainingMs = Math.max(this.hitStopRemainingMs, durationMs);
  }
  step(deltaMs: number): void {
    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs -= deltaMs;
      // Still step camera so screen shake and other camera effects play through.
      this.cameraDirector.step(deltaMs);
      const camProps = this.cameraDirector.getCurrentProperties();
      centralSoundManager
        .getListener()
        .position.set(camProps.center.x, camProps.center.y, 0);
      return;
    }
    // Update position and velocity of the physics cache.
    // TODO: determine whether this is actually necessary.
    for (const [handle, cachedInfo] of this.rigidBodyHandleToPhysicsCache) {
      const rigidBody = this.world.getRigidBody(handle);
      if (!rigidBody) {
        console.warn("Missing rigid body in level cache");
        continue;
      }
      const rbTranslation = rigidBody.translation();
      const rbVelocity = rigidBody.linvel();
      cachedInfo.translation.set(rbTranslation.x, rbTranslation.y);
      cachedInfo.velocity.set(rbVelocity.x, rbVelocity.y);
    }
    // Step the world.
    this.lastDeltaMs = deltaMs;
    this.world.step(this.rapierEventQueue, this);

    // Do collision events.
    this.rapierEventQueue.drainCollisionEvents(this.drainCollisionEvent);
    this.rapierEventQueue.drainContactForceEvents(this.drainContactForceEvent);

    // Step the signal network before entities so they read this frame's state.
    this.signalNetwork.step(deltaMs);

    // Do NoCollideWithStep collisions.
    for (const [rbHandle, cache] of this.rigidBodyHandleToPhysicsCache) {
      for (const [rbHandle2, coll] of cache.collByRigidBody) {
        if (!coll.enabled && coll.useCallback) {
          const entityId = this.rigidBodyHandleToEntityId.get(rbHandle);
          const entityId2 = this.rigidBodyHandleToEntityId.get(rbHandle2);
          if (!entityId || !entityId2) continue;
          const entity = this.entities.get(entityId);
          const entity2 = this.entities.get(entityId2);
          if (!entity || !entity2) continue;
          const hooks = this.entityIdToPhysicsHooks.get(entityId);
          const rb2 = this.world.getRigidBody(rbHandle2);
          if (!rb2) {
            cache.collByRigidBody.delete(rbHandle2);
            continue;
          }
          hooks?.handleOngoingCollision?.(entity2, rb2, deltaMs);
        }
      }
    }

    // Step all entities.
    for (const entity of this.entities.values()) {
      entity.step?.(deltaMs);
    }

    // Step the camera
    this.cameraDirector.step(deltaMs);

    // Sync audio listener position to camera center for spatial audio.
    const camProps = this.cameraDirector.getCurrentProperties();
    centralSoundManager
      .getListener()
      .position.set(camProps.center.x, camProps.center.y, 0);

    // Emit step event.
    this.emit(EntityLevelEvents.Step, deltaMs);
  }
  postStep(deltaMs = 0) {
    for (const entity of this.entities.values()) {
      entity.postStep?.(deltaMs);
    }
  }
  // Rapier callback.
  drainCollisionEvent(
    collHandle1: number,
    collHandle2: number,
    starting: boolean
  ) {
    const coll1 = this.world.getCollider(collHandle1);
    const coll2 = this.world.getCollider(collHandle2);
    const rb1 = coll1.parent();
    const rb2 = coll2.parent();
    if (!rb1 || !rb2) return;
    const cache1 = this.rigidBodyHandleToPhysicsCache.get(rb1.handle);
    const cache2 = this.rigidBodyHandleToPhysicsCache.get(rb2.handle);
    const entityId1 = this.colliderHandleToEntityId.get(collHandle1);
    const entityId2 = this.colliderHandleToEntityId.get(collHandle2);
    if (!cache1 || !cache2) {
      console.warn(
        `[Level] broken invariant: missing physics cache for collision event between entities ${entityId1}, ${entityId2}.`
      );
      return;
    }
    let entity1: BaseEntityType | undefined;
    let entity2: BaseEntityType | undefined;
    let hooks1: PhysicsHooksAPI<BaseEntityType> | undefined;
    let hooks2: PhysicsHooksAPI<BaseEntityType> | undefined;
    if (entityId1 !== undefined) {
      entity1 = this.entities.get(entityId1);
      hooks1 = this.entityIdToPhysicsHooks.get(entityId1);
    }
    if (entityId2 !== undefined) {
      entity2 = this.entities.get(entityId2);
      hooks2 = this.entityIdToPhysicsHooks.get(entityId2);
    }

    const isSolid = !coll1.isSensor() && !coll2.isSensor();

    // Handle collision end events.
    // TODO: build a physics hook for this for use with sensors.
    if (!starting) {
      const coll12 = cache1.collByRigidBody.get(rb2.handle);
      const coll21 = cache2.collByRigidBody.get(rb1.handle);
      if (coll12) {
        coll12.totalCollCount--;
        if (!coll1.isSensor() && !coll2.isSensor()) coll12.solidCollCount--;
        if (coll12.solidCollCount <= 0) coll12.enabled = true;
        if (coll12.totalCollCount <= 0)
          cache1.collByRigidBody.delete(rb2.handle);
      }
      if (coll21) {
        coll21.totalCollCount--;
        if (!coll1.isSensor() && !coll2.isSensor()) coll21.solidCollCount--;
        if (coll21.solidCollCount <= 0) coll21.enabled = true;
        if (coll21.totalCollCount <= 0)
          cache2.collByRigidBody.delete(rb1.handle);
      }
      if (hooks1 === undefined && hooks2 === undefined) return;
      if (entity1 !== undefined)
        hooks1?.endCollision?.(
          entity1,
          entity2,
          collHandle1,
          collHandle2,
          isSolid
        );
      if (entity2 !== undefined)
        hooks2?.endCollision?.(
          entity2,
          entity1,
          collHandle2,
          collHandle1,
          isSolid
        );
      return;
    }

    if (hooks1 === undefined && hooks2 === undefined) return;

    let enableFlag1: boolean | undefined;
    let enableFlag2: boolean | undefined;
    let useCallbackFlag1 = false;
    let useCallbackFlag2 = false;

    if (
      entity1 !== undefined &&
      hooks1 !== undefined &&
      hooks1.beginCollision !== undefined
    ) {
      this.world.contactPair(coll1, coll2, (manifold, flipped) => {
        if (
          entity1 === undefined ||
          hooks1 === undefined ||
          hooks1.beginCollision === undefined
        )
          return;
        const rawNormal = manifold.normal();
        const normal = new Vector2(rawNormal.x, rawNormal.y);
        if (flipped) normal.multiplyScalar(-1);
        const collBehavior = hooks1.beginCollision(
          entity1,
          entity2,
          normal,
          collHandle1,
          collHandle2,
          isSolid
        );
        switch (collBehavior) {
          case CollisionBehavior.Collide:
            enableFlag1 = true;
            break;
          case CollisionBehavior.NoCollide:
            enableFlag1 = false;
            break;
          case CollisionBehavior.Callback:
            enableFlag1 = true;
            useCallbackFlag1 = true;
            break;
          case CollisionBehavior.NoCollideWithCallback:
            enableFlag1 = false;
            useCallbackFlag1 = true;
            break;
          default:
            break;
        }
      });
    }
    if (
      entity2 !== undefined &&
      hooks2 !== undefined &&
      hooks2.beginCollision !== undefined
    ) {
      this.world.contactPair(coll2, coll1, (manifold, flipped) => {
        if (
          entity2 === undefined ||
          hooks2 === undefined ||
          hooks2.beginCollision === undefined
        )
          return;
        const rawNormal = manifold.normal();
        const normal = new Vector2(rawNormal.x, rawNormal.y);
        if (flipped) normal.multiplyScalar(-1);
        const collBehavior = hooks2.beginCollision(
          entity2,
          entity1,
          normal,
          collHandle2,
          collHandle1,
          isSolid
        );
        switch (collBehavior) {
          case CollisionBehavior.Collide:
            enableFlag2 = true;
            break;
          case CollisionBehavior.NoCollide:
            enableFlag2 = false;
            break;
          case CollisionBehavior.Callback:
            enableFlag2 = true;
            useCallbackFlag2 = true;
            break;
          case CollisionBehavior.NoCollideWithCallback:
            enableFlag2 = false;
            useCallbackFlag2 = true;
            break;
          default:
            break;
        }
      });
    }

    let coll12 = cache1.collByRigidBody.get(rb2.handle);
    if (!coll12) {
      coll12 = {
        enabled: true,
        useCallback: useCallbackFlag1,
        solidCollCount: 0,
        totalCollCount: 0
      };
      cache1.collByRigidBody.set(rb2.handle, coll12);
    }
    let coll21 = cache2.collByRigidBody.get(rb1.handle);
    if (!coll21) {
      coll21 = {
        enabled: true,
        useCallback: useCallbackFlag2,
        solidCollCount: 0,
        totalCollCount: 0
      };
      cache2.collByRigidBody.set(rb1.handle, coll21);
    }

    let enabled = true;
    if (enableFlag1 === false || enableFlag2 === false) enabled = false;
    if (coll12.totalCollCount > 0) enabled &&= coll12.enabled;
    if (coll21.totalCollCount > 0) enabled &&= coll21.enabled;
    coll12.enabled = enabled;
    coll21.enabled = enabled;
    coll12.totalCollCount++;
    coll21.totalCollCount++;
    if (!coll1.isSensor() && !coll2.isSensor()) {
      coll12.solidCollCount++;
      coll21.solidCollCount++;
    }
  }
  // Rapier callback.
  drainContactForceEvent(event: RAPIER.TempContactForceEvent) {
    const collHandle1 = event.collider1();
    const collHandle2 = event.collider2();
    const entityId1 = this.colliderHandleToEntityId.get(collHandle1);
    const entityId2 = this.colliderHandleToEntityId.get(collHandle2);
    if (!entityId1 || !entityId2) return;
    const entity1 = this.entities.get(entityId1);
    const entity2 = this.entities.get(entityId2);
    if (!entity1 || !entity2) return;
    const coll1 = this.world.getCollider(collHandle1);
    const coll2 = this.world.getCollider(collHandle2);
    const rb1 = coll1.parent();
    const rb2 = coll2.parent();
    if (!rb1 || !rb2) return;
    const cache1 = this.rigidBodyHandleToPhysicsCache.get(rb1.handle);
    const cache2 = this.rigidBodyHandleToPhysicsCache.get(rb2.handle);
    if (!cache1 || !cache2) return;
    const hooks1 = this.entityIdToPhysicsHooks.get(entityId1);
    const hooks2 = this.entityIdToPhysicsHooks.get(entityId2);
    const coll12 = cache1.collByRigidBody.get(rb2.handle);
    const coll21 = cache2.collByRigidBody.get(rb1.handle);
    if (coll12 !== undefined) {
      if (coll12.useCallback) {
        hooks1?.handleOngoingCollision?.(entity2, rb2, this.lastDeltaMs);
      }
    }
    if (coll21 !== undefined) {
      if (coll21.useCallback) {
        hooks2?.handleOngoingCollision?.(entity1, rb1, this.lastDeltaMs);
      }
    }
  }
  // Rapier callback. This has recursion implications in Rapier.
  filterContactPair(
    _coll1: number,
    _coll2: number,
    body1: number,
    body2: number
  ): RAPIER.SolverFlags | null {
    const cached1 = this.rigidBodyHandleToPhysicsCache.get(body1);
    const cached2 = this.rigidBodyHandleToPhysicsCache.get(body2);
    const enabled1 = cached1?.collByRigidBody.get(body2)?.enabled;
    const enabled2 = cached2?.collByRigidBody.get(body1)?.enabled;
    if (enabled1 === false || enabled2 === false)
      return RAPIER.SolverFlags.EMPTY;
    if (enabled1 === true || enabled2 === true)
      return RAPIER.SolverFlags.COMPUTE_IMPULSE;
    const entityId1 = this.rigidBodyHandleToEntityId.get(body1);
    const entityId2 = this.rigidBodyHandleToEntityId.get(body2);
    const hooks1 =
      entityId1 !== undefined
        ? this.entityIdToPhysicsHooks.get(entityId1)
        : undefined;
    const hooks2 =
      entityId2 !== undefined
        ? this.entityIdToPhysicsHooks.get(entityId2)
        : undefined;
    if (
      hooks1?.acceptCollisionByDefault === false ||
      hooks2?.acceptCollisionByDefault === false
    ) {
      return RAPIER.SolverFlags.EMPTY;
    }
    return RAPIER.SolverFlags.COMPUTE_IMPULSE;
  }
  // Rapier callback. This has recursion implications in Rapier.
  filterIntersectionPair(
    _collider1: number,
    _collider2: number,
    _body1: number,
    _body2: number
  ): boolean {
    return true;
  }
  dispose() {
    this.emit(EntityLevelEvents.Teardown);
    if (this.assetDependencies) {
      for (const assetKey of this.assetDependencies)
        centralAssetManager.releaseReference(assetKey);
    }
    for (const entity of this.entities.values()) {
      entity.destroy?.();
    }
    this.world.free();
    this.detachControls();
    this.navigation?.destroy();
    this.scene.remove(centralSoundManager.getListener());
  }
  registerEntityPhysicsHooks(hooks: PhysicsHooksAPI<BaseEntityType>): void {
    this.entityIdToPhysicsHooks.set(hooks.entityId, hooks);
    let rigidBody: RAPIER.RigidBody | undefined;
    if (hooks.rigidBodyHandle !== undefined) {
      this.rigidBodyHandleToEntityId.set(hooks.rigidBodyHandle, hooks.entityId);
      rigidBody = this.world.getRigidBody(hooks.rigidBodyHandle);
    }
    let colliderHandles: number[] | undefined;
    if (hooks.colliderHandles !== undefined) {
      colliderHandles = hooks.colliderHandles;
    } else if (rigidBody) {
      colliderHandles = [];
      for (let i = 0; i < rigidBody.numColliders(); i++) {
        colliderHandles.push(rigidBody.collider(i).handle);
      }
    }
    if (colliderHandles !== undefined) {
      for (const colliderHandle of colliderHandles) {
        this.colliderHandleToEntityId.set(colliderHandle, hooks.entityId);
      }
    }
    const translation = new Vector2();
    const velocity = new Vector2();
    if (rigidBody !== undefined) {
      const rbTranslation = rigidBody.translation();
      const rbVelocity = rigidBody.linvel();
      translation.set(rbTranslation.x, rbTranslation.y);
      velocity.set(rbVelocity.x, rbVelocity.y);
      const cache: CachedPhysicsInfo = {
        translation,
        velocity,
        collByRigidBody: new Map()
      };
      this.rigidBodyHandleToPhysicsCache.set(rigidBody.handle, cache);
    }
  }
  // This is only a partial implementation.
  updateEntityPhysicsHooks(hooksUpdate: PhysicsHooksAPI<BaseEntityType>): void {
    const hooks = {
      ...this.entityIdToPhysicsHooks.get(hooksUpdate.entityId),
      ...hooksUpdate
    };
    this.entityIdToPhysicsHooks.set(hooks.entityId, hooks);
    let rigidBody: RAPIER.RigidBody | undefined;
    if (hooks.rigidBodyHandle !== undefined) {
      this.rigidBodyHandleToEntityId.set(hooks.rigidBodyHandle, hooks.entityId);
      rigidBody = this.world.getRigidBody(hooks.rigidBodyHandle);
    }
    let colliderHandles: number[] | undefined;
    if (rigidBody !== undefined) {
      colliderHandles = [];
      for (let i = 0; i < rigidBody.numColliders(); i++) {
        const handle = rigidBody.collider(i).handle;
        colliderHandles.push(handle);
      }
      const currentCached = this.rigidBodyHandleToPhysicsCache.get(
        rigidBody.handle
      );
      if (currentCached === undefined) {
        const rbTranslation = rigidBody.translation();
        const rbVelocity = rigidBody.linvel();
        const translation = new Vector2();
        const velocity = new Vector2();
        translation.set(rbTranslation.x, rbTranslation.y);
        velocity.set(rbVelocity.x, rbVelocity.y);
        const cache: CachedPhysicsInfo = {
          translation,
          velocity,
          collByRigidBody: new Map()
        };
        this.rigidBodyHandleToPhysicsCache.set(rigidBody.handle, cache);
      }
    } else if (hooks.colliderHandles !== undefined) {
      colliderHandles = hooks.colliderHandles;
    }
    if (colliderHandles !== undefined) {
      for (const colliderHandle of colliderHandles) {
        this.colliderHandleToEntityId.set(colliderHandle, hooks.entityId);
      }
    }
  }
  removeEntityPhysicsHooks(id: string) {
    const hooks = this.entityIdToPhysicsHooks.get(id);
    if (hooks) {
      if (hooks.rigidBodyHandle) {
        this.rigidBodyHandleToPhysicsCache.delete(hooks.rigidBodyHandle);
      }
    }
    this.entityIdToPhysicsHooks.delete(id);
  }
  registerSensor(entityId: string, sensorColliderHandle: number) {
    this.colliderHandleToEntityId.set(sensorColliderHandle, entityId);
  }
  getEntityIdForCollider(handle: number) {
    return this.colliderHandleToEntityId.get(handle);
  }
  isEntitySolid(entityId: string): boolean {
    const hooks = this.entityIdToPhysicsHooks.get(entityId);
    if (!hooks) return false;
    const colliderHandles = new Set<number>(hooks.colliderHandles ?? []);
    if (hooks.rigidBodyHandle !== undefined) {
      const rigidBody = this.world.getRigidBody(hooks.rigidBodyHandle);
      if (rigidBody) {
        for (let i = 0; i < rigidBody.numColliders(); i++) {
          colliderHandles.add(rigidBody.collider(i).handle);
        }
      }
    }
    for (const handle of colliderHandles) {
      const collider = this.world.getCollider(handle);
      if (collider && !collider.isSensor()) return true;
    }
    return false;
  }
  // This needs work!
  disableActiveCollisionsBetween(entityId1: string, entityId2: string) {
    const rb1 = this.entityIdToPhysicsHooks.get(entityId1)?.rigidBodyHandle;
    const rb2 = this.entityIdToPhysicsHooks.get(entityId2)?.rigidBodyHandle;
    if (rb1 === undefined || rb2 === undefined) {
      if (rb1 === undefined)
        console.warn("Missing physics body for entity", entityId1);
      if (rb2 === undefined)
        console.warn("Missing physics body for entity", entityId2);
      return;
    }
    const cache1 = this.rigidBodyHandleToPhysicsCache.get(rb1);
    const cache2 = this.rigidBodyHandleToPhysicsCache.get(rb2);
    const coll12 = cache1?.collByRigidBody.get(rb2);
    if (coll12) coll12.enabled = false;
    const coll21 = cache2?.collByRigidBody.get(rb1);
    if (coll21) coll21.enabled = false;
  }
  enableActiveCollisionsBetween(entityId1: string, entityId2: string) {
    const rb1 = this.entityIdToPhysicsHooks.get(entityId1)?.rigidBodyHandle;
    const rb2 = this.entityIdToPhysicsHooks.get(entityId2)?.rigidBodyHandle;
    if (rb1 === undefined || rb2 === undefined) {
      if (rb1 === undefined)
        console.warn("Missing physics body for entity", entityId1);
      if (rb2 === undefined)
        console.warn("Missing physics body for entity", entityId2);
      return;
    }
    const cache1 = this.rigidBodyHandleToPhysicsCache.get(rb1);
    const cache2 = this.rigidBodyHandleToPhysicsCache.get(rb2);
    const coll12 = cache1?.collByRigidBody.get(rb2);
    if (coll12) coll12.enabled = true;
    const coll21 = cache2?.collByRigidBody.get(rb1);
    if (coll21) coll21.enabled = true;
  }
  attachControls(controls: ControlsAPI<BaseEntityType>) {
    this.controls = controls;
    this.emit(EntityLevelEvents.AttachControls, controls);
  }
  detachControls() {
    this.controls = undefined;
    this.emit(EntityLevelEvents.DetachControls);
  }
  getFullSnapshot() {
    const entitiesSnapshot: Record<string, EntitySnapshotOrRemoved> = {};
    for (const [entityId, entitySnapshot] of this.entitySnapshots) {
      entitiesSnapshot[entityId] = entitySnapshot;
    }
    for (const [entityId, entity] of this.entities) {
      const persist = entity.persist ?? entity.initialProps.inLevelDef;
      if (!persist) continue;
      const entitySnapshot = entity.getSnapshot?.();
      if (entitySnapshot) entitiesSnapshot[entityId] = entitySnapshot;
    }
    const snapshot: EntityLevelSnapshot = {
      state: this.state.getAllValues(),
      entities: entitiesSnapshot
    };
    return snapshot;
  }
  applySnapshot(snapshot: EntityLevelSnapshot) {
    // Apply state snapshot.
    for (const [k, v] of Object.entries(snapshot.state ?? {})) {
      this.state.setValue(k, v);
    }
    // Apply entity snapshots.
    this.entitySnapshots = new Map();
    for (const [entityId, entitySnapshot] of Object.entries(
      snapshot.entities
    )) {
      this.entitySnapshots.set(entityId, entitySnapshot);
      const entity = this.entities.get(entityId);
      if (entity === undefined) continue;
      if (isEntitySnapshot(entitySnapshot)) {
        entity.applySnapshot?.(entitySnapshot);
      }
      if (isRemovedEntitySnapshot(entitySnapshot)) {
        this.removeEntity(entityId);
      }
    }
  }
  bindEntityToVariable(entityId: string) {
    const entity = this.getEntity(entityId);
    if (!entity) return null;
    if (!entity.canBindToVariable) return null;
    const entityType = entity.type;
    let typeBindings = this.spellVariableBindings.get(entityType);
    if (typeBindings === undefined) {
      typeBindings = new Map<string, string>();
      this.spellVariableBindings.set(entityType, typeBindings);
    }
    const prefix = entity.bindingPrefix ?? entity.type.toLowerCase();
    const suffix = typeBindings.size + 1;
    const binding = `${prefix}_${suffix}`;
    typeBindings.set(entityId, binding);
    entity.bindToVariable?.(binding);
    if (this.spellApi) {
      for (const ctx of Object.values(this.spellApi.getSpellCtxs())) {
        ctx.bindEntityToVariable(entity, binding);
      }
    }
    return binding;
  }
  getEntityIdToBindings() {
    const result: Record<string, string> = {};
    for (const bindings of this.spellVariableBindings.values()) {
      for (const [entityId, binding] of bindings) {
        result[entityId] = binding;
      }
    }
    return result;
  }
  populateSpellCtxWithBindings(ctx: SpellCtx) {
    const bindings = this.getEntityIdToBindings();
    for (const [entityId, binding] of Object.entries(bindings)) {
      const entity = this.getEntity(entityId);
      if (!entity) continue;
      ctx.bindEntityToVariable(entity, binding);
    }
    ctx.syncEntitiesNow();
  }
  setBackgroundColor(color: ColorRepresentation) {
    this.backgroundColor = new Color(color);
  }
  setAssetDependencies(assetDeps: string[]): void {
    this.assetDependencies = assetDeps;
  }
  setEntityLoaderProvider(provider: EntityLoadingProviderAPI) {
    this.entityLoadingProvider = provider;
  }
  async constructEntityAfterPreload<
    T extends BaseEntityType,
    P extends EntityProps
  >(typeName: string, props: P): Promise<T | null> {
    if (!this.entityLoadingProvider) return null;
    await this.entityLoadingProvider.preloadEntityType(typeName);
    return this.entityLoadingProvider.constructEntity({
      ...props,
      type: typeName
    }) as T | null;
  }
  setDefaultMusic(music: keyof MusicAssets) {
    this.defaultMusic = music;
  }
  setDefaultMusicGain(gain: number) {
    this.defaultMusicGain = gain;
  }
}

export type EntityLoadingProviderAPI = {
  preloadEntityType(typeName: string): Promise<unknown>;
  constructEntity<
    T extends BaseEntityType,
    P extends EntityProps & { type: string }
  >(
    props: P
  ): T | null;
};
