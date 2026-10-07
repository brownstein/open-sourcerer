import cx from "classnames";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import shortid from "shortid";

import {
  CodingChallengeCodeState,
  CodingChallengeCodingSegment,
  CodingChallengeProviderEvents,
  CodingChallengeQuizSegment,
  CodingChallengeQuizState,
  CodingChallengeState,
  CodingChallengeTextSegment,
  CodingChallengeTextState
} from "src/api/codingChallenge";
import {
  CodingChallengeContentContext,
  CodingChallengeContentContextType
} from "src/challenges/components/context";
import { CodingChallengeContent } from "src/challenges/content/CodingChallengeContent";
import { useAppSelector, useAppStore } from "src/redux/hooks";
import { scriptEditorSelectors } from "src/redux/scriptEditor/selectors";
import { upsertEditor } from "src/redux/scriptEditor/slice";
import { selectCodingChallengeId } from "src/redux/status/selectors";
import { selectComponentConfigsByComponentName } from "src/redux/ui/selectors";
import { allCodingChallenges } from "src/scripting/challenges/allChallenges";

import { GameControllerContext } from "../context/GameControllerContext";
import { ComponentConfigType } from "../ui/config/types";
import { AutoScrollTarget, ScrollCtx } from "../util/useAutoScroll";
import "./CodingChallenge.css";

export type CodeEditorTabProps = {
  tabId: string;
  config?: ComponentConfigType<"codeEditor">;
};

export type RelativePositionString = "left" | "right" | "top" | "bottom";

