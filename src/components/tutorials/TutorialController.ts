import { t } from "i18next";

import { EntityLevelAPI } from "src/api/entity";
import { SpellsAPI, SpellsAPIEvents } from "src/api/spells";
import { TutorialEvaluationContext, Tutorial } from "src/api/tutorials";
import { createTypedEventEmitter } from "src/api/util";
import { AppStore } from "src/redux/store";
import { selectCurrentTutorialId } from "src/redux/ui/selectors";
import {
  advanceTutorial,
  exitTutorial,
  startTutorial
} from "src/redux/ui/slice";
import { registerSingleton } from "src/singletons/Singletons";
import { isPromise } from "src/util/isPromise";

import { celebrationSingleton } from "../ui/celebration/CelebrationController";
import {
  TutorialControllerAPI,
  TutorialControllerEventTypes,
  TutorialControllerStepData
} from "./TutorialControllerAPI";
import { allTutorials } from "./tutorials/allTutorials";

// I moved tutorial control to a class to avoud component mount / unmount issues with the
// event lifecycle - components shouls be subscribing to the step events to get updates.
class TutorialController implements TutorialControllerAPI {
  public events = createTypedEventEmitter<TutorialControllerEventTypes>();

  private store?: AppStore;
  private unsubscribe?: () => void;
  private level?: EntityLevelAPI;
  private spells?: SpellsAPI;

  private ctx?: TutorialEvaluationContext;

  private currentTutorial?: Tutorial;
  private currentStepData?: TutorialControllerStepData;
  private currentAwaitedPromise?: Promise<boolean>;

  constructor() {
    this._storeUpdate = this._storeUpdate.bind(this);
    this._spellComplete = this._spellComplete.bind(this);
  }

  setupStore(store: AppStore) {
    this.store = store;
    this.ctx = {
      state: this.store.getState(),
      level: this.level,
      spells: this.spells
    };
    this.unsubscribe?.();
    this.unsubscribe = this.store.subscribe(this._storeUpdate);
    return this;
  }

  setupLevel(level: EntityLevelAPI) {
    this.level = level;
    if (this.ctx !== undefined) this.ctx.level = level;
    return this;
  }

  setupSpells(spells: SpellsAPI) {
    if (this.spells)
      this.spells.events.off(SpellsAPIEvents.runSpellEnd, this._spellComplete);
    this.spells = spells;
    if (this.ctx !== undefined) this.ctx.spells = spells;
    this.spells.events.on(SpellsAPIEvents.runSpellEnd, this._spellComplete);
    return this;
  }

  startTutorial(tutorialId: string) {
    const tutorial = allTutorials.get(tutorialId);
    const step = tutorial?.steps.at(0);
    if (tutorial && step && tutorial.id !== this.currentTutorial?.id) {
      this.currentTutorial = tutorial;
      this.currentStepData = {
        step,
        stepIndex: 0
      };
      this.events.emit("tutorialStarted", tutorial);
      this.events.emit("tutorialStepStarted", this.currentStepData);
      this.store?.dispatch(startTutorial(tutorialId));
    }
  }

  endTutorial() {
    const currentTutorialId = this.currentTutorial?.id;
    if (this.currentTutorial) {
      if (this.currentStepData) {
        this.events.emit("tutorialStepExited", this.currentStepData);
      }
      this.events.emit("tutorialExited", this.currentTutorial);
      celebrationSingleton.celebrate({
        type: "tutorial",
        content: this.currentTutorial.name(t)
      });
    }
    if (currentTutorialId && this.currentTutorial?.id === currentTutorialId) {
      this.currentTutorial = undefined;
      this.currentStepData = undefined;
    }
    if (currentTutorialId) {
      this.store?.dispatch(exitTutorial(currentTutorialId));
    }
  }

  getTutorial(): Readonly<Tutorial> | null {
    return this.currentTutorial ?? null;
  }

  getStepData(): Readonly<TutorialControllerStepData> | null {
    return this.currentStepData ?? null;
  }

