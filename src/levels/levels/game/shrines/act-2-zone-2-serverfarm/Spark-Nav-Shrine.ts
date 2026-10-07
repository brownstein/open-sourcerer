import { Vector2, Vector3 } from "three";

import { CameraRequestPriority } from "src/api/camera";
import { CodingChallengeProviderEvents } from "src/api/codingChallenge";
import { EntityLevelEvents } from "src/api/entity";
import { typedEmitterPromise } from "src/api/util";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { getPlayer } from "src/engine/util/levelUtil";
import {
  findLayoutTabNodePath,
  mutateLayout
} from "src/engine/util/tabHelpers";
import { Fireworks } from "src/entities/environment/effects/Fireworks";
import {
  ShrineTerminal,
  ShrineTerminalEvents
} from "src/entities/environment/shrines/ShrineTerminal";
import { isTerrain } from "src/entities/terrain/BaseTerrain";
import { BigShrine_0 } from "src/levels/levels/game/shrines/BigShrine_0A";
import { gotoLevel } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import Spark_Nav_ShrineScreenshot from "./Spark_Nav_Shrine.png";

let sparkNavShrineCameraCleanup: (() => Promise<void>) | undefined;
let sparkNavShrineListenerCleanup: (() => void) | undefined;

export const SparkNavShrine: LevelDefinitionAPI = {
  id: "Spark_Nav_Shrine",
  screenshotImage: Spark_Nav_ShrineScreenshot,
  localizedName: "challenges.names.spark",
  mapJson: async () =>
    (
      await import(
        "src/levels/tiled/maps/shrines/jan-2025/spark-nav-shrine.tmj"
      )
    ).default,
  setup: (level) => {
    for (const entity of level.getEntities().values()) {
      if (isTerrain(entity) && entity.layerName === "Invisible Walls") {
        entity.object3D.visible = false;
      }
    }

    const terminal = level.getEntityForName<ShrineTerminal>("ShrineTerminal");
    if (!terminal) return;

    const doCodingChallenge = () => {
      if (!level.ctx?.codingChallenges) return;

      const codingChallenges = level.ctx.codingChallenges;
      let hasAppliedCodingSegmentCamera = false;
      let isRestoringCamera = false;

      const clearScriptedCamera = async () => {
        if (isRestoringCamera) return;
        isRestoringCamera = true;
        try {
          await level.cameraDirector.clearScriptedRequests(600, 1);
        } finally {
          isRestoringCamera = false;
        }
      };

      sparkNavShrineCameraCleanup = clearScriptedCamera;
      sparkNavShrineListenerCleanup?.();

      const maybeApplyCodingSegmentCamera = async () => {
        const activeChallenge = codingChallenges.getCurrentChallenge();
        if (activeChallenge?.id !== "Spark") return;

        const activeSegmentIndex =
          codingChallenges.getCurrentChallengeSegmentIndex();
        const isCodingSegmentActive = activeSegmentIndex === 1;
        if (!isCodingSegmentActive || hasAppliedCodingSegmentCamera) return;
        hasAppliedCodingSegmentCamera = true;

        const worldBounds = level.getWorldBoundaries();
        const center = new Vector2();
        const size = new Vector2();
        worldBounds.getCenter(center);
        worldBounds.getSize(size);
        // Small padding keeps maze edges visible after aspect ratio fitting.
        size.addScalar(1);

        await level.cameraDirector.pushScriptedRequest(
          {
            center,
            size
          },
          600,
          1
        );
      };

      const onChallengeProgress = () => {
        void maybeApplyCodingSegmentCamera();
      };

      const onChallengeDone = () => {
        void clearScriptedCamera();
      };

      codingChallenges.events.on(
        CodingChallengeProviderEvents.ChallengeProgress,
        onChallengeProgress
      );
      codingChallenges.events.on(
        CodingChallengeProviderEvents.ChallengeCompleted,
        onChallengeDone
      );
      codingChallenges.events.on(
        CodingChallengeProviderEvents.ChallengeAborted,
        onChallengeDone
      );

      sparkNavShrineListenerCleanup = () => {
        codingChallenges.events.off(
          CodingChallengeProviderEvents.ChallengeProgress,
          onChallengeProgress
        );
        codingChallenges.events.off(
          CodingChallengeProviderEvents.ChallengeCompleted,
          onChallengeDone
        );
        codingChallenges.events.off(
          CodingChallengeProviderEvents.ChallengeAborted,
          onChallengeDone
        );
      };
      level.ctx.codingChallenges.launch("Spark");
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

      const scheduler = new Scheduler();
      level.on(EntityLevelEvents.Step, (deltaMs) => scheduler.step(deltaMs));

      const cameraDirector = level.cameraDirector;

      codingChallenges.events.on(
        CodingChallengeProviderEvents.ChallengeCompleted,
        async () => {
          level.addEntity(
            new Fireworks({
              position: terminal.position.clone().add(new Vector3(0, 0, -0.5))
            })
          );

          await scheduler.asyncTimeout(2500);

          const player = getPlayer(level)!;

          const cameraRequestId = crypto.randomUUID();
          scheduler.add({
            duration: 5000,
            invokeFunction: (t) => {
              if (!player) return;
              cameraDirector.sendLookAtEntityRequest(player, {
                offset: new Vector2(0, t * Math.sin(t * 200) * 0.5)
              });
              cameraDirector.sendRequest({
                id: cameraRequestId,
                priority: CameraRequestPriority.HIGHEST,
                distort: t * 8 * Math.sin(t * 40),
                compositeOpacity: 1 - t
              });
            },
            invokeEventAtComplete: "shakeDone"
          });
          await typedEmitterPromise(scheduler, "shakeDone");

          cameraDirector.removeAllRequests();

          store.dispatch(
            gotoLevel({
              levelId: BigShrine_0.id
            })
          );
        }
      );
    };

    terminal.events.on(ShrineTerminalEvents.Activate, () => {
      doCodingChallenge();
    });
  },
  teardown: () => {
    sparkNavShrineListenerCleanup?.();
    sparkNavShrineListenerCleanup = undefined;
    void sparkNavShrineCameraCleanup?.();
    sparkNavShrineCameraCleanup = undefined;
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
