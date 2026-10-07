import { ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { TypedEventEmitter, createTypedEventEmitter } from "src/api/util";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import "./useTypingText.less";

export type UseTypingTextProps = {
  started?: boolean;
  startTypingDeferred?: DeferredEmitter;
  text: string;
  msPerChar?: number;
  onDone?: () => void;
};

export enum UseTypingEvents {
  WordStarted = "WordStarted"
}

export type UseTypingEventTypes = {
  [UseTypingEvents.WordStarted]: void;
};

// TODO: make this support hybrid components.
export function useTypingText(
  props: UseTypingTextProps
): [ReactNode, boolean, TypedEventEmitter<UseTypingEventTypes>] {
  const { text, msPerChar = 30, started, startTypingDeferred, onDone } = props;

  // Parse text for Markdown links: [label](href), supporting glossary:term
  const parseTextWithLinks = useCallback((inputText: string) => {
    const mdLink = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: Array<
      | { type: "text"; content: string; start: number; end: number }
      | {
          type: "link";
          label: string;
          href: string;
          scheme: "glossary" | "http" | "internal";
          term?: string;
          token: string;
          tokenStart: number;
          tokenEnd: number;
          tokenLen: number;
          labelLen: number;
        }
    > = [];

    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = mdLink.exec(inputText))) {
      const [full, label, href] = m;
      if (m.index > last) {
        parts.push({
          type: "text",
          content: inputText.slice(last, m.index),
          start: last,
          end: m.index
        });
      }
      let scheme: "glossary" | "http" | "internal" = "internal";
      let term: string | undefined;
      if (href.startsWith("glossary:")) {
        scheme = "glossary";
        term = href.slice("glossary:".length);
      } else if (/^https?:\/\//i.test(href)) {
        scheme = "http";
      }
      const tokenStart = m.index;
      const tokenEnd = m.index + full.length;
      parts.push({
        type: "link",
        label,
        href,
        scheme,
        term,
        token: `[${label}](${href})`,
        tokenStart,
        tokenEnd,
        tokenLen: tokenEnd - tokenStart,
        labelLen: label.length
      });
      last = tokenEnd;
    }
    if (last < inputText.length)
      parts.push({
        type: "text",
        content: inputText.slice(last),
        start: last,
        end: inputText.length
      });
    return parts;
  }, []);

  type VisiblePart =
    | { type: "text"; text: string; visibleStart: number; visibleLen: number }
    | {
        type: "link";
        text: string; // label
        href: string;
        scheme: "glossary" | "http" | "internal";
        term?: string;
        visibleStart: number;
        visibleLen: number; // equals label length
      };

  const buildVisibleModel = useCallback(
    (
      inputText: string
    ): {
      parts: VisiblePart[];
      totalVisibleLen: number;
      visibleText: string;
    } => {
      const parsed = parseTextWithLinks(inputText);
      const parts: VisiblePart[] = [];
      let cursor = 0;
      for (const p of parsed) {
        if (p.type === "text") {
          parts.push({
            type: "text",
            text: p.content,
            visibleStart: cursor,
            visibleLen: p.content.length
          });
          cursor += p.content.length;
        } else {
          parts.push({
            type: "link",
            text: p.label,
            href: p.href,
            scheme: p.scheme,
            term: p.term,
            visibleStart: cursor,
            visibleLen: p.label.length
          });
          cursor += p.label.length;
        }
      }
      const visibleText = parts.map((p) => p.text).join("");
      return { parts, totalVisibleLen: cursor, visibleText };
    },
    [parseTextWithLinks]
  );

  const defaultElements = useMemo(() => {
    const { parts } = buildVisibleModel(text);
    const elements: React.ReactElement[] = [];
    let keyIndex = 0;
    for (const part of parts) {
      // eslint-disable-next-line no-loop-func
      part.text.split("").forEach((ch) => {
        elements.push(
          <span key={keyIndex++} className="typing-char untyped">
            {ch}
          </span>
        );
      });
    }
    return elements;
  }, [text, buildVisibleModel]);
  const [displayElements, setDisplayElements] = useState<
    React.ReactElement[] | null
  >(null);
  const emitter = useMemo(
    () => createTypedEventEmitter<UseTypingEventTypes>(),
    []
  );
  const [done, setDone] = useState(false);
  const iState = useRef({
    text,
    currentChar: 0, // counts visible characters
    onDone,
    totalVisibleLen: 0,
    visibleText: "",
    parts: [] as VisiblePart[]
  });
  iState.current.text = text;
  iState.current.onDone = onDone;

  useLayoutEffect(() => {
    const model = buildVisibleModel(text);
    iState.current.currentChar = 0;
    iState.current.totalVisibleLen = model.totalVisibleLen;
    iState.current.visibleText = model.visibleText;
    iState.current.parts = model.parts;
    setDisplayElements([]);
  }, [text, buildVisibleModel]);

  useLayoutEffect(() => {
    const iStateCurrent = iState.current;
    if ((started ?? true) === false) {
      // Render untyped visible model
      const { parts } = buildVisibleModel(text);
      const elements: React.ReactElement[] = [];
      let keyIndex = 0;
      parts.forEach((part) => {
        part.text.split("").forEach((ch) => {
          elements.push(
            <span key={keyIndex++} className="typing-char untyped">
              {ch}
            </span>
          );
        });
      });

      setDisplayElements(elements);
      return;
    }
    let typeOutInterval: ReturnType<typeof setTimeout> | null = null;
    const keepTyping = () => {
      if (startTypingDeferred && !startTypingDeferred.getDone()) return;
      if (iStateCurrent.currentChar >= iStateCurrent.totalVisibleLen) {
        iStateCurrent.onDone?.();
        setDone(true);
        if (typeOutInterval !== null) {
          clearInterval(typeOutInterval);
          typeOutInterval = null;
        }
        return;
      }
      const currentCharAtCurrent = iStateCurrent.visibleText.at(
        iStateCurrent.currentChar
      );
      const wasSpaceOrStart =
        iStateCurrent.currentChar === 0 ||
        currentCharAtCurrent === "\n" ||
        currentCharAtCurrent === " ";
      if (wasSpaceOrStart) emitter.emit(UseTypingEvents.WordStarted);
      iStateCurrent.currentChar++;

      // Create elements based on visible model
      const { parts } = iStateCurrent;
      const elements: React.ReactElement[] = [];
      let partKey = 0;
      parts.forEach((part, partIndex) => {
        const typedInPart = Math.max(
          0,
          Math.min(
            iStateCurrent.currentChar - part.visibleStart,
            part.visibleLen
          )
        );
        if (part.type === "text") {
          part.text.split("").forEach((ch, idx) => {
            const isTyped = idx < typedInPart;
            elements.push(
              <span
                key={partKey++}
                className={`typing-char ${isTyped ? "typed" : "untyped"}`}
              >
                {ch}
              </span>
            );
          });
        } else {
          const linkFullyTyped = typedInPart >= part.visibleLen;
          const charSpans = part.text.split("").map((ch, idx) => (
            <span
              key={partKey++}
              className={`typing-char ${idx < typedInPart ? "typed" : "untyped"}`}
            >
              {ch}
            </span>
          ));
          if (linkFullyTyped) {
            if (part.scheme === "glossary" && part.term) {
              const { GlossaryLink } = require("src/ui/docs/GlossaryLink");
              elements.push(
                <GlossaryLink
                  key={`g-${partIndex}`}
                  term={part.term}
                  className="conversation-hyperlink"
                >
                  {charSpans}
                </GlossaryLink>
              );
            } else {
              elements.push(
                <a
                  key={`a-${partIndex}`}
                  href={part.href}
                  target="_blank"
                  rel="noreferrer"
                  className="conversation-hyperlink"
                >
                  {charSpans}
                </a>
              );
            }
          } else {
            elements.push(
              <span key={`ls-${partIndex}`} className="conversation-hyperlink">
                {charSpans}
              </span>
            );
          }
        }
      });

      setDisplayElements(elements);
    };
    typeOutInterval = setInterval(keepTyping, msPerChar);
    return () => {
      if (typeOutInterval !== null) {
        clearInterval(typeOutInterval);
        typeOutInterval = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    text,
    msPerChar,
    emitter,
    started,
    startTypingDeferred,
    parseTextWithLinks
  ]);
  return [displayElements ?? defaultElements, done, emitter];
}
