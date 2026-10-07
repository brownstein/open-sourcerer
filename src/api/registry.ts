// Registries are things like entity class and level definition repositories.
// Introducing them now so we can support mods more easily later.

export type BaseRegistryRecord<T> = Record<string, T>;
export type RegistryProvider<T> = {
  keys: () => string[];
  keysOrdered?: () => string[];
  add: (key: string, obj: T) => void;
  remove?: (key: string) => void;
  get: (key: string) => T | null;
};
