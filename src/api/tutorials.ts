import { TFunction } from "i18next";
import { ComponentType, ReactNode } from "react";
import { PopoverPosition } from "react-tiny-popover";
import { Vector2 } from "three";

import { RootState } from "src/redux/rootState";

import { SpellsAPI } from "./spells";
import { EntityLevelAPI } from "./entity";

export type TutorialEvaluationContext = {
  state: RootState;
  level?: EntityLevelAPI;
  spells?: SpellsAPI;
};

export type TutorialInstructionTarget = {
  // DOM element.
  element?: HTMLElement | null;
  // Multiple candidate DOM elements with priority ordering.
  firstElement?: Iterable<HTMLElement | null>;
  // Multiple candidate DOM elements.
  nearestElement?: Iterable<HTMLElement>;
  // Explicit position on screen.
  position?: Vector2;
  // Entity within current level.
  entityId?: string;
};

export type TutorialStep = {
  // Content to display - THIS IS NOT A REACT COMPONENT, BUT CAN RETURN ONE.
  content: (t: TFunction) => ReactNode;
  // Point to a given element or entity on screen.
  pointTo?: (ctx: TutorialEvaluationContext) => TutorialInstructionTarget | null;
  // Use this to black out the rest of the screen for a given step.
  shadowBox?: boolean;
  // Use this to pad the box.
  highlightPadding?: number;
  // Use this to indicate whether a step is done.
  isDone?: (ctx: TutorialEvaluationContext) => boolean | Promise<boolean>;
  // Use this to indicate a fractional completion percentage of a step.
  isDoneFraction?: (ctx: TutorialEvaluationContext) => number;
  // Use this to invoke behavior when a step finishes.
  onDone?: (ctx: TutorialEvaluationContext) => void | Promise<void>;
  // Use this to automatically go back a step when the user misclicks.
  shouldRegress?: (ctx: TutorialEvaluationContext) => boolean;
  // Enable skip for long tasks.
  enableSkip?: boolean;
};

export type Tutorial = {
  id: string;
  name: (t: TFunction) => string;
  steps: TutorialStep[];
};

export function tutorialStep(step: TutorialStep): TutorialStep {
  return step;
}

export function tutorial(tutorial: Tutorial): Tutorial {
  return tutorial;
}