import cx from "classnames";
import { useCallback, useContext, useId, useMemo, useState } from "react";
import { Item, Menu, useContextMenu } from "react-contexify";
import { useTranslation } from "react-i18next";
import { ArrowContainer, Popover } from "react-tiny-popover";

import { PlayerRenderMode } from "src/api/characterCustomization";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { mutateLayout, RelativePositionString } from "src/engine/util/tabHelpers";
import {
  selectDevFrameSteppingEnabled,
  selectDevPhysicsOverlayEnabled,
  selectNoClipEnabled
} from "src/redux/dev/selectors";
import {
  setEnableFrameStepping,
  setEnableNoClip,
  setEnablePhysicsOverlay
} from "src/redux/dev/slice";
import { useAppDispatch, useAppSelector, useAppStore } from "src/redux/hooks";
import { addQuest, completeQuest } from "src/redux/progression/slice";
import { selectPlayerRenderMode } from "src/redux/status/selectors";
import { setPlayerRenderMode } from "src/redux/status/slice";
import { openTab, pushModalTyped } from "src/redux/shared/actions";
import {
  selectCurrentTutorialId,
  selectLayoutTabsByComponentName
} from "src/redux/ui/selectors";
import { isDevMode } from "src/util/devUtil";

import { Icon, IconName } from "../icons/Icon";
import "./Dock.less";

export const kDockDragType = "dock";

type DockButton = {
  icon: IconName;
  text: string;
  componentName: string;
  componentPositionRelative?: RelativePositionString;
};

