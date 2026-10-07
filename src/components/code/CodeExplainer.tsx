import * as acorn from "acorn";
import cx from "classnames";
import { js as formatJs } from "js-beautify";
import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import shortid from "shortid";
import { Vector2 } from "three";

import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";

import { Arrow } from "../ui/arrow/Arrow";
import "./CodeExplainer.css";
import {
  LegacyTokenExplanations,
  TokenData,
  codePointToString,
  generateTokenExplanations,
  traverseAcornTreeAsLines
} from "./tokenHelpers";

type CodePointEventData = {
  el: HTMLSpanElement;
  lineIndex: number;
  tokenIndex: number;
};

type CodePointExplainerEventTypes = {
  hover: CodePointEventData;
  leave: CodePointEventData;
  click: CodePointEventData;
};

type CodeExplainerContextType = {
  codeNodes: Map<string, HTMLSpanElement>;
  explanationNodes: Map<string, HTMLDivElement>;
  events: TypedEventEmitter<CodePointExplainerEventTypes>;
};

export type ExplanationState = {
  lineIndex: number;
  tokenIndex: number;
};

export type ExplanationDisplayStateMember = {
  id: string;
  tokenIndex: number;
  content: ReactNode;
  entering?: boolean;
  exiting?: boolean;
};

export type ExplanationDisplayStateLine = {
  explanations: ExplanationDisplayStateMember[];
  entering?: boolean;
  exiting?: boolean;
};

export type ExplanationDisplayState = Map<number, ExplanationDisplayStateLine>;

export type CodeExplainerProps = {
  children: string;
  tokenExplanations?: LegacyTokenExplanations;
};

const CodeExplainerContext = createContext<CodeExplainerContextType | null>(
  null
);

