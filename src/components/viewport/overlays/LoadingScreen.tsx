import { useContext, useEffect, useState } from "react";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { LoadingScreen } from "src/components/preloader/LoadingScreen";
import { GameControllerEvents } from "src/engine/controller/GameControllerAPI";

import "./LoadingScreen.less";

const kMaxOpacity = 0.5;

export function LoadingScreenOverlay() {
  const gameController = useContext(GameControllerContext);
  const [inProgress, setInProgress] = useState(false);
  const [progress, setProgress] = useState(1);
  const [opacity, setOpacity] = useState(kMaxOpacity);

  useEffect(() => {
    const onLevelLoadStart = () => {
      setProgress(0);
      setInProgress(true);
    };
    const onLevelLoadProgress = (progress: number) => {
      setProgress(progress);
    };
    const onLevelLoadComplete = () => {
      setProgress(1);
    };
    gameController?.events.on(
      GameControllerEvents.LoadLevelStart,
      onLevelLoadStart
    );
    gameController?.events.on(
      GameControllerEvents.LoadLevelProgress,
      onLevelLoadProgress
    );
    gameController?.events.on(
      GameControllerEvents.LoadLevelComplete,
      onLevelLoadComplete
    );
    return () => {
      gameController?.events.off(
        GameControllerEvents.LoadLevelStart,
        onLevelLoadStart
      );
      gameController?.events.off(
        GameControllerEvents.LoadLevelProgress,
        onLevelLoadProgress
      );
      gameController?.events.off(
        GameControllerEvents.LoadLevelComplete,
        onLevelLoadComplete
      );
    };
  }, [gameController]);

  const done = !inProgress || progress >= 1;

  useEffect(() => {
    const doneCallback = () => {
      if (done) {
        setInProgress(false);
      } else {
        setOpacity(kMaxOpacity);
      }
    };
    const doneTimeout = setTimeout(doneCallback, 500);
    if (done) {
      setOpacity(0);
    } else {
      setInProgress(true);
    }
    return () => {
      if (doneTimeout !== undefined) clearTimeout(doneTimeout);
    };
  }, [inProgress, done]);

  if (!inProgress) return null;

  return (
    <div
      className="viewport-loading-screen-overlay"
      style={{
        opacity
      }}
    >
      <LoadingScreen percentLoaded={progress} />
    </div>
  );
}
