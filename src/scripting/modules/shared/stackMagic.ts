import * as Acorn from "acorn";
import Interpreter, {
  InterpreterFunction,
  InterpreterPseudoValue,
  InterpreterScope,
  State as InterpreterState
} from "js-interpreter";
import shortid from "shortid";

import { JSRunnerAPI } from "../../core/api";

// Creates a promise generating interpreter state - used for providing
// Promise support to the pseudo runtime.
export function createPromiseGeneratingInterpreterState(
  runner: JSRunnerAPI
): [
  InterpreterState,
  (v: InterpreterPseudoValue | void) => void,
  (v: InterpreterPseudoValue | void) => void
] {
  const interpreter = runner.interpreter;

  let resolveFunc: InterpreterFunction | undefined;
  let rejectFunc: InterpreterFunction | undefined;
  const bindingVar = `__${Math.random()}__`.replaceAll(/[.-]/g, "");
  function binder(resolve: InterpreterFunction, reject: InterpreterFunction) {
    resolveFunc = resolve;
    rejectFunc = reject;
  }

  const currentScope = interpreter.stateStack.at(-1)?.scope;
  if (!currentScope) throw new Error("Current scope not defined.");

  const promiseIdentifier = interpreter.newNode() as Acorn.Identifier;
  promiseIdentifier.type = "Identifier";
  promiseIdentifier.start = 0;
  promiseIdentifier.end = 0;
  promiseIdentifier.name = "Promise";

  const binderIdentifier = interpreter.newNode() as Acorn.Identifier;
  binderIdentifier.type = "Identifier";
  binderIdentifier.start = 0;
  binderIdentifier.end = 0;
  binderIdentifier.name = bindingVar;

  const newPromiseExpression = interpreter.newNode() as Acorn.NewExpression;
  newPromiseExpression.type = "NewExpression";
  newPromiseExpression.start = 0;
  newPromiseExpression.end = 0;
  newPromiseExpression.callee = promiseIdentifier;
  newPromiseExpression.arguments = [binderIdentifier];

  const newPromiseExScope = interpreter.createScope(
    newPromiseExpression,
    interpreter.getGlobalScope()
  );
  interpreter.setProperty(
    newPromiseExScope.object,
    bindingVar,
    interpreter.createNativeFunction(binder)
  );
  const newPromiseExState = new Interpreter.State(
    newPromiseExpression,
    newPromiseExScope
  );

  const resolve = (value: InterpreterPseudoValue | void) => {
    runner.incrementOutstandingPromises(-1);
    if (!resolveFunc) return;
    const expressionNode = interpreter.newNode() as Acorn.CallExpression;
    expressionNode.type = "CallExpression";
    const task = new Interpreter.Task(
      resolveFunc,
      value === undefined ? [] : [value],
      currentScope,
      expressionNode,
      -1
    );
    runner.interpreter.scheduleTask_(task, 0);
  };
  const reject = (value: InterpreterPseudoValue | void) => {
    runner.incrementOutstandingPromises(-1);
    if (!rejectFunc) return;
    const expressionNode = interpreter.newNode() as Acorn.CallExpression;
    expressionNode.type = "CallExpression";
    const task = new Interpreter.Task(
      rejectFunc,
      value === undefined ? [] : [value],
      currentScope,
      expressionNode,
      -1
    );
    runner.interpreter.scheduleTask_(task, 0);
  };

  runner.incrementOutstandingPromises(1);

  return [newPromiseExState, resolve, reject];
}

export function earlyResolveWithPromise(runner: JSRunnerAPI) {
  const interpreter = runner.interpreter;
  const [exState, resolve, reject] =
    createPromiseGeneratingInterpreterState(runner);
  const stateStackLast = interpreter.stateStack.at(-1);
  if (stateStackLast) stateStackLast.value = undefined;
  interpreter.stateStack.push(exState);
  interpreter.paused_ = false;
  return [resolve, reject];
}

