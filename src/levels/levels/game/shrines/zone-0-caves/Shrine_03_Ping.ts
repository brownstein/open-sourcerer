import { Vector3 } from "three";

import { CodingChallengeProviderEvents } from "src/api/codingChallenge";
import { celebrationSingleton } from "src/components/ui/celebration/CelebrationController";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import {
  findLayoutTabNodePath,
  mutateLayout
} from "src/engine/util/tabHelpers";
import { EncryptedWallText } from "src/entities/environment/EncryptedWallText";
import { Fireworks } from "src/entities/environment/effects/Fireworks";
import {
  ShrineTerminal,
  ShrineTerminalEvents
} from "src/entities/environment/shrines/ShrineTerminal";
import type { SpiritDoor } from "src/entities/environment/shrines/SpiritDoor";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { selectLevelTransitionData } from "src/redux/gameState/selectors";
import { store } from "src/redux/store";

import Shrine03PingScreenshot from "./Shrine03Ping.png";
import { Shrine03PingName, Shrines00HallName } from "./ShrinesTypes";

export const Shrine03Ping: LevelDefinitionAPI = {
  id: Shrine03PingName,
  screenshotImage: Shrine03PingScreenshot,
  localizedName: "challenges.names.ping",
  mapJson: async () =>
    (await import("src/levels/tiled/maps/shrines/act-1/Shrine03Ping.tmj"))
      .default,
  setup: (level) => {
    // Hide boundary walls.
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }

    // Reference encrypted text.
    const encryptedText = level.getEntitiesForType(EncryptedWallText).at(0);

    // Grab entity references.
    const terminal = level.getEntityForName<ShrineTerminal>("Terminal");
    if (!terminal) return;

    // Expose left door if we came from a hub.
    const { previousLevelId } = selectLevelTransitionData(store.getState());
    if (previousLevelId === Shrines00HallName) {
      const door1 = level.getEntityForName<SpiritDoor>("Door 1");
      console.log(door1);
      door1?.show();
    }

    const doCodingChallenge = () => {
      if (!level.ctx?.codingChallenges) return;
      level.ctx.codingChallenges.launch("Ping");
      const codingChallengeNodePathInitial = findLayoutTabNodePath(
        store,
        (cn) => cn === "codingChallenge"
      );
      if (codingChallengeNodePathInitial) return;
      mutateLayout(store, "viewport")
        .openTab({
          componentName: "codingChallenge",
          relativeWeight: 1,
          duration: 3000,
          relativePosition: "left"
        })
        .apply();

      level.ctx.codingChallenges.events.once(
        CodingChallengeProviderEvents.ChallengeCompleted,
        () => {
          level.addEntity(
            new Fireworks({
              position: terminal.position.clone().add(new Vector3(0, 0, -0.5))
            })
          );
          const exitDoor = level.getEntityForName<SpiritDoor>("Door 2");
          exitDoor?.show();

          celebrationSingleton.celebrate({
            type: "codingChallenge",
            content: "Ping"
          });

          const ancientText = level.getEntitiesForType(EncryptedWallText).at(0);
          ancientText?.decrypt();
        }
      );
    };

    terminal.events.on(ShrineTerminalEvents.Activate, doCodingChallenge);
  },
  teardown: () => {
    const codingChallengeNodePathInitial = findLayoutTabNodePath(
      store,
      (cn) => cn === "codingChallenge"
    );
    if (codingChallengeNodePathInitial) {
      mutateLayout(store, codingChallengeNodePathInitial?.at(-1)?.id ?? "")
        .closeTab(500)
        .apply();
    }
  }
};
