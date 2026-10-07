import { ThemeProvider, createTheme } from "@mui/material";
import { Suspense, lazy, useEffect, useMemo } from "react";
import shortid from "shortid";

import Controller from "src/components/controller/Controller";
import { CreditsScreen } from "src/components/title/CreditsScreen";
import TitleScreen from "src/components/title/TitleScreen";
import { MobileUI } from "src/components/ui/mobile/MobileUI";
import { RootUI } from "src/components/ui/root/RootUI";
import { RenderRetryBoundary } from "src/components/util/RenderRetryBoundary";
import { checkMobile } from "src/engine/util/mobile";
import { selectMultiplayerFlow } from "src/multiplayer/match/selectors";
import { MultiplayerScreens } from "src/multiplayer/ui/screens/MultiplayerScreens";
import { selectInTitleScreen } from "src/redux/gameState/selectors";
import { returnToTitleScreen } from "src/redux/gameState/slice";
import { useAppSelector } from "src/redux/hooks";
import { selectDarkMode } from "src/redux/settings/selectors";
import { store } from "src/redux/store";
import { updateLayout } from "src/redux/ui/slice";
import { isDevMode } from "src/util/devUtil";

import { MainPreloader } from "./preloader/Preloader";

const SpellTester = lazy(
  () => import("src/components/spell-tester/SpellTester")
);

// Mode switching here is only for modes that bypass the flexlayout-react component tree entirely.
const urlParams = new URLSearchParams(window.location.search);
const urlMode = isDevMode() ? urlParams.get("mode") : null;
const isCreditsRoute = window.location.pathname === "/credits";

/**
 * Escalating recovery for RootUI render crashes (flexlayout-react can
 * throw on transient layout-measure states). All tiers are in-React soft
 * refreshes — no page reload; the tree rehydrates from redux:
 *   1st failure  — plain retry (transient crashes recover on remount).
 *   2nd failure  — the layout model itself is suspect: rehydrate it to the
 *                  known-good baseline (viewport only) before retrying.
 *   3rd failure  — last tier: return to the title screen.
 */
function recoverRootUI(consecutiveFailures: number): boolean | void {
  if (consecutiveFailures === 1) return;
  if (consecutiveFailures === 2) {
    console.warn("[recoverRootUI] resetting layout to baseline");
    store.dispatch(
      updateLayout({
        type: "row",
        id: shortid(),
        weight: 100,
        children: [
          {
            type: "tabset",
            id: shortid(),
            weight: 100,
            children: [
              {
                // The stable viewport tab id tab helpers target.
                id: "viewport",
                component: "viewport",
                enableClose: false,
                type: "tab"
              }
            ]
          }
        ]
      })
    );
    return;
  }
  console.warn("[recoverRootUI] returning to title screen");
  store.dispatch(returnToTitleScreen());
  // The world changed entirely; restart the escalation ladder.
  return true;
}

export function MainEntryPoint() {
  const mobile = checkMobile();
  const onTitleScreen = useAppSelector(selectInTitleScreen);
  const multiplayerFlow = useAppSelector(selectMultiplayerFlow);
  const darkMode = useAppSelector(selectDarkMode);

  useEffect(() => {
    document.body.classList.toggle("dark", darkMode);
    document.body.classList.toggle("light", !darkMode);
  }, [darkMode]);

  const muiTheme = useMemo(
    () =>
      createTheme({
        cssVariables: true,
        palette: {
          mode: darkMode ? "dark" : "light"
        },
        typography: {
          h4: { fontWeight: 600 },
          h5: { fontWeight: 600 },
          h6: { fontWeight: 600 },
          subtitle1: { fontWeight: 600 },
          subtitle2: { fontWeight: 600 },
          overline: { fontWeight: 600 }
        }
      }),
    [darkMode]
  );

  const showTitleScreen = onTitleScreen && !mobile;

  if (isCreditsRoute) {
    return (
      <ThemeProvider theme={muiTheme}>
        <CreditsScreen
          onBack={() => {
            window.location.href = "/";
          }}
        />
      </ThemeProvider>
    );
  }

  if (urlMode === "spell-tester") {
    return (
      <ThemeProvider theme={muiTheme}>
        <MainPreloader>
          <Suspense fallback={null}>
            <SpellTester />
          </Suspense>
        </MainPreloader>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <MainPreloader>
        {showTitleScreen && multiplayerFlow !== "none" ? (
          <MultiplayerScreens />
        ) : showTitleScreen ? (
          <TitleScreen />
        ) : (
          <Controller>
            {mobile ? (
              <MobileUI />
            ) : (
              <RenderRetryBoundary onRetryEscalation={recoverRootUI}>
                <RootUI />
              </RenderRetryBoundary>
            )}
          </Controller>
        )}
      </MainPreloader>
    </ThemeProvider>
  );
}

export default MainEntryPoint;
