import Interpreter, {
  InterpreterFunction,
  InterpreterObject,
  InterpreterPrimitive,
  InterpreterPseudoValue
} from "js-interpreter";

import { TypedEventEmitter } from "src/api/util";

export type JSRunnerConsoleOutput = {
  type?: "error";
  primitiveValue?: boolean | number | string | null;
  objectValue?: Record<string, unknown> | unknown[];
};

export type JSRunnerEventTypes = {
  transpileStarted: void;
  transpileFinished: void;
  executionStarted: void;
  executionProgress: number;
  executionFinished: unknown;
  executionTerminated: void;
  error: Error;
  consoleLog: JSRunnerConsoleOutput;
  destroy: void;
};

export type BaseExternalContext = {};
export type BaseModuleContext = {};

export type JSRunnerIOC = {
  mapping: Map<string | symbol, unknown>;
};

export type JSRunnerCtx<T extends BaseExternalContext = BaseExternalContext> =
  T & {
    readonly runner: JSRunnerAPI;
    readonly ioc: JSRunnerIOC;
  };

export type JSRunnerAPI<T extends BaseExternalContext = BaseExternalContext> = {
  readonly interpreter: Interpreter;
  readonly events: TypedEventEmitter<JSRunnerEventTypes>;
  readonly ctx: JSRunnerCtx<T>;
  readonly translate: PseudoTranslatorAPI;
  encapsulateAndThrow(errOrString: Error | string): void;
  incrementOutstandingPromises(count: number): void;
  getLastPseudoResult(): InterpreterPseudoValue;
};

export type PseudoTranslatorAPI = {
  pseudoToNative: (data: InterpreterPseudoValue) => unknown;
  nativeToPseudo: (data: unknown) => InterpreterPseudoValue;
  bindPseudoObjectProperties: (
    pseudoInstance: InterpreterFunction | InterpreterObject,
    nativeInstance: object,
    direct: boolean,
    propertyNames: string[]
  ) => void;
  // Experimental.
  getNativeFunctionFromPseudo(data: unknown): {
    nativeFunc?: Function;
    asyncFunc?: Function;
    directlyCastable: boolean;
  } | null;
};

export type JSRunnerNativeModule<
  T extends BaseExternalContext = BaseExternalContext
> = {
  name: string;
  requirePseudo: (
    ctx: JSRunnerCtx<T>
  ) => InterpreterPseudoValue | Promise<InterpreterPseudoValue>;
};

export type JSRunnerPseudoModuleResolver<
  T extends BaseExternalContext = BaseExternalContext
> = (
  ctx: JSRunnerCtx<T>,
  modulePath: string
) => string | undefined | Promise<string | undefined>;

