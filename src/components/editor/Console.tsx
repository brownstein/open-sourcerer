import cx from "classnames";
import { debounce } from "debounce";
import { t } from "i18next";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ListOnScrollProps, VariableSizeList } from "react-window";

import { SpellCtxConsoleLogLine, SpellCtxEvents } from "src/api/spells";
import { GameControllerContext } from "src/components/context/GameControllerContext";
import { ComponentConfigType } from "src/components/ui/config/types";
import { useMeasureSize } from "src/components/util/useMeasureSize";
import { useAppSelector } from "src/redux/hooks";
import { selectScriptEditor } from "src/redux/scriptEditor/selectors";
import { selectEditorFontSize } from "src/redux/ui/selectors";

import "./Console.css";
import { useSpellContext } from "./codeEditorHooks";

export type ConsoleProps = {
  componentId?: string;
  componentState?: ComponentConfigType<"console">;
};

type RenderedLogLine = {
  line: SpellCtxConsoleLogLine;
  height: number;
  expanded?: Set<string>;
};

// TODO: handle keys in a more stable manner.
export function Console(props: ConsoleProps) {
  const { componentState } = props;
  const controller = useContext(GameControllerContext);
  const editorState = useAppSelector((state) =>
    componentState?.editorId
      ? selectScriptEditor(state, componentState.editorId)
      : null
  );
  const codeEditorFontSize = useAppSelector(selectEditorFontSize);

  const spellContextId = editorState?.runtimeId;
  const spellContext = useSpellContext(spellContextId);

  const [logLines, setLogLines] = useState<RenderedLogLine[]>([]);
  const [logLinesChangedAt, setLogLinesChangedAt] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(true);
  const scrolledToBottomRef = useRef(scrolledToBottom);
  scrolledToBottomRef.current = scrolledToBottom;

  const [running, setRunning] = useState(false);

  const vlRef = useRef<VariableSizeList>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [linesContainerRef, linesContainerRect] =
    useMeasureSize<HTMLDivElement>();

  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;
    containerEl.style.setProperty(
      "--console-font-size",
      `${codeEditorFontSize}px`
    );
  }, [codeEditorFontSize]);

  const setLine = useCallback(
    (
      lineIndex: number,
      transformLine: (line: RenderedLogLine) => RenderedLogLine
    ) => {
      setLogLines((ll) =>
        ll.map((rl, index) => (index === lineIndex ? transformLine(rl) : rl))
      );
      vlRef?.current?.resetAfterIndex(lineIndex);
    },
    []
  );

  useEffect(() => {
    const defaultHeight = codeEditorFontSize * 1.2;
    const onLog = (line: SpellCtxConsoleLogLine) => {
      setLogLines((l) => {
        // React strict mode has a habit of running these things twice.
        // Prevent that from affecting anything.
        if (l.at(-1)?.line === line) return [...l];
        const height = defaultHeight;
        const expanded = new Set<string>();
        if (l.length < 100) return [...l, { line, height, expanded }];
        return [...l.slice(1), { line, height, expanded }];
      });
      setLogLinesChangedAt(Date.now());
      vlRef?.current?.resetAfterIndex(0);
    };
    const onRunStart = () => setRunning(true);
    const onRunTerminate = () => setRunning(false);
    if (spellContext) {
      setLogLines(
        spellContext.consoleOutput.map((line) => ({
          line,
          height: line.objectValue ? defaultHeight * 3 : defaultHeight,
          expanded: new Set<string>()
        }))
      );
      setLogLinesChangedAt(Date.now());
      spellContext.events.on(SpellCtxEvents.consoleLog, onLog);
      spellContext.events.on(SpellCtxEvents.runStarted, onRunStart);
      spellContext.events.on(SpellCtxEvents.runComplete, onRunTerminate);
      setRunning(spellContext.running ?? false);
    }
    return () => {
      setLogLines([]);
      setLogLinesChangedAt(Date.now());
      if (spellContext) {
        spellContext.events.off(SpellCtxEvents.consoleLog, onLog);
        spellContext.events.off(SpellCtxEvents.runStarted, onRunStart);
        spellContext.events.off(SpellCtxEvents.runComplete, onRunTerminate);
      }
    };
  }, [spellContext, codeEditorFontSize]);

  // Track scroll behavior.
  // TODO: fix that.
  const onScroll = useMemo(
    () =>
      debounce(
        (sp: ListOnScrollProps) => {
          if (running) return;
          if (sp.scrollDirection === "backward") {
            const now = Date.now();
            if (now - logLinesChangedAt < 500) return;
            setScrolledToBottom(false);
          } else {
            const totalHeight = logLines.reduce((acc, l) => acc + l.height, 0);
            if (
              sp.scrollOffset >=
              totalHeight - linesContainerRect.height - codeEditorFontSize * 1.5
            ) {
              setScrolledToBottom(true);
            }
          }
        },
        250,
        false
      ),
    [
      linesContainerRect,
      logLines,
      logLinesChangedAt,
      running,
      codeEditorFontSize
    ]
  );

  // Auto-scroll.
  useEffect(() => {
    const doScroll = () => {
      if (!scrolledToBottom || !logLines) return;
      vlRef.current?.scrollToItem(logLines.length - 1, "end");
    };
    const timeout = setTimeout(doScroll, 50);
    return () => clearTimeout(timeout);
  }, [scrolledToBottom, logLines, running]);

  // Handle new code submission command line.
  const [codeToSubmit, setCodeToSubmit] = useState("");
  const submitCodeInputRef = useRef<HTMLInputElement>(null);
  const onSubmitCode = useCallback(
    (e: React.SubmitEvent) => {
      e.preventDefault();
      submitCodeInputRef.current?.blur();
      if (!spellContextId || !codeToSubmit) return;
      const spellRuntime = controller?.spellRuntime;
      const spellCtx = spellRuntime?.getSpellCtx(spellContextId ?? "");
      spellCtx?.appendAndRun(codeToSubmit, true);
      setCodeToSubmit("");
      setScrolledToBottom(true);
    },
    [controller, codeToSubmit, spellContextId]
  );

  const hasInteractiveConsole = !running && spellContextId && spellContext;
  const characterWidth = codeEditorFontSize * 12 / 18; // At a font size of 12, we're seeing 18px wide characters.
  const characterBudget = Math.floor(
    linesContainerRect.width / characterWidth - 8 // Subtract 8 characters to handle padding.
  );

  return (
    <div className="console" ref={containerRef}>
      <div className="console-header">
        (
        {editorState?.savedSpellSnapshot?.name
          ? t("console.spellName", {
              name: editorState.savedSpellSnapshot?.name
            })
          : t("console.spellNameUnknown")}
        )
      </div>
      <div
        className={cx("console-lines", {
          "with-interactive-console": hasInteractiveConsole
        })}
        ref={linesContainerRef}
      >
        <div className="console-lines-content-wrapper">
          <VariableSizeList
            width={linesContainerRect.width}
            height={linesContainerRect.height}
            initialScrollOffset={0}
            itemCount={logLines.length}
            itemSize={(index: number) =>
              logLines.at(index)?.height ?? codeEditorFontSize * 1.2
            }
            itemData={logLines}
            onScroll={onScroll}
            ref={vlRef}
          >
            {({ index, style }) => (
              <div style={style} className="console-line-wrapper">
                <LogLine
                  lineIndex={index}
                  line={logLines[index]}
                  setLine={setLine}
                  characterBudget={characterBudget}
                />
              </div>
            )}
          </VariableSizeList>
        </div>
      </div>
      {hasInteractiveConsole && (
        <form className="console-form" onSubmit={onSubmitCode}>
          <input
            id="console-input"
            className="console-interactive"
            ref={submitCodeInputRef}
            type="text"
            value={codeToSubmit}
            onChange={(e) => setCodeToSubmit(e.target.value)}
          />
        </form>
      )}
    </div>
  );
}

