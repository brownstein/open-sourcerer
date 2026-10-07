import { IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from "flexlayout-react";
import shortid from "shortid";

import { SavedSpell, savedSpellToItemData } from "src/api/spells";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { EditorData, upsertEditor } from "src/redux/scriptEditor/slice";
import { selectAllScriptsById } from "src/redux/scriptLibrary/selectors";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import {
  EnableElements,
  enableUIElements,
  updateComponentState,
  updateLayout
} from "src/redux/ui/slice";

import Demo_1_1Screenshot from "./Demo_1_1.png";

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

const iceSpell2 = `const Ice = require("ice");
const wait = require("wait");

const block = new Ice({
  shape: [
    [5, -0.25],
    [5, 0.25],
    [-0.25, 0.25],
    [-0.25, -0.25]
  ]
});
wait(5000);`;

const fireShooterSpell = `const Spark = require("spark");
const Sensor = require("sensor");
const Fire = require("fire");
const Vector = require("vector");
const self = require("self");
const wait = require("wait");

const caster = new Spark({
  mana: self.extra.mana
});
const sensor = caster.cast(Sensor, {
  radius: 2
});

let x = 0;
let y = 0;
let dx = self.extra.facingRight ? 1 : -1;

for (let i = 0; i < 10; i++) {
  x += dx;
  caster.setOffset({
    x,
    y
  });
  wait(250);
  for (const other of sensor.extra.nearbyEntities) {
    if (!other.isEnemy) continue;
    const delta = new Vector(other.position.x, other.position.y);
    delta.x -= sensor.position.x;
    delta.y -= sensor.position.y;
    const angle = delta.angle();
    caster.cast(Fire.blast, {
      angle
    });
  }
}

caster.destroy();`;

const healSpell = `const Heal = require("heal");

console.log("Casting a basic heal spell.");

//Heal.instant({strength: 10});

Heal.overTime({strength: 5})`;

const row = <CT extends (IJsonRowNode | IJsonTabSetNode)[]>(
  ...children: CT
): IJsonRowNode & { children: CT } => ({
  type: "row",
  id: shortid(),
  children
});

const tabset = <CT extends IJsonTabNode[]>(
  ...children: CT
): IJsonTabSetNode & { children: CT } => ({
  type: "tabset",
  id: shortid(),
  children
});

export const Demo_1_1: LevelDefinitionAPI = {
  id: "Demo_1_1",
  screenshotImage: Demo_1_1Screenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/demo/demo-1-1.tmj")).default,
  images: {},
  setup: (_level) => {
    // Hard-code unlocks.
    store.dispatch(
      enableUIElements([
        EnableElements.CodeEditor,
        EnableElements.HUD,
        EnableElements.Health,
        EnableElements.Mana,
        EnableElements.HotBar,
        EnableElements.HotBarBottom,
        EnableElements.Layout
      ])
    );

    // Configure code editor.
    const editor: EditorData = {
      id: shortid(),
      code: fireSpell
    };
    store.dispatch(upsertEditor(editor));

    // Hard-code editor layout.
    const layout = row(
      tabset({
        type: "tab",
        id: "viewport",
        component: "viewport",
        config: {
          isUIConfig: true,
          componentName: "viewport"
        },
        enableClose: false
      }),
      tabset({
        type: "tab",
        id: shortid(),
        component: "codeEditor",
        config: {
          isUIConfig: true,
          componentName: "codeEditor",
          componentConfigId: shortid()
        }
      })
    );
    layout.children[0].weight = 70;
    layout.children[1].weight = 30;
    const editorConfigId = layout.children[1].children[0].config
      .componentConfigId as string;
    store.dispatch(
      updateComponentState([
        editorConfigId,
        {
          componentConfigId: editorConfigId,
          editorId: editor.id
        }
      ])
    );
    store.dispatch(updateLayout(layout));

    // Update spells and hotkey them.
    const existingSpells = selectAllScriptsById(store.getState());
    const demoSpells: SavedSpell[] = [
      {
        name: "Fire Spell",
        id: "__demoFireSpell",
        code: fireSpell,
        metadata: {
          color: 0xffcc88,
          emblem: "Fireball"
        }
      },
      {
        name: "Ice Spell",
        id: "__demoIceSpell",
        code: iceSpell,
        metadata: {
          color: 0x88ccff,
          emblem: "ice_cube",
          emblemColor: 0xffffff,
          emblemGreyscale: true
        }
      },
      {
        name: "Ice Spell 2",
        id: "__demoIceSpell2",
        code: iceSpell2,
        metadata: {
          color: 0x88ccff,
          emblem: "ice_cube",
          emblemColor: 0xffffff,
          emblemGreyscale: true
        }
      },
      {
        name: "Fire Shooter Spell",
        id: "__demoFireShooterSpell",
        code: fireShooterSpell,
        metadata: {
          color: 0xffdd44,
          emblem: "fire_multi",
          emblemColor: 0xffffff,
          emblemGreyscale: true
        }
      },
      {
        name: "Heal Spell",
        id: "__demoHealSpell",
        code: healSpell,
        metadata: {
          color: 0x88ccff,
          emblem: "Gravity",
          emblemColor: 0x79e326,
          emblemGreyscale: true
        }
      }
    ];
    for (const spell of demoSpells) {
      if (existingSpells[spell.id]) continue;
      store.dispatch(
        addItems({ item: savedSpellToItemData(spell), hotkey: true })
      );
    }

    store.dispatch(addItems({ item: { type: "Sword" }, hotkey: true }));
  }
};
