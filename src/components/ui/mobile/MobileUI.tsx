import cx from "classnames";
import { useCallback, useEffect, useRef } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useTranslation } from "react-i18next";

import { useTabComponenents } from "src/components/context/UIRenderingContext";
import { CodeEditor } from "src/components/editor/CodeEditor";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import { scriptEditorSelectors } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import {
  selectComponentConfigById,
  selectComponentConfigsByComponentName,
  selectEditorFontSize
} from "src/redux/ui/selectors";
import { adjustEditorFontSize } from "src/redux/ui/slice";
import { nextAnimationFrame } from "src/util/animationPromise";

import { ComponentConfigType } from "../config/types";
import { Icon } from "../icons/Icon";
import "./MobileUI.less";
import mobileScriptRaw from "./mobileScript.raw";

const mobileScript = mobileScriptRaw as string;

type MobileComponentWrapperProps = {
  componentName: string;
  tabId: string;
};

function MobileComponentWrapper(props: MobileComponentWrapperProps) {
  const { componentName, tabId } = props;
  const { t } = useTranslation();
  const tabComponents = useTabComponenents();
  const componentConfig = useAppSelector((state) =>
    selectComponentConfigById(state, tabId)
  );
  const Component = tabComponents[componentName]?.component;

  if (!Component) {
    return <div>{t("componentNames.missingComponent", { componentName })}</div>;
  }

  return (
    <div className={cx("mobile-component-wrapper", componentName)}>
      <Component componentState={componentConfig} tabId={tabId} />
    </div>
  );
}

function SourcererJSLogo() {
  return <div className="sourcerer-js-logo-mobile" />;
}

export function MobileUI() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const initialUpdatePerformedRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const componentConfigsByComponentName = useAppSelector(
    selectComponentConfigsByComponentName
  );
  const editorConfigs = componentConfigsByComponentName["codeEditor"];
  const [editorTabId, editorState] = (editorConfigs.at(0) ?? []) as
    | []
    | [string, ComponentConfigType<"codeEditor">];
  const editorId = editorState?.editorId;
  const codeEditor = useAppSelector((state) =>
    editorId ? scriptEditorSelectors.selectById(state, editorId) : undefined
  );

  const editorFontSize = useAppSelector(selectEditorFontSize);
  useEffect(() => {
    if (editorFontSize > 12) {
      dispatch(adjustEditorFontSize(10));
    }
  }, [dispatch, editorFontSize]);

  const scrollTo = useCallback(
    (target: number) => {
      const container = containerRef.current;
      if (!container) return;
      const currentScroll = container.scrollTop;

      const scrollLoop = async () => {
        const animationDuration = 500;
        let animationTime = 0;
        while (animationTime < animationDuration) {
          const progress = animationTime / animationDuration;
          container.scrollTop =
            (1 - progress) * currentScroll + progress * target;
          animationTime += await nextAnimationFrame();
        }
        container.scrollTop = target;
      };

      scrollLoop();
    },
    [containerRef]
  );

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const contentChild = container.querySelector(".mobile-content");
    if (!contentChild) return;
    const containerRect = container.getBoundingClientRect();
    const contentRect = contentChild.getBoundingClientRect();
    const finalScroll = contentRect.height - containerRect.height;
    scrollTo(finalScroll);
  }, [scrollTo]);

  const scrollToViewport = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const viewportEl = container.querySelector(
      ".mobile-component-wrapper.viewport"
    );
    if (!viewportEl) return;
    const containerRect = container.getBoundingClientRect();
    const viewportRect = viewportEl.getBoundingClientRect();
    const finalScroll =
      container.scrollTop + viewportRect.top - containerRect.top;
    scrollTo(finalScroll);
  }, [scrollTo]);

  const handleRunCode = useCallback(() => {
    const runButton = document.getElementById("code-editor-run-button");
    if (runButton) {
      runButton.click();
      scrollToViewport();
    }
  }, [scrollToViewport]);

  useEffect(() => {
    if (!codeEditor) return;
    const code = mobileScript;
    const extantCode = codeEditor.code;
    if (code === extantCode) return;
    if (initialUpdatePerformedRef.current) return;
    initialUpdatePerformedRef.current = true;
    dispatch(
      upsertEditor({
        ...codeEditor,
        code
      })
    );
  }, [dispatch, codeEditor]);

  if (!editorTabId || !editorState) return <div>Tell Rob he broke it.</div>;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mobile-container mobile" ref={containerRef}>
        <div className="mobile-content">
          <SourcererJSLogo />
          <h2>Looks like you're on a phone!</h2>
          <div className="mobile-explanation">
            This game is designed to be played with a mouse and keyboard, but
            you can still preview the spell system.
          </div>
          <div className="mobile-scroll-prompt" onClick={scrollToBottom}>
            <div className="scroll-down-arrow">
              <Icon icon="arrowDown" />
            </div>
            <div>Scroll down to the game and code editor.</div>
          </div>
          <MobileComponentWrapper
            componentName="viewport"
            tabId="viewport"
          />
          <div className={cx("mobile-component-wrapper", "codeEditor")}>
            <CodeEditor
              tabId={editorTabId}
              componentState={editorState}
              minimalControls
            />
          </div>
          <button className="mobile-run-button" onClick={handleRunCode}>
            <Icon icon="doubleArrowFilled" />
            <span>Run This Code</span>
          </button>
          <div className="mobile-explanation">
            This code will run in a sandboxed JS interpreter to control the
            character.
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