type LogLineProps = {
  lineIndex: number;
  line: RenderedLogLine;
  characterBudget: number;
  setLine: (
    lineIndex: number,
    transformLine: (line: RenderedLogLine) => RenderedLogLine
  ) => void;
};

function LogLine(props: LogLineProps) {
  const { lineIndex, line, characterBudget, setLine } = props;
  const [containerRef, containerRect] = useMeasureSize<HTMLDivElement>();

  const expanded = useMemo(() => line.expanded ?? new Set<string>(), [line]);
  const toggleExpanded = useCallback(
    (path: string) => {
      if (expanded) {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(path)) {
          newExpanded.delete(path);
        } else {
          newExpanded.add(path);
        }
        setLine(lineIndex, (line) => ({ ...line, expanded: newExpanded }));
      } else {
        setLine(lineIndex, (line) => ({ ...line, expanded: new Set([path]) }));
      }
    },
    [lineIndex, line, expanded]
  );

  useLayoutEffect(() => {
    if (containerRect.height && containerRect.height !== line.height) {
      setLine(lineIndex, (line) => ({ ...line, height: containerRect.height }));
    }
  }, [lineIndex, containerRect, line, setLine]);

  let lineClass = "console-line";
  if (line.line.type === "error") {
    lineClass = `${lineClass} console-line-error`;
  }

  return (
    <div className={`${lineClass}`} ref={containerRef}>
      <NestedDisplayLine
        data={line.line.primitiveValue ?? line.line.objectValue}
        lengthBudget={characterBudget}
        expanded={expanded}
        toggleExpanded={toggleExpanded}
      />
    </div>
  );
}

