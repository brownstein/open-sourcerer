import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { GameControllerContext } from "src/components/context/GameControllerContext";
import { Button } from "src/components/ui/buttons/Button";
import { isDevMode } from "src/engine/util/devMode";
import { selectEditorTestLevelId } from "src/redux/dev/selectors";
import { selectMatchInProgress } from "src/multiplayer/match/selectors";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { selectIsDead } from "src/redux/status/selectors";
import { resetForEditorRetry } from "src/redux/status/slice";
import { delay } from "src/scripting/core/util";

import "./DeathScreen.less";

export function DeathScreen() {
  const controller = useContext(GameControllerContext);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const isDead = useAppSelector(selectIsDead);
  const matchInProgress = useAppSelector(selectMatchInProgress);
  const editorTestLevelId = useAppSelector(selectEditorTestLevelId);
  const devMode = useMemo(() => isDevMode(), []);
  const [isDrawn, setIsDrawn] = useState(isDead);
  const [saveExists, setCanLoad] = useState(false);

  useEffect(() => {
    if (!isDead) {
      setIsDrawn(false);
    } else {
      delay(1000).then(() => {
        setIsDrawn(true);
        setCanLoad(controller?.canLoad() ?? false);
      });
    }
  }, [controller, isDead]);

  const nodeRef = useRef<HTMLDivElement | null>(null);

  // Match KOs respawn automatically; the death screen would just flash.
  if (matchInProgress) return null;
  if (!isDrawn) return null;

  return (
    <div ref={nodeRef} className="death-screen">
      <h1>{t("deathScreen.title")}</h1>
      <div>{t("deathScreen.flavorText1")}</div>
      {editorTestLevelId ? (
        <div className="load-game-container">
          <Button
            size="lg"
            onClick={() => {
              dispatch(resetForEditorRetry());
              controller?.restartLevel();
            }}
          >
            Retry Level
          </Button>
        </div>
      ) : (
        <div className="load-game-container">
          <Button
            size="lg"
            onClick={() => {
              if (saveExists) {
                controller?.load({ preserveLayout: true });
              } else {
                dispatch(resetForEditorRetry());
                controller?.restartLevel();
              }
            }}
          >
            {t(
              saveExists
                ? "deathScreen.loadSaveGame"
                : "deathScreen.restartLevel"
            )}
          </Button>
        </div>
      )}
      {devMode && (
        <div className="load-game-container">
          <Button size="lg" onClick={() => dispatch(resetForEditorRetry())}>
            Revive (Dev Mode)
          </Button>
        </div>
      )}
    </div>
  );
}
