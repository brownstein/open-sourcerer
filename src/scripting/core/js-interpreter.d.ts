// Js-interpreter by Neil Fraser does not provide TypeScript types.
// This provides an incomplete definition for revision 5.1.0
declare module "js-interpreter" {
  import type {
    Options as AcornParseOptions,
    AnyNode as AcornASTNode
  } from "acorn";

  export type InterpreterASTNode = AcornASTNode;

  export type InterpreterPrimitive =
    | null
    | undefined
    | boolean
    | string
    | number;

  export type InterpreterObject = {
    getter: Record<string, unknown>;
    setter: Record<string, unknown>;
    properties: Record<string, unknown>;
    proto: InterpreterObject | null;
    class?: string;
    data?: unknown;
    node?: InterpreterASTNode;
  };

  export type InterpreterPseudoValue =
    | InterpreterPrimitive
    | InterpreterObject
    | InterpreterFunction;

  export type InterpreterScope = {
    parentScope: InterpreterScope | null;
    strict: boolean;
    object: InterpreterObject;
  };

  export type InterpreterOptDescriptor = {
    get?: InterpreterFunction;
    set?: InterpreterFunction;
    value?: unknown;
    writable?: boolean;
    enumerable?: boolean;
    configurable?: boolean;
  };

  export type InterpreterFunction = InterpreterObject & {
    properties: InterpreterObject["properties"] & {
      name: InterpreterObjectDescriptor;
      prototype: InterpreterObject;
      constructor: InterpreterObject;
    };
    class: "Function";
    id: number;
    asyncFunc?: (
      ...args: [...InterpreterPseudoValue[], (result: unknown) => void]
    ) => void;
    nativeFunc?: (...args: InterpreterPseudoValue[]) => unknown;
  };

  export type InterpreterNativeFunction = InterpreterFunction & {
    nativeFunc: (...args: unknown[]) => unknown;
  };

  export type InterpreterAsyncNativeFunction = InterpreterFunction & {
    asyncFunc: (...args: unknown[]) => unknown;
  };

  export type InterpreterState = {
    node: InterpreterASTNode;
    scope: InterpreterScope;
    done?: boolean;
    value?: unknown;
    // internals.
    cv?: unknown;
    labels?: string[];
    isLoop?: boolean;
    isSwitch?: boolean;
  };

  export type InterpreterTask = {
    time: number;
    node: InterpreterASTNode;
    scope: InterpreterScope;
    argsArray: InterpreterPseudoValue[];
    functionRef?: InterpreterFunction;
    pid: number;
    interval: number;
  };

  type InterpreterInitCallback = (
    interpreter: Interpreter,
    scope: InterpreterScope
  ) => void;

  class Interpreter {
    constructor(script: string, init_callback?: InterpreterInitCallback);
    run(): boolean;
    step(): boolean;
    appendCode(code: string | InterpreterASTNode): void;

    createObject(constructor: InterpreterFunction | null): InterpreterObject;
    createObjectProto(prototype: unknown): InterpreterObject;
    createArray(): InterpreterObject;

    createFunction(
      node: InterpreterASTNode,
      scope: InterpreterScope,
      opt_name?: string
    ): InterpreterFunction;

    // TODO: tighten this.
    createNativeFunction(
      f: (...args: any[]) => any,
      instance?: boolean
    ): InterpreterNativeFunction;
    createAsyncFunction(
      f: (...args: any[]) => any
    ): InterpreterAsyncNativeFunction;

    nativeToPseudo(arg: unknown): InterpreterPrimitive | InterpreterObject;
    // TODO: tighten this.
    pseudoToNative(
      arg: InterpreterPrimitive | InterpreterObject | unknown
    ): unknown;

    hasProperty(obj: InterpreterObject, name: string | number): boolean;
    getProperty(
      obj: InterpreterObject,
      name: string | number
    ): InterpreterObject | InterpreterPrimitive;
    setProperty(
      obj: InterpreterObject,
      property: string | number,
      value: unknown,
      opt_descriptor?: InterpreterOptDescriptor
    ): void;

    isa(child: unknown, constructor: unknown): boolean;

    populateError(error: InterpreterObject, opt_message?: string): void;

    // TODO: fix this signature;
    throwException(errorClass: unknown, errMessage?: string);
    unwind(completionType: unknown, value: unknown, label?: string);

    stripLocations_(ast: InterpreterASTNode, from?: number, to?: number): void;
    // createFunctionBase_(
    //   length: number,
    //   isConstructor: boolean
    // ): InterpreterFunction;
    // functionCounter_: number;

    // This was patched in in a previous implementation. Now I'm
    // using createTask, but there are still code references to this.
    // TODO: remove this!
    queueCall?(callback: any, args: any[]);

    // This is how new execution scopes are created.
    createScope(node: InterpreterASTNode, parentScope: Scope | null): Scope;

    // This is now the preferred way of adding async callback support.
    createTask_(
      isInterval: boolean,
      args: [
        task: InterpreterFunction,
        delay?: number,
        ...rest: InterpreterPseudoValue[]
      ]
    );
    // This is definitely not exposed on purpose, but necessary for Promise API spoofing.
    scheduleTask_(task: Task, delay: number): number;
    newNode(): InterpreterASTNode;

    getScope(): InterpreterScope;
    getGlobalScope(): InterpreterScope;
    getValueFromScope(name): InterpreterPseudoValue;

    public stateStack: InterpreterState[];
    public globalScope: InterpreterScope;
    public ast: any;
    public global: any; // TODO: remove.
    public value: any; // TODO: remove.

    // Asynchronously executed task queue.
    public tasks: InterpreterTask[];

    // This is used by async functions.
    public paused_: boolean;

    public BOOLEAN: InterpreterNativeFunction;
    public NUMBER: InterpreterNativeFunction;
    public STRING: InterpreterNativeFunction;
    public ARRAY: InterpreterNativeFunction;
    public OBJECT: InterpreterNativeFunction;
    public FUNCTION: InterpreterNativeFunction;
    public NULL: InterpreterNativeFunction;
    public UNDEFINED: InterpreterNativeFunction;
    public ERROR: InterpreterNativeFunction;
    public REGEXP: InterpreterNativeFunction;
    public DATE: InterpreterNativeFunction;

    public OBJECT_PROTO: unknown;

    static State: typeof State;
    static Task: typeof Task;

    static PARSE_OPTIONS: AcornParseOptions;
    static READONLY_DESCRIPTOR: InterpreterOptDescriptor;
    static VALUE_IN_DESCRIPTOR: {
      VALUE_IN_DESCRIPTOR: true;
    };
    static READONLY_NONENUMERABLE_DESCRIPTOR: InterpreterOptDescriptor;
    static VARIABLE_DESCRIPTOR: InterpreterOptDescriptor;

    // Error handling.
    static STEP_ERROR: unknown;
    static Completion: {
      NORMAL: 0;
      BREAK: 1;
      CONTINUE: 2;
      RETURN: 3;
      THROW: 4;
    };
  }

  class State {
    public done?: boolean;
    public value?: unknown;
    public node: InterpreterASTNode;
    public scope: InterpreterScope;
    constructor(node: InterpreterASTNode, scope: InterpreterScope);
  }

  class Task {
    constructor(
      functionRef: InterpreterFunction,
      argsArray: InterpreterPseudoValue[],
      scope: InterpreterScope,
      node: InterpreterASTNode,
      interval: number
    );
  }

  export default Interpreter;
  export { State, Task };
}
