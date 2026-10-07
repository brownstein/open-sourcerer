import { TFunction } from "i18next";

import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { TypedEventEmitter } from "./util";
import { SpellValidationAnyResult, SpellValidator } from "./spellValidation";

// Structure of a segment of a coding challenge.
export type CodingChallengeCodingSegment = {
  type: "coding";
  // Deprecated in favor of contentName.
  content?: (t: TFunction) => React.ReactNode;
  contentName?: string;
  prefillEditor?: () => string;
  getHintScript?: (level: number) => string;
  maxHintLevels?: number;
  validate?: SpellValidator;
  validatesLive?: boolean;
};

export type CodingChallengeQuizQuestion = {
  question: (t: TFunction) => React.ReactNode;
  answers: (t: TFunction) => React.ReactNode[];
  correctAnswerIndex: number;
  hint?: (t: TFunction) => React.ReactNode;
};

// Structure of a quiz segment of a coding challenge.
export type CodingChallengeQuizSegment = {
  type: "quiz";
  content: (t: TFunction) => React.ReactNode;
  questions: CodingChallengeQuizQuestion[];
};

// Structure of a text segment of a coding challenge.
export type CodingChallengeTextSegment = {
  type: "text";
  contentName: string;
};

export type CodingChallengeSegment =
  | CodingChallengeCodingSegment
  | CodingChallengeQuizSegment
  | CodingChallengeTextSegment;

// Structure of a coding challenge definition.
export type CodingChallenge = {
  id: string;
  challengeName: (t: TFunction) => React.ReactNode;
  segments: CodingChallengeSegment[];
};

export enum CodingChallengeProviderEvents {
  ChallengeStarted = "ChallengeStarted",
  ChallengeProgress = "ChallengeProgress",
  ChallengeCompleted = "ChallengeCompleted",
  ChallengeAborted = "ChallengeAborted"
}

export type CodingChallengeProviderEventTypes = {
  [CodingChallengeProviderEvents.ChallengeStarted]: CodingChallenge;
  [CodingChallengeProviderEvents.ChallengeProgress]: [
    CodingChallenge,
    CodingChallengeState
  ];
  [CodingChallengeProviderEvents.ChallengeCompleted]: [
    CodingChallenge,
    CodingChallengeState
  ];
  [CodingChallengeProviderEvents.ChallengeAborted]: void;
};

export type CodingChallengeQuizStateAnswer = {
  index: number;
  correct?: boolean;
};

export type CodingChallengeQuizState = {
  type: "quiz";
  answers: CodingChallengeQuizStateAnswer[];
  complete?: boolean;
};

export type CodingChallengeTextState = {
  type: "text";
  initialized?: boolean;
  fullyScrolled?: boolean;
  quizzes?: Set<string>;
  quizzesComplete?: Set<string>;
  complete?: boolean;
}

export type CodingChallengeCodeState = {
  type: "coding";
  running?: boolean;
  finished?: boolean;
  aborted?: boolean;
  validated?: boolean;
  result?: SpellValidationAnyResult;
  complete?: boolean;
};

export type CodingChallengeSegmentState =
  | CodingChallengeQuizState
  | CodingChallengeTextState
  | CodingChallengeCodeState;

export type CodingChallengeState = CodingChallengeSegmentState[] | null;

export type CodingChallengeProviderAPI = {
  events: TypedEventEmitter<CodingChallengeProviderEventTypes>;
  launch: (challengeId: string | null) => void;
  getCurrentChallenge: () => CodingChallenge | null;
  getCurrentChallengeState: () => CodingChallengeState;
  getCurrentChallengeSegmentIndex: () => number;
  getCurrentChallengeComplete: () => boolean;
  answerQuizQuestion: (
    segmentIndex: number,
    questionIndex: number,
    answerIndex: number
  ) => void;
  markStateInitialized: (index: number) => void;
  defineQuizQuestions: (index: number, questionIds: string[]) => void;
  markQuizQuestionAnswered: (index: number, questionId: string) => void;
  markScrollComplete: (index: number) => void;
  goToSegment: (index: number) => void;
};