type DockButtonProps = {
  buttonProps: DockButton;
  withTooltip?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-redeclare
export function DockButton(props: DockButtonProps) {
  const { buttonProps, withTooltip } = props;
  const store = useAppStore();
  const currentTutorialId = useAppSelector(selectCurrentTutorialId);
  const tabsByComponent = useAppSelector(selectLayoutTabsByComponentName);
  const [isOver, setIsOver] = useState(false);

  const onClick = useCallback(() => {
    // Don't open a duplicate tab if one already exists
    const existing = tabsByComponent.get(buttonProps.componentName);
    if (existing && existing.length > 0) return;

    mutateLayout(store, "viewport")
      .openTab({
        componentName: buttonProps.componentName,
        relativePosition: buttonProps.componentPositionRelative ?? "bottom",
        duration: 500
      })
      .apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, buttonProps, currentTutorialId, tabsByComponent]);

  // Intercept onMouseDown events on the buttons to prevent drag behavior
  // from kicking in and disrupting the click cycle - especially in the
  // the border dock variant.
  const onButtonMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const buttonContent = (
    <div
      className="dock-item"
      id={`dock-item-${buttonProps.componentName}`}
      onClick={onClick}
      onMouseDown={onButtonMouseDown}
      onMouseEnter={() => setIsOver(true)}
      onMouseLeave={() => setIsOver(false)}
    >
      <div className="dock-item-icon">
        <Icon icon={buttonProps.icon} size="fill" />
      </div>
    </div>
  );

  if (withTooltip) {
    return (
      <Popover
        isOpen={isOver}
        padding={4}
        positions={"right"}
        content={(cProps) => (
          <ArrowContainer
            childRect={cProps.childRect}
            popoverRect={cProps.popoverRect}
            position={cProps.position}
            arrowSize={4}
            arrowColor="#000000"
          >
            <div className="button-tooltip">{buttonProps.text}</div>
          </ArrowContainer>
        )}
      >
        {buttonContent}
      </Popover>
    );
  }

  return buttonContent;
}

function DevDockButton() {
  const controller = useContext(GameControllerContext);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const contextMenuId = useId();
  const { show: showContextMenu } = useContextMenu({
    id: contextMenuId
  });
  const enablePhysicsOverlay = useAppSelector(selectDevPhysicsOverlayEnabled);
  const enableFrameStepping = useAppSelector(selectDevFrameSteppingEnabled);
  const enableNoClip = useAppSelector(selectNoClipEnabled);
  const playerRenderMode = useAppSelector(selectPlayerRenderMode);

  return (
    <>
      <Popover
        isOpen={isOver}
        padding={4}
        positions="right"
        content={(cProps) => (
          <ArrowContainer
            childRect={cProps.childRect}
            popoverRect={cProps.popoverRect}
            position={cProps.position}
            arrowSize={4}
            arrowColor="#000000"
          >
            <div className="button-tooltip">
              {t("componentNames.developer")}
            </div>
          </ArrowContainer>
        )}
      >
        <div
          className="dock-item"
          onClick={(event) => showContextMenu({ event })}
          onMouseEnter={() => setIsOver(true)}
          onMouseLeave={() => setIsOver(false)}
        >
          <div className="dock-item-icon">
            <Icon icon="developer" size="fill" />
          </div>
        </div>
      </Popover>
      <Menu id={contextMenuId} className="dock-dev-overlay-menu">
        <Item id="loadGame" onClick={() => controller?.load()}>
          Load Game
        </Item>
        <Item
          id="toggleNoClip"
          onClick={() => dispatch(setEnableNoClip(!enableNoClip))}
        >
          Toggle NoClip
        </Item>
        <Item
          id="togglePhysicsOverlay"
          onClick={() =>
            dispatch(setEnablePhysicsOverlay(!enablePhysicsOverlay))
          }
        >
          Toggle Physics Overlay
        </Item>
        <Item
          id="toggleFrameStepping"
          onClick={() => dispatch(setEnableFrameStepping(!enableFrameStepping))}
        >
          Toggle Frame Stepping
        </Item>
        <Item
          id="togglePlayerSilhouette"
          onClick={() =>
            dispatch(
              setPlayerRenderMode(
                playerRenderMode === PlayerRenderMode.White
                  ? PlayerRenderMode.Normal
                  : PlayerRenderMode.White
              )
            )
          }
        >
          Toggle White Player Silhouette
        </Item>
        <Item
          id="openLevelEditor"
          onClick={() =>
            dispatch(
              openTab({
                nextToTabId: "viewport",
                componentName: "levelEditor",
                slideIn: true,
                duration: 300
              })
            )
          }
        >
          Level Editor
        </Item>
        <Item
          id="openLevelSelect"
          onClick={() =>
            dispatch(
              pushModalTyped({
                modalName: "levelSelect",
                modalArg: {}
              })
            )
          }
        >
          Level Select
        </Item>
        <Item
          id="openSpellSelect"
          onClick={() =>
            dispatch(
              pushModalTyped({
                modalName: "spellSelect",
                modalArg: {}
              })
            )
          }
        >
          Spell Select
        </Item>
        <Item
          id="openMultiplayer"
          onClick={() =>
            dispatch(
              pushModalTyped({
                modalName: "mpRoom",
                modalArg: {}
              })
            )
          }
        >
          Multiplayer Match
        </Item>
        <Item
          id="addSomeQuests"
          onClick={() => {
            dispatch(
              addQuest({
                name: "Do the thing",
                steps: [
                  {
                    name: "Do"
                  },
                  {
                    name: "The"
                  },
                  {
                    name: "Thing"
                  }
                ]
              })
            );
            dispatch(
              addQuest({
                name: "Do the other thing",
                steps: [
                  {
                    name: "Do"
                  },
                  {
                    name: "The"
                  },
                  {
                    name: "Thing"
                  }
                ]
              })
            );
            dispatch(completeQuest("Do the thing"));
          }}
        >
          Add Quests
        </Item>
      </Menu>
    </>
  );
}

export type DockProps = {
  className?: string;
};

export function Dock(props: DockProps) {
  const { className } = props;
  const { t } = useTranslation();

  const dockButtonsUpper: DockButton[] = useMemo<DockButton[]>(
    () => [
      {
        icon: "inventoryFilled",
        text: t("componentNames.inventory"),
        componentName: "inventory",
        componentPositionRelative: "right"
      },
      {
        icon: "fileFilled",
        text: t("componentNames.docs"),
        componentName: "docs",
        componentPositionRelative: "left"
      },
      {
        icon: "codingFilled",
        text: t("componentNames.editor"),
        componentName: "codeEditor",
        componentPositionRelative: "bottom"
      }
    ],
    [t]
  );

  const dockButtonsLower: DockButton[] = useMemo<DockButton[]>(
    () => [
      {
        icon: "settingsFilled",
        text: t("componentNames.settings"),
        componentName: "settings"
      }
    ],
    [t]
  );

  return (
    <div className={cx("dock", className)}>
      <div className="dock-buttons-upper">
        {dockButtonsUpper.map((buttonProps, i) => (
          <DockButton key={i} buttonProps={buttonProps} withTooltip />
        ))}
      </div>
      <div className="dock-buttons-lower">
        {isDevMode() && <DevDockButton />}
        {dockButtonsLower.map((buttonProps, i) => (
          <DockButton key={i} buttonProps={buttonProps} withTooltip />
        ))}
      </div>
    </div>
  );
}
