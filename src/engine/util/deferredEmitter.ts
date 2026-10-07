import EventEmitter from "events";

import { EmitterEventsMap } from "src/api/util";

export type DeferredEventTypes = {
  done: void;
  cancel: string;
};

type GrabValueSubset<T, KeySet> = {
  [K in keyof T]: K extends KeySet ? T[K] : never;
}[keyof T];

/**
 * Utility for creating EventEmitters which retain a state representing
 * their first emission, and can create Promises to help block on it.
 */
export class DeferredEmitter<
  EventsMap extends EmitterEventsMap = DeferredEventTypes,
  SuccessEvents extends string & keyof EventsMap = "done",
  FailureEvents extends string & keyof EventsMap = "cancel"
> extends EventEmitter {
  public readonly _isDeferredEmitter = true;
  private triggered = false;
  private triggeredByEventName?: string & keyof EventsMap;
  private triggeredWithResult?: EventsMap[keyof EventsMap];
  private successEvents = new Set<string>(["done"]);
  private failureEvents = new Set<string>(["cancel"]);
  constructor(
    successEvents?: SuccessEvents[] | null,
    failureEvents?: FailureEvents[] | null
  ) {
    super();
    if (successEvents) {
      for (const eventName of successEvents) {
        this.successEvents.add(eventName);
      }
    }
    if (failureEvents) {
      for (const eventName of failureEvents) {
        this.failureEvents.add(eventName);
      }
    }
  }
  on<T extends string & keyof EventsMap>(
    eventName: T,
    handler: (arg: EventsMap[T]) => unknown
  ) {
    if (this.triggered) {
      if (this.triggeredByEventName === eventName)
        handler(this.triggeredWithResult as EventsMap[T]);
      return this;
    }
    super.on(eventName, handler);
    return this;
  }
  once<T extends string & keyof EventsMap>(
    eventName: T,
    handler: (arg: EventsMap[T]) => unknown
  ) {
    if (this.triggered) {
      if (this.triggeredByEventName === eventName)
        handler(this.triggeredWithResult as EventsMap[T]);
      return this;
    }
    super.on(eventName, handler);
    return this;
  }
  off<T extends string & keyof EventsMap>(
    eventName: T,
    handler: () => unknown
  ) {
    super.off(eventName, handler);
    return this;
  }
  emit<T extends string & keyof EventsMap>(
    eventName: T,
    result?: EventsMap[T]
  ) {
    if (
      !this.triggered &&
      (this.successEvents.has(eventName) || this.failureEvents.has(eventName))
    ) {
      this.triggered = true;
      this.triggeredByEventName = eventName;
      this.triggeredWithResult = result;
    }
    try {
      return super.emit(eventName, result);
    } catch (err) {
      console.warn("Base EventEmitter failed to emit", err);
      return false;
    }
  }
  getPromise() {
    return new Promise<GrabValueSubset<EventsMap, SuccessEvents>>(
      (resolve, reject) => {
        let resolved = false;
        for (const eventName of this.successEvents) {
          // eslint-disable-next-line no-loop-func
          this.once(eventName as SuccessEvents, () => {
            if (resolved) return;
            resolved = true;
            resolve(
              this.triggeredWithResult as GrabValueSubset<
                EventsMap,
                SuccessEvents
              >
            );
          });
        }
        for (const eventName of this.failureEvents) {
          // eslint-disable-next-line no-loop-func
          this.once(eventName as FailureEvents, () => {
            if (resolved) return;
            resolved = true;
            reject(this.triggeredWithResult);
          });
        }
      }
    );
  }
  clearState() {
    this.triggered = false;
    this.successEvents.clear();
    this.failureEvents.clear();
    this.triggeredByEventName = undefined;
    this.triggeredWithResult = undefined;
  }
  getDone() {
    return this.triggered &&
      this.successEvents.has(this.triggeredByEventName ?? "")
      ? this.triggeredByEventName
      : false;
  }
  getCancelled() {
    return this.triggered &&
      this.failureEvents.has(this.triggeredByEventName ?? "")
      ? this.triggeredByEventName
      : false;
  }
  createProxy<
    OverlayEventsMap extends EmitterEventsMap,
    NewSuccessEvents extends string | never = never,
    NewFailureEvents extends string | never = never
  >(
    newSuccessEvents?: NewSuccessEvents[] | null,
    newFailureEvents?: NewFailureEvents[] | null
  ) {
    const combinedSuccessEvents = [
      ...this.successEvents,
      ...(newSuccessEvents ?? [])
    ] as (SuccessEvents | NewSuccessEvents)[];
    const combinedFailureEvents = [
      ...this.failureEvents,
      ...(newFailureEvents ?? [])
    ] as (FailureEvents | NewFailureEvents)[];
    const newEmitter = new DeferredEmitter<
      EventsMap & OverlayEventsMap,
      SuccessEvents | NewSuccessEvents,
      FailureEvents | NewFailureEvents
    >(combinedSuccessEvents, combinedFailureEvents);
    for (const eventName of new Set([
      ...combinedSuccessEvents,
      ...combinedFailureEvents
    ])) {
      this.on(eventName, (arg) =>
        newEmitter.emit(eventName, arg as Parameters<typeof newEmitter.emit>[1])
      );
    }
    return newEmitter;
  }
}

export function isDeferredEmitter<
  T extends DeferredEmitter
>(arg: T | unknown): arg is T {
  if (!arg) return false;
  return !!(arg as T)._isDeferredEmitter;
}

export type DeferredProxy<
  EmType extends DeferredEmitter,
  OverlayEventsMap extends EmitterEventsMap,
  NewSuccessEvents extends string | never = never,
  NewFailureEvents extends string | never = never
> =
  EmType extends DeferredEmitter<
    infer EventsMap,
    infer SuccessEvents,
    infer FailureEvents
  >
    ? DeferredEmitter<
        EventsMap & OverlayEventsMap,
        SuccessEvents | NewSuccessEvents,
        FailureEvents | NewFailureEvents
      >
    : never;
