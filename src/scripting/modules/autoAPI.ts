import { Clazz } from "../core/typings";
import { SpellRuntimeModuleCtxAPI, SpellRuntimeModulePseudo } from "../runtime/SpellRuntimeAPI";

export type AutoBindableNativeModuleInstance<T> = T & {
  teardown?: () => void;
};

export type AutoBindableNativeModuleClazz<T> = {
  name: string;
  nickname?: string;
  new (args: SpellRuntimeModuleCtxAPI): T;
};

export function assertAutoBindableNativeModule(clazz: AutoBindableNativeModuleClazz<unknown>) {
  if (clazz.name === undefined) console.warn("Module class may be malformed", clazz);
}

export type AutoBindNativeModule<T extends unknown = unknown> = {
  default?: AutoBindableNativeModuleClazz<AutoBindableNativeModuleInstance<T>>;
};

export type AutoBindPseudoModule = {
  default?: SpellRuntimeModulePseudo;
};