export function CodingChallengeTab(props: CodeEditorTabProps) {
  const { t } = useTranslation();
  const controller = useContext(GameControllerContext);
  const challenges = controller?.codingChallenges;
  const store = useAppStore();
  const dispatch = useDispatch();
  const [editorMarker] = useState(() => shortid());

  const currentChallengeId = useAppSelector(selectCodingChallengeId);
  const currentChallenge = useMemo(
    () => allCodingChallenges.get(currentChallengeId ?? "") ?? null,
    [currentChallengeId]
  );
  const [completedRecently, setCompletedRecently] = useState(false);
  const [currentChallengeState, setCurrentChallengeState] =
    useState<CodingChallengeState>(null);
  const [currentChallengeSegmentIndex, setCurrentChallengeSegmentIndex] =
    useState(0);
  const prevSegmentIndexRef = useRef(currentChallengeSegmentIndex);

  const componentConfigsByComponentName = useAppSelector(
    selectComponentConfigsByComponentName
  );

  // Maintain state.
  useEffect(() => {
    if (!currentChallengeId || !challenges) return;
    const onStatusUpdate = () => {
      setCurrentChallengeState(challenges.getCurrentChallengeState());
      setCurrentChallengeSegmentIndex(
        challenges.getCurrentChallengeSegmentIndex()
      );
      if (challenges.getCurrentChallengeComplete()) setCompletedRecently(true);
    };
    onStatusUpdate();
    challenges.events.on(
      CodingChallengeProviderEvents.ChallengeStarted,
      onStatusUpdate
    );
    challenges.events.on(
      CodingChallengeProviderEvents.ChallengeAborted,
      onStatusUpdate
    );
    challenges.events.on(
      CodingChallengeProviderEvents.ChallengeCompleted,
      onStatusUpdate
    );
    challenges.events.on(
      CodingChallengeProviderEvents.ChallengeProgress,
      onStatusUpdate
    );
    return () => {
      challenges.events.off(
        CodingChallengeProviderEvents.ChallengeStarted,
        onStatusUpdate
      );
      challenges.events.off(
        CodingChallengeProviderEvents.ChallengeAborted,
        onStatusUpdate
      );
      challenges.events.off(
        CodingChallengeProviderEvents.ChallengeCompleted,
        onStatusUpdate
      );
      challenges.events.off(
        CodingChallengeProviderEvents.ChallengeProgress,
        onStatusUpdate
      );
    };
  }, [challenges, currentChallengeId]);

  // Handle completion highlight behavior.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (completedRecently)
      timeout = setTimeout(() => {
        timeout = undefined;
        setCompletedRecently(false);
      }, 5000);
    return () => {
      if (timeout !== undefined) clearTimeout(timeout);
    };
  }, [completedRecently]);

  const onApplyHint = useCallback(
    (hintScript: string) => {
      const editorConfigs = componentConfigsByComponentName.codeEditor ?? [];
      // TODO (brownstein): clean this up with a better selector.
      const challengeEditorId = (
        editorConfigs.find(
          (config) =>
            typeof (config as ComponentConfigType<"codeEditor">).editorId ===
            "string"
        ) as ComponentConfigType<"codeEditor"> | undefined
      )?.editorId as string | undefined;
      if (!challengeEditorId) return;

      const editor = scriptEditorSelectors.selectById(
        store.getState(),
        challengeEditorId
      );
      if (!editor) return;

      dispatch(upsertEditor({ ...editor, code: hintScript }));
    },
    [componentConfigsByComponentName.codeEditor, dispatch, editorMarker, store]
  );

  const scrollToElement = useCallback((targetEl: HTMLElement) => {
    targetEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);
  const scrollCtxValue = useMemo(
    () => ({
      scrollToElement
    }),
    [scrollToElement]
  );

  const segmentCount = currentChallenge?.segments.length ?? 0;
  const canGoBack = currentChallengeSegmentIndex > 0;
  const canGoNext =
    currentChallengeSegmentIndex < segmentCount - 1 && segmentCount > 1;

  const slideDirection: "from-right" | "from-left" | "none" =
    currentChallengeSegmentIndex > prevSegmentIndexRef.current
      ? "from-right"
      : currentChallengeSegmentIndex < prevSegmentIndexRef.current
        ? "from-left"
        : "none";

  // Update after render so the current render sees the previous value for direction.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    prevSegmentIndexRef.current = currentChallengeSegmentIndex;
  });

  return (
    <div
      className="coding-challenge-tab-container"
      data-testid="coding-challenge-container"
    >
      <h3 className="coding-challenge-header">
        {t("challenges.prefix")}
        {currentChallenge?.challengeName(t) ?? "Not Active"}
      </h3>
      <div className="coding-challenge-segment-viewport">
        <ScrollCtx.Provider value={scrollCtxValue}>
          {currentChallenge?.segments.map((segment, si) => {
            if (si !== currentChallengeSegmentIndex) return null;
            const state = currentChallengeState?.at(si);
            if (
              segment.type === "coding" &&
              (!state || state?.type === "coding")
            ) {
              return (
                <CodingChallengeCodingSegmentRenderer
                  key={si}
                  segment={segment}
                  state={state}
                  active={currentChallengeSegmentIndex === si}
                  complete={state?.complete}
                  onApplyHint={onApplyHint}
                  scrollTo={scrollToElement}
                  slideDirection={slideDirection}
                />
              );
            }
            if (segment.type == "text" && (!state || state?.type === "text")) {
              return (
                <CodingChallengeTextSegmentRenderer
                  key={si}
                  segment={segment}
                  segmentIndex={si}
                  state={state}
                  active={currentChallengeSegmentIndex === si}
                  complete={state?.complete}
                  slideDirection={slideDirection}
                />
              );
            }
            if (segment.type === "quiz" && (!state || state?.type === "quiz")) {
              return (
                <CodingChallengeQuizSegmentRenderer
                  key={si}
                  segment={segment}
                  segmentIndex={si}
                  state={state}
                  active={currentChallengeSegmentIndex === si}
                  complete={state?.complete}
                  scrollTo={scrollToElement}
                  slideDirection={slideDirection}
                />
              );
            }
            return null;
          })}
        </ScrollCtx.Provider>
      </div>
      {segmentCount > 1 && (
        <div className="coding-challenge-footer-nav">
          <button
            type="button"
            className="coding-challenge-nav-button"
            disabled={!canGoBack}
            onClick={() =>
              challenges?.goToSegment(currentChallengeSegmentIndex - 1)
            }
          >
            Back
          </button>
          <div className="coding-challenge-nav-dots">
            {currentChallenge?.segments.map((_, si) => (
              <button
                key={si}
                type="button"
                className={`coding-challenge-nav-dot${si <= currentChallengeSegmentIndex ? " filled" : ""}`}
                onClick={() => challenges?.goToSegment(si)}
                aria-label={`Go to step ${si + 1}`}
              >
                {si <= currentChallengeSegmentIndex ? "●" : "○"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="coding-challenge-nav-button"
            disabled={!canGoNext}
            onClick={() =>
              challenges?.goToSegment(currentChallengeSegmentIndex + 1)
            }
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

type CodingChallengeTextSegmentProps = {
  segment: CodingChallengeTextSegment;
  segmentIndex: number;
  state?: CodingChallengeTextState;
  active?: boolean;
  complete?: boolean;
  slideDirection?: "from-right" | "from-left" | "none";
};

function CodingChallengeTextSegmentRenderer(
  props: CodingChallengeTextSegmentProps
) {
  const codingChallenges = useContext(GameControllerContext)?.codingChallenges;
  const { segment, segmentIndex, state, active, complete, slideDirection } =
    props;
  const { t } = useTranslation();

  // Generate a context value for the coding challenge content to use.
  const ctxValue = useMemo<CodingChallengeContentContextType | null>(
    () =>
      codingChallenges
        ? {
            challengeProvider: codingChallenges,
            segment,
            segmentIndex,
            segmentState: state
          }
        : null,
    [codingChallenges, segment, segmentIndex, state]
  );

  return (
    <div
      className={cx("coding-challenge-segment coding-challenge-text-segment", {
        [`slide-${slideDirection}`]: slideDirection && slideDirection !== "none"
      })}
    >
      <div
        className={cx("coding-challenge-segment-body-container", {
          active,
          complete
        })}
      >
        <div className="coding-challenge-segment-body-inner">
          <div className="coding-challenge-segment-type">
            {t("challenges.segmentType.text")}
          </div>
          <div className="coding-challenge-segment-content">
            <CodingChallengeContentContext.Provider value={ctxValue}>
              <CodingChallengeContent contentName={segment.contentName} />
            </CodingChallengeContentContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

type CodingChallengeQuizSegmentProps = {
  segment: CodingChallengeQuizSegment;
  segmentIndex: number;
  state?: CodingChallengeQuizState;
  active?: boolean;
  complete?: boolean;
  scrollTo?: (el: HTMLElement) => void;
  slideDirection?: "from-right" | "from-left" | "none";
};

function CodingChallengeQuizSegmentRenderer(
  props: CodingChallengeQuizSegmentProps
) {
  const { segment, segmentIndex, state, active, complete, slideDirection } =
    props;
  const { t } = useTranslation();
  const controller = useContext(GameControllerContext);
  const challenges = controller?.codingChallenges;

  // Count consecutive correctly-answered questions from index 0.
  // findIndex would always return the first match (index 0), never advancing past Q2.
  const activeQuestionIndex = active
    ? (() => {
        const answers = state?.answers ?? [];
        const firstNotCorrect = answers.findIndex((q) => !q?.correct);
        return firstNotCorrect === -1 ? answers.length : firstNotCorrect;
      })()
    : -1;

  const [revealedHints, setRevealedHints] = useState<Set<number>>(
    () => new Set()
  );

  const toggleHint = useCallback((qi: number) => {
    setRevealedHints((prev) => {
      const next = new Set(prev);
      if (next.has(qi)) next.delete(qi);
      else next.add(qi);
      return next;
    });
  }, []);

  return (
    <div
      className={cx("coding-challenge-segment coding-challenge-quiz-segment", {
        [`slide-${slideDirection}`]: slideDirection && slideDirection !== "none"
      })}
    >
      <div
        className={cx("coding-challenge-segment-body-container", {
          active,
          complete
        })}
      >
        <div className="coding-challenge-segment-body-inner">
          <div className="coding-challenge-segment-type">
            {t("challenges.segmentType.quiz")}
          </div>
          <div className="coding-challenge-segment-content">
            {segment.content(t)}
          </div>
          <div className="coding-challenge-quiz-questions">
            {segment.questions.map((q, qi) => (
              <div
                key={qi}
                className={cx("coding-challenge-quiz-question", {
                  active: activeQuestionIndex === qi,
                  correct: state?.answers.at(qi)?.correct,
                  incorrect:
                    state?.answers.at(qi) && !state.answers.at(qi)?.correct
                })}
              >
                <div className="coding-challenge-quiz-question-question">
                  {q.question(t)}
                </div>
                {activeQuestionIndex !== qi &&
                  !state?.answers.at(qi)?.correct && (
                    <div className="coding-challenge-quiz-question-locked">
                      <em>(answer above first)</em>
                    </div>
                  )}
                <ol className="coding-challenge-quiz-question-answers">
                  {q.answers(t).map((a, ai) => (
                    <li
                      key={ai}
                      data-testid={`quiz-answer-${ai}`}
                      className={cx("coding-challenge-quiz-question-answer", {
                        active: state?.answers.at(qi)?.index === ai
                      })}
                      onClick={
                        complete
                          ? undefined
                          : () =>
                              challenges?.answerQuizQuestion(
                                segmentIndex,
                                qi,
                                ai
                              )
                      }
                    >
                      {a}
                    </li>
                  ))}
                </ol>
                {q.hint &&
                  activeQuestionIndex === qi &&
                  !state?.answers.at(qi)?.correct && (
                    <div className="cc-quiz-hint-row">
                      <button
                        type="button"
                        className="cc-quiz-hint-button"
                        onClick={() => toggleHint(qi)}
                      >
                        {revealedHints.has(qi) ? "Hide hint" : "💡 Show hint"}
                      </button>
                      {revealedHints.has(qi) && (
                        <div className="cc-quiz-hint-text">{q.hint(t)}</div>
                      )}
                    </div>
                  )}
                {state?.answers.at(qi)?.correct && (
                  <div
                    className="coding-challenge-question-correct"
                    data-testid="question-correct"
                  >
                    Correct!
                  </div>
                )}
                {state?.answers.at(qi)?.correct === false && (
                  <div className="coding-challenge-question-incorrect">
                    Try Again!
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type CodingChallengeCodingSegmentProps = {
  segment: CodingChallengeCodingSegment;
  state?: CodingChallengeCodeState;
  active?: boolean;
  complete?: boolean;
  onApplyHint: (script: string) => void;
  scrollTo?: (el: HTMLElement) => void;
  slideDirection?: "from-right" | "from-left" | "none";
};

function CodingChallengeCodingSegmentRenderer(
  props: CodingChallengeCodingSegmentProps
) {
  const {
    segment,
    state,
    active,
    complete,
    onApplyHint,
    scrollTo,
    slideDirection
  } = props;
  const { t } = useTranslation();
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollToRef = useRef(scrollTo);
  scrollToRef.current = scrollTo;

  const [hintLevel, setHintLevel] = useState(0);
  const maxHintLevels = segment.maxHintLevels ?? 0;
  const hasHints = segment.getHintScript != null;

  const handleHintClick = useCallback(() => {
    if (!segment.getHintScript) return;
    const nextLevel = Math.min(hintLevel + 1, maxHintLevels);
    setHintLevel(nextLevel);
    onApplyHint(segment.getHintScript(nextLevel));
  }, [hintLevel, maxHintLevels, onApplyHint, segment]);

  return (
    <div
      className={cx(
        "coding-challenge-segment coding-challenge-coding-segment",
        {
          [`slide-${slideDirection}`]:
            slideDirection && slideDirection !== "none"
        }
      )}
    >
      <div
        className={cx("coding-challenge-segment-body-container", {
          active,
          complete
        })}
      >
        <div className="coding-challenge-segment-body-inner">
          <div className="coding-challenge-segment-type">
            {t("challenges.segmentType.coding")}
          </div>
          <div className="coding-challenge-segment-content">
            {segment.content?.(t)}
            {segment.contentName && (
              <CodingChallengeContent contentName={segment.contentName} />
            )}
          </div>
          {hasHints && (
            <div className="coding-challenge-path-helper">
              <div className="coding-challenge-path-helper-title">
                Need a hint?
              </div>
              <p>
                {hintLevel === 0
                  ? "Click to reveal hints one at a time. Each click adds more guidance (comments and pseudocode)."
                  : hintLevel < maxHintLevels
                    ? `Hint ${hintLevel} of ${maxHintLevels}. Click again for more.`
                    : "All hints loaded. Use the guidance above to write your solution, then run the script."}
              </p>
              <div className="coding-challenge-path-helper-actions">
                <button
                  type="button"
                  className="coding-challenge-path-helper-button primary"
                  onClick={handleHintClick}
                  disabled={hintLevel >= maxHintLevels}
                >
                  {hintLevel === 0
                    ? "Need a hint?"
                    : hintLevel < maxHintLevels
                      ? `Hint ${hintLevel + 1} of ${maxHintLevels}`
                      : "All hints shown"}
                </button>
              </div>
            </div>
          )}
        </div>
        {state?.result && (
          <div
            className="coding-challenge-segment-body-results"
            ref={resultsRef}
          >
            <h4 className="coding-challenge-test-results-header">
              Test Results
            </h4>
            <div className="coding-challenge-test-results">
              {state.result.tests?.map((test, ti) => (
                <div key={ti} className="coding-challenge-test-result">
                  <div
                    className={cx("coding-challenge-test-status", {
                      success: test.success,
                      "in-progress": test.inProgress,
                      fail: !test.inProgress && !test.success
                    })}
                  />
                  <div className="coding-challenge-test-name-and-status">
                    <div className="coding-challenge-test-name">
                      {test.name}
                    </div>
                    <div className="coding-challenge-test-status-name">
                      {test.success ? "ok" : null}
                      {test.inProgress ? "testing" : null}
                      {!test.inProgress && !test.success ? "failed" : null}
                    </div>
                  </div>
                </div>
              ))}
              {[<AutoScrollTarget key={state.result.tests?.length ?? 0} />]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
