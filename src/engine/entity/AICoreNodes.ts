import { MathUtils, clamp } from "three/src/math/MathUtils.js";

import {
  AIDirectives,
  AINodeData,
  AINodeInput,
  AINodeOutput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { SoundAPI } from "src/api/sound";

import {
  AICompositeNode,
  AIDecoratorNode,
  AINode,
  AIParallelNode,
  createNode
} from "./AIBehaviorTree";

class AISelectorNode extends AICompositeNode {
  run(data: AINodeData): AIResult {
    for (const child of this.children) {
      const result = child.run(data);

      if (result !== AIResult.Running) child.reset();

      if (result === AIResult.Failed) continue;

      if (this.currentlyRunningChild && this.currentlyRunningChild !== child)
        this.currentlyRunningChild.reset();

      this.currentlyRunningChild = child;

      return result;
    }

    return AIResult.Failed;
  }
}
export const Selector = createNode(AISelectorNode);

class AIMemoSelectorNode extends AICompositeNode {
  run(data: AINodeData): AIResult {
    const indexToResumeChildRunning = this.currentlyRunningChild
      ? this.children.indexOf(this.currentlyRunningChild)
      : 0;

    for (
      let index = indexToResumeChildRunning;
      index < this.children.length;
      index++
    ) {
      const child = this.children[index];
      const result = child.run(data);

      if (result !== AIResult.Running) child.reset();

      if (result === AIResult.Failed) continue;

      this.currentlyRunningChild = child;

      return result;
    }

    return AIResult.Failed;
  }
}
export const MemoSelector = createNode(AIMemoSelectorNode);

class AISequenceNode extends AICompositeNode {
  run(data: AINodeData): AIResult {
    const indexToResumeChildRunning = this.currentlyRunningChild
      ? this.children.indexOf(this.currentlyRunningChild)
      : 0;

    for (
      let index = indexToResumeChildRunning;
      index < this.children.length;
      index++
    ) {
      const child = this.children[index];
      const result = child.run(data);

      if (result !== AIResult.Running) child.reset();

      if (result === AIResult.Failed) return AIResult.Failed;

      if (result === AIResult.Running) {
        this.currentlyRunningChild = child;
        return AIResult.Running;
      }
    }

    return AIResult.Succeeded;
  }
}
export const Sequence = createNode(AISequenceNode);

class AIRandomSequenceNode extends AICompositeNode {
  reset(): void {
    super.reset();

    this._shuffleChildren();
  }

  run(data: AINodeData): AIResult {
    const indexToResumeChildRunning = this.currentlyRunningChild
      ? this.children.indexOf(this.currentlyRunningChild)
      : 0;

    for (
      let index = indexToResumeChildRunning;
      index < this.children.length;
      index++
    ) {
      const child = this.children[index];
      const result = child.run(data);

      if (result !== AIResult.Running) child.reset();

      if (result === AIResult.Failed) return AIResult.Failed;

      if (result === AIResult.Running) {
        this.currentlyRunningChild = child;
        return AIResult.Running;
      }
    }

    return AIResult.Succeeded;
  }

  // Fisher-Yates Shuffle
  private _shuffleChildren(): void {
    for (let i = this.children.length - 1; i > 0; i--) {
      const j = MathUtils.randInt(0, i);
      [this.children[i], this.children[j]] = [
        this.children[j],
        this.children[i]
      ];
    }
  }
}
export const RandomSequence = createNode(AIRandomSequenceNode);

class AIParallelSelectorNode extends AIParallelNode {
  run(data: AINodeData): AIResult {
    for (const child of this.children) {
      if (this.finishedRunningChildren.has(child)) continue;

      const result = child.run(data);

      if (result !== AIResult.Running) {
        child.reset();
        this.finishedRunningChildren.add(child);
      }

      if (result === AIResult.Succeeded) return AIResult.Succeeded;
    }

    if (this.finishedRunningChildren.size < this.children.length)
      return AIResult.Running;

    return AIResult.Failed;
  }
}
export const ParallelSelector = createNode(AIParallelSelectorNode);

class AIParallelSequenceNode extends AIParallelNode {
  run(data: AINodeData): AIResult {
    for (const child of this.children) {
      if (this.finishedRunningChildren.has(child)) continue;

      const result = child.run(data);

      if (result !== AIResult.Running) {
        child.reset();
        this.finishedRunningChildren.add(child);
      }

      if (result === AIResult.Failed) return AIResult.Failed;
    }

    if (this.finishedRunningChildren.size < this.children.length)
      return AIResult.Running;

    return AIResult.Succeeded;
  }
}
export const ParallelSequence = createNode(AIParallelSequenceNode);

class AIForEachNode<T> extends AIDecoratorNode {
  private readonly array: AINodeResolvedInput<T[]>;
  private readonly arrayItem: AINodeOutput<T>;
  private readonly finalResultToHaltOn: AINodeResolvedInput<
    AIResult.Succeeded | AIResult.Failed | undefined
  >;

  private currentIndex = 0;

  constructor(
    inArray: AINodeInput<T[]>,
    outArrayItem: AINodeOutput<T>,
    inFinalResultToHaltOn: AINodeInput<
      AIResult.Succeeded | AIResult.Failed | undefined
    >,
    child: AINode
  ) {
    super(child);

    this.array = AINode.ResolveInput(inArray);
    this.arrayItem = outArrayItem;
    this.finalResultToHaltOn = AINode.ResolveInput(inFinalResultToHaltOn);
  }

  reset(): void {
    super.reset();

    this.currentIndex = 0;
  }

  run(data: AINodeData): AIResult {
    if (this.array.value.length <= 0) return AIResult.Succeeded;

    for (; this.currentIndex < this.array.value.length; this.currentIndex++) {
      const arrayItem = this.array.value.at(this.currentIndex);
      if (!arrayItem) return AIResult.Failed;

      this.arrayItem.value = arrayItem;

      const result = this.child.run(data);

      if (result !== AIResult.Running) this.child.reset();

      if (result === AIResult.Running) return AIResult.Running;

      if (result === this.finalResultToHaltOn.value) return result;
    }

    switch (this.finalResultToHaltOn.value) {
      case undefined:
        return AIResult.Succeeded;
      case AIResult.Succeeded:
        return AIResult.Failed;
      case AIResult.Failed:
        return AIResult.Succeeded;
    }
  }
}
export const ForEach = createNode(AIForEachNode) as <T>(
  ...args: ConstructorParameters<typeof AIForEachNode<T>>
) => AIForEachNode<T>;

class AIInverterNode extends AIDecoratorNode {
  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    switch (result) {
      case AIResult.Succeeded:
        return AIResult.Failed;
      case AIResult.Running:
        return AIResult.Running;
      case AIResult.Failed:
        return AIResult.Succeeded;
    }
  }
}
export const Inverter = createNode(AIInverterNode);

