import cx from "classnames";
import {
  Fragment,
  ReactNode,
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { useMeasure } from "react-use";
import { Object3D } from "three";

import { Conversation } from "src/api/conversation";
import { TypedEventEmitter } from "src/api/util";
import { Object3DRenderer } from "src/components/ui/item/ItemRenderer";
import { useTypingText } from "src/components/util/useTypingText";

import "./Conversation.css";

export type ConversationOverlayProps = {
  // This lets us inject an entity-loaded sprite for continuation prompting.
  interactionObject3D?: Object3D;
  interactionRefreshEmitter?: TypedEventEmitter<{ render: void }>;
  // The conversation to render.
  conversation: Conversation<string, string>;
  onComplete: (finalStep: string) => void;
};

export function ConversationOverlay(props: ConversationOverlayProps) {
  const {
    interactionObject3D,
    interactionRefreshEmitter,
    conversation,
    onComplete
  } = props;
  const { t } = useTranslation();
  const [internalRef, internalRect] = useMeasure<HTMLDivElement>();

  const [currentStepKey, setCurrentStepKey] = useState(conversation.start);
  const [currentStepDoneTyping, setCurrentStepDoneTyping] = useState(false);

  const currentStep = conversation.steps[currentStepKey];

  useEffect(() => {
    currentStep.onStart?.();
  }, [currentStep]);

  const onAdvance = useCallback(
    (stepKey?: string) => {
      if (!currentStepDoneTyping) {
        setCurrentStepDoneTyping(true);
        return;
      }
      if (stepKey) {
        setCurrentStepKey(stepKey);
        setCurrentStepDoneTyping(false);
        return;
      }
      if (currentStep.next) {
        setCurrentStepKey(currentStep.next);
        setCurrentStepDoneTyping(false);
        return;
      }
      if (currentStep.done) {
        onComplete?.(currentStepKey);
        return;
      }
    },
    [onComplete, currentStepKey, currentStep, currentStepDoneTyping]
  );

  const characterBusts = useMemo<React.ReactNode[]>(() => {
    const result: React.ReactNode[] = [null, null];
    if (
      conversation.speakers === undefined ||
      conversation.speakerImages === undefined
    ) {
      return result;
    }

    for (let i = 0; i < conversation.speakers.length; i++) {
      const speaker: string = conversation.speakers[i];
      const isPlayer = speaker === "Player";
      const slot = isPlayer ? 0 : 1;
      const bustKey = speaker;
      const bustUrl = conversation.speakerImages[bustKey];
      const className = conversation.speakerImageClassNames?.[bustKey];
      if (bustUrl === undefined) continue;
      result[slot] = (
        <div key={slot} className={cx("character-bust", isPlayer ? "player" : "npc", className)}>
          <img src={bustUrl} />
        </div>
      );
    }

    const isPlayer = currentStep.speaker === "Player";
    const slot = isPlayer ? 0 : 1;
    const bustKey = currentStep.speakerImage ?? currentStep.speaker;
    const bustUrl = conversation.speakerImages[bustKey];
    const className = conversation.speakerImageClassNames?.[bustKey];
    if (bustUrl !== undefined) {
      result[slot] = (
        <div
          key={slot}
          className={cx(
            "character-bust",
            isPlayer ? "player" : "npc",
            className
          )}
        >
          <img src={bustUrl} />
        </div>
      );
    }

    return result;
  }, [conversation, currentStep]);

  const currentStepContent = useMemo(
    () => (
      <ConversationLine
        line={
          typeof currentStep.text === "function"
            ? currentStep.text(t)
            : currentStep.text
        }
        alreadyDone={currentStepDoneTyping}
        onTypingComplete={() => setCurrentStepDoneTyping(true)}
      />
    ),
    [t, currentStep, currentStepDoneTyping]
  );
  const currentStepOptions = useMemo(() => {
    if (!currentStepDoneTyping || !currentStep.nextOptions) return null;
    return (
      <ConversationOptions
        options={currentStep.nextOptions}
        onSelectOption={onAdvance}
        interactionObject3D={interactionObject3D}
        interactionRefreshEmitter={interactionRefreshEmitter}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentStep,
    currentStepDoneTyping,
    interactionObject3D,
    interactionRefreshEmitter
  ]);

  const nextStepPrompt = useMemo(() => {
    if (
      !interactionObject3D ||
      (currentStepDoneTyping && !(currentStep.next || currentStep.done))
    )
      return null;
    return (
      <div
        className={cx(
          "conversation-next-step-prompt",
          !currentStep.nextOptions?.length && "clickable"
        )}
        onClick={currentStep?.nextOptions ? undefined : () => onAdvance()}
      >
        <Object3DRenderer
          object3D={interactionObject3D}
          renderEmitter={interactionRefreshEmitter}
        />
      </div>
    );
  }, [
    currentStep,
    currentStepDoneTyping,
    interactionObject3D,
    interactionRefreshEmitter,
    onAdvance
  ]);

  // TODO: standardize this and plug into larger events system.
  useEffect(() => {
    const onKeyPress = (ke: KeyboardEvent) => {
      const key = ke.key;
      switch (key) {
        case "e":
        case "Enter":
          onAdvance();
          break;
        default:
          break;
      }
    };
    document.addEventListener("keyup", onKeyPress);
    return () => {
      document.removeEventListener("keyup", onKeyPress);
    };
  }, [onAdvance]);

  let fontSizeClass = "font-normal";
  if (internalRect.width > 1200) fontSizeClass = "font-large";
  if (internalRect.width < 800) fontSizeClass = "font-small";

  const characterBustsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const characterBustsEl = characterBustsRef.current;
    if (!characterBustsEl) return;
    characterBustsEl.style.setProperty(
      "--conversation-height",
      `${internalRect.height}px`
    );
  }, [internalRect]);

  return (
    <div className="conversation-overlay">
      <div className="conversation-characters" ref={characterBustsRef}>
        {characterBusts}
      </div>
      <div
        className="conversation"
        style={{
          height: internalRect.height
        }}
      >
        <div className="conversation-bg" />
        <div className="conversation-borders">
          <div className="border-ring border-outer" />
          <div className="border-ring border-inner" />
        </div>
        <div className="conversation-internal" ref={internalRef}>
          <div className="conversation-speaker-name">{currentStep.speaker}</div>
          <div
            className={cx("conversation-content", fontSizeClass)}
            onClick={currentStepOptions ? undefined : () => onAdvance()}
          >
            {currentStepContent}
            {currentStepOptions}
          </div>
        </div>
        {nextStepPrompt}
      </div>
    </div>
  );
}

