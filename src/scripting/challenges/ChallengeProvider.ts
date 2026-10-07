import { t } from "i18next";

import {
  CodingChallenge,
  CodingChallengeCodeState,
  CodingChallengeProviderAPI,
  CodingChallengeProviderEventTypes,
  CodingChallengeProviderEvents,
  CodingChallengeQuizState,
  CodingChallengeQuizStateAnswer,
  CodingChallengeSegment,
  CodingChallengeSegmentState,
  CodingChallengeState,
} from "src/api/codingChallenge";
import { EntityLevelAPI } from "src/api/entity";
import {
  SpellValidationAnyResult,
  SpellValidatorCtx,
  spellValidationResultIsInProgress,
  spellValidatorResultIsInvalid,
  spellValidatorResultIsValid
} from "src/api/spellValidation";
import {
  SpellCtxEvents,
  SpellsAPI,
  SpellsAPIEventTypes,
  SpellsAPIEvents
} from "src/api/spells";
import { createTypedEventEmitter } from "src/api/util";
import {
  findLayoutTabNodePath,
  mutateLayout
} from "src/engine/util/tabHelpers";
import {
  completeCodingChallenge,
  setCodingChallenge
} from "src/redux/shared/actions";
import { AppStore } from "src/redux/store";
import {
  selectComponentConfigById,
  selectLayoutTabsByComponentName
} from "src/redux/ui/selectors";

import { allCodingChallenges } from "./allChallenges";

