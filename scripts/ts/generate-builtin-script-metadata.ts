/**
 * generate-builtin-script-metadata.ts
 *
 * Scans every `*.raw.js` file in src/scripting/builtinScripts/raw, runs each
 * through the shared `computeImports` parser to discover the spell modules it
 * requires, then writes a sibling TypeScript file (same base name) exporting a
 * `BuiltInScriptMetadata` object. The `metadata.imports` field is auto-populated
 * from the parsed imports, and a multi-layer icon is composed from those imports
 * (one accent layer per recognized module) with seeded color/position jitter.
 *
 * If a TypeScript file with the matching base name already exists, it is left
 * untouched and the raw file is skipped.
 *
 * Usage:
 *   npm run scripts:compile
 *   node scripts/ts/generate-builtin-script-metadata.js
 */

import fs from "fs";
import path from "path";

// computeImports is loaded from the compiled JS sibling (same scripts tsconfig).
// Importing src/* types directly does not resolve under the scripts tsconfig, so
// the few types we need are mirrored locally (matching src/api/spells.ts and
// src/api/spellIcons.ts).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeImports } = require("../../src/scripting/core/computeImports") as {
  computeImports: (code: string) => string[] | null;
};

// Mirror of src/api/spellIcons.ts SpellIconSpec.
type SpellIconSpec = {
  layers: {
    iconKey: string;
    position: { x: number; y: number };
    scale: number;
    rotation: number;
    color: number;
  }[];
  backgroundColor?: number;
};

// Mirror of src/api/spells.ts SavedSpellAspect member names. The generated file
// references the real enum (SavedSpellAspect.<name>), so we only track the name.
type AspectName = "Fire" | "Ice" | "Earth" | "Air";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const RAW_DIR = path.resolve(
  __dirname,
  "../../src/scripting/builtinScripts/raw"
);

// keys.ts lives one level up (alongside builtIns.ts), and is fully regenerated on
// every run to mirror the current set of raw scripts.
const KEYS_PATH = path.resolve(
  __dirname,
  "../../src/scripting/builtinScripts/keys.ts"
);

// ---------------------------------------------------------------------------
// Import → icon mapping
//
// Each recognized module contributes one icon layer, so the generated icon
// represents as many of the spell's imports as possible. The highest-priority
// elemental module (per `ICON_PRIORITY`) becomes the centered primary layer and
// also sets the spell's aspect; the remaining recognized modules fan out around
// it as smaller accent layers. Colors and positions are jittered with a
// per-script seeded RNG so icons feel varied but regenerate identically.
// ---------------------------------------------------------------------------
type IconChoice = {
  iconKey: string;
  color: number;
  backgroundColor: number;
  aspect?: AspectName;
};

const MODULE_ICONS: Record<string, IconChoice> = {
  fire: { iconKey: "fireball", color: 0xffa75e, backgroundColor: 0x3a1b1b, aspect: "Fire" },
  ice: { iconKey: "iceBolt", color: 0x0acaff, backgroundColor: 0x1b3a4e, aspect: "Ice" },
  earth: { iconKey: "earthSpike", color: 0xcd9a5b, backgroundColor: 0x2e2113, aspect: "Earth" },
  air: { iconKey: "air", color: 0xffffff, backgroundColor: 0x1b2a3a, aspect: "Air" },
  spark: { iconKey: "lightning", color: 0xffd906, backgroundColor: 0x1a1a2e },
  grapple: { iconKey: "grapple", color: 0xff66cc, backgroundColor: 0x2d1b4e },
  heal: { iconKey: "healing", color: 0x00ff88, backgroundColor: 0x1b3a1b },
  ping: { iconKey: "ping", color: 0x4488ff, backgroundColor: 0x1a1a2e },
  aim: { iconKey: "aim", color: 0xffffff, backgroundColor: 0x222222 },
  projectile: { iconKey: "fireball", color: 0x44ddff, backgroundColor: 0x1a1a2e },
  wait: { iconKey: "delay", color: 0xffffff, backgroundColor: 0x222222 },
};

// Priority order — elemental/effect modules first, utilities last.
const ICON_PRIORITY = [
  "fire",
  "ice",
  "earth",
  "air",
  "spark",
  "grapple",
  "heal",
  "ping",
  "projectile",
  "aim",
  "wait",
];

const FALLBACK_ICON: IconChoice = {
  iconKey: "terminal",
  color: 0xffffff,
  backgroundColor: 0x1a1a2e,
};

// Cap the layer count so import-heavy spells don't produce cluttered icons.
const MAX_ICON_LAYERS = 4;

// FNV-1a hash → 32-bit seed, so each script gets stable-but-distinct randomness.
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32 PRNG — deterministic given a seed, returns floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nudge each RGB channel by up to ±amount, clamped to [0, 255].
function jitterColor(color: number, rand: () => number, amount: number): number {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((color >> 16) & 0xff) + (rand() * 2 - 1) * amount);
  const g = clamp(((color >> 8) & 0xff) + (rand() * 2 - 1) * amount);
  const b = clamp((color & 0xff) + (rand() * 2 - 1) * amount);
  return (r << 16) | (g << 8) | b;
}

