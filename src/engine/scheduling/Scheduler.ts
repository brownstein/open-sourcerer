import EventEmitter from "events";

import { typedEmitterPromise } from "src/api/util";

export type ScheduledEventArg = {
  id?: string;
  startIn?: number;
  startTime?: number;
  duration?: number;
  recurring?: boolean;
  invokeFunctionAtStart?: () => void;
  invokeFunction?: (relativeTime: number, totalTime: number) => void;
  invokeFunctionAtComplete?: () => void;
  invokeEventAtStart?: string;
  invokeEvent?: string;
  invokeEventAtComplete?: string;
};

type ScheduledEvent = ScheduledEventArg &
  Required<Pick<ScheduledEventArg, "startTime" | "duration">>;

export class Scheduler extends EventEmitter {
  protected totalMs: number = 0;
  protected schedule: ScheduledEvent[] = [];
  protected startedEvents = new Set<ScheduledEvent>();
  currentTime() {
    return this.totalMs;
  }
  hasEvents() {
    return !!this.schedule.length;
  }
  hasEvent(id: string) {
    return this.schedule.some((e) => e.id === id);
  }
  add(eventIn: ScheduledEventArg) {
    const event: ScheduledEvent = {
      ...eventIn,
      startTime: eventIn.startTime
        ? eventIn.startTime
        : eventIn.startIn
          ? this.totalMs + eventIn.startIn
          : this.totalMs,
      duration: eventIn.duration ?? 0
    };
    this.schedule.push(event as ScheduledEvent);
  }
  cancel(eventId: string) {
    this.schedule = this.schedule.filter((e) => e.id !== eventId);
  }
  cancelAll(): void {
    this.schedule = [];
  }
  async asyncTimeout(timeoutDuration: number): Promise<void> {
    const UNIQUE_EVENT = crypto.randomUUID();

    this.add({
      duration: timeoutDuration,
      invokeEventAtComplete: UNIQUE_EVENT
    });

    await typedEmitterPromise(this, UNIQUE_EVENT);

    return;
  }
  step(deltaMs: number) {
    this.totalMs += deltaMs;
    let removeEvents: ScheduledEvent[] | undefined;
    for (const event of this.schedule) {
      if (this.totalMs >= event.startTime) {
        let eventDone = false;
        if (event.duration) {
          const totalTime = Math.min(
            event.duration,
            this.totalMs - event.startTime
          );
          const relativeTime = totalTime / event.duration;
          eventDone = relativeTime === 1;
          event.invokeFunction?.(relativeTime, totalTime);
          if (event.invokeEvent) this.emit(event.invokeEvent);
        } else {
          eventDone = true;
        }
        if (!this.startedEvents.has(event)) {
          this.startedEvents.add(event);
          event.invokeFunctionAtStart?.();
          if (event.invokeEventAtStart) {
            this.emit(event.invokeEventAtStart, { event });
          }
        }
        if (eventDone) {
          if (event.recurring) {
            event.startTime = this.totalMs;
          } else {
            if (removeEvents === undefined) {
              removeEvents = [event];
            } else {
              removeEvents.push(event);
            }
            this.startedEvents.delete(event);
          }
          if (event.invokeEventAtComplete)
            this.emit(event.invokeEventAtComplete, { event });
          event.invokeFunctionAtComplete?.();
        }
      }
    }
    if (removeEvents !== undefined) {
      this.schedule = this.schedule.filter((s) => !removeEvents?.includes(s));
    }
  }
}
