import Interpreter, {
  InterpreterFunction,
  InterpreterNativeFunction,
  InterpreterObject,
  InterpreterPseudoValue
} from "js-interpreter";
import { ValidationError } from "yup";

import { SourceMapping } from "./SourceMapping";
import { JSRunnerAPI, PseudoTranslatorAPI } from "./api";
import { isPrimitiveValue } from "./util";

// Low-level POJO object property binder.
// Currently unused, prefer using PseudoTranslator utility.
export function bindObjectProperty(
  interpreter: Interpreter,
  obj: unknown,
  pseudoObj: InterpreterObject,
  propName: string,
  declareGetter: boolean = true,
  declareSetter: boolean = true
) {
  if (typeof obj !== "object")
    throw new Error("[internal] can only call bindObjectProperty on objects.");
  const objAsRecord = obj as Record<string, unknown>;
  let doGet = declareGetter;
  let doSet = declareSetter;
  const nativePropDesc =
    Object.getOwnPropertyDescriptor(obj, propName) ??
    Object.getOwnPropertyDescriptor(obj?.constructor.prototype ?? {}, propName);
  if (nativePropDesc) {
    doGet = !!(nativePropDesc.get ?? nativePropDesc.value !== undefined);
    doSet = !!nativePropDesc.writable;
  }
  interpreter.setProperty(
    pseudoObj,
    propName,
    Interpreter.VALUE_IN_DESCRIPTOR,
    {
      enumerable: true,
      get: doGet
        ? interpreter.createNativeFunction(() => {
            const v = objAsRecord[propName];
            return interpreter.nativeToPseudo(v);
          })
        : undefined,
      set: doSet
        ? interpreter.createNativeFunction((v: unknown) => {
            const nativeV = interpreter.pseudoToNative(v);
            objAsRecord[propName] = nativeV;
            return v;
          })
        : undefined
    }
  );
}

// Internal recursive function for handling pseudoToNative.
// Also used in object auto-conversion for module utils.
export function pseudoToNativeRespectingPropertyDescriptorsAdvanced(
  interpreter: Interpreter,
  arg: InterpreterPseudoValue,
  cyclesMap: WeakMap<InterpreterObject, unknown>,
  escapeHatch: (
    arg: Record<string, unknown>
  ) => false | object | ((...args: unknown[]) => unknown)
) {
  if (isPrimitiveValue(arg)) return arg;
  const argObj = arg as InterpreterObject;
  const existingConversion = cyclesMap.get(argObj);
  if (existingConversion !== undefined) return existingConversion;

  // Disallow regex.
  if (interpreter.isa(argObj, interpreter.REGEXP)) {
    return "[regexp]";
  }

  // Use default mechanism for dates.
  if (interpreter.isa(argObj, interpreter.DATE)) {
    interpreter.pseudoToNative(arg);
  }

  // Before we handle functions, objects, and arrays,
  // let's try the escape hatch to see if we're working with
  // a specially bound object or function used by the module API.
  const escaped = escapeHatch(arg);
  if (escaped !== false) return escaped;

  // Handle functions.
  if (interpreter.isa(argObj, interpreter.FUNCTION)) {
    const functionName = interpreter.getProperty(argObj, "name");
    if (functionName) return `[function ${functionName}]`;
    return "[function]";
  }

  // Handle arrays.
  if (interpreter.isa(argObj, interpreter.ARRAY)) {
    const result: unknown[] = [];
    cyclesMap.set(arg, result);
    let length = 0;
    if (typeof argObj.properties.length === "number") {
      length = argObj.properties.length;
    }
    for (let i = 0; i < length; i++) {
      result[i] = pseudoToNativeRespectingPropertyDescriptorsAdvanced(
        interpreter,
        argObj.properties[i] as InterpreterPseudoValue,
        cyclesMap,
        escapeHatch
      );
    }
    return result;
  }

  // Handle objects.
  const result: Record<string, unknown> = {};
  cyclesMap.set(arg, result);
  for (const key in argObj.properties) {
    if (key in argObj.getter) {
      const getter = argObj.getter[key] as InterpreterNativeFunction;
      if (getter.nativeFunc) {
        const getterResult = getter.nativeFunc() as InterpreterPseudoValue;
        result[key] = pseudoToNativeRespectingPropertyDescriptorsAdvanced(
          interpreter,
          getterResult,
          cyclesMap,
          escapeHatch
        );
        continue;
      }
      continue;
    }
    result[key] = pseudoToNativeRespectingPropertyDescriptorsAdvanced(
      interpreter,
      argObj.properties[key] as InterpreterPseudoValue,
      cyclesMap,
      escapeHatch
    );
  }
  return result;
}

// interpreter.pseudoToNative, with native property descriptor support.
export function pseudoToNativeRespectingPropDescriptors(
  interpreter: Interpreter,
  value: InterpreterPseudoValue
) {
  return pseudoToNativeRespectingPropertyDescriptorsAdvanced(
    interpreter,
    value,
    new WeakMap(),
    () => false
  );
}