type NestedDisplayLineProps = {
  data: unknown;
  className?: string;
  lengthBudget: number;
  expanded: Set<string>;
  toggleExpanded: (togglePath: string) => void;
};

function NestedDisplayLine(props: NestedDisplayLineProps) {
  const { data, className, lengthBudget, expanded, toggleExpanded } = props;

  const nestingResult = useMemo(
    () => {
      return computeNesting({ expanded }, data, "", lengthBudget)
    },
    [expanded, data, lengthBudget]
  );

  return (
    <div className={cx("nested-display-line", className)}>
      <NestedDisplayLineNested
        nest={nestingResult}
        path=""
        indent={0}
        expanded={expanded}
        toggleExpanded={toggleExpanded}
      />
    </div>
  );
}

type NestedDisplayLineNestedProps = {
  nest: NestingResult;
  path: string;
  indent: number;
  parentInline?: boolean;
  parentPostfix?: string;
  expanded: Set<string>;
  toggleExpanded: (togglePath: string) => void;
};

function NestedDisplayLineNested(props: NestedDisplayLineNestedProps) {
  const {
    nest,
    path,
    indent,
    parentInline,
    parentPostfix,
    expanded,
    toggleExpanded
  } = props;

  const inline = nest.canInline;

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleExpanded(path);
    },
    [path, toggleExpanded]
  );

  if (nest.primitiveValue) {
    let primitiveValue = nest.primitiveValue;
    if (nest.key !== undefined)
      primitiveValue = `${nest.key}: ${primitiveValue}`;
    if (indent > 0 && !parentInline)
      primitiveValue = leftPad(primitiveValue, indent);
    return (
      <div className={cx("primitive", { inline })}>
        {primitiveValue}
        {parentPostfix ? (
          <div className="nested-separator">{parentPostfix}</div>
        ) : null}
      </div>
    );
  }

  let content: React.ReactNode[] = [];
  let keyDisplay = null;
  let wrapperPrefix = "{";
  let wrapperPostfix = "}";
  if (nest.isArray) {
    wrapperPrefix = "[";
    wrapperPostfix = "]";
  }
  if (nest.key) keyDisplay = `${nest.key}: `;
  if (!parentInline) {
    if (keyDisplay) {
      keyDisplay = leftPad(keyDisplay, indent);
    } else {
      wrapperPrefix = leftPad(wrapperPrefix, indent);
    }
  }
  if (!inline) wrapperPostfix = leftPad(wrapperPostfix, indent);
  const inlineClassName = inline ? "inline" : null;
  content.push(
    <div key="_LC" className={cx("nested-container", inlineClassName)}>
      {keyDisplay && (
        <div className={cx("nested-key", inlineClassName)}>{keyDisplay}</div>
      )}
      <div className="wrapper-character" onClick={onClick}>
        {wrapperPrefix}
      </div>
    </div>
  );
  if (nest.isArray || nest.isObject) {
    let i = 0;
    for (const value of nest.nestedValues ?? []) {
      if (value.isTruncation) {
        content.push(
          <div key="_T" className="nested-truncation" onClick={onClick}>
            {leftPad("…", inline ? 0 : indent + 2)}
          </div>
        );
        continue;
      }
      content.push(
        <NestedDisplayLineNested
          key={i}
          nest={value}
          path={nest.isArray ? `${path}[${i}]` : `${path}.${value.key ?? i}`}
          indent={indent + 2}
          parentInline={inline}
          parentPostfix={
            i++ < (nest.nestedValues?.length ?? 0) - 1
              ? `,${inline ? " " : "\n"}`
              : undefined
          }
          expanded={expanded}
          toggleExpanded={toggleExpanded}
        />
      );
    }
  }
  content.push(
    <div key="_RC" className={cx("nested-container", inlineClassName)}>
      <div className="wrapper-character" onClick={onClick}>
        {wrapperPostfix}
      </div>
      {parentPostfix && <div className="nested-separator">{parentPostfix}</div>}
    </div>
  );
  return (
    <div
      className={cx(
        nest.isArray ? "nested-array" : "nested-object",
        inlineClassName
      )}
    >
      {content}
    </div>
  );
}

