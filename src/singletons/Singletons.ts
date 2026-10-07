// This file is used as a mechanism to allow singletons to interconnect.
// Use only as a last resort.

import { Store } from "redux";
import { SpellsAPI } from "src/api/spells";
import { TutorialControllerAPI } from "src/components/tutorials/TutorialControllerAPI";
import { RootState } from "src/redux/rootState";

export type SingletonsAPI = {
  store?: Store<RootState>;
  spells?: SpellsAPI;
  tutorials?: TutorialControllerAPI;
};

const singletons: SingletonsAPI = {};

export function registerSingleton<K extends keyof SingletonsAPI>(key: K, service: SingletonsAPI[K]) {
  singletons[key] = service;
}

export function clearSingleton<K extends keyof SingletonsAPI>(key: K) {
  delete singletons[key];
}

export function getSingleton<K extends keyof SingletonsAPI>(key: K): SingletonsAPI[K] | null {
  return singletons[key] ?? null;
}
