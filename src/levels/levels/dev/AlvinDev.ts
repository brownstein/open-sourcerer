import { LevelAPI } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import type { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Marker } from "src/entities/environment/Marker";
import { ResizableTerrain } from "src/entities/environment/ResizableTerrain";
import { Switch } from "src/entities/environment/Switch";
import { ToggleableTerrain } from "src/entities/environment/ToggleableTerrain";
import { ArrayResizableTerrain } from "src/entities/environment/coding/ArrayResizableTerrain";
import { TechDoor } from "src/entities/environment/doors/TechDoor";
import { BeanBot, BeanBotEvents } from "src/entities/npcs/bean-bot/BeanBot";
import adanasChamberFlattened from "src/levels/tiled/maps/shrines/adanas-chamber-flattened.png";
import { openDocAt } from "src/redux/docsNav/slice";
import { unlockDoc } from "src/redux/progression/slice";
import { addItems } from "src/redux/shared/actions";
import { store } from "src/redux/store";
import { EnableElements, enableUIElements } from "src/redux/ui/slice";

import AlvinDevScreenshot from "./AlvinDev.png";

export const AlvinDev: LevelDefinitionAPI = {
  id: "AlvinDev",
  screenshotImage: AlvinDevScreenshot,
  mapJson: async () =>
    (await import("../../tiled/maps/dev/alvin-dev.tmj")).default,
  images: {
    "adanas-chamber-flattened": adanasChamberFlattened
  },
  setup: (level: LevelAPI) => {
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

    store.dispatch(
      addItems({
        item: { type: "Sword" },
        hotkey: true
      })
    );

    const tSwitch = level.getEntitiesForType(Switch).at(0)!;
    const dockPos = level.getEntityForName<Marker>("dock")!;
    const beanBot = level.getEntitiesForType(BeanBot)[0];
    const techDoor = level.getEntitiesForType(TechDoor)[0];
    const toggleableTerrain = level.getEntitiesForType(ToggleableTerrain)[0];
    const resizeable = level.getEntitiesForType(ResizableTerrain)[0];
    const og = resizeable.targetHeight;
    const ogx = resizeable.targetWidth;

    const array = level.getEntitiesForType(ArrayResizableTerrain)[0];
    // array.setElementLength(0, 0);

    beanBot.swapControlMethod("physicsFollowPlayer");

    let counter = 0;

    tSwitch.switchEvents.on("stateUpdated", async (isOn) => {
      toggleableTerrain.toggle();

      counter++;
      const poop = counter % array.length;

      if (isOn) resizeable.setHeight(og * 2);
      else resizeable.setHeight(og);

      if (isOn) resizeable.setWidth(0);
      else resizeable.setWidth(ogx);

      if (isOn) array.setAllFractionalLength(1);
      else
        array.setElementFractionalLength(
          poop,
          Math.max(Math.random() * 0.8 - 0.3, 0)
        );
    });
  }
};
