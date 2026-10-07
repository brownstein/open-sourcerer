import { debounce } from "debounce";
import {
  BorderNode,
  DockLocation,
  IJsonRowNode,
  ILayoutApi,
  ITabRenderValues,
  ITabSetRenderValues,
  Layout,
  Action as LayoutAction,
  Actions as LayoutActions,
  Model,
  TabNode,
  TabSetNode
} from "flexlayout-react";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";
import { mergeRefs } from "react-merge-refs";

import { OverlayPosition } from "src/api/overlay";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { UIModelContext } from "src/components/context/UIModelContext";
import {
  UIRenderingContext,
  useTabComponenents
} from "src/components/context/UIRenderingContext";
import { UITabContext } from "src/components/context/UITabContext";
import { Modals } from "src/components/modals/Modals";
import { TutorialOverlayLayer } from "src/components/tutorials/TutorialOverlayLayer";
import { ItemDragLayer } from "src/components/ui/draggable/ItemDragLayer";
import "src/components/ui/icons/icons.less";
import { useApplyUrlParams } from "src/components/util/useApplyUrlParams";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { mutateLayout } from "src/engine/util/tabHelpers";
import i18Next from "src/i18n/i18n";
import { useAppDispatch, useAppSelector, useAppStore } from "src/redux/hooks";
import {
  selectLanguage,
  selectTabButtonTextColor,
  selectTabOverlayColor
} from "src/redux/settings/selectors";
import {
  selectComponentConfigById,
  selectLayout
} from "src/redux/ui/selectors";
import { updateLayout } from "src/redux/ui/slice";

import { Celebrator } from "../celebration/Celebrator";
import { Dock } from "../dock/Dock";
import { OverlayRenderer } from "../overlays/OverlayRenderer";
import { AddTabHexButton } from "../tab-selector/TabSelector";
import "./RootUI.css";

type ComponentRendererProps = {
  nodeId?: string;
  componentName: string;
};

/**
 * Component renderer for the game's pane heirarchy.
 */
function ComponentRenderer(props: ComponentRendererProps) {
  const { nodeId, componentName } = props;
  const gameController = useContext(GameControllerContext);
  const { t } = useTranslation();
  const tabComponents = useTabComponenents();
  const componentConfig = useAppSelector((state) =>
    selectComponentConfigById(state, nodeId)
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSizeRef, containerSize] = useMeasureSize<HTMLDivElement>();

  const componentDef = tabComponents[componentName];

  // Track cursor entrance/exit from the region.
  // This was updated to track clicks instead of cursor movement
  // because it's annoying to have the viewport jump around when
  // shifting tabs around.
  useEffect(() => {
    const container = containerRef.current;
    // TODO: visually indicate which region we're in.
    const onEnter = (e: MouseEvent) => {
      if (!nodeId) return;
      const target = e.target as HTMLElement;
      const isTextInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      // The level editor owns the keyboard while the user works in it — keep
      // the cursor region on its own tab so game bindings stay disengaged.
      if (isTextInput || componentName === "levelEditor") {
        gameController?.controls.setCurrentCursorRegion(nodeId);
      } else {
        gameController?.controls.setCurrentCursorRegion("viewport");
      }
    };
    const onExit = () => {
      if (nodeId) {
        gameController?.controls.unsetCurrentCursorRegion(nodeId);
      }
    };
    container?.addEventListener("mousedown", onEnter);
    // Default to selecting the viewport so controls work immediately.
    gameController?.controls.setCurrentCursorRegion("viewport");
    // container?.addEventListener("mouseleave", onExit);
    return () => {
      container?.removeEventListener("mousedown", onEnter);
      // container?.removeEventListener("mouseleave", onExit);
      onExit();
    };
  }, [gameController, nodeId, componentName]);

  // Maintain sizing variables.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.style.setProperty("--sr-width", `${containerSize.width}px`);
    container.style.setProperty("--sr-height", `${containerSize.height}px`);
    const aspectRatio = containerSize.width / containerSize.height;
    container.style.setProperty("--sr-aspect-ratio", `${aspectRatio}`);
    if (aspectRatio > 0.8 && aspectRatio < 1.2) {
      container.style.setProperty("--sr-aspect-ratio-type", "square");
    } else if (aspectRatio > 1) {
      container.style.setProperty("--sr-aspect-ratio-type", "wide");
    } else {
      container.style.setProperty("--sr-aspect-ratio-type", "tall");
    }
    if (componentDef.minimumWidth) {
      container.style.setProperty(
        "--sr-minimum-width",
        typeof componentDef.minimumWidth === "string"
          ? componentDef.minimumWidth
          : `${componentDef.minimumWidth}px`
      );
    }
    if (componentDef.minimumHeight) {
      container.style.setProperty(
        "--sr-minimum-height",
        typeof componentDef.minimumHeight === "string"
          ? componentDef.minimumHeight
          : `${componentDef.minimumHeight}px`
      );
    }
  }, [containerSize, componentDef]);

  const tabContext = useMemo(() => ({ tabId: nodeId ?? "" }), [nodeId]);

  // This shouldn't happen the way we use layouts.
  if (!nodeId) return null;

  // This shouldn't happen, but it could if someone manually inserts
  // a bad component definition.
  if (!componentDef) {
    return <div>{t("componentNames.missingComponent", { componentName })}</div>;
  }
  const Component = componentDef.component;
  const minWidth = componentDef.minimumWidth;
  const minHeight = componentDef.minimumHeight;

  return (
    <div
      className="screen-region"
      ref={mergeRefs([containerRef, containerSizeRef])}
    >
      <UITabContext.Provider value={tabContext}>
        <div
          className="screen-region-inner"
          style={{
            minWidth,
            minHeight
          }}
        >
          <Component tabId={nodeId} componentState={componentConfig} />
        </div>
      </UITabContext.Provider>
    </div>
  );
}

