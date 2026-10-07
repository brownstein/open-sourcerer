import * as Acorn from "acorn";
import Interpreter, {
  InterpreterFunction,
  InterpreterPseudoValue,
  InterpreterScope
} from "js-interpreter";

import { BaseExternalContext, JSRunnerAPI } from "./api";
import { transpileToES5 } from "./transpile";
import { zeroASTLocations } from "./util";

export function pushFunctionCall(
  runner: JSRunnerAPI<BaseExternalContext>,
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

export async function processES6ModuleRequire(
  runner: JSRunnerAPI<BaseExternalContext>,
  moduleName: string,
  moduleSource: string
) {
  const { interpreter } = runner;
  const transpiled = await transpileToES5(moduleSource);
  const transpiledAST = transpiled.transpiledAST;
  zeroASTLocations(transpiledAST);

  // Construct module body.
  const moduleBody = transpiledAST.body;
  const moduleCodeBlockNode = interpreter.newNode() as Acorn.BlockStatement;
  moduleCodeBlockNode.type = "BlockStatement";
  moduleCodeBlockNode.body = moduleBody.filter((node) => {
    if (node.type === "ImportDeclaration") return false;
    if (node.type === "ReturnStatement") return false;
    return true;
  }) as Acorn.Statement[];

  // Construct module scope.
  const currentScope = interpreter.getScope();
  const moduleScope = interpreter.createScope(
    moduleCodeBlockNode,
    currentScope
  );

  // Populate module and module.exports in module scope.
  interpreter.setProperty(
    moduleScope.object,
    "module",
    interpreter.nativeToPseudo({
      exports: {},
      name: moduleName
    })
  );

  // Prepare a return statement and add it at the end of the block statement body.
  const exportsIdentifierNode = interpreter.newNode() as Acorn.Identifier;
  exportsIdentifierNode.type = "Identifier";
  exportsIdentifierNode.name = "exports";
  const moduleIdentifierNode = interpreter.newNode() as Acorn.Identifier;
  moduleIdentifierNode.type = "Identifier";
  moduleIdentifierNode.name = "module";
  const moduleExportsExpression =
    interpreter.newNode() as Acorn.MemberExpression;
  moduleExportsExpression.type = "MemberExpression";
  moduleExportsExpression.object = moduleIdentifierNode;
  moduleExportsExpression.property = exportsIdentifierNode;
  const returnStatement = interpreter.newNode() as Acorn.ReturnStatement;
  returnStatement.type = "ReturnStatement";
  returnStatement.argument = moduleExportsExpression;
  moduleCodeBlockNode.body.push(returnStatement);

  // Turn all that into a function expression.
  const wrapperFuncNode = interpreter.newNode() as Acorn.FunctionExpression;
  wrapperFuncNode.type = "FunctionExpression";
  wrapperFuncNode.body = moduleCodeBlockNode;
  wrapperFuncNode.params = [];

  // Create the InterpreterFunction.
  const pseudoFunc = interpreter.createFunction(
    wrapperFuncNode,
    moduleScope,
    moduleName
  );

  // Push the function call onto the stack for immediate execution.
  pushFunctionCall(runner, pseudoFunc, [], moduleScope);
}
