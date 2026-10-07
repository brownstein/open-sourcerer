import * as acorn from "acorn";
import Interpreter, { InterpreterObject } from "js-interpreter";

export type ASTNode = acorn.AnyNode;

export function isPrimitiveValue(
  value: unknown
): value is boolean | number | string | undefined | null {
  switch (typeof value) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return true;
    case "object":
      return value === null;
    default:
      return false;
  }
}

export function isConstructor(value: unknown): value is {
  new (...args: unknown[]): unknown;
} {
  if (typeof value !== "function") return false;
  return !!value.prototype && value.prototype.constructor === value;
}

export function isPseudoObject(value: unknown): value is InterpreterObject {
  if (isPrimitiveValue(value)) return false;
  return true;
}

export function zeroASTLocations(node: unknown) {
  if (isPrimitiveValue(node)) return;
  if (Array.isArray(node)) {
    for (const subNode of node) zeroASTLocations(subNode);
    return;
  }
  const nodeObj = node as Record<string, unknown>;
  if ("start" in nodeObj && typeof nodeObj.start === "number")
    nodeObj.start = 0;
  if ("end" in nodeObj && typeof nodeObj.end === "number") nodeObj.end = 0;
  for (const propertyKey in nodeObj) {
    if (!Object.hasOwn(nodeObj, propertyKey)) continue;
    const property = nodeObj[propertyKey];
    zeroASTLocations(property);
  }
}

export function traverseAST(node: unknown, callback: (node: unknown) => void) {
  if (isPrimitiveValue(node)) return;
  if (Array.isArray(node)) {
    for (const subNode of node) traverseAST(subNode, callback);
    return;
  }
  const nodeObj = node as Record<string, unknown>;
  if ("start" in nodeObj && "end" in nodeObj && "loc" in nodeObj)
    callback(node);
  for (const propertyKey in nodeObj) {
    if (!Object.hasOwn(nodeObj, propertyKey)) continue;
    const property = nodeObj[propertyKey];
    traverseAST(property, callback);
  }
}

export function cloneAST(node: unknown): unknown {
  if (isPrimitiveValue(node)) return node;
  if (Array.isArray(node)) {
    return node.map(cloneAST);
  }
  const nodeObj = node as Record<string, unknown>;
  const clonedNode: Record<string, unknown> = {};
  for (const propertyKey in nodeObj) {
    if (!Object.hasOwn(nodeObj, propertyKey)) continue;
    const property = nodeObj[propertyKey];
    clonedNode[propertyKey] = cloneAST(property);
  }
  return clonedNode;
}

export function buildSourceLocationMap(code: string) {
  const posToLine: number[] = [];
  let line = 0;
  for (let si = 0; si < code.length; si++) {
    const char = code[si];
    switch (char) {
      case "\n":
      case "\r":
        line++;
        break;
      default:
        break;
    }
    posToLine.push(line);
  }
  return posToLine;
}

export const delay = (timeout: number) =>
  new Promise((resolve) => setTimeout(resolve, timeout));

// Helper for interactive console usage.
export function wrapLastProgramExpressionInConsoleLog(program: acorn.Program) {
  let lastExpressionIndex = -1;
  for (let bi = 0; bi < program.body.length; bi++) {
    const bodyNode = program.body[bi];
    if (bodyNode.type === "ExpressionStatement") {
      lastExpressionIndex = bi;
    }
  }
  if (lastExpressionIndex === -1) return false;
  const lastExpression = program.body[
    lastExpressionIndex
  ] as acorn.ExpressionStatement;
  const consoleLog: acorn.ExpressionStatement = {
    type: "ExpressionStatement",
    start: 0,
    end: 0,
    expression: {
      type: "CallExpression",
      start: 0,
      end: 0,
      callee: {
        computed: false,
        type: "MemberExpression",
        start: 0,
        end: 0,
        object: {
          type: "Identifier",
          start: 0,
          end: 0,
          name: "console"
        },
        property: {
          type: "Identifier",
          start: 0,
          end: 0,
          name: "log"
        },
        optional: false
      },
      arguments: [lastExpression.expression],
      optional: false
    }
  };
  program.body[lastExpressionIndex] = consoleLog;
  return true;
}

