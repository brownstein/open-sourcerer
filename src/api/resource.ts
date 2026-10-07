import { Loader } from "./loader";

export type BaseResourceDefType = {
  id: string;
  loaded: boolean;
  load?(): () => Promise<void>;
  getSubResources?: () => string[];
};

export type ResourceProvider = {
  resources: string[];
  getResourceLoader(resourceName: string): Loader<unknown>;
};
