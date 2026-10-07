import { t } from "i18next";
import { Vector3 } from "three";

import { CodingChallengeProviderEvents } from "src/api/codingChallenge";
import { EntityLevelAPI } from "src/api/entity";
import { celebrationSingleton } from "src/components/ui/celebration/CelebrationController";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Fireworks } from "src/entities/environment/effects/Fireworks";
import {
  ShrineTerminal,
  ShrineTerminalEvents
} from "src/entities/environment/shrines/ShrineTerminal";
import { SpiritDoor } from "src/entities/environment/shrines/SpiritDoor";
import { selectLevelTransitionData } from "src/redux/gameState/selectors";
import { store } from "src/redux/store";

export type CodingChallengeLevelSpec<T> = LevelDefinitionAPI<T> & {
  challengeId: string;
};

export type CodingChallengeLevelSetupResult<T> = {
  setupResult: Awaited<T>;
  completeChallenge?: () => void;
};

export function createCodingChallengeLevel<T>(
  levelDef: CodingChallengeLevelSpec<T>
): LevelDefinitionAPI<CodingChallengeLevelSetupResult<T>> {
  const { challengeId } = levelDef;

  const setup = async (level: EntityLevelAPI) => {
    const setupResult = (await levelDef.setup?.(level)) as Awaited<T>;

    const { previousLevelId } = selectLevelTransitionData(store.getState());
    const entranceDoor = level.getEntityForName<SpiritDoor>("Door 1");
    if (previousLevelId === entranceDoor?.toLevel) entranceDoor?.show();

    const terminal = level.getEntitiesForType(ShrineTerminal).at(0);
    if (!terminal)
      return {
        setupResult
      };

    let challengeCompleted = false;
    const completeChallenge = () => {
      if (challengeCompleted) return;
      challengeCompleted = true;
      const challengeName = level.ctx?.codingChallenges
        ?.getCurrentChallenge()
        ?.challengeName(t);
      celebrationSingleton.celebrate({
        type: "codingChallenge",
        content: challengeName
      });
      const exitDoor = level.getEntityForName<SpiritDoor>("Door 2");
      exitDoor?.show();
      level.addEntity(
        new Fireworks({
          position: terminal.position.clone().add(new Vector3(0, 0, -0.5))
        })
      );
    };

    const startChallenge = () => {
      const currentChallengeId =
        level.ctx?.codingChallenges?.getCurrentChallenge()?.id;
      if (currentChallengeId !== challengeId) {
        level.ctx?.codingChallenges?.events.on(
          CodingChallengeProviderEvents.ChallengeCompleted,
          completeChallenge
        );
      }
      level.ctx?.codingChallenges?.launch(challengeId);
    };

    terminal.events.on(ShrineTerminalEvents.Activate, startChallenge);
    level.ctx?.codingChallenges?.events.on(
      CodingChallengeProviderEvents.ChallengeCompleted,
      completeChallenge
    );
    return {
      setupResult,
      completeChallenge
    };
  };

  const teardown = (
    level: EntityLevelAPI,
    levelSetupResult: CodingChallengeLevelSetupResult<T>
  ) => {
    const { completeChallenge, setupResult } = levelSetupResult;
    levelDef.teardown?.(level, setupResult);
    if (completeChallenge)
      level.ctx?.codingChallenges?.events.off(
        CodingChallengeProviderEvents.ChallengeCompleted,
        completeChallenge
      );
    level.ctx?.codingChallenges?.launch(null);
  };

  return {
    id: levelDef.id,
    localizedName: levelDef.localizedName,
    screenshotImage: levelDef.screenshotImage,
    mapJson: levelDef.mapJson,
    images: levelDef.images,
    tileSets: levelDef.tileSets,
    backgroundColor: levelDef.backgroundColor,
    layers: levelDef.layers,
    ambientMusic: levelDef.ambientMusic,
    ambientMusicGain: levelDef.ambientMusicGain,
    demoItems: levelDef.demoItems,
    demoAllies: levelDef.demoAllies,
    setup,
    teardown
  };
}
