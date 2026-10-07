import EventEmitter from "events";

import { EmitterEventsMap, TypedEventEmitter } from "src/api/util";

type GenericCallback = (...args: unknown[]) => void;

/**
 * Utility to proxy events from one or more EventEmitters.
 * Useful for delegating control between event streams.
 * This is a kludge, but an effective one (hopefully).
 */
export class EventsProxy<
    T extends EmitterEventsMap,
    EmitterType extends TypedEventEmitter<T> = TypedEventEmitter<T>
  >
  extends EventEmitter
  implements TypedEventEmitter<T>
{
  public enabled = true;
  protected emittersEnabled = new WeakSet<EmitterType>();
  protected emitterToSubscriptors = new WeakMap<
    EmitterType,
    Map<string, GenericCallback>
  >();
  subscribe(emitter: EmitterType, events: (keyof T)[]) {
    this.emittersEnabled.add(emitter);
    let subscriptors = this.emitterToSubscriptors.get(emitter);
    if (!subscriptors) {
      subscriptors = new Map<string, GenericCallback>();
      this.emitterToSubscriptors.set(emitter, subscriptors);
    }
    for (const eventName of events) {
      if (typeof eventName !== "string") continue;
      if (subscriptors.has(eventName)) continue;
      const subscriptor = (...args: unknown[]) => {
        if (!this.enabled || !this.emittersEnabled.has(emitter)) return;
        this.emit(eventName, ...(args as Parameters<typeof this.emit>[1] & []));
      };
      subscriptors.set(eventName, subscriptor);
      emitter.on(eventName, subscriptor);
    }
    return this;
  }
  unsubscribe(emitter: EmitterType) {
    this.emittersEnabled.delete(emitter);
    const subscribedToEvents = this.emitterToSubscriptors.get(emitter);
    if (subscribedToEvents) {
      for (const [eventName, subscriptor] of subscribedToEvents) {
        emitter.off(eventName, subscriptor);
      }
    }
    this.emitterToSubscriptors.delete(emitter);
    return this;
  }
  enableEmitter(emitter: EmitterType) {
    this.emittersEnabled.add(emitter);
    return this;
  }
  disableEmitter(emitter: EmitterType) {
    this.emittersEnabled.delete(emitter);
    return this;
  }
  // These methods are only overridden to get the proxy to conform to the TypedEventEmitter interface.
  emit<K extends keyof T>(eventName: K, value?: T[K]) {
    if (typeof eventName === "number") return false;
    return super.emit(eventName, value);
  }
  on<K extends keyof T>(eventName: K, handler: (arg: T[K]) => void) {
    if (typeof eventName === "number") return this;
    return super.on(eventName, handler);
  }
  once<K extends keyof T>(eventName: K, handler: (arg: T[K]) => void) {
    if (typeof eventName === "number") return this;
    return super.once(eventName, handler);
  }
  off<K extends keyof T>(eventName: K, handler: (arg: T[K]) => void) {
    if (typeof eventName === "number") return this;
    return super.off(eventName, handler);
  }
}
