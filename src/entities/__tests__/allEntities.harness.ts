import RAPIER from "@dimforge/rapier2d-compat";
import { Box2, Vector2 } from "three";

import { AssetConsumerType } from "src/api/asset";
import { EntityClassType, EntityProps } from "src/api/entity";
import { Loader } from "src/api/loader";
import { centralAssetManager } from "src/engine/asset/AssetManager";
import { createEntityAssetLoader } from "src/engine/entity/createEntityAssetLoader";
import { Level } from "src/engine/level/Level";
import { MultiLoader } from "src/engine/loader/Loaders";
import { allEntities } from "src/entities/allEntities";
import { allItems } from "src/items/allItems";

type EntityTestResult = {
  type: string;
  passed: boolean;
  error?: string;
};

// Some entities require specific props beyond just position.
const extraProps: Record<string, Partial<EntityProps>> = {
  PopoverConversation: { participants: [], lines: [] },
  PlayerPickup: { itemType: "Log" },
  SpellAreaPreview: {
    previewPolygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ]
  },
  WaterTerrain: {
    terrain: {
      id: "test-water",
      pos: { x: 0, y: 0 },
      bbox: new Box2(new Vector2(0, 0), new Vector2(4, 4)),
      polygon: [],
      convexComponentPolygons: [
        [
          new Vector2(0, 0),
          new Vector2(4, 0),
          new Vector2(4, 4),
          new Vector2(0, 4)
        ]
      ],
      decalTiles: []
    }
  }
};

async function run(): Promise<EntityTestResult[]> {
  await RAPIER.init();

  // Load entity resources via the new asset dependency system (mirrors LevelLoader logic).
  const allAssetKeysToPreload = new Set<string>();
  const allAssetConsumersToResolve = new Set<AssetConsumerType>();

  for (const entityClass of allEntities) {
    allAssetConsumersToResolve.add(entityClass);
  }
  for (const itemClass of allItems as unknown as AssetConsumerType[]) {
    allAssetConsumersToResolve.add(itemClass);
  }

  for (const consumer of allAssetConsumersToResolve) {
    consumer
      .getAssetDependencies?.()
      .forEach((assetKey) => allAssetKeysToPreload.add(assetKey));
    consumer
      .getConsumerDependencies?.()
      .forEach((dep) => allAssetConsumersToResolve.add(dep));
  }

  const allAssetLoadersToPreload: Record<string, Loader> = {};
  for (const assetKey of allAssetKeysToPreload) {
    const assetLoader = centralAssetManager.acquireReference(assetKey);
    if (!assetLoader) continue;
    allAssetLoadersToPreload[assetKey] = assetLoader;
  }

  const newAssetLoader = new MultiLoader(
    "allAssetsToPreload",
    allAssetLoadersToPreload
  );

  // Load legacy entity resources (sprites, textures, etc.)
  const entityLoader = createEntityAssetLoader(allEntities);
  const itemLoader = createEntityAssetLoader(
    allItems as unknown as EntityClassType[]
  );

  const combinedLoader = new MultiLoader("allTestAssets", {
    new: newAssetLoader,
    entities: entityLoader,
    items: itemLoader
  });
  await combinedLoader.load();

  const results: EntityTestResult[] = [];

  for (const EntityClass of allEntities) {
    try {
      const level = new Level("test", RAPIER);
      const props: EntityProps = {
        position: { x: 0, y: 0, z: 0 },
        ...extraProps[EntityClass.type]
      };
      const entity = new EntityClass(props);
      level.addEntity(entity);

      const found = level.getEntity(entity.id);
      if (found !== entity)
        throw new Error("Entity not found in level after addEntity");

      results.push({ type: EntityClass.type, passed: true });
    } catch (err) {
      results.push({
        type: EntityClass.type,
        passed: false,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return results;
}

run().then((results) => {
  (window as any).__TEST_RESULTS__ = results;
});
