import path from "path-browserify";
import shortid from "shortid";
import { Color, Texture, Vector2, Vector3 } from "three";

import { AssetConsumerType } from "src/api/asset";
import {
  BaseEntityType,
  EntityClassType,
  EntityLevelEvents,
  EntityLevelSnapshot,
  EntityProps,
  isRemovedEntitySnapshot
} from "src/api/entity";
import { Loader } from "src/api/loader";
import { createEntityAssetLoader } from "src/engine/entity/createEntityAssetLoader";
import {
  EntityLoadingProviderAPI,
  Level,
  kWorldGravity
} from "src/engine/level/Level";
import {
  AbstractLoader,
  MultiLoader,
  TextureResourceLoader
} from "src/engine/loader/Loaders";
import { NavigationGridAsync } from "src/engine/navigation/NavigationGridAsync";
import { loadTerrainForTiledLevelWithTileDefs } from "src/engine/navigation/TiledTerrainLoader";
import { anyToVector2 } from "src/engine/util/vecTypes";
import { entityClassRegistry } from "src/entities/allEntities";
import { HelloWorld } from "src/entities/dev/HelloWorld";
import { ParallaxImage } from "src/entities/environment/ParallaxImage";
import { BaseTerrain } from "src/entities/terrain/BaseTerrain";
import {
  createEntityForMapTerrain,
  resolvePersistentTerrainAssets
} from "src/entities/terrain/allTerrain";
import {
  selectActiveAllies,
  selectIsDemoMode
} from "src/redux/gameState/selectors";
import { setActiveAllies } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import { centralAssetManager } from "../asset/AssetManager";
import { kInvPixelScale } from "../constants/scaling";
import { LevelDefinitionAPI, TilesetDefinitionAPI } from "./LevelLoaderAPI";
import { levelLoaderContext } from "./LevelLoaderContext";
import { TilesetTileDefs } from "./tiled/api";
import { parseMap } from "./tiled/parseMap";
import { parseTileset } from "./tiled/parseTileset";
import { ITiledLevelJSON } from "./tiled/tiledJson";
import { extendEdges } from "./util/extendEdges";

export type LevelLoaderAPI = Loader<Level> &
  EntityLoadingProviderAPI & {
    readonly levelId: string;
    setSnapshot(snapshot: EntityLevelSnapshot): LevelLoaderAPI;
  };
