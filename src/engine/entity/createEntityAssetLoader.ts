import { AssetKey } from "node:sea";
import { EntityClassArray } from "src/api/entity";
import { Loader } from "src/api/loader";
import { MultiLoader } from "src/engine/loader/Loaders";

export function createEntityAssetLoader(
  defs: EntityClassArray,
  conditionalSet?: Set<string>
): Loader {
  const conditionals = conditionalSet ?? new Set<string>();
  const resourceMap: Record<string, Loader> = {};
  for (const def of defs) {
    if (!def.loaders) continue;
    if (def.loadConditionally && !conditionals.has(def.type)) continue;
    const loaderKey = `${def.type}:resources`;
    const defLoader = new MultiLoader(loaderKey, def.loaders);
    resourceMap[loaderKey] = defLoader;
  }
  return new MultiLoader("resourceLoader", resourceMap);
}