class AISucceederNode extends AIDecoratorNode {
  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Running) return AIResult.Running;

    return AIResult.Succeeded;
  }
}
export const Succeeder = createNode(AISucceederNode);

class AIFailureNode extends AIDecoratorNode {
  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Running) return AIResult.Running;

    return AIResult.Failed;
  }
}
export const Failure = createNode(AIFailureNode);

class AIRepeaterNode extends AIDecoratorNode {
  private readonly numRepeatTimes: AINodeResolvedInput<number>;
  private readonly finalResultToHaltOn: AINodeResolvedInput<
    AIResult.Failed | AIResult.Succeeded | undefined
  >;
  private hasEncounteredASuccess = false;
  private currentNumTimesRepeated = 0;

  constructor(
    inNumRepeatTimes: AINodeInput<number>,
    inFinalResultToHaltOn: AINodeInput<
      AIResult.Failed | AIResult.Succeeded | undefined
    > = undefined,
    child: AINode
  ) {
    super(child);

    this.numRepeatTimes = AINode.ResolveInput(inNumRepeatTimes);
    this.finalResultToHaltOn = AINode.ResolveInput(inFinalResultToHaltOn);
  }

  reset(): void {
    super.reset();

    this.hasEncounteredASuccess = false;
    this.currentNumTimesRepeated = 0;
  }

  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Running) return AIResult.Running;

    if (result === this.finalResultToHaltOn.value) return AIResult.Succeeded;

    if (result === AIResult.Succeeded) this.hasEncounteredASuccess = true;
    this.currentNumTimesRepeated++;

    if (
      this.currentNumTimesRepeated < this.numRepeatTimes.value ||
      this.numRepeatTimes.value === 0
    )
      return AIResult.Running;

    if (!this.hasEncounteredASuccess) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}
export const Repeater = createNode(AIRepeaterNode);

class AITimeoutNode extends AIDecoratorNode {
  private readonly timeoutDurationMs: AINodeResolvedInput<number>;
  private currentTimerMs = 0;

