import { Button, IconButton, Tooltip } from "@mui/material";
import {
  ReactElement,
  ReactNode,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ArrowContainer, Popover } from "react-tiny-popover";
import shortid from "shortid";
import { Vector2 } from "three";

import { Arrow, ArrowProps } from "src/components/ui/arrow/Arrow";
import { mutateLayout } from "src/engine/util/tabHelpers";
import { useAppStore } from "src/redux/hooks";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectComponentConfigsByComponentName } from "src/redux/ui/selectors";

import { UITabContext } from "../context/UITabContext";
import { ComponentConfigType } from "../ui/config/types";
import { Icon } from "../ui/icons/Icon";
import "./ExampleCode.css";
import { findOffsetInParentNode, findRange } from "./rangeHelpers";
import { DefaultExplainers } from "./tokenExplanations";
import {
  TokenOrCommentType,
  explainThisToken,
  mergeExplainers,
  tokenizeCode
} from "./tokenHelpers";

type HLRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExampleCodeProps = {
  children: ReactElement | ReactElement[];
  explanations?: Record<string, ReactNode>;
};

export function ExampleCode(props: ExampleCodeProps) {
  const { children, explanations } = props;

  const store = useAppStore();
  const { tabId } = useContext(UITabContext);

  const explainers = useMemo(
    () => mergeExplainers(DefaultExplainers, explanations),
    [explanations]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const codeBlockRef = useRef<HTMLDivElement>(null);

  // Get the tokenized code contained contained in all child elements.
  // This only works because we're using plain elements internally - don't try
  // wrapping complex components insdie this component.
  const textContent = useMemo(() => {
    let textContents: string[] = [];
    const _traverse = (node: ReactNode) => {
      if (node === null || node === undefined) return;
      switch (typeof node) {
        case "string":
          textContents.push(node);
          return;
        case "boolean":
        case "number":
          textContents.push(String(node));
          return;
        default:
          break;
      }
      if (Array.isArray(node)) {
        node.map(_traverse);
        return;
      }
      if (!isValidElement(node)) return;
      const withChildren = node as ReactElement<{ children?: React.ReactNode }>;
      if (withChildren.props.children !== undefined)
        _traverse(withChildren.props.children);
    };
    _traverse(children);
    return textContents.join("");
  }, [children]);
  const tokenizedCode = useMemo(() => {
    try {
      return tokenizeCode(textContent);
    } catch (err) {
      return [];
    }
  }, [textContent]);

  // Range element token to display.
  const [explainToken, setExplainToken] = useState<TokenOrCommentType>(null);

  const [hoverHighlightRect, setHoverHighlightRect] = useState<HLRect | null>(
    null
  );
  const [explainHighlightRect, setExplainHighlightRect] =
    useState<HLRect | null>(null);

  const onMouseMove = useCallback<React.MouseEventHandler>(
    (event) => {
      if (!codeBlockRef.current) return;
      const caratPosition = document.caretPositionFromPoint(
        event.clientX,
        event.clientY
      );
      if (!caratPosition) {
        setHoverHighlightRect(null);
        return;
      }
      const offset = findOffsetInParentNode(
        codeBlockRef.current,
        caratPosition.offsetNode,
        caratPosition.offset
      );
      if (offset === -1) {
        setHoverHighlightRect(null);
        return;
      }
      const tokenAtOffset = tokenizedCode[offset];
      if (!tokenAtOffset) {
        setHoverHighlightRect(null);
        return;
      }
      const range = findRange(
        codeBlockRef.current,
        tokenAtOffset.start,
        tokenAtOffset.end
      );
      if (range) {
        const updateRect = () => {
          const containerEl = codeBlockRef.current;
          if (!containerEl) return;
          const codeBlockRect = containerEl.getBoundingClientRect();
          const rangeRect = range.getBoundingClientRect();
          const top = rangeRect.top - codeBlockRect.top;
          const left = rangeRect.left - codeBlockRect.left;
          setHoverHighlightRect({
            x: left,
            y: top,
            width: rangeRect.width,
            height: rangeRect.height
          });
        };
        updateRect();
      }
    },
    [tokenizedCode]
  );

  const onClick = useCallback<React.MouseEventHandler>(
    (event) => {
      if (!codeBlockRef.current) return;
      const caratPosition = document.caretPositionFromPoint(
        event.clientX,
        event.clientY
      );
      if (!caratPosition) {
        setExplainToken(null);
        setExplainHighlightRect(null);
        return;
      }
      const offset = findOffsetInParentNode(
        codeBlockRef.current,
        caratPosition.offsetNode,
        caratPosition.offset
      );
      if (offset === -1) {
        setExplainToken(null);
        setExplainHighlightRect(null);
        return;
      }
      const tokenAtOffset = tokenizedCode[offset];
      setExplainToken(tokenAtOffset);
      if (!tokenAtOffset) setExplainHighlightRect(null);
    },
    [tokenizedCode]
  );

  const onMouseOut = useCallback(() => {
    setHoverHighlightRect(null);
  }, []);

  const onNext = useCallback(() => {
    for (let i = explainToken?.end ?? 0; i < tokenizedCode.length; i++) {
      const nextToken = tokenizedCode[i];
      if (nextToken && nextToken !== explainToken) {
        setExplainToken(nextToken);
        return;
      }
    }
    setExplainToken(null);
  }, [explainToken, tokenizedCode]);

  const onPrev = useCallback(() => {
    for (let i = explainToken?.start ?? 0 - 1; i >= 0; i--) {
      const nextToken = tokenizedCode[i];
      if (nextToken && nextToken !== explainToken) {
        setExplainToken(nextToken);
        return;
      }
    }
    setExplainToken(null);
  }, [explainToken, tokenizedCode]);

  useEffect(() => {
    if (!codeBlockRef.current || !explainToken) {
      setExplainHighlightRect(null);
      return;
    }
    const range = findRange(
      codeBlockRef.current,
      explainToken.start,
      explainToken.end
    );
    if (range) {
      CSS.highlights.set("example-code-selection", new Highlight(range));
      const updateRect = () => {
        const containerEl = codeBlockRef.current;
        if (!containerEl) return;
        const codeBlockRect = containerEl.getBoundingClientRect();
        const rangeRect = range.getBoundingClientRect();
        const top = rangeRect.top - codeBlockRect.top;
        const left = rangeRect.left - codeBlockRect.left;
        setExplainHighlightRect({
          x: left,
          y: top,
          width: rangeRect.width,
          height: rangeRect.height
        });
      };
      updateRect();
    }
    return () => {
      CSS.highlights.delete("example-code-selection");
    };
  }, [explainToken?.start, explainToken?.end]);

  // Arrow from explanation to code.
  // TODO: make this listen for rect changes.
  const explanationsRef = useRef<HTMLDivElement>(null);
  const [arrowProps, setArrowProps] = useState<ArrowProps | null>(null);
  useEffect(() => {
    if (
      !containerRef.current ||
      !codeBlockRef.current ||
      !explanationsRef.current ||
      !explainHighlightRect
    ) {
      setArrowProps(null);
      return;
    }
    const containerEl = containerRef.current;
    const codeBlockEl = codeBlockRef.current;
    const explanationsEl = explanationsRef.current;

    const updateArrow = () => {
      const containerRect = containerEl.getBoundingClientRect();
      const codeRect = codeBlockEl.getBoundingClientRect();
      const explainRect = explanationsEl.getBoundingClientRect();

      const containerRectTopLeft = new Vector2(
        containerRect.left,
        containerRect.top
      );
      const codeOffset = new Vector2(
        codeRect.left - containerRect.left,
        codeRect.top - containerRect.top
      );
      const toPoint = new Vector2(
        explainHighlightRect.x + explainHighlightRect.width + codeOffset.x,
        explainHighlightRect.y + explainHighlightRect.height + codeOffset.y
      );
      const fromPoint = new Vector2(
        explainRect.left + explainRect.width * 0.6,
        explainRect.top - containerRectTopLeft.y
      );
      fromPoint.x = Math.min(
        explainRect.left + explainRect.width * 0.9,
        toPoint.x + (fromPoint.y - toPoint.y)
      );

      setArrowProps({
        from: fromPoint,
        to: toPoint,
        fromDelta: new Vector2(0, Math.min(0, toPoint.y - fromPoint.y) * 0.25),
        toDelta: new Vector2(-1, -1).multiplyScalar(
          toPoint.clone().sub(fromPoint).length() * 0.25
        ),
        headSize: 20,
        color: "#ffffff",
        fixed: false,
        className: "code-explanation-arrow"
      });
    };

    updateArrow();
    const resizeObserver = new ResizeObserver(updateArrow);
    resizeObserver.observe(containerEl);
    resizeObserver.observe(explanationsEl);
    return () => resizeObserver.disconnect();
  }, [explainHighlightRect]);

  const explanationsContentRef = useRef<HTMLDivElement>(null);
  const [explanationsHeight, setExplanationsHeight] = useState(0);
  useEffect(() => {
    if (!explainToken || !explanationsContentRef.current) {
      setExplanationsHeight(0);
      return;
    }
    const doResize = () => {
      if (!explanationsContentRef.current) return;
      const innerRect = explanationsContentRef.current.getBoundingClientRect();
      setExplanationsHeight(innerRect.height);
    };
    doResize();
    const resizeOveserver = new ResizeObserver(doResize);
    resizeOveserver.observe(explanationsContentRef.current);
    return () => resizeOveserver.disconnect();
  }, [explainToken]);

  const explanation = useMemo(
    () =>
      explainToken &&
      explainThisToken(textContent, tokenizedCode, explainToken, explainers),
    [textContent, tokenizedCode, explainToken, explainers]
  );

  const onRunCode = useCallback(() => {
    const state = store.getState();
    const allCodeEditorConfigs = selectComponentConfigsByComponentName(state)[
      "codeEditor"
    ] as [string, ComponentConfigType<"codeEditor">][] | undefined;
    const openEditor = allCodeEditorConfigs?.find(
      ([_, cfg]) => cfg.docsInstanceId === tabId
    );
    if (openEditor?.[1].editorId) {
      store.dispatch(
        upsertEditor({
          id: openEditor[1].editorId,
          code: textContent
        })
      );
    } else {
      const editorId = shortid();
      mutateLayout(store, tabId)
        .openTab(
          {
            componentName: "codeEditor",
            relativePosition: "bottom",
            relativeWeight: 0.5,
            componentConfig: {
              editorId,
              docsInstanceId: tabId
            }
          },
          {
            editor: {
              id: editorId,
              config: {
                code: textContent
              }
            }
          }
        )
        .apply();
    }
  }, [store, textContent, tabId]);

  return (
    <div className="example-code-block" ref={containerRef}>
      <div
        className="example-code-code"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseOut}
        onMouseUp={onClick}
        ref={codeBlockRef}
      >
        {children}
        {hoverHighlightRect && (
          <div
            className="range-highlight hover"
            style={{
              top: hoverHighlightRect.y,
              left: hoverHighlightRect.x,
              width: hoverHighlightRect.width,
              height: hoverHighlightRect.height
            }}
          />
        )}
        {explainHighlightRect && (
          <div
            id="explain-highlight-rect"
            className="range-highlight"
            style={{
              top: explainHighlightRect.y,
              left: explainHighlightRect.x,
              width: explainHighlightRect.width,
              height: explainHighlightRect.height
            }}
          />
        )}
      </div>
      <div className="example-code-controls-and-explanations">
        <div
          className="example-code-explanations"
          ref={explanationsRef}
          style={{
            height: explanationsHeight
          }}
        >
          <div className="content" ref={explanationsContentRef}>
            {explanation}
          </div>
        </div>
      </div>
      <div className="example-code-explain-code-controls">
        {explainToken ? (
          <>
            <Tooltip title="Previous">
              <IconButton onClick={onPrev}>
                <Icon icon="chevronLeft" size="font" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Next">
              <IconButton onClick={onNext}>
                <Icon icon="chevronRight" size="font" />
              </IconButton>
            </Tooltip>
          </>
        ) : (
          <>
            <Button variant="contained" color="primary" onClick={onNext}>
              Explain Code
            </Button>
            <Button variant="contained" color="secondary" onClick={onRunCode}>
              Open in Code Editor
            </Button>
          </>
        )}
      </div>
      {arrowProps && <Arrow {...arrowProps} />}
    </div>
  );
}