export function replaceCurrentStateWithCallback(
  runner: JSRunnerAPI,
  callback: InterpreterFunction,
  args?: InterpreterPseudoValue[],
  scopeAssignments?: Record<string, InterpreterPseudoValue>
) {
  const interpreter = runner.interpreter;
  const state = interpreter.stateStack.at(-1);
  if (!state)
    throw new Error("Expected current stack node to be a function call.");
  // This might break if I update the library.
  // Hooray for the ability to mess with internals
  // in this undocumented soup of a package!
  const stateWithInternals = state as typeof state & {
    doneCallee_: number;
    funcThis_: InterpreterPseudoValue;
    func_: InterpreterFunction;
    doneArgs_: boolean;
    arguments_: InterpreterPseudoValue[];
    doneExec_: boolean;
  };
  stateWithInternals.doneCallee_ = 2;
  stateWithInternals.func_ = callback;
  stateWithInternals.doneArgs_ = true;
  stateWithInternals.arguments_ = args ?? [];
  stateWithInternals.doneExec_ = false;
  if (scopeAssignments) {
    const scope = state.scope;
    for (const [key, value] of Object.entries(scopeAssignments)) {
      interpreter.setProperty(scope.object, key, value);
    }
  }
}

export function pushInterpreterFunctionCall(
  runner: JSRunnerAPI,
  func: InterpreterFunction,
  args?: InterpreterPseudoValue[],
  scopeIn?: InterpreterScope
) {
  const interpreter = runner.interpreter;
  const state = interpreter.stateStack.at(-1);
  if (!state) throw new Error("Expected current stack node to have a state.");
  const node = func.node as Acorn.Function;
  const body = node.body;
  const scope = interpreter.createScope(
    body,
    scopeIn ?? interpreter.getScope()
  );
  const argsList = interpreter.createArray();
  if (args) {
    for (let ai = 0; ai < args.length; ai++) {
      interpreter.setProperty(argsList, ai, args[ai]);
    }
  }
  interpreter.setProperty(scope.object, "arguments", argsList);
  for (let i = 0; i < node.params.length; i++) {
    const paramName = (node.params[i] as Acorn.Identifier).name;
    const paramValue = args && i < args.length ? args[i] : undefined;
    interpreter.setProperty(scope.object, paramName, paramValue);
  }
  // Sketch.
  interpreter.setProperty(
    scope.object,
    "this",
    Interpreter.VALUE_IN_DESCRIPTOR,
    {
      enumerable: false,
      configurable: false,
      writable: false,
      value: null
    }
  );
  const newState = new Interpreter.State(body, scope);
  // Not sure if popping the current function call off the
  // stack actually makes sense here, so don't do it for now.
  // interpreter.stateStack.pop();
  interpreter.stateStack.push(newState);
  interpreter.paused_ = false;
}

export type HybridFunctionSpecifier = {
  native?: (...args: unknown[]) => void;
  nativeAsync?: (...args: unknown[]) => void | Promise<void>;
  pseudo?: InterpreterFunction;
  returnValue?: boolean;
  cascade?: boolean;
};

