import { SavedSpell } from "src/api/spells";

import { BuiltInScriptMetadata } from "./builtInsTypes";
import { BuiltInScriptId } from "./keys";

const builtInRawScripts = import.meta.glob<{ default: string }>(
  "./raw/*.raw.js",
  { eager: true }
);
const builtInModuleMetadata = import.meta.glob<{
  default: BuiltInScriptMetadata;
}>("./raw/*.ts", { eager: true });

function buildModuleMapping<T>(modules: Record<string, T>) {
  return new Map(
    Object.entries(modules).map(([path, mod]) => {
      const parts = path.split("/");
      const fileName = parts.at(-1);
      const fileNameBase = fileName?.split(".").at(0);
      if (!fileNameBase) return ["", mod];
      return [fileNameBase, mod];
    })
  );
}

const builtIns: Record<string, SavedSpell> = {};
const rawScriptsByKey = buildModuleMapping(builtInRawScripts);
const metadataByKey = buildModuleMapping(builtInModuleMetadata);

for (const [key, scriptMod] of rawScriptsByKey) {
  const savedSpellWithoutCode =
    metadataByKey.get(key)?.default ??
    ({
      name: key,
      id: key
    } satisfies BuiltInScriptMetadata);
  const savedSpell = {
    ...savedSpellWithoutCode,
    code: scriptMod.default
  } satisfies SavedSpell;
  builtIns[key] = savedSpell;
}

export const builtInSpells = builtIns as Record<BuiltInScriptId, SavedSpell>;
