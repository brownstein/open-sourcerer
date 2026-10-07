import cx from "classnames";
import { FC, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";

import { PlayerRenderMode } from "src/api/characterCustomization";
import { Icon } from "src/components/ui/icons/Icon";
import { PersistenceController } from "src/engine/controller/Persistence";
import { detectIsChrome } from "src/engine/util/userAgent";
import { useAppStore } from "src/redux/hooks";
import { buildLevelEditorFullscreenLayout } from "src/redux/levelEditor/listeners";
import { cycleLanguage } from "src/redux/settings/slice";
import { setPlayerRenderMode } from "src/redux/status/slice";
import { updateLayout } from "src/redux/ui/slice";
import { isDevMode } from "src/util/devUtil";

import { setMultiplayerFlow } from "src/multiplayer/match/matchSlice";

import { leaveTitleScreen } from "../../../src/redux/gameState/slice";
import { CharacterCustomization } from "./CharacterCustomization";
import { CreditsScreen } from "./CreditsScreen";
import "./TitleScreen.less";
import "./TitleScreen.less";

type Mode = "demo" | "start" | "multiplayer";
type Screen = "title" | "customize" | "credits";

const TitleScreen: FC = () => {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useDispatch();
  const [mode, setMode] = useState<Mode>("start");
  const [screen, setScreen] = useState<Screen>("title");
  const loadSaveController = useMemo(
    () => new PersistenceController(store),
    [store]
  );
  const canLoad = useMemo(
    () => loadSaveController.checkLoadable(),
    [loadSaveController]
  );
  const isChrome = useMemo(() => detectIsChrome(), []);
  const devMode = useMemo(() => isDevMode(), []);

  const handleDemoMode = useCallback(() => {
    setMode("demo");
    setScreen("customize");
  }, []);
  const handleNewGame = useCallback(() => {
    // The campaign skips customization here: the player starts as a blank
    // white silhouette and picks a look mid-intro, in the cryo room.
    setMode("start");
    dispatch(setPlayerRenderMode(PlayerRenderMode.White));
    dispatch(leaveTitleScreen({ isDemoMode: false }));
  }, [dispatch]);
  const handleMultiplayer = useCallback(() => {
    setMode("multiplayer");
    setScreen("customize");
  }, []);
  const handlePostCustomize = useCallback(() => {
    // Demo and multiplayer still customize up front, so the character is
    // already defined — never start those as a silhouette.
    dispatch(setPlayerRenderMode(PlayerRenderMode.Normal));
    if (mode === "multiplayer") {
      // Stay on the title routing; MainEntryPoint swaps to the multiplayer
      // screens while the flow is open.
      dispatch(setMultiplayerFlow("menu"));
      setScreen("title");
      return;
    }
    dispatch(leaveTitleScreen({ isDemoMode: mode === "demo" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const handleLoadGame = () => {
    if (!canLoad) return;
    loadSaveController.load();
  };
  const handleSpellTester = useCallback(() => {
    window.location.search = "?__developer__&mode=spell-tester";
  }, []);
  const handleLevelEditor = useCallback(() => {
    // Open the level editor fullscreen via redux. The LevelEditorTab itself
    // syncs `mode=level-editor` to the URL on mount and clears it on unmount.
    dispatch(updateLayout(buildLevelEditorFullscreenLayout()));
    dispatch(leaveTitleScreen({ isDemoMode: false }));
  }, [dispatch]);
  const handleCredits = useCallback(() => {
    setScreen("credits");
  }, []);
  const handleCreditsBack = useCallback(() => {
    setScreen("title");
  }, []);
  const handleLanguageCycle = useCallback(() => {
    dispatch(cycleLanguage());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const handleSettings = () => {
  //   // Implement settings functionality
  // };

  return (
    <div className={cx("title-screen", screen)}>
      <div className="title-and-logo">
        <div className="logo" />
      </div>
      {!isChrome && (
        <div className="chrome-warning">
          ( If you can read this, you might want to switch to Google Chrome. )
        </div>
      )}
      {screen === "title" && (
        <div className="buttons-container">
          <button data-testid="start-game-button" onClick={handleNewGame}>
            Start Game
          </button>
          {devMode && <button onClick={handleDemoMode}>Demo Mode</button>}
          <button data-testid="multiplayer-button" onClick={handleMultiplayer}>
            Multiplayer
          </button>
          <button disabled={!canLoad} onClick={handleLoadGame}>
            Load Game
          </button>
          {/* <button onClick={handleSettings}>Settings</button> */}
          {devMode && <button onClick={handleSpellTester}>Spell Tester</button>}
          {devMode && <button onClick={handleLevelEditor}>Level Editor</button>}
          <button onClick={handleCredits}>Credits</button>
        </div>
      )}
      {screen === "customize" && (
        <div className="customizer">
          <CharacterCustomization />
          <button
            data-testid="start-with-character-button"
            onClick={handlePostCustomize}
          >
            {mode === "multiplayer"
              ? "Continue to Multiplayer"
              : "Start With Character"}
          </button>
        </div>
      )}
      {screen === "credits" && <CreditsScreen onBack={handleCreditsBack} />}
      <div className="language-changer">
        <button onClick={handleLanguageCycle}>
          <Icon icon="earthAfrica" size="font" />
        </button>
      </div>
    </div>
  );
};

export default TitleScreen;
