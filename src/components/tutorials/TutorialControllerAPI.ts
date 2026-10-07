import {
  TutorialStep,
  Tutorial
} from "src/api/tutorials";
import { TypedEventEmitter } from "src/api/util";

export type TutorialControllerStepData = {
  step: TutorialStep;
  stepIndex: number;
  stepProgressFraction?: number;
};

export type TutorialControllerEventTypes = {
  tutorialStarted: Tutorial;
  tutorialCompleted: Tutorial;
  tutorialExited: Tutorial;
  tutorialStepStarted: Readonly<TutorialControllerStepData>;
  tutorialStepProgress: Readonly<TutorialControllerStepData>;
  tutorialStepCompleted: Readonly<TutorialControllerStepData>;
  tutorialStepExited: Readonly<TutorialControllerStepData>;
};

export type TutorialControllerAPI = {
  events: TypedEventEmitter<TutorialControllerEventTypes>;
  startTutorial: (tutorialId: string) => void;
  endTutorial: () => void;
  getTutorial: () => Readonly<Tutorial> | null;
  getStepData: () => Readonly<TutorialControllerStepData> | null;
  advanceForward: () => void;
  advanceBackward: () => void;
};