// Internal function to process an error stack with a source mapping.
export function mapErrorStack(rawStack: string, sourceMapping: SourceMapping) {
  const stackLines = rawStack.split("\n");
  const stackAt = stackLines.slice(1).filter((v) => /\s\sat\s.+/.test(v));
  const stackAtMapped = stackAt
    .map((line) => {
      const funcCallMatched = /\s\sat\s(.+)\s\((.+):(\d+):(\d+)\)/.exec(line);
      if (funcCallMatched && funcCallMatched.length === 5) {
        const rawFuncName = funcCallMatched[1];
        const rawLine = Number(funcCallMatched[3]);
        const rawColumn = Number(funcCallMatched[4]);
        const sourceLocation = sourceMapping.getSourceLocation(
          rawLine,
          rawColumn
        );
        if (!sourceLocation) return null;
        // Source map lines are 1-based; convert to 0-based to match the
        // editor's line numbering.
        const line0 = sourceLocation.line - 1;
        return `  at ${rawFuncName} (${line0}:${sourceLocation.column})`;
      }
      const matched = /\s\sat\s(.+):(\d+):(\d+)/.exec(line);
      if (!matched || matched.length !== 4) return null;
      const rawLine = Number(matched[2]);
      const rawColumn = Number(matched[3]);
      const sourceLocation = sourceMapping.getSourceLocation(
        rawLine,
        rawColumn
      );
      if (!sourceLocation) return null;
      const line0 = sourceLocation.line - 1;
      return `  at code:${line0}:${sourceLocation.column}`;
    })
    .filter((line) => line);
  const revisedStack = [stackLines.at(0), ...stackAtMapped].join("\n");
  return revisedStack;
}

// Internal symbols used by PseudoTranslator and decorators.
const __mapClazzSymbol = Symbol();
const __mapClazzData = Symbol();
const __mapPrototypeData = Symbol();
const __mapErrorMessageSymbol = Symbol();

// Internal types for keeping track of decorated classes and methods.
export type ClazzInstance<
  ConstructorType extends Function = Function,
  InstanceType extends object = object
> = InstanceType & {
  constructor?: ConstructorType;
  postConstruct?: (runner: JSRunnerAPI) => void | Promise<void>;
  readyPromise?: Promise<void | unknown>;
};
type ClazzPrototype = object & {
  [__mapPrototypeData]: {
    pseudoAttributes: Map<string, ClazzPropDetails>;
  };
};

export type ClazzPropDetails = {
  // TODO: support this property more effectively - it isn't causing properties to be logged
  // right now as its a class property, not an instance property.
  enumerable?: boolean;
  synch?: boolean;
  raw?: boolean;
  injectCtx?: boolean;
  makePromise?: boolean;
  validator?: (data: unknown) => unknown;
  exposeErrorMessages?: boolean;
};

export type ConstructorArgsValidator<T extends unknown[] = unknown[]> = (
  ...data: unknown[]
) => T;

export type ClazzBase<
  ConstructorArgs extends unknown[] = any[],
  InstanceType = ClazzInstance
> = {
  [__mapClazzSymbol]?: symbol;
  [__mapPrototypeData]?: {
    pseudoAttributes: Map<string, ClazzPropDetails>;
  };
  [__mapClazzData]?: {
    name?: string;
    pseudoAttributes: Map<string, ClazzPropDetails>;
    // newer style config.
    constructorArgsValidator?: ConstructorArgsValidator;
    // older style config.
    constructorAsync?: boolean;
    constructorValidator?: (data: unknown) => unknown;
  };
  [__mapErrorMessageSymbol]?: boolean;
  new (...args: ConstructorArgs): InstanceType;
};

// Decorator for auto-translating a class to a pseudo-class.
export function autoTranslateClass(opt?: {
  name?: string;
  // newer style config.
  constructorArgsValidator?: ConstructorArgsValidator;
  // older style config.
  constructorAsync?: boolean;
  constructorValidator?: (data: unknown) => unknown;
}) {
  return function _decorate<Clazz extends ClazzBase = ClazzBase>(clazz: Clazz) {
    const pseudoAttributes = new Map();
    if (clazz[__mapPrototypeData]) {
      for (const [key, value] of clazz[__mapPrototypeData].pseudoAttributes) {
        pseudoAttributes.set(key, value);
      }
    }
    if (clazz.prototype[__mapPrototypeData]) {
      for (const [key, value] of clazz.prototype[__mapPrototypeData]
        .pseudoAttributes) {
        pseudoAttributes.set(key, value);
      }
    }
    clazz[__mapClazzSymbol] = Symbol();
    clazz[__mapClazzData] = {
      name: opt?.name,
      constructorArgsValidator: opt?.constructorArgsValidator,
      constructorAsync: opt?.constructorAsync,
      constructorValidator: opt?.constructorValidator,
      pseudoAttributes
    };
  };
}