function buildIcon(
  baseName: string,
  imports: string[]
): { icon: SpellIconSpec; aspect?: AspectName } {
  const rand = mulberry32(hashString(baseName));

  // Recognized modules in priority order (element first, utilities last).
  const recognized = ICON_PRIORITY.filter((m) => imports.includes(m));

  // Aspect is taken from the highest-priority elemental module, if any.
  const aspect = recognized.map((m) => MODULE_ICONS[m].aspect).find(Boolean);

  // One layer per recognized module (capped); fall back to the terminal icon.
  const sources = recognized.length
    ? recognized.slice(0, MAX_ICON_LAYERS).map((m) => MODULE_ICONS[m])
    : [FALLBACK_ICON];

  const backgroundColor = jitterColor(sources[0].backgroundColor, rand, 16);

  const n = sources.length;
  const layers = sources.map((src, i) => {
    // Primary layer centered and large; accents fan out on a circle around it.
    let x = 0;
    let y = 0;
    let scale = 0.95;
    if (i > 0) {
      const angle =
        ((i - 1) / Math.max(1, n - 1)) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const radius = 13 + rand() * 4;
      x = Math.round(Math.cos(angle) * radius);
      y = Math.round(Math.sin(angle) * radius);
      scale = 0.55 + rand() * 0.12;
    }
    return {
      iconKey: src.iconKey,
      position: { x, y },
      scale: Number(scale.toFixed(2)),
      rotation: Math.round((rand() - 0.5) * 36),
      color: jitterColor(src.color, rand, 28),
    };
  });

  return { aspect, icon: { backgroundColor, layers } };
}

// ---------------------------------------------------------------------------
// Name / id derivation from the base filename
// ---------------------------------------------------------------------------
// "QuickGrapple" -> "Quick Grapple"
function toDisplayName(baseName: string): string {
  return baseName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

// "QuickGrapple" -> "quick-grapple"
function toKebabId(baseName: string): string {
  return toDisplayName(baseName).toLowerCase().replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// TS file emission
// ---------------------------------------------------------------------------
// Indent every line of a block by `spaces`.
function indentBlock(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function renderMetadataFile(
  name: string,
  id: string,
  imports: string[],
  aspect: AspectName | undefined,
  icon: SpellIconSpec
): string {
  // Build the inner metadata block by hand so `aspect` can be emitted as a real
  // SavedSpellAspect enum reference rather than a bare string literal.
  const metadataLines: string[] = [];
  if (aspect) metadataLines.push(`aspect: SavedSpellAspect.${aspect},`);
  metadataLines.push(`imports: ${JSON.stringify(imports)},`);
  metadataLines.push(`icon: ${JSON.stringify(icon, null, 2)},`);

  const aspectImport = aspect
    ? `import { SavedSpellAspect } from "src/api/spells";\n`
    : "";

  return `// AUTO-GENERATED by scripts/ts/generate-builtin-script-metadata.ts
// Imports and default icon are derived from the matching .raw.js file.
// Safe to edit — this file will not be overwritten once it exists.
import { BuiltInScriptMetadata } from "../builtInsTypes";
${aspectImport}
const metadata: BuiltInScriptMetadata = {
  name: ${JSON.stringify(name)},
  id: ${JSON.stringify(id)},
  metadata: {
${indentBlock(metadataLines.join("\n"), 4)}
  },
};

export default metadata;
`;
}

// Emits keys.ts: a union type of every valid built-in script id. The ids are the
// raw filename bases, which are exactly the keys used to index `builtInSpells`.
function renderKeysFile(baseNames: string[]): string {
  const union = baseNames.length
    ? baseNames.map((n) => `  | ${JSON.stringify(n)}`).join("\n")
    : "  never";

  return `// AUTO-GENERATED by scripts/ts/generate-builtin-script-metadata.ts
// Union of every valid built-in script id (the key used to index builtInSpells).
// Regenerated on every run — do not edit by hand.
export type BuiltInScriptId =
${union};
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  if (!fs.existsSync(RAW_DIR)) {
    console.error(`Raw script directory not found: ${RAW_DIR}`);
    process.exit(1);
  }

  const rawFiles = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.endsWith(".raw.js"))
    .sort();

  let created = 0;
  let skipped = 0;
  const baseNames: string[] = [];

  for (const rawFile of rawFiles) {
    // "QuickGrapple.raw.js" -> "QuickGrapple"
    const baseName = rawFile.replace(/\.raw\.js$/, "");
    baseNames.push(baseName);
    const tsPath = path.join(RAW_DIR, `${baseName}.ts`);

    if (fs.existsSync(tsPath)) {
      console.log(`skip  ${baseName}.ts (already exists)`);
      skipped++;
      continue;
    }

    const code = fs.readFileSync(path.join(RAW_DIR, rawFile), "utf-8");
    const imports = computeImports(code);

    if (imports === null) {
      console.warn(`warn  ${rawFile}: failed to parse imports, skipping`);
      skipped++;
      continue;
    }

    const name = toDisplayName(baseName);
    const id = toKebabId(baseName);
    const { icon, aspect } = buildIcon(baseName, imports);

    const contents = renderMetadataFile(name, id, imports, aspect, icon);
    fs.writeFileSync(tsPath, contents, "utf-8");

    console.log(
      `write ${baseName}.ts  imports=[${imports.join(", ")}]  icon=[${icon.layers
        .map((l) => l.iconKey)
        .join(", ")}]`
    );
    created++;
  }

  // Always regenerate keys.ts to reflect the full current set of raw scripts.
  fs.writeFileSync(KEYS_PATH, renderKeysFile(baseNames.sort()), "utf-8");
  console.log(`keys  keys.ts (${baseNames.length} ids)`);

  console.log(
    `\nDone. ${created} metadata file(s) created, ${skipped} skipped.`
  );
}

main();