export function constructHybridFunction(
  runner: JSRunnerAPI,
  funcs: HybridFunctionSpecifier[],
  params: string[] = []
) {
  const interpreter = runner.interpreter;
  const codeBlock = interpreter.newNode() as Acorn.BlockStatement;
  const scope = interpreter.createScope(codeBlock, interpreter.getScope());
  codeBlock.type = "BlockStatement";
  codeBlock.body = [];
  // TODO: avoid polliting the global scope with enumerable properties here.
  // Properties should be self-contained and put in a non-enumerable descriptor.
  let cascadeBinding: string | undefined;
  const cascadeBindings: string[] = [];
  let returnBinding = funcs.some((f) => f.returnValue)
    ? `__internals_rv_${shortid()}`
    : null;
  for (const func of funcs) {
    let funcBinding: string | undefined;
    if (func.native) {
      const pseudoWrapper = interpreter.createNativeFunction(func.native);
      funcBinding = `__internals_nb_${shortid()}`;
      interpreter.setProperty(scope.object, funcBinding, pseudoWrapper);
    }
    if (func.nativeAsync) {
      const inner = func.nativeAsync;
      const wrapper = async (callback: (result: unknown) => void) => {
        callback(await inner());
      };
      const pseudoWrapper = interpreter.createAsyncFunction(wrapper);
      funcBinding = `__internals_na_${shortid()}`;
      interpreter.setProperty(scope.object, funcBinding, pseudoWrapper);
    }
    if (func.pseudo) {
      funcBinding = `__internals_nf_${shortid()}`;
      interpreter.setProperty(scope.object, funcBinding, func.pseudo);
    }
    if (!funcBinding) continue;
    const funcCallNode = interpreter.newNode() as Acorn.CallExpression;
    funcCallNode.type = "CallExpression";
    funcCallNode.arguments = [];
    if (cascadeBinding) {
      const identifier = interpreter.newNode() as Acorn.Identifier;
      identifier.type = "Identifier";
      identifier.name = cascadeBinding;
      funcCallNode.arguments.push(identifier);
      cascadeBinding = undefined;
    } else {
      for (const param of params) {
        const identifier = interpreter.newNode() as Acorn.Identifier;
        identifier.type = "Identifier";
        identifier.name = param;
        funcCallNode.arguments.push(identifier);
      }
    }
    funcCallNode.callee = interpreter.newNode() as Acorn.Identifier;
    funcCallNode.callee.type = "Identifier";
    funcCallNode.callee.name = funcBinding;
    if (!func.cascade && !func.returnValue) {
      const expressionNode = interpreter.newNode() as Acorn.ExpressionStatement;
      expressionNode.type = "ExpressionStatement";
      expressionNode.expression = funcCallNode;
      codeBlock.body.push(expressionNode);
      continue;
    }
    if (func.cascade) {
      cascadeBinding = `__internals_c_${shortid()}`;
      cascadeBindings.push(cascadeBinding);
    }
    const varDecs = interpreter.newNode() as Acorn.VariableDeclaration;
    varDecs.type = "VariableDeclaration";
    varDecs.kind = "var";
    varDecs.declarations = [];
    const varDec = interpreter.newNode() as unknown as Acorn.VariableDeclarator;
    varDec.type = "VariableDeclarator";
    varDec.id = interpreter.newNode() as Acorn.Identifier;
    varDec.id.type = "Identifier";
    varDec.id.name = cascadeBinding ?? returnBinding ?? "_result_";
    varDec.init = funcCallNode;
    varDecs.declarations.push(varDec);
    interpreter.setProperty(
      scope.object,
      cascadeBinding ?? returnBinding ?? "_result_",
      undefined,
      Interpreter.VARIABLE_DESCRIPTOR
    );
    codeBlock.body.push(varDecs);
  }
  if (cascadeBinding ?? returnBinding) {
    const returnStatement = interpreter.newNode() as Acorn.ReturnStatement;
    returnStatement.type = "ReturnStatement";
    returnStatement.argument = interpreter.newNode() as Acorn.Identifier;
    returnStatement.argument.type = "Identifier";
    returnStatement.argument.name =
      cascadeBinding ?? returnBinding ?? "_result_";
    codeBlock.body.push(returnStatement);
  }
  const outerFuncNode = interpreter.newNode() as Acorn.FunctionExpression;
  outerFuncNode.type = "FunctionExpression";
  outerFuncNode.body = codeBlock;
  outerFuncNode.params = [];
  for (const param of params) {
    const identifier = interpreter.newNode() as Acorn.Identifier;
    identifier.type = "Identifier";
    identifier.name = param;
    outerFuncNode.params.push(identifier);
  }
  return [
    interpreter.createFunction(
      outerFuncNode,
      scope,
      "_if_you_can_read_this_you_won_congrats_"
    ),
    scope
  ];
}

export function immediatelyPerformHybridFunction(
  runner: JSRunnerAPI,
  funcs: HybridFunctionSpecifier[],
  args: InterpreterPseudoValue[]
) {
  const _interpreter = runner.interpreter;
  const argNames = [];
  for (let i = 0; i < args.length; i++) {
    argNames.push(`arg${i}`);
  }
  const [hybridFunc, scope] = constructHybridFunction(runner, funcs, argNames);
  pushInterpreterFunctionCall(runner, hybridFunc, args, scope);
}

export function addAsyncCall(
  runner: JSRunnerAPI,
  func: InterpreterFunction,
  args: InterpreterPseudoValue[],
  scopeIn?: InterpreterScope
) {
  const interpreter = runner.interpreter;
  const funcCallNode = interpreter.newNode() as Acorn.CallExpression;
  funcCallNode.type = "CallExpression";

  const parentScope = scopeIn ?? interpreter.getGlobalScope();
  const scope = interpreter.createScope(funcCallNode, parentScope);

  const task = new Interpreter.Task(func, args, scope, funcCallNode, -1);
  interpreter.scheduleTask_(task, 0);
}