  advanceForward() {
    if (
      this.ctx === undefined ||
      this.currentTutorial === undefined ||
      this.currentStepData === undefined
    )
      return;
    const nextStepIndex = this.currentStepData.stepIndex + 1;
    const step = this.currentTutorial.steps.at(nextStepIndex);
    if (step) {
      this.currentStepData = {
        step,
        stepIndex: nextStepIndex,
        stepProgressFraction: 0
      };
      this.events.emit("tutorialStepStarted", this.currentStepData);
      this.store?.dispatch(advanceTutorial(nextStepIndex));
    } else {
      this.events.emit("tutorialCompleted", this.currentTutorial);
      this.endTutorial();
    }
    this._runCurrentStepCallbacks();
  }

  advanceBackward() {
    if (
      this.ctx === undefined ||
      this.currentTutorial === undefined ||
      this.currentStepData === undefined
    )
      return;
    this.currentStepData.stepIndex--;
    this.currentStepData.stepIndex = Math.max(
      0,
      this.currentStepData.stepIndex
    );
    this._runCurrentStepCallbacks();
  }

  private _storeUpdate() {
    if (this.store === undefined) return;
    const state = this.store.getState();
    if (selectCurrentTutorialId(state) === undefined) {
      this.currentTutorial = undefined;
      this.currentStepData = undefined;
      return;
    }
    this._runCurrentStepCallbacks();
  }

  private _spellComplete() {
    this._runCurrentStepCallbacks();
  }

  private async _runCurrentStepCallbacks() {
    if (this.ctx === undefined || this.store === undefined) return;
    this.ctx.state = this.store.getState();
    if (
      this.currentTutorial === undefined ||
      this.currentStepData === undefined
    )
      return;

    const tutorial = this.currentTutorial;
    let nextStepIndex = this.currentStepData.stepIndex;
    let nextStepNumericProgress: number | undefined;

    // Cap iteration through step callbacks in case there's a degenerate condition that causes steps to
    // feed into each other.
    for (let i = 0; i < 1000; i++) {
      const currentStep = tutorial.steps.at(nextStepIndex);
      if (currentStep === undefined) break;
      if (currentStep.isDone !== undefined) {
        let isDone = currentStep.isDone(this.ctx);
        if (isPromise(isDone)) {
          // These next three lines guard against unresolved Promise buildup.
          this.currentAwaitedPromise = isDone;
          const promiseResolution = await isDone;
          if (this.currentAwaitedPromise !== isDone) return;
          isDone = promiseResolution;
        }
        if (isDone) {
          nextStepIndex++;
          nextStepNumericProgress = undefined;
          continue;
        }
      }
      if (currentStep.shouldRegress?.(this.ctx)) {
        nextStepIndex--;
        nextStepNumericProgress = undefined;
        continue;
      }
      if (currentStep.isDoneFraction !== undefined) {
        const doneFraction = currentStep.isDoneFraction(this.ctx);
        if (doneFraction >= 1) {
          nextStepIndex++;
          nextStepNumericProgress = undefined;
        } else {
          nextStepNumericProgress = doneFraction;
        }
        continue;
      }
      break;
    }

    if (nextStepIndex !== this.currentStepData.stepIndex) {
      if (nextStepIndex > this.currentStepData.stepIndex) {
        this.events.emit("tutorialStepCompleted", this.currentStepData);
      }
      const step = tutorial.steps.at(nextStepIndex);
      if (step) {
        this.currentStepData = {
          step,
          stepIndex: nextStepIndex,
          stepProgressFraction: nextStepNumericProgress
        };
        this.events.emit("tutorialStepStarted", this.currentStepData);
        this.store.dispatch(advanceTutorial(nextStepIndex));
      } else {
        this.events.emit("tutorialCompleted", tutorial);
        this.endTutorial();
      }
    } else if (
      nextStepNumericProgress !== this.currentStepData.stepProgressFraction
    ) {
      this.currentStepData = {
        ...this.currentStepData,
        stepProgressFraction: nextStepNumericProgress
      };
      this.events.emit("tutorialStepProgress", this.currentStepData);
    }
  }
}

export const tutorialSingleton = new TutorialController();
registerSingleton("tutorials", tutorialSingleton);