/**
 * Update handler to convert layout JSON into a Model, with an optional second
 * parameter to pull from a previous model instance to allow component re-use.
 *
 * As of flexlayout-react@0.10.0, Model.fromJson accepts the previous model
 * directly and carries over view state (mounted tab contents, rects,
 * visibility) for nodes with matching ids.
 */
export function flexModel(layout: IJsonRowNode, prevModel: Model | null) {
  return Model.fromJson(
    {
      global: {
        tabEnableRename: false,
        tabSetEnableTabStrip: true,
        tabBorderHeight: 1,
        tabBorderWidth: 1
      },
      layout
    },
    prevModel ?? undefined
  );
}

/**
 * Root UI system for the game. A conscious decision was made to support
 * flexible layout panes but not floating windows in revision 3.
 */
export function RootUI() {
  const { t } = useTranslation();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const layout = useAppSelector(selectLayout);
  const uiRenderContext = useContext(UIRenderingContext);
  const gameController = useContext(GameControllerContext);
  const layoutRef = useRef<ILayoutApi | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tabOverlayColor = useAppSelector(selectTabOverlayColor);
  const tabButtonTextColor = useAppSelector(selectTabButtonTextColor);
  const language = useAppSelector(selectLanguage);
  const tabComponents = useTabComponenents();

  const lastModelRef = useRef<Model | null>(null);
  const model = useMemo(
    () => flexModel(layout, lastModelRef.current ?? null),
    [layout]
  );
  lastModelRef.current = model;

  useEffect(() => {
    const layoutEl = document.querySelector(".flexlayout__layout");
    if (layoutEl) {
      const overlayRgba = `rgba(${tabOverlayColor.r},${tabOverlayColor.g},${tabOverlayColor.b},${tabOverlayColor.a})`;
      const textRgba = `rgba(${tabButtonTextColor.r},${tabButtonTextColor.g},${tabButtonTextColor.b},${tabButtonTextColor.a})`;
      (layoutEl as HTMLElement).style.setProperty(
        "--tab-overlay-color",
        overlayRgba
      );
      (layoutEl as HTMLElement).style.setProperty(
        "--tab-button-text-color",
        textRgba
      );
      i18Next.changeLanguage(language);
    }
  }, [tabOverlayColor, tabButtonTextColor, language]);

  // Define the viewport as the main region for the game controller's keybindings.
  useEffect(() => {
    const container = containerRef.current;
    const controls = gameController?.controls;
    if (controls && container) {
      controls.mountDom(container);
      controls.setGameControlRegions(["viewport"]);
    }
    return () => {
      controls?.unmountDom();
    };
  }, [gameController]);

  // Emit a resize event whenever the model changes to update components.
  // TODO: figure out if this is actually needed.
  useEffect(() => {
    uiRenderContext.events.emit("resize");
  }, [uiRenderContext, model]);

  const factory = useCallback(
    (node: TabNode) => {
      const componentName = node.getComponent();
      if (!componentName) return <div>Missing component name in layout!</div>;
      return (
        <ComponentRenderer
          nodeId={node.getId()}
          componentName={componentName}
        />
      );
    },
    [t]
  );

  // Track window resize events.
  useEffect(() => {
    const onResize = debounce(() => uiRenderContext.events.emit("resize"), 50);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [uiRenderContext]);

  const onLayoutChangeDebounced = useMemo(
    () =>
      debounce((updatedModel: Model) => {
        dispatch(updateLayout(updatedModel.toJson().layout));
      }, 100),
    [dispatch]
  );

  // Intercept tab deletion actions to provide a smoother transition.
  const onAction = useCallback(
    (action: LayoutAction) => {
      if (action.type === LayoutActions.DELETE_TAB) {
        const tabNodeId = action.data.node as string;
        mutateLayout(store, tabNodeId).closeTab(500).apply();
        uiRenderContext.events.emit("resize");
        return;
      }
      return action;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, dispatch, uiRenderContext]
  );

  // Keep the layout updated in Redux.
  const onModelChange = useCallback(
    (updatedModel: Model, action: LayoutAction) => {
      // Debounce tab split action layout updates to the store.
      // Emit an immediate resize event though.
      switch (action.type) {
        case LayoutActions.ADJUST_BORDER_SPLIT:
        case LayoutActions.ADJUST_WEIGHTS:
          uiRenderContext.events.emit("resize");
          return onLayoutChangeDebounced(updatedModel);
        default:
          break;
      }

      // Ensure we always have a viewport tab.
      const viewportTab = updatedModel.getNodeById("viewport");
      if (viewportTab === undefined) {
        const tabSetId = updatedModel.getActiveTabset()?.getId();
        if (tabSetId) {
          updatedModel.doAction(
            LayoutActions.addTab(
              {
                type: "tab",
                name: "Game",
                id: "viewport"
              },
              tabSetId,
              DockLocation.CENTER,
              0
            )
          );
        }
      }

      
      const modelJson = updatedModel.toJson();
      dispatch(updateLayout(modelJson.layout));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, dispatch, uiRenderContext]
  );

  const onRenderTab = useCallback(
    (node: TabNode, renderValues: ITabRenderValues) => {
      const tabComponent = tabComponents[node.getComponent() ?? ""];
      if (!tabComponent) return;
      // TODO(brownstein) nest this logic in a component that can subscribe to component
      // state so that the tab names can be updated properly.
      const displayName = tabComponent.displayName(t);
      renderValues.content = displayName;
      if (tabComponent.iconClassName !== undefined) {
        renderValues.leading = (
          <div className={`tab-icon ${tabComponent.iconClassName}`} />
        );
      }
    },
    [tabComponents, t]
  );

  const onRenderTabSet = useCallback(
    (node: TabSetNode | BorderNode, renderValues: ITabSetRenderValues) => {
      const tabSetId = node.getId();
      // Get rid of the maximize button - its confusing users.
      renderValues.buttons = [];
      renderValues.stickyButtons.push(
        <AddTabHexButton key="add-tab" tabSetId={tabSetId} />
      );
      // TODO: don't duplicate this, but instead detect the
      // clicked region and spawn the popover at the cursor
      // position.
      renderValues.stickyButtons.push(
        <AddTabHexButton key="add-tab-zone" tabSetId={tabSetId} isFiller />
      );
    },
    []
  );

  // TODO: only do this once.
  useApplyUrlParams();

  return (
    <div className="screen-root">
      <DndProvider backend={HTML5Backend}>
        <div className="left-sidebar">
          <Dock />
        </div>
        <div className="layout-root" ref={containerRef}>
          <UIModelContext.Provider value={model}>
            <Layout
              ref={layoutRef}
              model={model}
              factory={factory}
              onModelChange={onModelChange}
              onAction={onAction}
              onRenderTab={onRenderTab}
              onRenderTabSet={onRenderTabSet}
              realtimeResize
            />
          </UIModelContext.Provider>
          <OverlayRenderer position={OverlayPosition.Screen} />
        </div>
        <Modals />
        <Celebrator />
        <ItemDragLayer />
        <TutorialOverlayLayer />
      </DndProvider>
    </div>
  );
}