// There's a bug in the `unwind` method of JS interpreter. This replaces
// the function with a working version.
export function patchUnwindReturnBug() {
  /**
   * Unwind the stack to the innermost relevant enclosing TryStatement,
   * For/ForIn/WhileStatement or Call/NewExpression.  If this results in
   * the stack being completely unwound the thread will be terminated
   * and the appropriate error being thrown.
   * @param {Interpreter.Completion} type Completion type.
   * @param {Interpreter.Value} value Value computed, returned or thrown.
   * @param {string|undefined} label Target label for break or return.
   */
  Interpreter.prototype.unwind = function (type, value, label) {
    if (type === Interpreter.Completion.NORMAL) {
      throw TypeError("Should not unwind for NORMAL completions");
    }

    loop: for (var stack = this.stateStack; stack.length > 0; stack.pop()) {
      var state = stack[stack.length - 1];
      switch (state.node.type) {
        case "TryStatement":
          state.cv = { type: type, value: value, label: label };
          return;
        case "CallExpression":
        case "NewExpression":
          if (type === Interpreter.Completion.RETURN) {
            state.value = value;
            return;
          } else if (type !== Interpreter.Completion.THROW) {
            throw Error("Unsyntactic break/continue not rejected by Acorn");
          }
          break;
        case "Program":
          // Don't pop the stateStack.
          // Leave the root scope on the tree in case the program is appended to.
          state.done = true;
          if (type === Interpreter.Completion.RETURN) return;
          break loop;
      }
      if (type === Interpreter.Completion.BREAK) {
        if (
          label
            ? state.labels && state.labels.indexOf(label) !== -1
            : state.isLoop || state.isSwitch
        ) {
          stack.pop();
          return;
        }
      } else if (type === Interpreter.Completion.CONTINUE) {
        if (
          label
            ? state.labels && state.labels.indexOf(label) !== -1
            : state.isLoop
        ) {
          return;
        }
      }
    }

    // Unhandled completion.  Throw a real error.
    var realError;
    if (this.isa(value, this.ERROR)) {
      var errorTable: Record<string, ErrorConstructor> = {
        EvalError: EvalError,
        RangeError: RangeError,
        ReferenceError: ReferenceError,
        SyntaxError: SyntaxError,
        TypeError: TypeError,
        URIError: URIError
      };
      var name = String(
        this.getProperty(value as InterpreterObject, "name")
      ) as string;
      var message = (
        this.getProperty(value as InterpreterObject, "message") as string
      ).valueOf();
      var errorConstructor = errorTable[name] || Error;
      realError = errorConstructor(message);
      realError.stack = String(
        this.getProperty(value as InterpreterObject, "stack")
      );
    } else {
      realError = String(value);
    }
    // Attach AST node positions representing the call stack at the point
    // of the error, mirroring populateError's frame selection: the
    // innermost node with a position (the error site), then each
    // CallExpression up the stack (the call chain).
    if (realError instanceof Error) {
      var astPositions = [];
      for (var i = this.stateStack.length - 1; i >= 0; i--) {
        var node = this.stateStack[i].node;
        if (
          node.start > 0 &&
          node.end > 0 &&
          (!astPositions.length || node.type === "CallExpression")
        ) {
          astPositions.push([node.start, node.end]);
        }
      }
      if (astPositions.length > 0) {
        (realError as any).__astPositions = astPositions;
      }
    }
    // Overwrite the previous (more or less random) interpreter return value.
    // Replace it with the error.
    this.value = realError;
    throw realError;
  };
}

const expressionTypeNames: Set<string> = new Set<acorn.Expression["type"]>([
  "Identifier",
  "Literal",
  "ThisExpression",
  "ArrayExpression",
  "ObjectExpression",
  "FunctionExpression",
  "UnaryExpression",
  "UpdateExpression",
  "BinaryExpression",
  "AssignmentExpression",
  "LogicalExpression",
  "MemberExpression",
  "ConditionalExpression",
  "CallExpression",
  "NewExpression",
  "SequenceExpression",
  "ArrowFunctionExpression",
  "YieldExpression",
  "TemplateLiteral",
  "TaggedTemplateExpression",
  "ClassExpression",
  "MetaProperty",
  "AwaitExpression",
  "ChainExpression",
  "ImportExpression",
  "ParenthesizedExpression"
]);

export function isExpression(node: acorn.Node): node is acorn.Expression {
  return expressionTypeNames.has(node.type);
}

const moduleDeclarationTypeNames: Set<string> = new Set<
  acorn.ModuleDeclaration["type"]
>([
  "ImportDeclaration",
  "ExportAllDeclaration",
  "ExportDefaultDeclaration",
  "ExportNamedDeclaration"
]);

export function isModuleDeclaration(
  node: acorn.Node
): node is acorn.ModuleDeclaration {
  return moduleDeclarationTypeNames.has(node.type);
}

const statementTypeNames: Set<string> = new Set<acorn.Statement["type"]>([
  "BlockStatement",
  "BreakStatement",
  "ClassDeclaration",
  "ContinueStatement",
  "DebuggerStatement",
  "DoWhileStatement",
  "EmptyStatement",
  "ExpressionStatement",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "FunctionDeclaration",
  "IfStatement",
  "LabeledStatement",
  "ReturnStatement",
  "SwitchStatement",
  "ThrowStatement",
  "TryStatement",
  "VariableDeclaration",
  "WhileStatement",
  "WithStatement"
]);

export function isStatement(node: acorn.Node): node is acorn.Statement {
  return statementTypeNames.has(node.type);
}