type ConversationOptionsProps = {
  options: Conversation<string, string>["steps"][string]["nextOptions"];
  onSelectOption?: (key: string) => void;
  interactionObject3D?: Object3D;
  interactionRefreshEmitter?: TypedEventEmitter<{ render: void }>;
};

function ConversationOptions(props: ConversationOptionsProps) {
  const {
    options,
    onSelectOption,
    interactionObject3D,
    interactionRefreshEmitter
  } = props;
  const { t } = useTranslation();
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);

  // TODO: standardize this and plug into larger events system.
  useEffect(() => {
    const onKeyPress = (ke: KeyboardEvent) => {
      if (!options) return;
      const key = ke.key;
      switch (key) {
        case "ArrowUp":
        case "w":
          setSelectedOptionIndex(
            (selectedOptionIndex + options.length - 1) % options.length
          );
          break;
        case "ArrowDown":
        case "s":
          setSelectedOptionIndex((selectedOptionIndex + 1) % options.length);
          break;
        case "e":
        case "Enter":
          onSelectOption?.(options[selectedOptionIndex].next);
          break;
        default:
          break;
      }
    };
    document.addEventListener("keyup", onKeyPress);
    return () => {
      document.removeEventListener("keyup", onKeyPress);
    };
  }, [onSelectOption, options, selectedOptionIndex]);

  return (
    <div className="conversation-response-options">
      {options?.map((opt, index) => (
        <div key={index} onClick={() => onSelectOption?.(opt.next)}>
          {index === selectedOptionIndex && (
            <div className="option-select">
              {interactionObject3D && (
                <Object3DRenderer
                  object3D={interactionObject3D}
                  renderEmitter={interactionRefreshEmitter}
                />
              )}
            </div>
          )}
          <div
            className="option-content"
            onMouseOver={() => setSelectedOptionIndex(index)}
          >
            <ConversationLine
              line={typeof opt.text === "function" ? opt.text(t) : opt.text}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type ConversationLineProps = {
  line: React.ReactNode | React.ReactNode[];
  started?: boolean;
  alreadyDone?: boolean;
  onTypingComplete?: () => void;
};

export function ConversationLine(props: ConversationLineProps) {
  const { line, started, alreadyDone, onTypingComplete } = props;
  const [completedLineIndex, setCompletedLineIndex] = useState(-1);

  useLayoutEffect(() => {
    if (!line) return;
    setCompletedLineIndex(-1);
  }, [line]);

  useLayoutEffect(() => {
    if (alreadyDone && Array.isArray(line))
      setCompletedLineIndex(line.length - 1);
  }, [alreadyDone, line]);

  const onLineIndexComplete = useCallback(
    (index: number) => {
      if (!Array.isArray(line)) return;
      setCompletedLineIndex(index);
      const nextIndex = index + 1;
      if (nextIndex === line.length) {
        onTypingComplete?.();
      }
    },
    [line, onTypingComplete]
  );

  const [recursivelyRenderable, content] = useMemo<
    [boolean, JSX.Element]
  >(() => {
    if (Array.isArray(line)) {
      return [
        true,
        <>
          {line.map((subLine, index) => {
            const isElement =
              typeof subLine === "object" &&
              subLine !== null &&
              !Array.isArray(subLine);
            const wrap = (el: ReactNode) =>
              isElement ? (
                <Fragment key={index}>{el}</Fragment>
              ) : (
                <div key={index}>{el}</div>
              );
            if (index === completedLineIndex + 1) {
              return wrap(
                <ConversationLine
                  line={subLine}
                  started={started}
                  onTypingComplete={() => onLineIndexComplete(index)}
                />
              );
            }
            if (index <= completedLineIndex + 1) {
              return wrap(<ConversationLine alreadyDone line={subLine} />);
            }
            return wrap(<ConversationLine started={false} line={subLine} />);
          })}
        </>
      ];
    }
    if (typeof line === "string") {
      return [
        true,
        <TypingConversationStringLine
          line={line}
          started={started}
          alreadyDone={alreadyDone}
          onTypingComplete={onTypingComplete}
        />
      ];
    }
    const isElement =
      typeof line === "object" && line !== null && !Array.isArray(line);

    if (isElement && (line as JSX.Element).type === "div") {
      const asElement = line as JSX.Element;
      return [
        false,
        cloneElement(asElement, {
          className: cx(
            asElement.props.className ?? "",
            "typing-char",
            alreadyDone || started ? "typed" : "untyped"
          )
        })
      ];
    }

    return [
      false,
      <div
        className={cx(
          "typing-char",
          alreadyDone || started ? "typed" : "untyped"
        )}
      >
        {line}
      </div>
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, started, alreadyDone, completedLineIndex, onTypingComplete]);

  useEffect(() => {
    if (recursivelyRenderable || alreadyDone || !started) return;
    const renderTimeoutMs = 1000;
    const renderTimeout = setTimeout(
      () => onTypingComplete?.(),
      renderTimeoutMs
    );
    return () => {
      clearTimeout(renderTimeout);
    };
  }, [recursivelyRenderable, started, alreadyDone, onTypingComplete]);

  return content;
}

type TypingConversationStringLineProps = {
  line: string;
  started?: boolean;
  alreadyDone?: boolean;
  onTypingComplete?: () => void;
};

function TypingConversationStringLine(
  props: TypingConversationStringLineProps
) {
  const { line, started, alreadyDone: _alreadyDone, onTypingComplete } = props;

  const onDone = useCallback(() => {
    onTypingComplete?.();
  }, [onTypingComplete]);

  const [textLine, _typingDone, _typingEmitter] = useTypingText({
    text: line,
    started,
    onDone
  });

  // Always return the parsed text with hyperlinks, even when alreadyDone
  return <>{textLine}</>;
}
