import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";

import { Button } from "src/components/ui/buttons/Button";
import { Icon } from "src/components/ui/icons/Icon";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { selectDevFrameSteppingEnabled } from "src/redux/dev/selectors";
import { selectGamePaused } from "src/redux/gameState/selectors";
import { unpauseGame } from "src/redux/gameState/slice";
import { useAppSelector } from "src/redux/hooks";
import { toggleMaximizedTab } from "src/redux/ui/slice";

import "./PauseScreen.less";

export function PauseScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const controller = useContext(GameControllerContext);
  const isPaused = useAppSelector(selectGamePaused);
  const frameSteppingEnabled = useAppSelector(selectDevFrameSteppingEnabled);
  const stepFrame = useCallback(() => {
    controller?.stepOneFrame();
  }, [controller]);
  const unPause = useCallback(() => {
    dispatch(unpauseGame());
  }, [dispatch]);


  const handleMaximizeClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    dispatch(toggleMaximizedTab("viewport"));
  };

  interface LayoutNode {
    type: "row" | "tabset";
    children: Array<LayoutNode | TabNode>;
    maximized?: boolean;
  }

  interface TabNode {
    id: string;
  }

  const findViewportTabSet = (layout: LayoutNode): LayoutNode | null => {
    const traverse = (node: LayoutNode | TabNode): LayoutNode | null => {
      if (
        "type" in node &&
        node.type === "tabset" &&
        node.children.some((tab) => "id" in tab && tab.id === "viewport")
      ) {
        return node;
      }
      if ("children" in node) {
        for (const child of node.children) {
          const found = traverse(child);
          if (found) return found;
        }
      }
      return null;
    };

    return traverse(layout);
  };

  const isViewportMaximized = useSelector(
    (state: { ui: { layout: LayoutNode } }) => {
      const tabSet = findViewportTabSet(state.ui.layout);
      return tabSet?.maximized ?? false;
    }
  );

  if (!isPaused) return null;

  if (frameSteppingEnabled) {
    return (
      <div className="pause-screen pause-screen-frame-step">
        <div className="pause-screen-frame-step-controls">
          <Button className="frame-step-button" onClick={stepFrame}>
            <Icon icon="forwardStep" size="font" />
          </Button>
          <div className="pause-screen-frame-step-hint">
            Press ] to step frame
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pause-screen" onClick={unPause}>
      <div className="pause-screen-centered-content">
        <Icon icon="pause" className="pause-screen-pause-icon" />
        <h2>{t("pauseScreen.paused")}</h2>
      </div>

      <Button
        className="maximize-button"
        onClick={handleMaximizeClick}
        tooltip={
          isViewportMaximized ? "Minimize Viewport" : "Maximize Viewport"
        }
      >
        <Icon icon={isViewportMaximized ? "minimize" : "maximize"} size="font" />
      </Button>
    </div>
  );
}