function leftPad(str: string, indent: number) {
  if (indent === 0) return str;
  let indentation = "";
  for (let i = 0; i < indent; i++) {
    indentation += " ";
  }
  return `${indentation}${str}`;
}

type NestingContext = {
  expanded: Set<string>;
};

type NestingResult = {
  key?: string;
  primitiveValue?: string;
  isArray?: boolean;
  isObject?: boolean;
  nestedValues?: NestingResult[];
  hasExpansion?: boolean;
  canInline?: boolean;
  inlineChars?: number;
  isTruncation?: boolean;
};

function computeNesting(
  ctx: NestingContext,
  data: unknown,
  path: string,
  lengthBudget: number
): NestingResult {
  switch (typeof data) {
    case "boolean":
    case "number": {
      const asString = String(data);
      return {
        canInline: true,
        inlineChars: asString.length,
        primitiveValue: asString
      };
    }
    case "string": {
      const asString = `"${data}"`;
      return {
        canInline: true,
        inlineChars: asString.length,
        primitiveValue: asString
      };
    }
    case "function": {
      const asString = data.name.length
        ? `Function ${data.name}()`
        : "Function()";
      return {
        canInline: true,
        inlineChars: asString.length,
        primitiveValue: asString
      };
    }
    case "undefined": {
      const asString = "undefined";
      return {
        canInline: true,
        inlineChars: asString.length,
        primitiveValue: asString
      };
    }
    case "object": {
      if (data === null) {
        const asString = "null";
        return {
          canInline: true,
          inlineChars: asString.length,
          primitiveValue: asString
        };
      }
      const isExpanded = ctx.expanded.has(path);
      if (Array.isArray(data)) {
        if (isExpanded) {
          const nestedValues: NestingResult[] = [];
          for (let i = 0; i < data.length; i++) {
            const value = data[i];
            const nestedResult = computeNesting(
              ctx,
              value,
              `${path}[${i}]`,
              lengthBudget - 2
            );
            nestedValues.push(nestedResult);
          }
          return {
            isArray: true,
            hasExpansion: true,
            nestedValues
          };
        }
        let inlineChars = 2;
        let canInline = true;
        let hasExpansion = false;
        let i = 0;
        const nestedValues: NestingResult[] = [];
        for (const value of data) {
          const nestedResult = computeNesting(
            ctx,
            value,
            `${path}[${i}]`,
            lengthBudget - inlineChars
          );
          hasExpansion = hasExpansion || (nestedResult.hasExpansion ?? false);
          canInline = canInline && (nestedResult.canInline ?? false);
          const nextInlineChars =
            inlineChars + (i++ > 0 ? 2 : 0) + (nestedResult.inlineChars ?? 1);
          if ((!hasExpansion && !canInline) || nextInlineChars > lengthBudget) {
            canInline = false;
            inlineChars += 3;
            nestedValues.push({ isTruncation: true });
            break;
          }
          inlineChars = nextInlineChars;
          nestedValues.push(nestedResult);
        }
        return {
          isArray: true,
          nestedValues,
          canInline,
          hasExpansion,
          inlineChars
        };
      } else {
        if (isExpanded) {
          const nestedValues: NestingResult[] = [];
          for (const [key, value] of Object.entries(data)) {
            const nestedResult = computeNesting(
              ctx,
              value,
              `${path}.${key}`,
              lengthBudget - 2
            );
            nestedResult.key = key;
            nestedValues.push(nestedResult);
          }
          return {
            isObject: true,
            hasExpansion: true,
            nestedValues
          };
        }
        let canInline = true;
        let hasExpansion = false;
        let inlineChars = 2;
        let i = 0;
        const nestedValues: NestingResult[] = [];
        for (const [key, value] of Object.entries(data)) {
          const nestedResult = computeNesting(
            ctx,
            value,
            `${path}.${key}`,
            lengthBudget - inlineChars
          );
          nestedResult.key = key;
          hasExpansion = hasExpansion || (nestedResult.hasExpansion ?? false);
          canInline = canInline && (nestedResult.canInline ?? false);
          const nextInlineChars =
            inlineChars + (i++ > 0 ? 2 : 0) + (nestedResult.inlineChars ?? 1);
          if ((!hasExpansion && !canInline) || nextInlineChars + 3 >= lengthBudget) {
            // canInline = false;
            inlineChars += 3;
            nestedValues.push({ isTruncation: true });
            break;
          }
          inlineChars = nextInlineChars;
          nestedValues.push(nestedResult);
        }
        return {
          isObject: true,
          nestedValues,
          canInline,
          hasExpansion,
          inlineChars
        };
      }
    }
    default:
      return {};
  }
}