// Decorator for exposing a property, method, or static member for a pseudo-class.
export function exposeProp(details: ClazzPropDetails = {}) {
  return function _decorate(instance: Object, propertyKey: string) {
    if (typeof propertyKey !== "string") return;
    const proto = instance as ClazzPrototype | ClazzBase;
    if (!proto[__mapPrototypeData]) {
      proto[__mapPrototypeData] = {
        pseudoAttributes: new Map()
      };
    }
    proto[__mapPrototypeData]?.pseudoAttributes.set(propertyKey, {
      ...details,
      // Default to enumerable as true so that we see the property in info calls.
      enumerable: details.enumerable ?? true
    });
  };
}

// Decorator indicating an error type should always be presented.
export function exposeErrorMessage() {
  return function _decorate<Clazz extends ClazzBase = ClazzBase>(clazz: Clazz) {
    clazz[__mapErrorMessageSymbol] = true;
  };
}

// Internal cache of functions marked as statically callable.
// Use sparingly!
const _gStaticCastableFunctions = new WeakSet<Function>();
export function markStaticCastableFunction() {
  return function _decorate(
    instance: Object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    if (typeof propertyKey !== "string") return;
    if (typeof descriptor.value === "function")
      _gStaticCastableFunctions.add(descriptor.value);
  };
}

// Internal utility methods.
export function isMappedClazz(thing: unknown): thing is ClazzBase {
  if (typeof thing !== "function") return false;
  const clazz = thing as unknown as ClazzBase;
  return !!clazz[__mapClazzSymbol];
}
export function isInstanceofMappedClazz(
  instance: object
): instance is ClazzInstance<ClazzBase> {
  const clazz = instance.constructor as ClazzBase;
  return !!clazz[__mapClazzSymbol];
}

export type PropertyBindingDataResult = {
  prototypeBinding?: ClazzPropDetails;
  instanceValue?: unknown;
};

// Get binding data for a given property on a mapped class for a given attribute name.
export function getPropertyBindingData(
  runner: JSRunnerAPI,
  thing: InterpreterObject,
  propName: string
): PropertyBindingDataResult | null {
  if (isMappedClazz(thing)) {
    const clazzSeen = new WeakSet();
    let currentClazz = thing;
    while (isMappedClazz(currentClazz) && !clazzSeen.has(currentClazz)) {
      clazzSeen.add(currentClazz);
      const clazzData = currentClazz[__mapPrototypeData];
      if (clazzData?.pseudoAttributes?.has(propName)) {
        const prototypeBinding = clazzData.pseudoAttributes.get(propName);
        if (!prototypeBinding?.enumerable) return null;
        return prototypeBinding !== undefined ? { prototypeBinding } : null;
      }
      const clazzProto = currentClazz.prototype[__mapPrototypeData];
      if (clazzProto?.pseudoAttributes?.has(propName)) {
        const prototypeBinding = clazzProto.pseudoAttributes.get(propName);
        if (!prototypeBinding.enumerable) return null;
        return prototypeBinding !== undefined ? { prototypeBinding } : null;
      }
      currentClazz = currentClazz.prototype.constructor;
    }
    return null;
  }
  if (isInstanceofMappedClazz(thing)) {
    const pseudoObj = runner.translate.nativeToPseudo(thing);
    if (!pseudoObj || isPrimitiveValue(pseudoObj)) return null;
    console.log("HERE");
    const clazzSeen = new WeakSet();
    let currentClazz = thing.constructor;
    while (isMappedClazz(currentClazz) && !clazzSeen.has(currentClazz)) {
      console.log("GOING DEEPER");
      clazzSeen.add(currentClazz);
      let clazzProto = currentClazz[__mapPrototypeData];
      if (clazzProto?.pseudoAttributes?.has(propName)) {
        const prototypeBinding = clazzProto.pseudoAttributes.get(propName);
        if (!prototypeBinding?.enumerable) return null;
        return prototypeBinding !== undefined ? { prototypeBinding } : null;
      }
      clazzProto = currentClazz.prototype[__mapPrototypeData];
      if (clazzProto?.pseudoAttributes?.has(propName)) {
        const prototypeBinding = clazzProto.pseudoAttributes.get(propName);
        if (!prototypeBinding?.enumerable) return null;
        return prototypeBinding !== undefined ? { prototypeBinding } : null;
      }
      currentClazz = currentClazz.prototype.constructor;
    }
  }
  return null;
}

// More internal utility types.
type CachedLocalValue = object | ((...args: unknown[]) => unknown);
type CachedPseudoClazz = {
  constructor: InterpreterFunction;
  prototype: InterpreterObject;
};

// This gets ugly, but we assign this symbol to functions
// to allow us to cache them in PseudoTranslator.
const __functionCacheSymbol = Symbol();
type CachableFunction = {
  [__functionCacheSymbol]?: symbol;
};

