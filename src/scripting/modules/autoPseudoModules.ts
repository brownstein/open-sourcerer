import { SpellRuntimeModulePseudo } from "../runtime/SpellRuntimeAPI";
import { AutoBindPseudoModule } from "./autoAPI";

// Eagerly glob every `*.pseudo.ts` auto module so they can be merged into the
// worker's require() module map. Kept in its own file (separate from
// autoPseudo.ts) because `import.meta.glob` is a Vite-only build construct —
// pulling it into the entity-definition import graph would break it under Jest
// and any non-Vite consumer.
const psuedoModulesRaw = import.meta.glob<AutoBindPseudoModule>(
  "./auto/*.pseudo.ts",
  { eager: true }
);
const pseudoModulesAuto: Record<string, SpellRuntimeModulePseudo> = {};

for (const [key, pseudoMod] of Object.entries(psuedoModulesRaw)) {
  const fileName = key.split("/").at(-1);
  if (!fileName) continue;
  const nameParts = fileName.split(".");
  const firstNamePart = nameParts.at(0);
  if (!firstNamePart) continue;
  if (!pseudoMod.default) continue;
  const pseudoDef = pseudoMod.default;
  pseudoModulesAuto[pseudoDef.name] = pseudoDef;
}

export { pseudoModulesAuto };