export class LevelLoader
  extends AbstractLoader<Level>
  implements LevelLoaderAPI
{
  public levelId: string;
  private snapshot?: EntityLevelSnapshot;
  private levelDefOverride?: LevelDefinitionAPI;
  constructor(levelId: string) {
    super(`Level:${levelId}`);
    this.levelId = levelId;
  }
  setSnapshot(snapshot?: EntityLevelSnapshot) {
    this.snapshot = snapshot;
    return this;
  }
  setLevelDef(def: LevelDefinitionAPI) {
    this.levelDefOverride = def;
    return this;
  }
  async load() {
    try {
      const result = await this._load();
      this.resolve?.(result);
      return result;
    } catch (err) {
      this.reject?.(err as Error);
      throw err;
    }
  }
  async _load() {
    const rapier = await getRapier();
    const levelId = this.levelId;

    // Load level definition. Prefer an explicit override (used by the editor
    // and screenshot tooling) over the registered definition.
    const levelDef =
      this.levelDefOverride ??
      levelLoaderContext.hotLoaders.levels.getResource(levelId);
    if (!levelDef) {
      throw new Error(`[LevelLoader]: missing level "${levelId}".`);
    }

    // Resolve level JSON (this can be async.)
    let levelJson: ITiledLevelJSON;
    if (typeof levelDef.mapJson === "function") {
      levelJson = await levelDef.mapJson();
    } else {
      levelJson = levelDef.mapJson;
    }

    // Load any referenced tilesets.
    const tilesetDefinitions: Record<string, TilesetDefinitionAPI> = {};
    const parsedTilesets: Record<string, TilesetTileDefs> = {};
    for (const tilesetRef of levelJson.tilesets) {
      const tileSetPath = path.parse(tilesetRef.source);
      const tileSetName = tileSetPath.name;
      const tileSetDef =
        levelDef.tileSets?.[tileSetName] ??
        levelLoaderContext.hotLoaders.tileSets.getResource(tileSetName);
      if (tileSetDef === null) {
        throw new Error(`[LevelLoader]: missing tileset "${tileSetName}".`);
      }
      tilesetDefinitions[tileSetName] = tileSetDef;
      parsedTilesets[tileSetName] = parseTileset(tileSetDef.tileSetJson);
    }

    // Parse the level.
    const levelMap = parseMap({
      levelJson,
      tileSets: parsedTilesets,
      images: levelDef.images,
      layers: levelDef.layers
    });

    // Extend the edges of any level geometry that touches the level's bbox.
    const terrainExtensions = extendEdges(levelMap);

    // Add resource loaders for the tile set textures.
    const tilesetLoaders: Record<string, TextureResourceLoader> = {};
    for (const tileSetId of Object.keys(tilesetDefinitions)) {
      const textureUrl = tilesetDefinitions[tileSetId].tileSetImage;
      tilesetLoaders[tileSetId] = new TextureResourceLoader(
        `tileset:${tileSetId}`,
        textureUrl
      );
    }
    const sharedTilesetLoader = new MultiLoader(
      `level:${levelId}:tilesets`,
      tilesetLoaders
    );

    // Add resource loaders for images.
    let hasAnyImages = false;
    const imageLoaders: Record<string, TextureResourceLoader> = {};
    for (const [imageName, imageUrl] of Object.entries(levelDef.images ?? {})) {
      hasAnyImages = true;
      imageLoaders[imageName] = new TextureResourceLoader(
        `image:${imageName}`,
        imageUrl
      );
    }
    const sharedImageLoader = hasAnyImages
      ? new MultiLoader(`level:${levelId}:image`, imageLoaders)
      : null;

    // Add resource loaders for all entities in the level.
    // TODO: be selective about entity types here.
    // Ensure items are preloaded before this.
    // Ensure entity dependencies are also loaded, such as active allies.
    // TODO: alvin: confirm if I did the above correctly, a bit messy and re-used code but I do not want to break anything and do any major refactor here

    const allAssetKeysToPreload = new Set<string>();
    const allAssetConsumersToResolve = new Set<AssetConsumerType>();

    allAssetConsumersToResolve.add(levelDef);

    // allies
    if (
      levelDef.demoAllies !== undefined &&
      selectIsDemoMode(store.getState())
    ) {
      const demoAllyTypes = levelDef.demoAllies.map((ally) => ally.type);
      store.dispatch(setActiveAllies(demoAllyTypes));
    }

    selectActiveAllies(store.getState())
      .map((typeName) => entityClassRegistry.get(typeName))
      .filter((possibleAllyClass) => !!possibleAllyClass)
      .forEach((allyClass) => allAssetConsumersToResolve.add(allyClass));

    const allMapEntityLayers = levelMap.layers.filter(
      (layer) => layer.type === "entities"
    );

    // TODO: MIGRATE
    const legacyAllEntityClasses: EntityClassType[] = [];

    for (const entityLayer of allMapEntityLayers) {
      for (const entityDef of entityLayer.entities) {
        const entityClass = entityClassRegistry.get(entityDef.type);
        if (!entityClass) continue;

        legacyAllEntityClasses.push(entityClass);

        // we prematurely call the consumer methods here because there are props to pass
        const entityInstanceProps = entityDef.props;
        entityClass
          .getAssetDependencies?.(entityInstanceProps)
          .forEach((assetKey) => allAssetKeysToPreload.add(assetKey));
        entityClass
          .getConsumerDependencies?.(entityInstanceProps)
          .forEach((consumer) => allAssetConsumersToResolve.add(consumer));
      }
    }

    // This is a kludge.
    for (const assetKey of resolvePersistentTerrainAssets()) {
      allAssetKeysToPreload.add(assetKey);
    }

    // now... do a BFS of the entire dependency tree until it has been exhausted
    // WARN: do not delete from the set, as that is the native safeguard against infinite loops,
    // exiting this loop means we have exhausted all unique asset consumers and now have all the asset keys we need
    for (const consumer of allAssetConsumersToResolve) {
      consumer
        .getAssetDependencies?.()
        .forEach((assetKey) => allAssetKeysToPreload.add(assetKey));
      consumer
        .getConsumerDependencies?.()
        .forEach((consumer) => allAssetConsumersToResolve.add(consumer));
    }

    const allAssetLoadersToPreload: Record<string, Loader> = {};
    for (const assetKey of allAssetKeysToPreload) {
      const assetLoader = centralAssetManager.acquireReference(assetKey);
      if (!assetLoader) continue;

      allAssetLoadersToPreload[assetKey] = assetLoader;
    }

    const allAssetsToPreloadLoader = new MultiLoader(
      "allAssetsToPreload",
      allAssetLoadersToPreload
    );

    /*
     * WARN: LEGACY SUPPORT. MIGRATE LATER WHEN .loaders IS NOT LONGER USED
     */
    const oldEntityAssetLoader = createEntityAssetLoader(
      // [],
      // legacyAllEntityClasses,
      entityClassRegistry.getAll(),
      new Set()
    );

    // TODO: migrate completely to new asset management system
    const legacySupportingEntityLoaders: Record<string, Loader> = {
      new: allAssetsToPreloadLoader,
      old: oldEntityAssetLoader
    };

    const entityAssetLoader = new MultiLoader(
      "entityAssetsToBeMigrated",
      legacySupportingEntityLoaders
    );

    const loaders: Record<string, Loader> = {
      tilesets: sharedTilesetLoader,
      entities: entityAssetLoader
    };
    if (sharedImageLoader) loaders["images"] = sharedImageLoader;
    const sharedLoader = new MultiLoader(`level:${levelId}:assets`, loaders);

    // Load everything.
    sharedLoader.on("progress", () => {
      this.resourceProgress = sharedLoader.resourceProgress;
      this.emit("progress", this);
    });
    await sharedLoader.load();

    // Assign loaded textures to tile sheet definitions.
    for (const [tileSetId, tileSetDef] of Object.entries(parsedTilesets)) {
      const texture = tilesetLoaders[tileSetId].resource;
      tileSetDef.sheetInfo.texture = texture;
    }

    // Assign loaded textures to images.
    const imageTextures: Record<string, Texture> = {};
    for (const imageName of Object.keys(levelDef.images ?? {})) {
      const texture = imageLoaders[imageName]?.resource;
      if (!texture) continue;
      imageTextures[imageName] = texture;
    }

    // Create level.
    const level = new Level(levelId, rapier);
    level.setEntityLoaderProvider(this);
    level.setAssetDependencies([...allAssetKeysToPreload]);
    level.setDefinition(levelDef);
    level.demoItems = levelDef.demoItems;

    // Add music.
    if (levelDef.ambientMusic !== undefined)
      level.setDefaultMusic(levelDef.ambientMusic);
    if (levelDef.ambientMusicGain !== undefined)
      level.setDefaultMusicGain(levelDef.ambientMusicGain);

    // Add background color.
    const backgroundColor =
      levelDef.backgroundColor ??
      (levelJson.backgroundcolor
        ? new Color(levelJson.backgroundcolor)
        : undefined);
    if (backgroundColor !== undefined) level.backgroundColor = backgroundColor;

    // Add a nav grid to the level.
    const navTerrain = loadTerrainForTiledLevelWithTileDefs(
      levelJson,
      parsedTilesets,
      new Vector2(kInvPixelScale, -kInvPixelScale)
    );
    const navGrid = new NavigationGridAsync(
      navTerrain,
      levelJson.tilewidth * kInvPixelScale,
      Math.abs(kWorldGravity.y)
    );
    level.navigation = navGrid;
    level.navTerrain = navTerrain;
    navGrid.setupIncrementalObstacleUpdates(level);

    const entitiesToAdd: BaseEntityType[] = [];

    // Traverse level layers, create terrain and entities.
    for (const layer of levelMap.layers) {
      if (layer.type === "tiles") {
        const layerOffset = new Vector3();
        if (layer.offset !== undefined) {
          layerOffset.x += layer.offset.x * (layer.parallax?.x ?? 1);
          layerOffset.y += layer.offset.y * (layer.parallax?.y ?? 1);
        }
        for (const terrainDef of layer.terrain) {
          const terrainEntity = createEntityForMapTerrain(layer, terrainDef);
          if (terrainEntity?.object3D && layer.properties?.invisible)
            terrainEntity.object3D.visible = false;
          if (!terrainEntity) continue;
          entitiesToAdd.push(terrainEntity);
          if (!layer.parallax) {
            level.worldBBox.expandByPoint(terrainDef.bbox.min);
            level.worldBBox.expandByPoint(terrainDef.bbox.max);
          }
        }
        continue;
      }
      if (layer.type === "entities") {
        if (!layer.visible) level.registerHiddenEntityLayer(layer.name);
        for (const entityDef of layer.entities) {
          if (this.snapshot && entityDef.props.id) {
            const entitySnapshot = this.snapshot.entities[entityDef.props.id];
            if (entitySnapshot && isRemovedEntitySnapshot(entitySnapshot))
              continue;
          }
          // Expand bounds if requested.
          if (layer.expandBounds) {
            const position = entityDef.props.position;
            const size = entityDef.props.size;
            const pos2 = anyToVector2(position);
            level.worldBBox.expandByPoint(pos2);
            if (size) {
              pos2.x += size.width * 0.5;
              pos2.y += size.height * 0.5;
              level.worldBBox.expandByPoint(pos2);
            }
          }
          // TODO: Use a map here for faster lookup.
          const EntityClass = entityClassRegistry.get(entityDef.type);
          if (EntityClass !== null) {
            const entity = new EntityClass(entityDef.props);
            entitiesToAdd.push(entity);
          } else {
            const entity = new HelloWorld(entityDef.props);
            entitiesToAdd.push(entity);
          }
        }
        continue;
      }
      if (layer.type === "image") {
        if (layer.imageName) {
          const layerTexture = imageTextures[layer.imageName];
          if (layerTexture) {
            layer.texture = layerTexture;
            const image = layerTexture.image as HTMLImageElement;
            layer.size = new Vector2(image.naturalWidth, image.naturalHeight);
            const entity = new ParallaxImage({
              id: `image:${shortid()}`,
              position: new Vector3(0, 0, layer.depth),
              layer,
              layerName: layer.name
            });
            entitiesToAdd.push(entity);
          }
        }
        continue;
      }
    }

    for (const entity of entitiesToAdd) {
      if (this.snapshot?.entities[entity.id]?.removed) continue;
      level.addEntity(entity);
    }

    // Add terrain extensions.
    for (const terrainDef of terrainExtensions) {
      const terrainEntity = new BaseTerrain({
        id: terrainDef.id,
        position: new Vector3(terrainDef.pos.x, terrainDef.pos.y, 0),
        terrain: terrainDef
      });
      level.addEntity(terrainEntity);
    }

    // Apply snapshot to all level entities.
    if (this.snapshot) level.applySnapshot(this.snapshot);

    // Invoke optional setup function.
    const setupResult = await levelDef.setup?.(level);
    level.on(EntityLevelEvents.Teardown, () =>
      levelDef.teardown?.(level, setupResult)
    );

    return level;
  }
  preloadEntityType(typeName: string): Promise<unknown> {
    const EntityClass = entityClassRegistry.get(typeName);
    if (EntityClass === null)
      return Promise.reject(
        "Unable to find the specified entity type in the class registry."
      );
    const entityAssetLoader = createEntityAssetLoader(
      [EntityClass],
      new Set([typeName])
    );
    return entityAssetLoader.load();
  }
  constructEntity<
    T extends BaseEntityType,
    P extends EntityProps & { type: string }
  >(props: P): T | null {
    const EntityClass = entityClassRegistry.get(props.type);
    if (EntityClass !== null) {
      return new EntityClass(props) as T;
    }
    return null;
  }
}

let rapierInstance:
  | Awaited<typeof import("@dimforge/rapier2d-compat")>
  | undefined;

async function getRapier() {
  if (rapierInstance) return rapierInstance;
  rapierInstance = await import("@dimforge/rapier2d-compat");
  // Suppress rapier's internal deprecation warning during wasm init
  // (rapier 0.17.x passes raw bytes to __wbg_init which triggers a self-warning)
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("deprecated parameters for the initialization function")
    )
      return;
    origWarn.apply(console, args);
  };
  await rapierInstance.init();
  console.warn = origWarn;
  return rapierInstance;
}
