import { GenericHotLoaderAPI, HotLoaderEvents } from "src/api/hotLoader";
import { createTypedEventEmitter } from "src/api/util";

export class GenericHotLoader<T> implements GenericHotLoaderAPI<T> {
  public readonly events = createTypedEventEmitter<{
    [HotLoaderEvents.IdsAdded]: string[];
    [HotLoaderEvents.IdsRemoved]: string[];
    [HotLoaderEvents.ResourceChanged]: [string, T | null];
  }>();

  private resources = new Map<string, T>();

  constructor(initialResources?: Record<string, T> | Map<string, T>) {
    if (initialResources !== undefined) {
      const asMap = initialResources as Map<string, T>;
      const asRecord = initialResources as Record<string, T>;
      const isMap = typeof asMap.get === "function";
      for (const [key, value] of isMap ? asMap : Object.entries(asRecord)) {
        this.resources.set(key, value);
      }
    }
  }

  getIds(): string[] {
    return [...this.resources.keys()];
  }
  getResource(id: string): T | null {
    return this.resources.get(id) ?? null;
  }
  updateResource(id: string, resource: T): void {
    this.resources.set(id, resource);
    this.events.emit(HotLoaderEvents.IdsAdded, [id]);
    this.events.emit(HotLoaderEvents.ResourceChanged, [id, resource]);
  }
  removeResource(id: string): void {
    if (!this.resources.delete(id)) return;
    this.events.emit(HotLoaderEvents.IdsRemoved, [id]);
    this.events.emit(HotLoaderEvents.ResourceChanged, [id, null]);
  }
}
