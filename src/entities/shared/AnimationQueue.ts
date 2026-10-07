import { createTypedEventEmitter } from "src/api/util";

export type QueuedAnimation<T extends string = string> = {
  id: T;
  onStart?: () => void;
  onCancel?: () => void;
  onEnd?: () => void;
};

export class AnimationQueue<T extends string = string> {
  public events = createTypedEventEmitter<{
    animationStarting: string;
    animationDone: string;
  }>();
  private queue: QueuedAnimation<T>[] = [];
  private currentQueueItem?: QueuedAnimation<T>;
  isEmpty() {
    return this.queue.length === 0;
  }
  push(item: QueuedAnimation<T>) {
    this.queue.push(item);
    if (this.queue.length === 1) item.onStart?.();
  }
  first() {
    return this.queue.at(0);
  }
  endFirst() {
    const first = this.queue.shift();
    first?.onEnd?.();
    const nextFirst = this.queue.at(0);
    nextFirst?.onStart?.();
  }
  swapFirst(item: QueuedAnimation<T>) {
    const first = this.queue.shift();
    first?.onEnd?.();
    this.queue.unshift(item);
    item.onStart?.();
  }
  cancel(id: T) {
    const newQueue: QueuedAnimation<T>[] = [];
    for (const item of this.queue) {
      if (item.id === id) {
        item.onCancel?.();
      } else {
        newQueue.push(item);
      }
    }
    if (newQueue.at(0) !== this.currentQueueItem) {
      this.currentQueueItem = newQueue.at(0);
      this.currentQueueItem?.onStart?.();
    }
    this.queue = newQueue;
  }
  cancelFirst() {
    const first = this.queue.shift();
    first?.onCancel?.();
    const nextFirst = this.queue.at(0);
    nextFirst?.onStart?.();
  }
  cancelAll(ids?: T[]) {
    if (ids) {
      const idSet = new Set<T>(ids);
      const newQueue: QueuedAnimation<T>[] = [];
      for (const item of this.queue) {
        if (idSet.has(item.id)) {
          item.onCancel?.();
        } else {
          newQueue.push(item);
        }
      }
      if (newQueue.at(0) !== this.currentQueueItem) {
        this.currentQueueItem = newQueue.at(0);
        this.currentQueueItem?.onStart?.();
      }
      this.queue = newQueue;
    } else {
      for (const item of this.queue) item.onCancel?.();
      this.queue = [];
      this.currentQueueItem = undefined;
    }
  }
  includes(id: T) {
    return this.queue.some((item) => item.id === id);
  }
}
