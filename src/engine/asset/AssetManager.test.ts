import { Loader } from "src/api/loader";

import { centralAssetManager } from "./AssetManager";

jest.mock("src/assets/allAssets", () => {
  const { EventEmitter } = require("events");

  function makeMockLoader(name: string) {
    const emitter = new EventEmitter();
    emitter.resource = undefined;
    emitter.resourceName = name;
    emitter.resourceSize = 100;
    emitter.resourceProgress = 0;
    emitter.completionPromise = Promise.resolve(undefined);
    emitter.load = jest.fn();
    emitter.unload = jest.fn();
    return emitter;
  }

  const _testLoaders = {
    testSpriteA: makeMockLoader("testSpriteA"),
    testSpriteB: makeMockLoader("testSpriteB"),
    testTexture: makeMockLoader("testTexture"),
    testSound: makeMockLoader("testSound")
  };

  return {
    __esModule: true,
    _testLoaders,
    assetsRegistry: {
      keys: () => Object.keys(_testLoaders),
      add: (key: string, loader: any) => {
        (_testLoaders as any)[key] = loader;
      },
      get: (key: string) => (_testLoaders as any)[key] ?? null
    }
  };
});

const { _testLoaders: testLoaders } = jest.requireMock<{
  _testLoaders: Record<string, Loader>;
}>("src/assets/allAssets");

/**
 * Simulates a successful load on a mock loader by setting its resource,
 * mirroring what real loaders do after their load() resolves.
 */
function simulateLoad(loader: Loader): void {
  loader.resource = { type: loader.resourceName };
  loader.resourceProgress = 1;
}

/**
 * Simulates an unload on a mock loader by clearing its resource,
 * mirroring what real loaders do after their unload() resolves.
 */
function simulateUnload(loader: Loader): void {
  loader.resource = undefined;
  loader.resourceProgress = 0;
}

beforeEach(() => {
  (centralAssetManager as any).referenceCounts.clear();
  for (const loader of Object.values(testLoaders)) {
    loader.resource = undefined;
    loader.resourceProgress = 0;
    (loader.load as jest.Mock).mockClear();
    (loader.unload as jest.Mock).mockClear();
  }
});

