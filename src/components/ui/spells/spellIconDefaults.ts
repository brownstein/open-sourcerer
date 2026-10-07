import { SavedSpellAspect } from "src/api/spells";
import { SpellIconSpec, SpellIconSpecLayer } from "src/api/spellIcons";

import { spellIconDefs } from "./spellIconDefs";

export function makeDefaultSpellIcon(aspect?: SavedSpellAspect): SpellIconSpec {
  switch (aspect) {
    case SavedSpellAspect.Fire:
      return {
        backgroundColor: 0x3a1b1b,
        layers: [
          { iconKey: "fireball", position: { x: 0, y: 0 }, scale: 1, rotation: 0, color: 0xffa75e },
        ],
      };
    case SavedSpellAspect.Ice:
      return {
        backgroundColor: 0x1b3a4e,
        layers: [
          { iconKey: "iceBolt", position: { x: 0, y: 0 }, scale: 1, rotation: 0, color: 0x0acaff },
        ],
      };
    default:
      return {
        backgroundColor: 0x1a1a2e,
        layers: [
          { iconKey: "fireball", position: { x: 0, y: 0 }, scale: 1, rotation: 0, color: 0xffffff },
        ],
      };
  }
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const bgColors = [
  0x1a1a2e, 0x2d1b4e, 0x1b3a4e, 0x3a1b1b, 0x1b3a1b,
  0x3a3a1b, 0x000000, 0x222222, 0x444444,
];

const layerColors = [
  0xffffff, 0x000000, 0xff5a1f, 0x0acaff, 0xffd906,
  0xe885ff, 0x00ff88, 0xff0000, 0x0a7cff, 0xcdff85,
  0xffa75e, 0x77daff,
];

function randomLayer(): SpellIconSpecLayer {
  return {
    iconKey: pick(spellIconDefs).iconKey,
    position: {
      x: Math.round((Math.random() - 0.5) * 60),
      y: Math.round((Math.random() - 0.5) * 60),
    },
    scale: 0.5 + Math.random() * 1.0,
    rotation: Math.round((Math.random() - 0.5) * 90),
    color: pick(layerColors),
  };
}

export function randomizeSpellIcon(): SpellIconSpec {
  const layerCount = 1 + Math.floor(Math.random() * 3);
  const layers: SpellIconSpecLayer[] = [];
  for (let i = 0; i < layerCount; i++) {
    layers.push(randomLayer());
  }
  return {
    backgroundColor: pick(bgColors),
    layers,
  };
}
