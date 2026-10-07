import { EventEmitter } from "events";
import { Color } from "three";

export type PrimitiveTypeNameMap = {
  boolean: boolean;
  number: number;
  string: string;
};

export type RemoveIndex<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : K]: T[K];
};

export type PrimitiveType<k extends keyof PrimitiveTypeNameMap> =
  PrimitiveTypeNameMap[k];

export type PrimitiveWithDefault<T> = T extends keyof PrimitiveTypeNameMap
  ? {
      default?: PrimitiveType<T>;
      type: T;
    }
  : never;

export function isPrimitiveWithDefault<T extends keyof PrimitiveTypeNameMap>(
  val: PrimitiveWithDefault<keyof PrimitiveTypeNameMap>,
  primitiveType: keyof PrimitiveTypeNameMap
): val is PrimitiveWithDefault<T> {
  if (val.type === primitiveType) return true;
  return false;
}

export type PrimitivesWithDefaults =
  | PrimitiveWithDefault<"boolean">
  | PrimitiveWithDefault<"number">
  | PrimitiveWithDefault<"string">;

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type ConfigDefType = {
  [key: string]: PrimitivesWithDefaults;
};

export type ConfigDefTypeFor<
  T extends { [key: string]: PrimitiveTypeNameMap[keyof PrimitiveTypeNameMap] }
> = {
  [K in keyof T]: T[K] extends string
    ? PrimitiveWithDefault<"string">
    : T[K] extends number
      ? PrimitiveWithDefault<"number">
      : T[K] extends boolean
        ? PrimitiveWithDefault<"boolean">
        : never;
};

export type Config<CD extends ConfigDefType> = Partial<{
  [K in keyof CD]?: PrimitiveType<CD[K]["type"]>;
}>;

export function configDef<CD extends ConfigDefType>(arg: CD): CD {
  return arg;
}

export function configDefFor<CD extends ConfigDefType>(config: Config<CD>): CD {
  const cd: ConfigDefType = {};
  for (const [key, value] of Object.entries(config)) {
    switch (typeof value) {
      case "boolean":
        cd[key] = {
          type: "boolean",
          default: value
        };
        break;
      case "number":
        cd[key] = {
          type: "number",
          default: value
        };
        break;
      case "string":
        cd[key] = {
          type: "string",
          default: value
        };
        break;
      default:
        throw new Error(
          `[configDefFor] cannot produce def for ${key}=${typeof value}`
        );
    }
  }
  return cd as CD;
}

export function safeConfig<CD extends ConfigDefType>(
  configDef: CD,
  config: Config<CD>
): Config<CD> {
  const result: Config<CD> = {};
  for (const key in Object.keys(configDef)) {
    const typedKey = key as keyof CD;
    const configVal = config[typedKey];
    const defaultVal = configDef[typedKey].default;
    const resolvedVal = configVal ?? defaultVal;
    if (typeof resolvedVal !== configDef[typedKey].type) continue;
    result[typedKey] = resolvedVal as Config<CD>[typeof typedKey];
  }
  return result;
}

export function applyConfig<CD extends ConfigDefType>(
  configDef: CD,
  config: unknown
): Config<CD> {
  if (typeof config !== "object")
    throw new Error(`Config is not an object: ${typeof config}`);
  if (config === null) throw new Error("Config is null");
  const result: Config<CD> = {};
  for (const key in Object.keys(configDef)) {
    const typedKey = key as keyof CD;
    const configVal = (config as Config<CD>)[typedKey];
    const defaultVal = configDef[typedKey].default;
    const resolvedVal = configVal ?? defaultVal;
    if (typeof resolvedVal !== configDef[typedKey].type) continue;
    result[typedKey] = resolvedVal as Config<CD>[typeof typedKey];
  }
  return result;
}

export type EmitterEventsMap = Record<string | symbol, unknown>;

export type TypedEventEmitter<T extends EmitterEventsMap> = Omit<
  EventEmitter,
  "emit" | "on" | "once" | "off"
> & {
  emit: <EventName extends keyof T>(
    eventName: EventName,
    ...args: T[EventName] extends void ? [] : [T[EventName]]
  ) => void;
  on: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
  once: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
  off: <EventName extends keyof T>(
    eventName: EventName,
    handler: (arg: T[EventName]) => unknown
  ) => void;
};

export type TypedEventEmitterEvents<
  T extends TypedEventEmitter<EmitterEventsMap>
> = T extends TypedEventEmitter<infer EM> ? EM : never;

export function createTypedEventEmitter<EventMap extends EmitterEventsMap>() {
  return new EventEmitter() as TypedEventEmitter<EventMap>;
}

export type ReadOnly<T extends Record<string, unknown>> = {
  readonly [K in keyof T]: T[K];
};

export type ColorRepresentation = number | string | Color;

// Helper to create a promise that waits for an event on a TypedEventEmitter.
export function typedEmitterPromise<
  EventMapType extends EmitterEventsMap,
  EventType extends keyof EventMapType,
  RejectEventType extends keyof EventMapType
>(
  emitter: TypedEventEmitter<EventMapType>,
  event: EventType,
  rejectEvent?: RejectEventType
): Promise<EventMapType[EventType]> {
  let resolved = false;
  return new Promise((resolve, reject) => {
    emitter.setMaxListeners(emitter.getMaxListeners() + (rejectEvent ? 2 : 1));
    emitter.once(event, (arg) => {
      emitter.setMaxListeners(emitter.getMaxListeners() - 1);
      if (resolved) return;
      resolved = true;
      resolve(arg);
    });
    if (rejectEvent) {
      emitter.once(rejectEvent, (arg) => {
        emitter.setMaxListeners(emitter.getMaxListeners() - 1);
        if (resolved) return;
        resolved = true;
        reject(arg);
      });
    }
  });
}

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((el) => typeof el === "number");
}
