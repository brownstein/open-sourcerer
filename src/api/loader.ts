import { TypedEventEmitter } from "./util";

export type Loader<T = unknown> = TypedEventEmitter<{
  progress: Loader<T>;
  complete: T;
  failure: Error;
}> & {
  resource?: T;
  resourceName: string;
  resourceSize: number;
  resourceProgress: number;
  completionPromise: Promise<T>;
  load(): Promise<T>;
  unload(): Promise<void>;
};

export type ExtractLoaderResourceType<L> =
  L extends Loader<infer D> ? D : never;

export type ResourceDefinition = {
  loaders?: Record<string, Loader<unknown>>;
  loadConditionally?: boolean;
};