  constructor(inDurationMs: AINodeInput<number>, child: AINode) {
    super(child);

    this.timeoutDurationMs = AINode.ResolveInput(inDurationMs);
  }

  reset(): void {
    super.reset();

    this.currentTimerMs = 0;
  }

  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) {
      this.child.reset();
      return result;
    }

    this.currentTimerMs += data.deltaMs;
    if (this.currentTimerMs >= this.timeoutDurationMs.value) {
      this.child.reset();
      return AIResult.Failed;
    }

    return AIResult.Running;
  }
}
export const Timeout = createNode(AITimeoutNode);

class AIDebounceNode extends AIDecoratorNode {
  private readonly intervalMs: AINodeResolvedInput<number>;
  private timeMsAtLastSuccess = -Infinity;

  constructor(inIntervalMs: AINodeInput<number> = 1000, child: AINode) {
    super(child);

    this.intervalMs = AINode.ResolveInput(inIntervalMs);
  }

  run(data: AINodeData): AIResult {
    const currentTimeMs = data.totalMs;

    if (currentTimeMs - this.timeMsAtLastSuccess < this.intervalMs.value)
      return AIResult.Failed;

    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Running) return AIResult.Running;

    if (result === AIResult.Succeeded) this.timeMsAtLastSuccess = currentTimeMs;

    return result;
  }
}
export const Debounce = createNode(AIDebounceNode);

class AIWaitUntilSuccessNode extends AIDecoratorNode {
  run(data: AINodeData): AIResult {
    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Succeeded) return AIResult.Succeeded;

    return AIResult.Running;
  }
}
export const WaitUntilSuccess = createNode(AIWaitUntilSuccessNode);

class AISetupNode extends AIDecoratorNode {
  private hasRanOnce = false;

  run(data: AINodeData): AIResult {
    if (this.hasRanOnce) return AIResult.Succeeded;

    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    if (result === AIResult.Running) return AIResult.Running;

    this.hasRanOnce = true;
    return AIResult.Succeeded;
  }
}
export const Setup = createNode(AISetupNode);

class AIScopeWithDirectiveNode<
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives,
  TValue extends TDirectives[TKey] = TDirectives[TKey]
> extends AIDecoratorNode {
  private readonly directiveKey: AINodeResolvedInput<TKey>;
  private readonly directiveValue: AINodeOutput<TValue>;

  constructor(
    inDirectiveKey: AINodeInput<TKey>,
    outDirectiveValue: AINodeOutput<TValue>,
    child: AINode
  ) {
    super(child);

    this.directiveKey = AINode.ResolveInput(inDirectiveKey);
    this.directiveValue = outDirectiveValue;
  }

  run(data: AINodeData): AIResult {
    if (!data.directives) return AIResult.Failed;

    const directives = data.directives as {
      [Key in TKey]: TValue;
    };

    this.directiveValue.value = directives[this.directiveKey.value];

    if (this.directiveValue.value === undefined) return AIResult.Failed;

    const result = this.child.run(data);

    if (result !== AIResult.Running) this.child.reset();

    return result;
  }
}
export const ScopeWithDirective = createNode(AIScopeWithDirectiveNode) as <
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives,
  TValue extends TDirectives[TKey] = TDirectives[TKey]
>(
  ...args: ConstructorParameters<
    typeof AIScopeWithDirectiveNode<TDirectives, TKey, TValue>
  >
) => AIScopeWithDirectiveNode<TDirectives, TKey, TValue>;

class AIHasDirectiveNode<
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives
> extends AINode {
  private readonly directiveKey: AINodeResolvedInput<TKey>;

  constructor(inDirectiveKey: AINodeInput<TKey>) {
    super();

    this.directiveKey = AINode.ResolveInput(inDirectiveKey);
  }

  run(data: AINodeData): AIResult {
    if (!data.directives) return AIResult.Failed;

    const directives = data.directives as {
      [Key in TKey]: unknown;
    };

    if (directives[this.directiveKey.value] === undefined)
      return AIResult.Failed;

    return AIResult.Succeeded;
  }
}
export const HasDirective = createNode(AIHasDirectiveNode) as <
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives
>(
  ...args: ConstructorParameters<typeof AIHasDirectiveNode<TDirectives, TKey>>
) => AIHasDirectiveNode<TDirectives, TKey>;