describe("AssetManager", () => {
  describe("acquireReference", () => {
    it("returns the loader for a known asset key", () => {
      const loader = centralAssetManager.acquireReference("testSpriteA");
      expect(loader).toBe(testLoaders.testSpriteA);
    });

    it("returns null for an unknown asset key", () => {
      const loader = centralAssetManager.acquireReference("nonExistentAsset$$");
      expect(loader).toBeNull();
    });

    it("returns null for an empty string key", () => {
      const loader = centralAssetManager.acquireReference("");
      expect(loader).toBeNull();
    });

    it("returns null for various garbage strings", () => {
      expect(centralAssetManager.acquireReference("🎮🎲")).toBeNull();
      expect(centralAssetManager.acquireReference("   ")).toBeNull();
      expect(centralAssetManager.acquireReference("null")).toBeNull();
      expect(centralAssetManager.acquireReference("undefined")).toBeNull();
    });

    it("increments reference count on each acquire", () => {
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.acquireReference("testSpriteA");
      const count = (centralAssetManager as any).referenceCounts.get(
        "testSpriteA"
      );
      expect(count).toBe(3);
    });

    it("does not increment reference count for unknown keys", () => {
      centralAssetManager.acquireReference("doesNotExist");
      const count = (centralAssetManager as any).referenceCounts.get(
        "doesNotExist"
      );
      expect(count).toBeUndefined();
    });

    it("returns the same loader on repeated acquires", () => {
      const first = centralAssetManager.acquireReference("testSpriteA");
      const second = centralAssetManager.acquireReference("testSpriteA");
      expect(first).toBe(second);
    });
  });

  describe("get", () => {
    it("returns the loaded resource after load completes", () => {
      const loader = centralAssetManager.acquireReference("testSpriteA")!;
      simulateLoad(loader);

      const resource = centralAssetManager.get<any>("testSpriteA");
      expect(resource).toEqual({ type: "testSpriteA" });
    });

    it("returns distinct resources for different asset keys", () => {
      const loaderA = centralAssetManager.acquireReference("testSpriteA")!;
      const loaderB = centralAssetManager.acquireReference("testSpriteB")!;
      simulateLoad(loaderA);
      simulateLoad(loaderB);

      const resourceA = centralAssetManager.get<any>("testSpriteA");
      const resourceB = centralAssetManager.get<any>("testSpriteB");
      expect(resourceA.type).toBe("testSpriteA");
      expect(resourceB.type).toBe("testSpriteB");
      expect(resourceA).not.toEqual(resourceB);
    });

    it("throws for a known asset that has not been loaded yet", () => {
      centralAssetManager.acquireReference("testTexture");
      expect(() => centralAssetManager.get<any>("testTexture")).toThrow();
    });

    it("throws for an unknown asset key", () => {
      expect(() =>
        centralAssetManager.get<any>("completelyFakeAsset")
      ).toThrow();
    });

    it("throws for garbage string keys", () => {
      expect(() => centralAssetManager.get<any>("")).toThrow();
      expect(() => centralAssetManager.get<any>("🎮")).toThrow();
      expect(() => centralAssetManager.get<any>("   ")).toThrow();
    });
  });

  describe("releaseReference", () => {
    it("decrements reference count for a known asset", () => {
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      const count = (centralAssetManager as any).referenceCounts.get(
        "testSpriteA"
      );
      expect(count).toBe(1);
    });

    it("does not go below zero", () => {
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      const count = (centralAssetManager as any).referenceCounts.get(
        "testSpriteA"
      );
      expect(count).toBe(0);
    });

    it("is a no-op for unknown keys", () => {
      expect(() =>
        centralAssetManager.releaseReference("totallyFakeKey")
      ).not.toThrow();
    });

    it("is a no-op for garbage strings", () => {
      expect(() => centralAssetManager.releaseReference("")).not.toThrow();
      expect(() => centralAssetManager.releaseReference("🎮")).not.toThrow();
    });

    it("is a no-op for keys that were never acquired", () => {
      expect(() =>
        centralAssetManager.releaseReference("testSpriteB")
      ).not.toThrow();
      const count = (centralAssetManager as any).referenceCounts.get(
        "testSpriteB"
      );
      expect(count).toBeUndefined();
    });
  });

  describe("unloadUnusedAssets", () => {
    it("unloads assets with zero references", () => {
      const loader = centralAssetManager.acquireReference("testSpriteA")!;
      simulateLoad(loader);
      expect(loader.resource).toBeTruthy();

      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.unloadUnusedAssets();

      expect(loader.unload).toHaveBeenCalled();
    });

    it("does not unload assets that still have references", () => {
      const loader = centralAssetManager.acquireReference("testSpriteA")!;
      simulateLoad(loader);

      // Acquire a second reference then release one — count is still 1.
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");

      centralAssetManager.unloadUnusedAssets();
      expect(loader.unload).not.toHaveBeenCalled();
    });

    it("cleans up the reference count entry after unloading", () => {
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.unloadUnusedAssets();

      const count = (centralAssetManager as any).referenceCounts.get(
        "testSpriteA"
      );
      expect(count).toBeUndefined();
    });

    it("is safe to call multiple times", () => {
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");

      centralAssetManager.unloadUnusedAssets();
      centralAssetManager.unloadUnusedAssets();
      centralAssetManager.unloadUnusedAssets();

      // unload called only once — entry deleted after first prune.
      expect(testLoaders.testSpriteA.unload).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when there are no assets to unload", () => {
      expect(() => centralAssetManager.unloadUnusedAssets()).not.toThrow();
    });

    it("does not affect assets that were never acquired", () => {
      // Acquire and release only spriteA.
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.unloadUnusedAssets();

      // spriteB was never touched — should not be unloaded.
      expect(testLoaders.testSpriteB.unload).not.toHaveBeenCalled();
      expect(testLoaders.testTexture.unload).not.toHaveBeenCalled();
      expect(testLoaders.testSound.unload).not.toHaveBeenCalled();
    });
  });

  describe("level transition workflow", () => {
    it("preloads all assets for a level and verifies they are accessible", () => {
      const levelAssets = [
        "testSpriteA",
        "testSpriteB",
        "testTexture",
        "testSound"
      ];

      // Acquire all assets (what LevelLoader does).
      for (const key of levelAssets) {
        const loader = centralAssetManager.acquireReference(key)!;
        expect(loader).toBeTruthy();
      }

      // Simulate MultiLoader completing all loads.
      for (const key of levelAssets) {
        simulateLoad(testLoaders[key]);
      }

      // Every asset should be accessible via get.
      for (const key of levelAssets) {
        const resource = centralAssetManager.get<any>(key);
        expect(resource).toBeTruthy();
        expect(resource.type).toBe(key);
      }
    });

    it("transitions from level 1 to level 2 with deferred unloading", () => {
      // --- Level 1 preload: needs spriteA, spriteB, texture ---
      const level1Assets = ["testSpriteA", "testSpriteB", "testTexture"];

      for (const key of level1Assets) {
        centralAssetManager.acquireReference(key);
        simulateLoad(testLoaders[key]);
      }

      // Verify all level 1 assets are accessible.
      for (const key of level1Assets) {
        expect(centralAssetManager.get<any>(key).type).toBe(key);
      }

      // --- Level 1 teardown: release all ---
      for (const key of level1Assets) {
        centralAssetManager.releaseReference(key);
      }

      // Assets should STILL be accessible before pruning (deferred unload).
      for (const key of level1Assets) {
        expect(centralAssetManager.get<any>(key).type).toBe(key);
      }

      // --- Level 2 preload: needs spriteB and sound (spriteB shared) ---
      const level2Assets = ["testSpriteB", "testSound"];

      for (const key of level2Assets) {
        centralAssetManager.acquireReference(key);
        simulateLoad(testLoaders[key]);
      }

      // --- Prune AFTER level 2 finishes loading ---
      centralAssetManager.unloadUnusedAssets();

      // spriteA: only level 1 — should be unloaded.
      expect(testLoaders.testSpriteA.unload).toHaveBeenCalled();

      // texture: only level 1 — should be unloaded.
      expect(testLoaders.testTexture.unload).toHaveBeenCalled();

      // spriteB: shared — should NOT be unloaded.
      expect(testLoaders.testSpriteB.unload).not.toHaveBeenCalled();

      // sound: new for level 2 — should NOT be unloaded.
      expect(testLoaders.testSound.unload).not.toHaveBeenCalled();

      // Level 2 assets remain accessible.
      expect(centralAssetManager.get<any>("testSpriteB").type).toBe(
        "testSpriteB"
      );
      expect(centralAssetManager.get<any>("testSound").type).toBe("testSound");
    });

    it("verifies unloaded assets throw on get after garbage collection", () => {
      // Load and then fully release spriteA.
      centralAssetManager.acquireReference("testSpriteA");
      simulateLoad(testLoaders.testSpriteA);
      centralAssetManager.releaseReference("testSpriteA");

      // Prune and simulate the loader clearing its resource.
      centralAssetManager.unloadUnusedAssets();
      simulateUnload(testLoaders.testSpriteA);

      // get should now throw since the resource was garbage collected.
      expect(() => centralAssetManager.get<any>("testSpriteA")).toThrow();
    });

    it("allows re-acquiring an asset after it was unloaded", () => {
      // Level 1: load spriteA.
      centralAssetManager.acquireReference("testSpriteA");
      simulateLoad(testLoaders.testSpriteA);

      // Level 1 teardown.
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.unloadUnusedAssets();
      simulateUnload(testLoaders.testSpriteA);

      // Level 2: re-acquire and re-load spriteA.
      const loader = centralAssetManager.acquireReference("testSpriteA")!;
      expect(loader).toBeTruthy();
      simulateLoad(loader);

      // Should be accessible again.
      const resource = centralAssetManager.get<any>("testSpriteA");
      expect(resource).toEqual({ type: "testSpriteA" });
    });

    it("handles acquiring the same asset multiple times across levels", () => {
      // Level 1 acquires spriteA twice (e.g., two entities using it).
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.acquireReference("testSpriteA");
      simulateLoad(testLoaders.testSpriteA);

      expect(
        (centralAssetManager as any).referenceCounts.get("testSpriteA")
      ).toBe(2);

      // Level 1 teardown releases both.
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteA");

      // Level 2 re-acquires it before prune happens.
      centralAssetManager.acquireReference("testSpriteA");

      // Prune — spriteA has refcount 1 from level 2, should not unload.
      centralAssetManager.unloadUnusedAssets();
      expect(testLoaders.testSpriteA.unload).not.toHaveBeenCalled();
    });

    it("performs a three-level transition correctly", () => {
      // --- Level 1: spriteA, spriteB ---
      centralAssetManager.acquireReference("testSpriteA");
      centralAssetManager.acquireReference("testSpriteB");
      simulateLoad(testLoaders.testSpriteA);
      simulateLoad(testLoaders.testSpriteB);

      // Level 1 teardown.
      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteB");

      // --- Level 2: spriteB, texture ---
      centralAssetManager.acquireReference("testSpriteB");
      centralAssetManager.acquireReference("testTexture");
      simulateLoad(testLoaders.testTexture);

      // Prune after level 2 loads.
      centralAssetManager.unloadUnusedAssets();
      expect(testLoaders.testSpriteA.unload).toHaveBeenCalledTimes(1);
      expect(testLoaders.testSpriteB.unload).not.toHaveBeenCalled();

      // Level 2 teardown.
      centralAssetManager.releaseReference("testSpriteB");
      centralAssetManager.releaseReference("testTexture");

      // --- Level 3: sound only ---
      centralAssetManager.acquireReference("testSound");
      simulateLoad(testLoaders.testSound);

      // Prune after level 3 loads.
      centralAssetManager.unloadUnusedAssets();
      expect(testLoaders.testSpriteB.unload).toHaveBeenCalledTimes(1);
      expect(testLoaders.testTexture.unload).toHaveBeenCalledTimes(1);
      expect(testLoaders.testSound.unload).not.toHaveBeenCalled();

      // Only sound should be accessible.
      expect(centralAssetManager.get<any>("testSound").type).toBe("testSound");
    });

    it("unloads everything when no level is active", () => {
      const loaderA = centralAssetManager.acquireReference("testSpriteA")!;
      const loaderB = centralAssetManager.acquireReference("testSpriteB")!;
      simulateLoad(loaderA);
      simulateLoad(loaderB);

      centralAssetManager.releaseReference("testSpriteA");
      centralAssetManager.releaseReference("testSpriteB");
      centralAssetManager.unloadUnusedAssets();

      expect(loaderA.unload).toHaveBeenCalled();
      expect(loaderB.unload).toHaveBeenCalled();
    });
  });
});