// PseudoTranslator is responsible for providing core pseudoToNative and
// nativeToPseudo functionality with a lot of extra bells and whistles thrown
// in such that auto-mapped classes and their methods/properties just work.
export class PseudoTranslator implements PseudoTranslatorAPI {
  public runner: JSRunnerAPI;
  private pseudoToNativeMap = new WeakMap<WeakKey, CachedLocalValue>();
  private nativeToPseudoMap = new WeakMap<WeakKey, InterpreterPseudoValue>();
  private generatedPseudoClazzMap = new Map<symbol, CachedPseudoClazz>();
  private propertyAccessorCache = new Map<symbol, InterpreterFunction>();
  constructor(runner: JSRunnerAPI) {
    this.runner = runner;
    this.pseudoToNative = this.pseudoToNative.bind(this);
    this.nativeToPseudo = this.nativeToPseudo.bind(this);
    this._pseudoToNativeEscapeHatch =
      this._pseudoToNativeEscapeHatch.bind(this);
    this._nativeToPseudo = this._nativeToPseudo.bind(this);
  }
  pseudoToNative(input: InterpreterPseudoValue) {
    const interpreter = this.runner.interpreter;
    return pseudoToNativeRespectingPropertyDescriptorsAdvanced(
      interpreter,
      input,
      new WeakMap(),
      this._pseudoToNativeEscapeHatch
    );
  }
  nativeToPseudo(input: unknown) {
    return this._nativeToPseudo(input, false, null, new WeakMap());
  }
  bindPseudoObjectProperties(
    pseudoInstance: InterpreterFunction | InterpreterObject,
    nativeInstance: object,
    direct: boolean,
    propertyNames: string[]
  ) {
    const propMap = new Map<string, ClazzPropDetails>();
    for (const propName of propertyNames) {
      propMap.set(propName, {});
    }
    this._createGettersAndSettersForDescribedProperties(
      pseudoInstance,
      nativeInstance,
      direct,
      propMap
    );
  }
  // This is bound and passed in as the escape hatch to the standard converter
  // function at the top of this file.
  private _pseudoToNativeEscapeHatch(input: Record<string, unknown>) {
    const reuseValue = this.pseudoToNativeMap.get(input);
    if (reuseValue !== undefined) return reuseValue;
    return false;
  }
  private _nativeToPseudo(
    input: unknown,
    forceCache: boolean,
    methodFlags: ClazzPropDetails | null,
    cyclesMap: WeakMap<WeakKey, InterpreterPseudoValue>
  ) {
    const translator = this;
    const runner = this.runner;
    const interpreter = this.runner.interpreter;

    if (isPrimitiveValue(input)) return input;

    // Functions passed to this method may be naked functions
    // or translated properties of auto-translated classes (in which case,
    // methodFlags will be passed).
    if (typeof input === "function") {
      // Check if the function is present in the cache.
      // If it is, we'll just return that.
      let cacheSymbol: symbol | null = this._getCachedFunctionSymbol(input);
      if (cacheSymbol !== null) {
        const cachedPseudoFunction =
          this.propertyAccessorCache.get(cacheSymbol);
        if (cachedPseudoFunction) return cachedPseudoFunction;
      }
      if (forceCache && cacheSymbol === null) {
        cacheSymbol = this._assignCachedFunctionSymbol(input);
      }

      // Handle mapped classes.
      if (isMappedClazz(input)) {
        const cached = this._convertClazzToPseudo(input);
        return cached.constructor;
      }

      // Wrap the function.
      const isSynchronous = methodFlags?.synch || false;
      const isRaw = methodFlags?.raw ?? false;
      const injectCtx = methodFlags?.injectCtx;
      const validator = methodFlags?.validator;
      const wrapperFunction = function (
        this: unknown,
        ...pseudoArgs: (InterpreterPseudoValue | ((result?: unknown) => void))[]
      ) {
        let instance = null;
        if (this) {
          instance =
            translator.pseudoToNativeMap.get(this) ??
            translator.pseudoToNative(this as InterpreterObject);
        }
        // Identify arguments that need conversion.
        const argsToConvert = (
          isSynchronous ? pseudoArgs : pseudoArgs.slice(0, -1)
        ) as InterpreterPseudoValue[];

        // Grab callback for asynchronous definitions.
        const cb = isSynchronous
          ? undefined
          : (pseudoArgs.at(-1) as (result?: unknown) => void);

        // If a method requested raw pseudo values, don't run conversion,
        // otherwise convert input arguments to native values.
        let args = isRaw
          ? [...argsToConvert]
          : argsToConvert.map(translator.pseudoToNative);

        // If we have a property validator, try running it.
        // TODO: handle validation of the whole args array.
        if (validator) {
          try {
            args = args.map(validator);
          } catch (errUnknown) {
            const validationErr =
              errUnknown instanceof ValidationError
                ? (errUnknown as ValidationError)
                : null;
            const msgFallback =
              errUnknown instanceof Error
                ? (errUnknown as Error).message
                : (errUnknown as string);
            runner.encapsulateAndThrow(
              validationErr?.errors.join("\n") ?? msgFallback
            );
            cb?.();
            return;
          }
        }

        // If a method requested context injection, provide context as
        // the frist argument.
        if (injectCtx) args.unshift(runner.ctx);

        try {
          // Synchronous calls.
          if (isSynchronous) {
            const returnValue = (input as Function).apply(instance, args);
            if (isRaw) return returnValue;
            return translator.nativeToPseudo(returnValue);
          }

          // Asynchronous Promise-based calls.
          Promise.resolve((input as Function).apply(instance, args))
            .then((result: unknown) => {
              cb?.(isRaw ? result : translator.nativeToPseudo(result));
            })
            .catch((err) => {
              console.error(
                "[SpellAPIUtils]: Unhandled error in asynchronous internal callback",
                err
              );
              const exposeError =
                !!err &&
                (!!err.constructor[__mapErrorMessageSymbol] ||
                  methodFlags?.exposeErrorMessages);
              runner.encapsulateAndThrow(
                exposeError
                  ? err
                  : "An internal error occurred within the magic system."
              );
              cb?.();
            });
        } catch (err) {
          const exposeError =
            !!err &&
            typeof err.constructor === "function" &&
            (!!(err.constructor as unknown as Record<symbol, boolean>)[
              __mapErrorMessageSymbol
            ] ||
              methodFlags?.exposeErrorMessages);
          console.error(
            "[SpellAPIUtils]: Unhandled error in internal callback",
            err
          );
          runner.encapsulateAndThrow(
            exposeError
              ? (err as Error)
              : "An internal error occurred within the magic system."
          );
        }
      };

      // Manually set properties on the wrapper function to match input.
      Object.defineProperty(wrapperFunction, "length", {
        configurable: true,
        value: isSynchronous ? input.length : input.length + 1
      });
      Object.defineProperty(wrapperFunction, "name", {
        configurable: true,
        value: input.name
      });

      // Construct pseudo function wrapper.
      const result = isSynchronous
        ? interpreter.createNativeFunction(wrapperFunction)
        : interpreter.createAsyncFunction(wrapperFunction);

      // Cache the pseudo function if there's somewhere to put it.
      if (cacheSymbol) this.propertyAccessorCache.set(cacheSymbol, result);

      // This makes use of globals... not necessairly a good thing.
      // TODO: clean this up.
      const isDirectlyCallbable = _gStaticCastableFunctions.has(input);
      if (isDirectlyCallbable) {
        _gStaticCastableFunctions.add(wrapperFunction);
      }

      return result;
    }

    // If we've got anything but an object here, return null.
    if (typeof input !== "object" || input === null) return null;

    // Check for cached and cycle-detected results.
    const fromCache = this.nativeToPseudoMap.get(input);
    if (fromCache !== undefined) return fromCache;
    const fromCycles = cyclesMap.get(input);
    if (fromCycles !== undefined) return fromCycles;

    // Handle arrays.
    if (Array.isArray(input)) {
      const result = interpreter.createArray();
      cyclesMap.set(input, result);
      for (const key in input) {
        interpreter.setProperty(
          result,
          key,
          this._nativeToPseudo(input[key], false, null, cyclesMap)
        );
      }
      return result;
    }

    // Handle class instances.
    if (isInstanceofMappedClazz(input)) {
      const result = this._convertClazzInstanceToPseudo(
        input as ClazzInstance<ClazzBase>,
        cyclesMap
      );
      this.pseudoToNativeMap.set(result, input);
      this.nativeToPseudoMap.set(input, result);
      return result;
    }

    // For plain old javascript objects, we return a mapped object that
    // automatically stays in sync with the native object for convienience.
    const result = interpreter.createObjectProto(interpreter.OBJECT_PROTO);
    cyclesMap.set(input, result);
    // We deliberately fail to set the pseudo to native object map
    // here so that we always auto-translate back. This ensures that
    // if properties are mutated within the runtime, we get those
    // mutations back.
    // this.pseudoToNativeMap.set(result, input);
    this.nativeToPseudoMap.set(input, result);
    this._createGettersAndSettersForDescribedProperties(
      result,
      input,
      true,
      null
    );
    return result;
  }
  private _getCachedFunctionSymbol(func: Function) {
    const obj = func as CachableFunction;
    return obj[__functionCacheSymbol] ?? null;
  }
  private _assignCachedFunctionSymbol(func: Function) {
    const obj = func as CachableFunction;
    const cacheSymbol = Symbol();
    obj[__functionCacheSymbol] = cacheSymbol;
    return cacheSymbol;
  }
  private _createGettersAndSettersForDescribedProperties(
    pseudoObject: InterpreterFunction | InterpreterObject,
    nativeObject: object,
    bindPropertiesDirectly: boolean,
    attributeDefinitions: Map<string, ClazzPropDetails> | null,
    cachePrototypeMethods = false
  ) {
    const translator = this;
    const runner = this.runner;
    const interpreter = this.runner.interpreter;
    const keysHandled = new Set<string>();
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(nativeObject)
    )) {
      keysHandled.add(key);
      const attrDef = attributeDefinitions ? attributeDefinitions.get(key) : {};
      if (attrDef === undefined) continue;
      let doGet: (() => unknown) | undefined;
      let doSet: ((value: unknown) => void) | undefined;
      if (descriptor.get || descriptor.set) {
        if (descriptor.get) {
          doGet = function (this: unknown) {
            if (typeof this !== "object" || this === null) {
              throw new Error(
                "[SpellAPIUtils]: Called a getter directly; this not found."
              );
            }
            const instance = bindPropertiesDirectly
              ? nativeObject
              : translator.pseudoToNativeMap.get(this);
            if (!instance) {
              throw new Error(
                "[SpellAPIUtils]: Unable to find native object for this pseudo object."
              );
            }
            try {
              const result = descriptor.get?.apply(instance);
              return translator._nativeToPseudo(
                result,
                cachePrototypeMethods,
                attrDef ?? null,
                new WeakMap()
              );
            } catch (err) {
              console.error(
                "[SpellAPIUtils]: Encountered error in native getter.",
                err
              );
              runner.encapsulateAndThrow(err as Error | string);
            }
          };
        }
        if (descriptor.set) {
          doSet = function (this: unknown, input: unknown) {
            if (typeof this !== "object" || this === null) {
              throw new Error(
                "[SpellAPIUtils]: Called a setter directly; this not found."
              );
            }
            const instance = bindPropertiesDirectly
              ? nativeObject
              : translator.pseudoToNativeMap.get(this);
            if (!instance) {
              throw new Error(
                "[SpellAPIUtils]: Unable to find native object for this pseudo object."
              );
            }
            try {
              let value = translator.pseudoToNative(
                input as InterpreterPseudoValue
              );

              // If we assigned a validator to a property,
              // run it for the setter prior to setting the property.
              if (attrDef.validator) {
                try {
                  input = attrDef.validator(input);
                } catch (errUnknown) {
                  const validationErr =
                    errUnknown instanceof ValidationError
                      ? (errUnknown as ValidationError)
                      : null;
                  const msgFallback =
                    errUnknown instanceof Error
                      ? (errUnknown as Error).message
                      : (errUnknown as string);
                  runner.encapsulateAndThrow(
                    validationErr?.errors.join("\n") ?? msgFallback
                  );
                  return;
                }
              }

              const result = descriptor.set?.apply(instance, [value]);
              // There might be a bug here with prototype method assignments...
              return translator._nativeToPseudo(
                result,
                cachePrototypeMethods,
                attrDef ?? null,
                new WeakMap()
              );
            } catch (err) {
              console.error(
                "[SpellAPIUtils]: Encountered error in native setter.",
                err
              );
              runner.encapsulateAndThrow(err as Error | string);
            }
          };
        }
      } else {
        doGet = function (this: unknown) {
          if (typeof this !== "object" || this === null) {
            throw new Error(
              "[SpellAPIUtils]: Called a getter directly; this not found."
            );
          }
          const instance = bindPropertiesDirectly
            ? nativeObject
            : translator.pseudoToNativeMap.get(this);
          if (!instance) {
            throw new Error(
              "[SpellAPIUtils]: Unable to find native object for this pseudo object."
            );
          }
          try {
            const result = (instance as Record<string, unknown>)[key];
            return translator._nativeToPseudo(
              result,
              cachePrototypeMethods,
              attrDef ?? null,
              new WeakMap()
            );
          } catch (err) {
            console.error(
              "[SpellAPIUtils]: Encountered error in native getter.",
              err
            );
            runner.encapsulateAndThrow(err as Error | string);
          }
        };
        if (descriptor.writable)
          doSet = function (this: unknown, value: unknown) {
            if (typeof this !== "object" || this === null) {
              throw new Error(
                "[SpellAPIUtils]: Called a setter directly; this not found."
              );
            }
            const instance = bindPropertiesDirectly
              ? nativeObject
              : translator.pseudoToNativeMap.get(this);
            if (!instance) {
              throw new Error(
                "[SpellAPIUtils]: Unable to find native object for this pseudo object."
              );
            }
            const validator = attrDef?.validator;
            try {
              let nativeValue = translator.pseudoToNative(
                value as InterpreterPseudoValue
              );
              if (validator) nativeValue = validator(nativeValue);
              (instance as Record<string, unknown>)[key] = nativeValue;
              return value;
            } catch (err) {
              if (!validator) {
                console.error(
                  "[SpellAPIUtils]: Encountered error in native getter.",
                  err
                );
              }
              runner.encapsulateAndThrow(err as Error | string);
            }
          };
      }
      if (doGet) {
        Object.defineProperty(doGet, "name", {
          writable: true,
          enumerable: attrDef.enumerable,
          value: key
        });
      }
      if (doSet) {
        Object.defineProperty(doSet, "name", {
          writable: true,
          enumerable: attrDef.enumerable,
          value: key
        });
      }
      interpreter.setProperty(
        pseudoObject,
        key,
        Interpreter.VALUE_IN_DESCRIPTOR,
        {
          enumerable: true,
          get: doGet ? interpreter.createNativeFunction(doGet) : undefined,
          set: doSet ? interpreter.createNativeFunction(doSet) : undefined
        }
      );
    }
    // Handle any attributes we asked to define that aren't currently defined.
    if (attributeDefinitions !== null) {
      for (const [key, attrDef] of attributeDefinitions) {
        if (
          keysHandled.has(key) ||
          interpreter.hasProperty(pseudoObject, key)
        ) {
          continue;
        }
        const doGet = function (this: unknown) {
          if (typeof this !== "object" || this === null) {
            throw new Error(
              "[SpellAPIUtils]: Called a getter directly; this not found."
            );
          }
          const instance = bindPropertiesDirectly
            ? nativeObject
            : translator.pseudoToNativeMap.get(this);
          if (!instance) {
            throw new Error(
              "[SpellAPIUtils]: Unable to find native object for this pseudo object."
            );
          }
          try {
            const result = (instance as Record<string, unknown>)[key];
            return translator._nativeToPseudo(
              result,
              cachePrototypeMethods,
              attrDef ?? null,
              new WeakMap()
            );
          } catch (err) {
            console.error(
              "[SpellAPIUtils]: Encountered error in native getter.",
              err
            );
            runner.encapsulateAndThrow(err as Error | string);
          }
        };
        Object.defineProperty(doGet, "name", {
          writable: true,
          value: key
        });
        interpreter.setProperty(
          pseudoObject,
          key,
          Interpreter.VALUE_IN_DESCRIPTOR,
          {
            enumerable: true,
            configurable: true,
            get: interpreter.createNativeFunction(doGet)
          }
        );
      }
    }
  }
  private _convertClazzInstanceToPseudo(
    instance: ClazzInstance<ClazzBase>,
    cyclesMap: WeakMap<WeakKey, InterpreterPseudoValue>
  ) {
    const interpreter = this.runner.interpreter;
    const Clazz = instance.constructor;
    if (Clazz === undefined)
      throw new Error("[SpellAPIUtils]: Unable to resolve proxy class.");
    const clazzSymbol = Clazz[__mapClazzSymbol];
    if (!clazzSymbol)
      throw new Error(
        "[SpellAPIUtils]: Attempted to convert unmapped class to pseudo-class."
      );
    const pseudoClazzData = this._convertClazzToPseudo(Clazz);
    const pseudoInstance = interpreter.createObjectProto(
      pseudoClazzData.prototype
    );
    cyclesMap.set(instance, pseudoInstance);
    this._createGettersAndSettersForDescribedProperties(
      pseudoInstance,
      instance,
      true,
      Clazz[__mapClazzData]?.pseudoAttributes ?? new Map()
    );
    return pseudoInstance;
  }
  private _convertClazzToPseudo(Clazz: ClazzBase): CachedPseudoClazz {
    const translator = this;
    const interpreter = this.runner.interpreter;
    const clazzSymbol = Clazz[__mapClazzSymbol];
    const clazzData = Clazz[__mapClazzData];
    if (!clazzSymbol)
      throw new Error(
        "[SpellAPIUtils]: Attempted to convert unmapped class to pseudo-class."
      );
    const previouslyGenerated = this.generatedPseudoClazzMap.get(clazzSymbol);
    if (previouslyGenerated) return previouslyGenerated;
    const constructorIsAsync = clazzData?.constructorAsync || false;
    const constructorWrapper = function (
      ...pseudoArgs: InterpreterPseudoValue[]
    ) {
      let args: unknown[];
      let cb: undefined | ((instance: InterpreterPseudoValue) => void);
      if (constructorIsAsync) {
        args = pseudoArgs.slice(0, -1).map(translator.pseudoToNative);
        cb = pseudoArgs.at(-1) as typeof cb;
      } else {
        args = pseudoArgs.map(translator.pseudoToNative);
      }

      // If we have an old-style constructor validator, try running it.
      if (clazzData?.constructorValidator) {
        try {
          args = args.map(clazzData.constructorValidator);
        } catch (errUnknown) {
          const validationErr =
            errUnknown instanceof ValidationError
              ? (errUnknown as ValidationError)
              : null;
          const msgFallback =
            errUnknown instanceof Error
              ? (errUnknown as Error).message
              : (errUnknown as string);
          translator.runner.encapsulateAndThrow(
            validationErr?.errors.join("\n") ?? msgFallback
          );
          cb?.(undefined);
          return;
        }
      }

      if (clazzData?.constructorArgsValidator) {
        try {
          args = clazzData.constructorArgsValidator(args);
        } catch (errUnknown) {
          const validationErr =
            errUnknown instanceof ValidationError
              ? (errUnknown as ValidationError)
              : null;
          const msgFallback =
            errUnknown instanceof Error
              ? (errUnknown as Error).message
              : (errUnknown as string);
          translator.runner.encapsulateAndThrow(
            validationErr?.errors.join("\n") ?? msgFallback
          );
          cb?.(undefined);
          return;
        }
      }

      try {
        const clazzInstance = new Clazz(...args);
        const pseudoInstance = translator.nativeToPseudo(clazzInstance);
        translator.nativeToPseudoMap.set(clazzInstance, pseudoInstance);
        if (cb) {
          // Newer style postConstruct callback handling.
          if (clazzInstance.postConstruct) {
            Promise.resolve(clazzInstance.postConstruct(translator.runner))
              .then(() => cb(translator.nativeToPseudo(clazzInstance)))
              .catch((err) => {
                translator.runner.encapsulateAndThrow(
                  err ?? `Failed to construct ${Clazz.name}.`
                );
                cb?.(undefined);
              });
            return;
          }
          // Older style readyPromise post-init handling.
          if (clazzInstance?.readyPromise) {
            clazzInstance?.readyPromise
              .then(() => cb(pseudoInstance))
              .catch((err) => {
                translator.runner.encapsulateAndThrow(
                  err ?? `Failed to construct ${Clazz.name}.`
                );
                cb?.(undefined);
              });
            return;
          }
          cb(pseudoInstance);
        } else {
          return pseudoInstance;
        }
      } catch (err) {
        translator.runner.encapsulateAndThrow(err as Error | string);
        cb?.(undefined);
      }
    };
    Object.defineProperty(constructorWrapper, "name", {
      configurable: true,
      value: clazzData?.name ?? Clazz.name
    });
    Object.defineProperty(constructorWrapper, "length", {
      configurable: true,
      // The interpreter truncates a native async function's args to
      // `length - 1` (the last slot is the appended callback). Entity
      // constructors take a single options object, but an *optional* param
      // (`constructor(opt?)`) doesn't count toward Function.length, so
      // Clazz.length is 0 and the options object would be sliced away. Floor at
      // 1 real arg so the options object always survives.
      value: constructorIsAsync ? Math.max(Clazz.length, 1) + 1 : Clazz.length
    });
    const pseudoConstructor = constructorIsAsync
      ? interpreter.createAsyncFunction(constructorWrapper)
      : interpreter.createNativeFunction(constructorWrapper, true);

    const pseudoPrototype = interpreter.getProperty(
      pseudoConstructor,
      "prototype"
    ) as InterpreterObject;

    // Get the special data off the class object.
    const psuedoAttributes =
      Clazz[__mapClazzData]?.pseudoAttributes ?? new Map();

    // Handle static members.
    this._createGettersAndSettersForDescribedProperties(
      pseudoConstructor,
      Clazz,
      true,
      psuedoAttributes
    );

    // Handle prototype(s).
    let proto = Clazz.prototype;
    while (proto?.[__mapPrototypeData]) {
      this._createGettersAndSettersForDescribedProperties(
        pseudoPrototype,
        proto,
        false,
        psuedoAttributes,
        true
      );
      proto = Object.getPrototypeOf(proto);
    }
    const pseudoClazzData: CachedPseudoClazz = {
      constructor: pseudoConstructor,
      prototype: pseudoPrototype
    };
    this.generatedPseudoClazzMap.set(clazzSymbol, pseudoClazzData);
    // We want to be able to convert the class back into
    // a class for native processing, so add it to the mapping.
    this.pseudoToNativeMap.set(pseudoConstructor, Clazz);
    return pseudoClazzData;
  }
  // Experimental. Use with caution.
  getNativeFunctionFromPseudo(argObj: InterpreterPseudoValue) {
    if (
      !this.runner.interpreter.isa(argObj, this.runner.interpreter.FUNCTION)
    ) {
      return null;
    }
    const argFunc = argObj as InterpreterFunction;
    if (argFunc.nativeFunc) {
      return {
        nativeFunc: argFunc.nativeFunc,
        directlyCastable: _gStaticCastableFunctions.has(argFunc.nativeFunc)
      };
    }
    if (argFunc.asyncFunc) {
      return {
        asyncFunc: argFunc.asyncFunc,
        directlyCastable: _gStaticCastableFunctions.has(argFunc.asyncFunc)
      };
    }
    return null;
  }
}