class AIVerifyDirectiveNode<
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives
> extends AINode {
  private readonly directiveKey: AINodeResolvedInput<TKey>;

  constructor(inDirectiveKey: AINodeInput<TKey>) {
    super();

    this.directiveKey = AINode.ResolveInput(inDirectiveKey);
  }

  run(data: AINodeData): AIResult {
    if (!data.directives) return AIResult.Failed;

    const directives = data.directives as {
      [Key in TKey]: unknown;
    };

    if (!directives[this.directiveKey.value]) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}
export const VerifyDirective = createNode(AIVerifyDirectiveNode) as <
  TDirectives extends AIDirectives,
  TKey extends keyof TDirectives = keyof TDirectives
>(
  ...args: ConstructorParameters<
    typeof AIVerifyDirectiveNode<TDirectives, TKey>
  >
) => AIVerifyDirectiveNode<TDirectives, TKey>;

class AIWaitNode extends AINode {
  private readonly waitDurationMs: AINodeResolvedInput<number>;
  private currentTimerMs = 0;

  constructor(inWaitDurationMs: AINodeInput<number>) {
    super();

    this.waitDurationMs = AINode.ResolveInput(inWaitDurationMs);
  }

  reset(): void {
    super.reset();

    this.currentTimerMs = 0;
  }

  run(data: AINodeData): AIResult {
    this.currentTimerMs += data.deltaMs;

    if (this.currentTimerMs >= this.waitDurationMs.value)
      return AIResult.Succeeded;

    return AIResult.Running;
  }
}
export const Wait = createNode(AIWaitNode);

class AIPlaySoundNode extends AINode {
  private readonly sound: AINodeResolvedInput<SoundAPI>;

  constructor(inSound: AINodeInput<SoundAPI>) {
    super();

    this.sound = AINode.ResolveInput(inSound);
  }

  run(_data: AINodeData): AIResult {
    this.sound.value.play();
    return AIResult.Succeeded;
  }
}
export const PlaySound = createNode(AIPlaySoundNode);

class AILogNode extends AINode {
  private readonly logData: AINodeResolvedInput<any>[];

  constructor(...inLogData: AINodeInput<any>[]) {
    super();

    this.logData = inLogData.map((arg) => AINode.ResolveInput(arg));
  }

  run(_data: AINodeData): AIResult {
    console.log(...this.logData.map((data) => data.value));
    return AIResult.Succeeded;
  }
}
export const Log = createNode(AILogNode);

class AIRandomNode extends AINode {
  private readonly probabilityToSucceed: AINodeResolvedInput<number>;

  constructor(inProbabilityToSucceed: AINodeInput<number>) {
    super();

    this.probabilityToSucceed = AINode.ResolveInput(inProbabilityToSucceed);
  }

  run(_data: AINodeData): AIResult {
    const randomNumber = Math.random();
    const probabilityToSucceed = clamp(this.probabilityToSucceed.value, 0, 1);

    if (randomNumber < probabilityToSucceed) return AIResult.Succeeded;

    return AIResult.Failed;
  }
}
export const Random = createNode(AIRandomNode);

class AIDoNode extends AINode {
  private readonly actionFn: (data: AINodeData) => void;

  constructor(actionFn: (data: AINodeData) => void) {
    super();

    this.actionFn = actionFn;
  }

  run(data: AINodeData): AIResult {
    this.actionFn(data);
    return AIResult.Succeeded;
  }
}
export const Do = createNode(AIDoNode);

class AIExecuteNode extends AINode {
  private readonly actionFn: (data: AINodeData) => AIResult;
  private readonly resetFn: (() => void) | undefined;

  constructor(
    actionFn: (data: AINodeData) => AIResult,
    resetFn: (() => void) | undefined = undefined
  ) {
    super();

    this.actionFn = actionFn;
    this.resetFn = resetFn;
  }

  run(data: AINodeData): AIResult {
    const result = this.actionFn(data);
    return result;
  }

  reset(): void {
    super.reset();
    this.resetFn?.();
  }
}
export const Execute = createNode(AIExecuteNode);

class AIVerifyNode extends AINode {
  private readonly condition: AINodeResolvedInput<boolean>;

  constructor(condition: AINodeInput<boolean>) {
    super();

    this.condition = AINode.ResolveInput(condition);
  }

  run(_data: AINodeData): AIResult.Succeeded | AIResult.Failed {
    return this.condition.value ? AIResult.Succeeded : AIResult.Failed;
  }
}
export const Verify = createNode(AIVerifyNode);
