import { EmitterEventsMap, TypedEventEmitter } from "src/api/util";

type TriggerMode = "edge" | "while" | "event";

interface BaseTriggerOptions {
  readonly mode: TriggerMode;
  readonly trigger: () => boolean;
  readonly onActivation: () => void;
  readonly onDeactivation?: () => void;
}

interface EdgeTriggerOptions extends BaseTriggerOptions {
  readonly mode: "edge";
}

interface WhileTriggerOptions extends BaseTriggerOptions {
  readonly mode: "while";
  readonly activationIntervalMs?: number;
  readonly activationOffsetMs?: number;
  readonly deactivationOffsetMs?: number;
}

interface EventTriggerOptions<
  EventTypes extends EmitterEventsMap,
  EventType extends keyof EventTypes
> extends Omit<
    BaseTriggerOptions,
    "trigger" | "onActivation" | "onDeactivation"
  > {
  readonly mode: "event";
  readonly emitter: TypedEventEmitter<EventTypes>;
  readonly event: EventType;
  readonly trigger?: (arg: EventTypes[EventType]) => boolean;
  readonly onActivation: (arg: EventTypes[EventType]) => void;
}

export type TriggerOptions<
  EventTypes extends EmitterEventsMap = EmitterEventsMap,
  EventType extends keyof EventTypes = keyof EventTypes
> =
  | EdgeTriggerOptions
  | WhileTriggerOptions
  | EventTriggerOptions<EventTypes, EventType>;

interface BaseTrigger {
  tick: (deltaMs: number) => void;
  dispose: () => void;
}

class EdgeTrigger implements BaseTrigger {
  private readonly trigger: () => boolean;
  private readonly onActivation: () => void;
  private readonly onDeactivation?: () => void;

  private currentTriggerValue = false;
  private previousTriggerValue = false;

  constructor(opts: EdgeTriggerOptions) {
    this.trigger = opts.trigger;
    this.onActivation = opts.onActivation;
    this.onDeactivation = opts.onDeactivation;
  }

  tick(): void {
    this.previousTriggerValue = this.currentTriggerValue;
    this.currentTriggerValue = this.trigger();

    if (!this.previousTriggerValue && this.currentTriggerValue) {
      this.onActivation();
      return;
    }

    if (this.previousTriggerValue && !this.currentTriggerValue) {
      this.onDeactivation?.();
      return;
    }
  }

  dispose(): void {}
}

class WhileTrigger implements BaseTrigger {
  private readonly trigger: () => boolean;
  private readonly onActivation: () => void;
  private readonly onDeactivation?: () => void;

  private readonly activationIntervalMs: number;
  private readonly activationOffsetMs: number;
  private readonly deactivationOffsetMs: number;

  private timeMs = 0;
  private timeMsAtInitialActivation = 0;
  private timeMsAtLastActivation = 0;
  private timeMsAtInitialDeactivation = 0;

  // NOTE: keep this true so deactivation callback does not fire frame one
  private hasDeactivationCallbackFired = true;

  private currentTriggerValue = false;
  private previousTriggerValue = false;

  constructor(opts: WhileTriggerOptions) {
    this.trigger = opts.trigger;
    this.onActivation = opts.onActivation;
    this.onDeactivation = opts.onDeactivation;

    this.activationIntervalMs = opts.activationIntervalMs ?? 0;
    this.activationOffsetMs = opts.activationOffsetMs ?? 0;
    this.deactivationOffsetMs = opts.deactivationOffsetMs ?? 0;
  }

  tick(deltaMs: number): void {
    this.timeMs += deltaMs;

    this.previousTriggerValue = this.currentTriggerValue;
    this.currentTriggerValue = this.trigger();

    const isActivated = this.currentTriggerValue;
    const isDeactivated = !this.currentTriggerValue;
    const wasJustActivated =
      !this.previousTriggerValue && this.currentTriggerValue;
    const wasJustDeactivated =
      this.previousTriggerValue && !this.currentTriggerValue;

    if (wasJustActivated) {
      this.timeMsAtInitialActivation = this.timeMs;

      this.timeMsAtLastActivation =
        this.timeMsAtInitialActivation -
        this.activationIntervalMs +
        this.activationOffsetMs;
    }

    if (wasJustDeactivated) {
      this.timeMsAtInitialDeactivation = this.timeMs;
      this.hasDeactivationCallbackFired = false;
    }

    if (isActivated) {
      const timeMsForNextActivation =
        this.timeMsAtLastActivation + this.activationIntervalMs;
      if (this.timeMs < timeMsForNextActivation) return;

      this.onActivation();
      this.timeMsAtLastActivation = this.timeMs;

      return;
    }

    if (isDeactivated) {
      if (this.hasDeactivationCallbackFired) return;

      const timeMsForDeactivationOffset =
        this.timeMsAtInitialDeactivation + this.deactivationOffsetMs;
      if (this.timeMs < timeMsForDeactivationOffset) return;

      this.onDeactivation?.();
      this.hasDeactivationCallbackFired = true;

      return;
    }
  }

  dispose(): void {}
}

class EventTrigger<
  EventTypes extends EmitterEventsMap,
  const EventType extends keyof EventTypes
> implements BaseTrigger
{
  private readonly unsubscribeFn: () => void;

  constructor(opts: EventTriggerOptions<EventTypes, EventType>) {
    const { emitter, event, trigger, onActivation } = opts;

    const subscribedFn = (arg: EventTypes[EventType]) => {
      const shouldActivate = trigger?.(arg) ?? true;
      if (!shouldActivate) return;

      onActivation(arg);
    };

    emitter.on(event, subscribedFn);

    this.unsubscribeFn = () => {
      emitter.off(event, subscribedFn);
    };
  }

  tick(): void {}
  dispose(): void {
    this.unsubscribeFn();
  }
}

export class CallbackTrigger<
  EventTypes extends EmitterEventsMap = EmitterEventsMap,
  const EventType extends keyof EventTypes = keyof EventTypes
> implements BaseTrigger
{
  private readonly trigger: BaseTrigger;

  constructor(opts: TriggerOptions<EventTypes, EventType>) {
    switch (opts.mode) {
      case "edge": {
        this.trigger = new EdgeTrigger(opts);
        break;
      }
      case "while": {
        this.trigger = new WhileTrigger(opts);
        break;
      }
      case "event": {
        this.trigger = new EventTrigger(opts);
        break;
      }
    }
  }

  tick(deltaMs: number): void {
    this.trigger.tick(deltaMs);
  }

  dispose(): void {
    this.trigger.dispose();
  }
}

export class CallbackTriggerManager {
  private readonly callbackTriggers: CallbackTrigger[] = [];

  attachCallbackTrigger<
    EventTypes extends EmitterEventsMap,
    const EventType extends keyof EventTypes
  >(
    callbackTrigger: CallbackTrigger<EventTypes, EventType>
  ): CallbackTriggerManager {
    this.callbackTriggers.push(callbackTrigger);

    return this;
  }

  detachCallbackTrigger(
    callbackTrigger: CallbackTrigger
  ): CallbackTriggerManager {
    const idxToRemove = this.callbackTriggers.indexOf(callbackTrigger);
    if (idxToRemove < 0) return this;

    this.callbackTriggers.splice(idxToRemove, 1);

    return this;
  }

  tick(deltaMs: number) {
    this.callbackTriggers.forEach((callbackTrigger) =>
      callbackTrigger.tick(deltaMs)
    );
  }

  dispose(): void {
    this.callbackTriggers.forEach((callbackTrigger) =>
      callbackTrigger.dispose()
    );

    this.callbackTriggers.length = 0;
  }
}