export class CodingChallengeProvider implements CodingChallengeProviderAPI {
  public events = createTypedEventEmitter<CodingChallengeProviderEventTypes>();
  private spellsAPI?: SpellsAPI;
  private store?: AppStore;
  private currentChallenge?: CodingChallenge;
  private currentSegmentIndex?: number;
  private currentChallengeState?: CodingChallengeState;
  private getLevel?: () => EntityLevelAPI | null;
  constructor() {
    this._onSpellStarted = this._onSpellStarted.bind(this);
    this._onSpellValidationProgress =
      this._onSpellValidationProgress.bind(this);
  }
  setGetLevel(getLevel: () => EntityLevelAPI | null) {
    this.getLevel = getLevel;
  }
  launch(challengeId: string | null) {
    if (challengeId === null) {
      this.setChallenge(null);
      return;
    }
    const challenge = allCodingChallenges.get(challengeId);
    if (challenge) this.setChallenge(challenge);
  }
  getCurrentChallenge() {
    return this.currentChallenge ?? null;
  }
  getCurrentChallengeState() {
    return this.currentChallengeState ?? null;
  }
  setChallenge(codingChallenge: CodingChallenge | null) {
    if (this.currentChallenge)
      this.events.emit(CodingChallengeProviderEvents.ChallengeAborted);
    this.currentChallenge = codingChallenge ?? undefined;
    this.currentSegmentIndex = 0;
    this.currentChallengeState = undefined;
    if (this.currentChallenge) {
      this.events.emit(
        CodingChallengeProviderEvents.ChallengeStarted,
        this.currentChallenge
      );
    }
    this.store?.dispatch(
      setCodingChallenge({
        codingChallengeId: this.currentChallenge?.id ?? null
      })
    );
    if (codingChallenge === null) {
      this.closeCodeEditor();
      this.closeChallengeTab();
    } else {
      this.openChallengeTab();
      this.goToSegment(0);
    }
  }
  setup(spellsAPI: SpellsAPI, store: AppStore) {
    if (this.spellsAPI || this.store) this.destroy();
    this.spellsAPI = spellsAPI;
    this.spellsAPI.events.on(
      SpellsAPIEvents.runSpellStart,
      this._onSpellStarted
    );
    this.store = store;
  }
  destroy() {
    this.spellsAPI?.events.off(
      SpellsAPIEvents.runSpellStart,
      this._onSpellStarted
    );
    this.spellsAPI = undefined;
    this.store = undefined;
    this.currentChallenge = undefined;
    this.currentChallengeState = undefined;
  }
  private _onSpellStarted(
    ctx: SpellsAPIEventTypes[SpellsAPIEvents.runSpellStart]
  ) {
    const level = this.getLevel?.();
    if (
      this.currentChallenge === undefined ||
      this.currentSegmentIndex === undefined ||
      !level
    )
      return;
    const challengeCurrentSegment = this.currentChallenge.segments.at(
      this.currentSegmentIndex
    );
    if (challengeCurrentSegment?.type !== "coding") return;
    if (
      challengeCurrentSegment.validatesLive &&
      challengeCurrentSegment.validate
    ) {
      const deferredValidationContext: SpellValidatorCtx = {
        t,
        spellCtx: ctx,
        level
      };
      const segmentState: CodingChallengeCodeState = {
        type: "coding",
        running: true,
        finished: false,
        aborted: false,
        validated: false
      };
      this.updateSegmentState(this.currentSegmentIndex, segmentState);
      const deferredValidation = challengeCurrentSegment.validate(
        deferredValidationContext
      );
      deferredValidation.on("progress", this._onSpellValidationProgress);
      deferredValidation.on("done", this._onSpellValidationProgress);
      deferredValidation.on("failed", this._onSpellValidationProgress);
    } else if (challengeCurrentSegment.validate) {
      const deferredValidationContext: SpellValidatorCtx = {
        t,
        spellCtx: ctx,
        level
      };
      let runComplete = false;
      const onSpellComplete = () => {
        if (runComplete) return;
        runComplete = true;
        if (!challengeCurrentSegment.validate) return;
        const deferredValidation = challengeCurrentSegment.validate(
          deferredValidationContext
        );
        deferredValidation.on("progress", this._onSpellValidationProgress);
        deferredValidation.on("done", this._onSpellValidationProgress);
        deferredValidation.on("failed", this._onSpellValidationProgress);
      };
      ctx.events.on(SpellCtxEvents.runComplete, onSpellComplete);
      ctx.events.on(SpellCtxEvents.runTerminated, onSpellComplete);
      if (ctx.runComplete || ctx.error) {
        onSpellComplete();
      } else {
        this._onSpellValidationProgress({
          type: "progress"
        });
      }
    }
  }
  private _onSpellValidationProgress(result: SpellValidationAnyResult) {
    if (
      this.currentChallenge === undefined ||
      this.currentSegmentIndex === undefined
    )
      return;
    const challengeCurrentSegment = this.currentChallenge.segments.at(
      this.currentSegmentIndex
    );
    if (challengeCurrentSegment?.type !== "coding") return;
    const isDone = !spellValidationResultIsInProgress(result);
    const segmentState: CodingChallengeCodeState = {
      type: "coding",
      running: !isDone,
      finished: isDone,
      aborted: spellValidatorResultIsInvalid(result) && !!result.aborted,
      validated: spellValidatorResultIsValid(result),
      result
    };
    this.updateSegmentState(this.currentSegmentIndex, segmentState);
  }
  answerQuizQuestion(
    segmentIndex: number,
    questionIndex: number,
    answerIndex: number
  ) {
    if (this.currentChallenge === undefined) return;
    const challengeSegment = this.currentChallenge.segments.at(segmentIndex);
    if (challengeSegment?.type !== "quiz") return;
    const question = challengeSegment.questions.at(questionIndex);
    if (!question) return;
    const correct = question.correctAnswerIndex === answerIndex;
    const answerState: CodingChallengeQuizStateAnswer = {
      index: answerIndex,
      correct
    };
    const currentSegmentState = this.currentChallengeState?.at(
      segmentIndex
    ) ?? {
      type: "quiz",
      answers: []
    };
    if (currentSegmentState.type !== "quiz") return;
    const segmentState: CodingChallengeQuizState = {
      type: "quiz",
      answers: [
        ...currentSegmentState.answers.slice(0, questionIndex),
        answerState,
        ...currentSegmentState.answers.slice(questionIndex + 1)
      ]
    };
    this.updateSegmentState(segmentIndex, segmentState);
  }
  private checkSegmentComplete(
    segment: CodingChallengeSegment,
    state: CodingChallengeSegmentState
  ) {
    if (state.complete) return;
    if (segment.type === "quiz" && state.type === "quiz") {
      for (let qi = 0; qi < segment.questions.length; qi++) {
        const answer = state.answers.at(qi);
        if (!answer?.correct) {
          return;
        }
      }
      state.complete = true;
    }
    if (segment.type === "text" && state.type === "text") {
      const { initialized, fullyScrolled, quizzes, quizzesComplete } = state;
      state.complete =
        initialized && fullyScrolled && quizzes?.size === quizzesComplete?.size;
    }
    if (segment.type === "coding" && state.type === "coding") {
      state.complete = state.validated;
    }
    return state.complete;
  }
  private updateSegmentState(
    segmentIndex: number,
    segmentState: CodingChallengeSegmentState
  ) {
    if (!this.currentChallenge) return;
    const segment = this.currentChallenge.segments.at(segmentIndex);
    if (!segment || segment.type !== segmentState.type) return;
    if (!this.currentChallengeState) this.currentChallengeState = [];
    this.currentChallengeState = [
      ...this.currentChallengeState.slice(0, segmentIndex),
      segmentState,
      ...this.currentChallengeState.slice(segmentIndex + 1)
    ];

    this.checkSegmentComplete(segment, segmentState);
    const allComplete = this.getCurrentChallengeComplete();

    if (allComplete) {
      this.events.emit(CodingChallengeProviderEvents.ChallengeCompleted, [
        this.currentChallenge,
        this.currentChallengeState
      ]);
      this.store?.dispatch(
        completeCodingChallenge({ codingChallengeId: this.currentChallenge.id })
      );
    } else {
      this.events.emit(CodingChallengeProviderEvents.ChallengeProgress, [
        this.currentChallenge,
        this.currentChallengeState
      ]);
    }
  }
  private checkCodeEditorOpen() {
    if (!this.store) return false;
    const state = this.store.getState();
    const tabsByComponent = selectLayoutTabsByComponentName(state);
    for (const tab of tabsByComponent.get("codeEditor") ?? []) {
      if (!tab.id) continue;
      const componentConfig = selectComponentConfigById(state, tab.id);
      if (!componentConfig) continue;
      if (componentConfig.challengeId === this.currentChallenge?.id) {
        return true;
      }
    }
    return false;
  }
  private openCodeEditor() {
    if (!this.store || this.checkCodeEditorOpen()) return;
    const state = this.store.getState();
    const tabsByComponent = selectLayoutTabsByComponentName(state);
    const codingChallengeTab = tabsByComponent.get("codingChallenge")?.at(0);
    if (!codingChallengeTab?.id) return;
    mutateLayout(this.store, codingChallengeTab.id)
      .openTab({
        componentName: "codeEditor",
        componentConfig: {
          theme: "codingChallenge",
          challengeId: this.currentChallenge?.id
        },
        duration: 2000,
        relativePosition: "bottom",
        relativeWeight: 0.5
      })
      .apply();
  }
  private closeCodeEditor() {
    if (!this.store) return;
    const state = this.store.getState();
    const tabsByComponent = selectLayoutTabsByComponentName(state);
    const closedEditorIds = new Set<string>();
    let mutation = mutateLayout(this.store, "");
    for (const tab of tabsByComponent.get("codeEditor") ?? []) {
      if (!tab.id) continue;
      const componentConfig = selectComponentConfigById<"codeEditor">(state, tab.id);
      if (!componentConfig) continue;
      if (componentConfig.challengeId) {
        mutation = mutation.closeTab(1000, tab.id);
        if (typeof componentConfig.editorId === "string") {
          closedEditorIds.add(componentConfig.editorId);
        }
      }
    }
    for (const tab of tabsByComponent.get("console") ?? []) {
      if (!tab.id) continue;
      const componentConfig = selectComponentConfigById(state, tab.id);
      if (!componentConfig) continue;
      if (
        typeof componentConfig.editorId === "string" &&
        closedEditorIds.has(componentConfig.editorId)
      ) {
        mutation = mutation.closeTab(1000, tab.id);
      }
    }
    mutation.apply();
  }
  private openChallengeTab() {
    if (!this.store) return;
    const codingChallengeNodePathInitial = findLayoutTabNodePath(
      this.store,
      (cn) => cn === "codingChallenge"
    );
    if (!codingChallengeNodePathInitial) {
      mutateLayout(this.store, "viewport")
        .openTab({
          componentName: "codingChallenge",
          relativeWeight: 0.5,
          duration: 3000,
          relativePosition: "left"
        })
        .apply();
    }
  }
  private closeChallengeTab() {
    if (!this.store) return;
    const codingChallengeNodePathInitial = findLayoutTabNodePath(
      this.store,
      (componentName) => componentName === "codingChallenge"
    );
    if (codingChallengeNodePathInitial) {
      mutateLayout(this.store, codingChallengeNodePathInitial.at(-1)?.id ?? "")
        .closeTab(500)
        .apply();
    }
  }
  getCurrentChallengeComplete() {
    if (!this.currentChallenge || !this.currentChallengeState) return false;
    let allComplete = true;
    for (let si = 0; si < this.currentChallenge.segments.length; si++) {
      if (!allComplete) break;
      const iSegment = this.currentChallenge.segments.at(si);
      const iSegmentState = this.currentChallengeState.at(si);
      if (iSegment && iSegmentState)
        this.checkSegmentComplete(iSegment, iSegmentState);
      if (
        !iSegment ||
        !iSegmentState ||
        iSegment.type !== iSegmentState.type ||
        !iSegmentState.complete
      ) {
        allComplete = false;
        break;
      }
    }
    return allComplete;
  }
  getCurrentChallengeSegmentIndex() {
    return this.currentSegmentIndex ?? 0;
  }
  goToSegment(index: number) {
    if (!this.currentChallenge) return;
    const segments = this.currentChallenge.segments;
    const clamped = Math.max(0, Math.min(index, segments.length - 1));
    this.currentSegmentIndex = clamped;
    this.events.emit(CodingChallengeProviderEvents.ChallengeProgress, [
      this.currentChallenge,
      this.currentChallengeState ?? []
    ]);
    const segment = segments.at(this.currentSegmentIndex);
    if (segment?.type === "coding") this.openCodeEditor();
  }
  advanceToNextSegment() {
    this.goToSegment((this.currentSegmentIndex ?? 0) + 1);
  }
  markStateInitialized(segmentIndex: number) {
    if (!this.currentChallenge) return;
    const currentSegmentState = this.currentChallengeState?.at(segmentIndex);
    this.updateSegmentState(segmentIndex, {
      ...currentSegmentState,
      type: "text",
      initialized: true
    });
  }
  defineQuizQuestions(segmentIndex: number, quizQuestionIds: string[]) {
    if (!this.currentChallenge) return;
    const currentSegmentState = this.currentChallengeState?.at(segmentIndex);
    this.updateSegmentState(segmentIndex, {
      ...currentSegmentState,
      type: "text",
      quizzes: new Set(quizQuestionIds)
    });
  }
  markQuizQuestionAnswered(segmentIndex: number, quizQuestionId: string) {
    if (!this.currentChallenge) return;
    const currentSegmentState = this.currentChallengeState?.at(segmentIndex);
    if (currentSegmentState && currentSegmentState.type !== "text") return;
    this.updateSegmentState(segmentIndex, {
      ...currentSegmentState,
      type: "text",
      quizzesComplete: new Set([
        ...(currentSegmentState?.quizzesComplete ?? []),
        quizQuestionId
      ])
    });
  }
  markScrollComplete(segmentIndex: number) {
    if (!this.currentChallenge) return;
    const currentSegmentState = this.currentChallengeState?.at(segmentIndex);
    if (currentSegmentState && currentSegmentState.type !== "text") return;
    this.updateSegmentState(segmentIndex, {
      ...currentSegmentState,
      type: "text",
      fullyScrolled: true
    });
  }
}

export const codingChallengeProviderSingleton = new CodingChallengeProvider();
