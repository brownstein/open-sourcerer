import { ReactNode, useEffect, useRef, useState } from "react";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { GameController } from "src/engine/controller/GameController";
import { GameControllerEvents } from "src/engine/controller/GameControllerAPI";
import { multiplayerSession } from "src/multiplayer/MultiplayerSession";
import { gotoLevel } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import { OverlayContext } from "../context/OverlayContext";

export type ControllerProps = {
  children?: ReactNode;
};

type ControllerIState = {
  gameController?: GameController;
};

export function Controller(props: ControllerProps) {
  const { children } = props;
  const [controller, setController] = useState<GameController | undefined>();
  const [loadProgress, setLoadProgress] = useState<number | undefined>();
  const iStateRef = useRef<ControllerIState>({});

  // Main game controller init sequence.
  useEffect(() => {
    let mounted = true;
    const iState = iStateRef.current;
    if (iState.gameController) return;
    const gameController = new GameController();
    iState.gameController = gameController;
    gameController.events.on(GameControllerEvents.LoadLevelStart, () => {
      if (!mounted) return;
      setLoadProgress(0);
    });
    gameController.events.on(
      GameControllerEvents.LoadLevelProgress,
      (progress) => {
        if (!mounted) return;
        setLoadProgress(progress);
      }
    );
    gameController.events.on(
      GameControllerEvents.TransitionToLevelComplete,
      () => {
        if (!mounted) return;
        setLoadProgress(undefined);
      }
    );
    setController(gameController);
    gameController
      .attachToStore(store)
      .createSpellRuntime()
      .setupCodingChallenges()
      .beginRenderCycle();
    gameController.controls.mountStore(store);
    multiplayerSession.attachGame(gameController);
    return () => {
      mounted = false;
      multiplayerSession.detachGame();
      gameController.destroy();
      iState.gameController = undefined;
    };
  }, []);

  useEffect(() => {
    const levelId = store.getState().gameState.levelId;
    if (!levelId) return;
    store.dispatch(gotoLevel({ levelId }));
  }, []);

  if (!controller) {
    return <div>LOADING... {loadProgress}</div>;
  }

  return (
    <GameControllerContext.Provider value={controller}>
      <OverlayContext.Provider value={controller.overlays}>
        {children}
      </OverlayContext.Provider>
    </GameControllerContext.Provider>
  );
}

export default Controller;
