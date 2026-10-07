import cx from "classnames";
import shuffle from "fast-shuffle";
import {
  Children,
  Fragment,
  FunctionComponent,
  ReactElement,
  ReactNode,
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { Icon } from "src/components/ui/icons/Icon";

import "./CodingChallengeQuiz.css";
import {
  CodingChallengeContentContext,
  useContentStateForSegment
} from "./context";

export type CodingChallengeQuizContextType = {
  answered?: boolean;
  answerQuestion: (index: number, correct: boolean) => void;
};

export const CodingChallengeQuizQuestionContext =
  createContext<CodingChallengeQuizContextType | null>(null);

export type CodingChallengeQuizQuestionProps = {
  children: ReactNode;
  randomize?: boolean;
  id?: string;
};

export type TabQuestionState = {
  orderSeed: number;
  answeredCorrectly: boolean;
};

function isElementUnsafe<T>(
  node: ReactNode,
  func: FunctionComponent<T>
): node is ReactElement<T> {
  if (
    !node ||
    typeof node !== "object" ||
    Array.isArray(node) ||
    Symbol.iterator in node
  )
    return false;
  return (node as { type?: { name?: string } }).type?.name === func.name;
}

export function CodingChallengeQuizQuestion(
  props: CodingChallengeQuizQuestionProps
) {
  const { children, randomize, id } = props;
  const challengeCtx = useContext(CodingChallengeContentContext);
  const { challengeProvider, segmentIndex, segmentState } = challengeCtx ?? {};

  // This ties into component state for codingChallenge.
  const [qs, setQs] = useContentStateForSegment<TabQuestionState>(id, () => ({
    orderSeed: Math.floor(Math.random() * 0xffffff),
    answeredCorrectly: segmentState?.complete ? true : false
  }));

  const { orderSeed, answeredCorrectly } = qs;

  const [preface, rawAnswers, explanation, correctAnswerIndex] = useMemo<
    [
      ReactNode[],
      ReactElement<CodingChallengeQuizAnswerProps>[],
      ReactNode[],
      number
    ]
  >(() => {
    const childrenArr = Children.toArray(children);
    const preface: ReactNode[] = [];
    let answers: ReactElement<CodingChallengeQuizAnswerProps>[] = [];
    const explanation: ReactNode[] = [];

    for (let i = 0; i < childrenArr.length; i++) {
      const child = childrenArr[i];
      if (isElementUnsafe(child, CodingChallengeQuizAnswer)) {
        answers.push(child);
        continue;
      }
      if (isElementUnsafe(child, CodingChallengeQuizExplanation)) {
        explanation.push(child);
        continue;
      }
      preface.push(child);
    }

    if (randomize) answers = shuffle(orderSeed)(answers);
    const correctIndex = answers.findIndex((answer) => answer.props.correct);

    return [preface, answers, explanation, correctIndex];
  }, [children, randomize, orderSeed]);

  const [correct, setCorrect] = useState(answeredCorrectly);
  const [answeredIndices, setAnsweredIndices] = useState(
    () => new Set<number>(correct ? [correctAnswerIndex] : [])
  );
  const answered = answeredIndices.size > 0;
  const answers = useMemo(
    () =>
      rawAnswers.map((a, i) =>
        cloneElement(a, {
          key: i,
          index: i,
          answered: answeredIndices.has(i),
          questionAnswered: correct
        })
      ),
    [rawAnswers, answeredIndices, correct]
  );

  const answerQuestion = useCallback(
    (index: number, isCorrect: boolean) => {
      setAnsweredIndices(new Set([...answeredIndices, index]));
      if (isCorrect) {
        setCorrect(true);
        setQs((val) => ({
          ...val,
          answeredCorrectly: true
        }));
        if (challengeProvider && segmentIndex !== undefined && id) {
          challengeProvider?.markQuizQuestionAnswered(segmentIndex, id);
        }
      }
    },
    [setQs, challengeProvider, segmentIndex, id, answeredIndices]
  );

  const ctxValue = useMemo(
    () => ({
      answered,
      answerQuestion
    }),
    [answered, answerQuestion]
  );

  const explanationContentOuterRef = useRef<HTMLDivElement>(null);
  const explanationContentInnerRef = useRef<HTMLDivElement>(null);
  const [explanationContentInnerHeight, setExplanactionContentInnerHeight] =
    useState(0);

  useEffect(() => {
    if (!correct) return;
    const explanationContentOuterEl = explanationContentOuterRef.current;
    const explanationContentInnerEl = explanationContentInnerRef.current;
    if (!explanationContentInnerEl || !explanationContentOuterEl) return;
    let lastWidth = 0;
    const observeHeight = () => {
      if (!explanationContentInnerEl || !explanationContentOuterEl) return;
      const outerRect = explanationContentOuterEl.getBoundingClientRect();
      if (outerRect.width === lastWidth) return;
      lastWidth = outerRect?.width;
      const rect = explanationContentInnerEl.getBoundingClientRect();
      setExplanactionContentInnerHeight(rect.height);
    };
    const observer = new ResizeObserver(observeHeight);
    observer.observe(explanationContentOuterEl);
    return () => observer.disconnect();
  }, [correct]);

  return (
    <div
      className={cx("coding-challenge-quiz-question", {
        answered,
        correct
      })}
    >
      {preface.length > 0 && (
        <div className="coding-challenge-quiz-question-preface">
          {preface.map((el, i) => (
            <Fragment key={i}>{el}</Fragment>
          ))}
        </div>
      )}
      <CodingChallengeQuizQuestionContext.Provider value={ctxValue}>
        {answers}
      </CodingChallengeQuizQuestionContext.Provider>
      {explanation.length > 0 && correct && (
        <div
          className="coding-challenge-quiz-question-explanation"
          style={{ height: explanationContentInnerHeight }}
          ref={explanationContentOuterRef}
        >
          <div
            className="coding-challenge-quiz-question-explanation-inner"
            ref={explanationContentInnerRef}
          >
            {explanation.map((el, i) => (
              <Fragment key={i}>{el}</Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type CodingChallengeQuizAnswerProps = {
  children: ReactNode;
  index?: number;
  answered?: boolean;
  questionAnswered?: boolean;
  correct?: boolean;
};

export function CodingChallengeQuizAnswer(
  props: CodingChallengeQuizAnswerProps
) {
  const {
    children,
    index = 0,
    answered = false,
    questionAnswered = false,
    correct = false
  } = props;
  const ctx = useContext(CodingChallengeQuizQuestionContext);
  const { answerQuestion } = ctx ?? {};

  const markAnswer = useCallback(() => {
    if (questionAnswered) return;
    answerQuestion?.(index, correct);
  }, [answerQuestion, questionAnswered, index, correct]);

  return (
    <div
      className={cx("coding-challenge-quiz-answer", {
        answered,
        correct,
        incorrect: answered && !correct
      })}
      onClick={markAnswer}
    >
      <div className="coding-challenge-quiz-answer-box">
        {answered &&
          (correct ? (
            <Icon
              className="coding-challenge-quiz-answer-box-check-icon"
              icon="check"
              size="font"
            />
          ) : (
            <Icon
              className="coding-challenge-quiz-answer-box-x-icon"
              icon="closeFilled"
              size="font"
            />
          ))}
      </div>
      <div className="coding-challenge-quiz-answer-content">{children}</div>
    </div>
  );
}

export type CodingChallengeQuizExplanationProps = {
  children: ReactElement;
};

export function CodingChallengeQuizExplanation(
  props: CodingChallengeQuizExplanationProps
) {
  const { children } = props;
  return children;
}
