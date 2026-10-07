import { TypedEventEmitter } from "./util";

export enum HotLoaderEvents {
  IdsAdded = "IdsAdded",
  IdsRemoved = "IdsRemoved",
  ResourceChanged = "ResourceChanged"
}

export type GenericHotLoaderAPI<T> = {
  readonly events: TypedEventEmitter<{
    [HotLoaderEvents.IdsAdded]: string[];
    [HotLoaderEvents.IdsRemoved]: string[];
    [HotLoaderEvents.ResourceChanged]: [string, T | null];
  }>;
  getIds(): string[];
  getResource(id: string): T | null;
  updateResource(id: string, resource: T): void;
  removeResource(id: string): void;
};