export function CodeExplainer(props: CodeExplainerProps) {
  const { children, tokenExplanations } = props;
  const explanationsRef = useRef(tokenExplanations);
  explanationsRef.current = tokenExplanations;

  const formattedCode = useMemo(() => {
    const code = children;
    return formatJs(code, {
      indent_size: 2,
      indent_with_tabs: false
    });
  }, [children]);
  const tokenLines = useMemo(
    () => traverseAcornTreeAsLines(formattedCode),
    [formattedCode]
  );
  const allTokenExplanations = useMemo(
    () => generateTokenExplanations(tokenLines, tokenExplanations ?? {}),
    [tokenLines, tokenExplanations]
  );
  const codeExplainerContextValue = useMemo<CodeExplainerContextType>(
    () => ({
      codeNodes: new Map(),
      explanationNodes: new Map(),
      events: createTypedEventEmitter<CodePointExplainerEventTypes>()
    }),
    []
  );

  const [expState, setExpState] = useState<ExplanationState | null>(null);
  const [expDisplayState, setExpDisplayState] =
    useState<ExplanationDisplayState>(new Map());

  useEffect(() => {
    if (!expState) return;
    const { lineIndex, tokenIndex } = expState;
    const tokenData = tokenLines.at(lineIndex)?.at(tokenIndex);

    let expDisplayMember: ExplanationDisplayStateMember | undefined;
    if (tokenData) {
      const expContent = allTokenExplanations.get(
        codePointToString(lineIndex, tokenIndex)
      );
      if (expContent) {
        expDisplayMember = {
          id: shortid(),
          tokenIndex,
          content: expContent,
          entering: true
        };
      }
    }

    setExpDisplayState((s) => {
      if (!expDisplayMember) return s;
      const newState = new Map(
        [...s.entries()].map(
          ([key, line]: [number, ExplanationDisplayStateLine]) => [
            key,
            {
              ...line,
              explanations: line.explanations.map(
                (exp: ExplanationDisplayStateMember) => ({ ...exp })
              )
            }
          ]
        )
      );
      if (!newState.has(lineIndex)) {
        newState.set(lineIndex, {
          explanations: [],
          entering: true
        });
      }
      const line = newState.get(lineIndex);
      if (line) {
        line.explanations.push(expDisplayMember);
        line.exiting = undefined;
      }
      return newState;
    });

    let enterTimeout: ReturnType<typeof setTimeout> | null = null;

    const onEnter = () => {
      setExpDisplayState((s) => {
        if (!expDisplayMember) return s;
        const newState = new Map(
          [...s.entries()].map(
            ([key, line]: [number, ExplanationDisplayStateLine]) => [
              key,
              {
                ...line,
                explanations: line.explanations.map(
                  (exp: ExplanationDisplayStateMember) => ({ ...exp })
                )
              }
            ]
          )
        );
        const line = newState.get(lineIndex);
        if (line) {
          line.entering = false;
          const exp = line.explanations.find(
            (exp) => exp.id === expDisplayMember.id
          );
          if (exp) exp.entering = false;
        }
        return newState;
      });
    };
    const onExitCleanup = () => {
      setExpDisplayState((s) => {
        if (!expDisplayMember) return s;
        const newState = new Map(
          [...s.entries()].map(
            ([key, line]: [number, ExplanationDisplayStateLine]) => [
              key,
              {
                ...line,
                explanations: line.explanations.map(
                  (exp: ExplanationDisplayStateMember) => ({ ...exp })
                )
              }
            ]
          )
        );
        const line = newState.get(lineIndex);
        if (line) {
          if (line.exiting) {
            newState.delete(lineIndex);
          } else {
            line.explanations = line.explanations.filter((exp) => !exp.exiting);
          }
        }
        return newState;
      });
    };
    const onExit = () => {
      setExpDisplayState((s) => {
        if (!expDisplayMember) return s;
        const newState = new Map(
          [...s.entries()].map(
            ([key, line]: [number, ExplanationDisplayStateLine]) => [
              key,
              {
                ...line,
                explanations: line.explanations.map(
                  (exp: ExplanationDisplayStateMember) => ({ ...exp })
                )
              }
            ]
          )
        );
        const line = newState.get(lineIndex);
        const exp = newState
          .get(lineIndex)
          ?.explanations.find((exp) => exp.id === expDisplayMember.id);
        if (exp) exp.exiting = true;
        if (line?.explanations.every((exp) => exp.exiting)) line.exiting = true;
        return newState;
      });
      setTimeout(onExitCleanup, 500);
    };

    enterTimeout = setTimeout(onEnter, 500);
    return () => {
      if (enterTimeout !== null) clearTimeout(enterTimeout);
      onExit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    expState?.lineIndex,
    expState?.tokenIndex,
    tokenLines,
    allTokenExplanations,
    codeExplainerContextValue
  ]);

  useEffect(() => {
    const onClick = (e: CodePointEventData) => {
      setExpState((s) =>
        !s || s.lineIndex !== e.lineIndex || s.tokenIndex !== e.tokenIndex
          ? {
              lineIndex: e.lineIndex,
              tokenIndex: e.tokenIndex
            }
          : null
      );
    };
    codeExplainerContextValue.events.on("click", onClick);
    return () => {
      codeExplainerContextValue.events.off("click", onClick);
    };
  }, [codeExplainerContextValue, tokenLines, allTokenExplanations]);

  const rootRef = useRef<HTMLDivElement>(null);
  const [arrow, setArrow] = useState<ReactNode>(null);
  useEffect(() => {
    if (expDisplayState.size !== 1) return;
    const lineIndex = expDisplayState.keys().next().value;
    if (lineIndex === undefined) return;
    const lineState = expDisplayState.get(lineIndex);
    if (lineState === undefined) return;
    const explanations = lineState.explanations;
    if (explanations.length !== 1) return;
    const explanation = explanations.at(0);
    if (
      explanation === undefined ||
      explanation.entering ||
      explanation.exiting
    )
      return;

    const tokenIndex = explanation.tokenIndex;

    const rootEl = rootRef.current;
    if (!rootEl) return;
    const tokenEl = codeExplainerContextValue.codeNodes.get(
      codePointToString(lineIndex, tokenIndex)
    );
    const explanationEl = codeExplainerContextValue.explanationNodes.get(
      codePointToString(lineIndex, tokenIndex)
    );
    if (!tokenEl || !explanationEl) return;

    let lastFrom: Vector2 | null = null;
    let lastTo: Vector2 | null = null;

    let rendering = true;
    const doRender = () => {
      if (!rendering) return;
      requestAnimationFrame(doRender);
      const rootRect = rootEl.getBoundingClientRect();
      const tokenElRect = tokenEl.getBoundingClientRect();
      const expElRect = explanationEl.getBoundingClientRect();
      const nextTo = new Vector2(
        tokenElRect.left + tokenElRect.width * 0.5 - rootRect.left,
        tokenElRect.top - rootRect.top
      );
      const nextFrom = new Vector2(
        expElRect.left + expElRect.width * 0.5 - rootRect.left,
        expElRect.top + expElRect.height - rootRect.top
      );
      if (lastFrom?.equals(nextFrom) && lastTo?.equals(nextTo)) return;
      lastFrom = nextFrom;
      lastTo = nextTo;
      setArrow(
        <Arrow
          backoffDist={2}
          from={nextFrom}
          fromDelta={new Vector2(0, 10)}
          to={nextTo}
          toDelta={new Vector2(0, 10)}
          color="rgba(40, 150, 200, 1)"
          lineWidth="3pt"
          className="code-explainer-arrow"
          lineStyle={{
            strokeDasharray: "8px 2px"
          }}
          fixed={false}
        />
      );
    };
    doRender();

    return () => {
      rendering = false;
      setArrow(null);
    };
  }, [codeExplainerContextValue, expDisplayState]);

  const advanceExplanation = useCallback(() => {
    const currentExpState = expState ?? {
      lineIndex: 0,
      tokenIndex: -1
    };
    let lineIndex: number = currentExpState.lineIndex;
    let tokenIndex: number = currentExpState.tokenIndex;
    let done = false;
    for (let li = lineIndex; li < tokenLines.length; li++) {
      const tokenLine = tokenLines.at(li);
      if (!tokenLine || tokenLine.length === 0) continue;
      for (
        let ti = li === lineIndex ? tokenIndex + 1 : 0;
        ti < tokenLine.length;
        ti++
      ) {
        const token = tokenLine.at(ti);
        if (!token || token.type === "space") continue;
        lineIndex = li;
        tokenIndex = ti;
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) {
      setExpState(null);
    } else {
      setExpState({
        lineIndex,
        tokenIndex
      });
    }
  }, [expState, tokenLines]);

  return (
    <div className="code-explainer" ref={rootRef}>
      {arrow}
      <CodeExplainerContext.Provider value={codeExplainerContextValue}>
        <div className="code-container">
          {tokenLines.map((l, lineIndex) => {
            const lineExp = expDisplayState.get(lineIndex);
            return (
              <div className="code-container-line" key={lineIndex}>
                {lineExp && (
                  <div
                    className={cx("code-container-line-explanations", {
                      entering: lineExp.entering,
                      exiting: lineExp.exiting
                    })}
                  >
                    {lineExp.explanations.map((exp) => (
                      <ExplanationBlock
                        key={exp.id}
                        explanation={exp.content}
                        lineIndex={lineIndex}
                        tokenIndex={exp.tokenIndex}
                        className={cx({
                          entering: exp.entering,
                          exiting: exp.exiting
                        })}
                      />
                    ))}
                  </div>
                )}
                <div className="code-container-line-code">
                  <code>
                    {l.map((t, tokenIndex) =>
                      t.type === "token" ? (
                        <CodePoint
                          key={tokenIndex}
                          code={t}
                          line={lineIndex}
                          index={tokenIndex}
                          className={
                            tokenIndex === expState?.tokenIndex &&
                            lineIndex === expState?.lineIndex
                              ? "selected"
                              : undefined
                          }
                        />
                      ) : (
                        <span
                          key={tokenIndex}
                          className={t.isComment ? "comment" : "whitespace"}
                        >
                          {t.chars}
                        </span>
                      )
                    )}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
        <div className="code-explainer-controls">
          {!expState && (
            <div
              className="code-explainer-control"
              onClick={advanceExplanation}
            >
              Explain Code
            </div>
          )}
          {expState && (
            <div
              className="code-explainer-control"
              onClick={advanceExplanation}
            >
              Explain Next Symbol
            </div>
          )}
        </div>
      </CodeExplainerContext.Provider>
    </div>
  );
}

type CodePointProps = {
  code: TokenData;
  line: number;
  index: number;
  className?: string;
};

export function CodePoint(props: CodePointProps) {
  const { code, line, index, className } = props;
  const ctx = useContext(CodeExplainerContext);
  const elRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!ctx || !el) return;
    const posStr = codePointToString(line, index);
    ctx.codeNodes.set(posStr, el);
    return () => {
      if (ctx.codeNodes.get(posStr) === el) {
        ctx.codeNodes.delete(posStr);
      }
    };
  }, [ctx, line, index]);

  const onHover = useCallback(() => {
    const el = elRef.current;
    if (!ctx || !el) return;
    ctx.events.emit("hover", {
      el,
      lineIndex: line,
      tokenIndex: index
    });
  }, [ctx, line, index]);

  const onLeave = useCallback(() => {
    const el = elRef.current;
    if (!ctx || !el) return;
    ctx.events.emit("leave", {
      el,
      lineIndex: line,
      tokenIndex: index
    });
  }, [ctx, line, index]);

  const onClick = useCallback(() => {
    const el = elRef.current;
    if (!ctx || !el) return;
    ctx.events.emit("click", {
      el,
      lineIndex: line,
      tokenIndex: index
    });
  }, [ctx, line, index]);

  return (
    <span
      ref={elRef}
      className={cx("token", categorizeToken(code.token), className)}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {code.chars}
    </span>
  );
}

type tokenCatetory = "name" | "operator" | "literal";

function categorizeToken(token: acorn.Token): tokenCatetory {
  switch (token.type.label) {
    case "name":
      return "name";
    case "string":
    case "number":
    case "boolean":
      return "literal";
    default:
      return "operator";
  }
}

export type ExplanationBlockProps = {
  explanation: ReactNode;
  lineIndex: number;
  tokenIndex: number;
  className?: string;
};

export function ExplanationBlock(props: ExplanationBlockProps) {
  const { explanation, lineIndex, tokenIndex, className } = props;
  const ctx = useContext(CodeExplainerContext);
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!ctx || !el) return;
    const posStr = codePointToString(lineIndex, tokenIndex);
    ctx.explanationNodes.set(posStr, el);
    return () => {
      if (ctx.explanationNodes.get(posStr) === el) {
        ctx.explanationNodes.delete(posStr);
      }
    };
  }, [ctx, lineIndex, tokenIndex]);

  return (
    <div ref={elRef} className={cx("explanation-block", className)}>
      {explanation}
    </div>
  );
}
