import { IJsonRowNode, IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { EquippedWeaponTypes, equipWeapon } from "src/redux/inventory/slice";
import { selectAllScriptsById } from "src/redux/scriptLibrary/selectors";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import {
  EnableElements,
  enableUIElements,
  updateLayout
} from "src/redux/ui/slice";

const fireSpell = `const Fire = require("fire");

console.log("Casting a basic Fire spell.");
new Fire({ aim: true });`;

const iceSpell = `const Ice = require("ice");
const wait = require("wait");

const block = new Ice({
  shape: [
    [0.25, 1.5],
    [0.25, -1.5],
    [-0.25, -1.5],
    [-0.25, 1.5]
  ]
});
wait(5000);`;

const healSpell = `const heal = require("heal");

heal(10);`;

/** The standard duel loadout: identical spells for every player. */
const MATCH_SPELLS: SavedSpell[] = [
  {
    name: "Fire Spell",
    id: "__mpFireSpell",
    code: fireSpell,
    metadata: { color: 0xffcc88, emblem: "Fireball" }
  },
  {
    name: "Ice Wall",
    id: "__mpIceSpell",
    code: iceSpell,
    metadata: {
      color: 0x88ccff,
      emblem: "ice_cube",
      emblemColor: 0xffffff,
      emblemGreyscale: true
    }
  },
  {
    name: "Heal",
    id: "__mpHealSpell",
    code: healSpell,
    metadata: {
      color: 0x88ccff,
      emblem: "Gravity",
      emblemColor: 0x79e326,
      emblemGreyscale: true
    }
  }
];

let applied = false;

/**
 * One-time per-session match setup, run when the first match level is ready
 * (the multiplayer analogue of demo-mode setup, without demo mode): combat
 * HUD + code editor enabled, viewport/editor layout, the standard spell
 * loadout hot-keyed, and the sword granted and equipped.
 */
export function applyMatchSetup(): void {
  if (applied) return;
  applied = true;

  store.dispatch(
    enableUIElements([
      EnableElements.CodeEditor,
      EnableElements.HUD,
      EnableElements.Health,
      EnableElements.Mana,
      EnableElements.HotBar,
      EnableElements.HotBarBottom,
      EnableElements.Layout,
      EnableElements.Portrait
    ])
  );

  const tabset = (children: IJsonTabSetNode["children"]): IJsonTabSetNode => ({
    type: "tabset",
    id: shortid(),
    children
  });
  const layout: IJsonRowNode = {
    type: "row",
    id: shortid(),
    children: [
      {
        ...tabset([
          {
            type: "tab",
            id: "viewport",
            component: "viewport",
            config: { isUIConfig: true, componentName: "viewport" },
            enableClose: false
          }
        ]),
        weight: 70
      },
      {
        ...tabset([
          {
            type: "tab",
            id: shortid(),
            component: "codeEditor",
            config: {
              isUIConfig: true,
              componentName: "codeEditor",
              componentConfigId: shortid()
            }
          }
        ]),
        weight: 30
      }
    ]
  };
  store.dispatch(updateLayout(layout));

  const existingSpells = selectAllScriptsById(store.getState());
  for (const spell of MATCH_SPELLS) {
    if (existingSpells[spell.id]) continue;
    store.dispatch(addItems({ item: savedSpellToItemData(spell), hotkey: true }));
  }

  store.dispatch(addItems({ item: { type: "Sword" }, hotkey: true }));
  store.dispatch(equipWeapon(EquippedWeaponTypes.Sword));
}

/** Allow re-application on the next multiplayer session. */
export function resetMatchSetup(): void {
  applied = false;
}
