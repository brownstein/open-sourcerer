import * as acorn from "acorn";

type CB = (node: acorn.AnyNode, parent: acorn.AnyNode | null) => void;

/**
 * This is a utility to fully traverse an Acorn program tree with a callback.
 */
export function recurseIntoAcornProgram(cb: CB, program: acorn.Program) {
  cb(program, null);
  recurseBody(cb, program);
}

function recurseBody(cb: CB, node: acorn.Program | acorn.BlockStatement) {
  for (const line of node.body) {
    cb(line, node);
    switch (line.type) {
      case "ImportDeclaration":
      case "ExportAllDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportNamedDeclaration":
        break;
      default:
        recurseStatement(cb, line);
        break;
    }
  }
}

function recurseStatement(cb: CB, node: acorn.Statement) {
  switch (node.type) {
    case "BlockStatement":
      recurseBody(cb, node);
      break;
    case "BreakStatement":
    case "ContinueStatement":
    case "DebuggerStatement":
    case "EmptyStatement":
      break;
    case "ClassDeclaration":
      recurseClassDeclaration(cb, node);
      break;
    case "DoWhileStatement":
      cb(node.test, node);
      recurseExpression(cb, node.test);
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
    case "ExpressionStatement":
      cb(node.expression, node);
      recurseExpression(cb, node.expression);
      break;
    case "ForInStatement":
    case "ForOfStatement":
      cb(node.left, node);
      if (node.left.type === "VariableDeclaration") {
        recurseVariableDeclaration(cb, node.left);
      } else {
        recursePattern(cb, node.left);
      }
      cb(node.right, node);
      recurseExpression(cb, node.right);
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
    case "ForStatement":
      if (node.init) {
        cb(node.init, node);
        if (node.init.type === "VariableDeclaration") {
          recurseVariableDeclaration(cb, node.init);
        } else {
          recurseExpression(cb, node.init);
        }
      }
      if (node.test) {
        cb(node.test, node);
        recurseExpression(cb, node.test);
      }
      if (node.update) {
        cb(node.update, node);
        recurseExpression(cb, node.update);
      }
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
    case "FunctionDeclaration":
      cb(node.id, node);
      for (const param of node.params) {
        cb(param, node);
        recursePattern(cb, param);
      }
      cb(node.body, node);
      recurseBody(cb, node.body);
      break;
    case "IfStatement":
      cb(node.test, node);
      recurseExpression(cb, node.test);
      cb(node.consequent, node);
      recurseStatement(cb, node.consequent);
      if (node.alternate) {
        cb(node.alternate, node);
        recurseStatement(cb, node.alternate);
      }
      break;
    case "WhileStatement":
      cb(node.test, node);
      recurseExpression(cb, node.test);
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
    case "LabeledStatement":
      cb(node.label, node);
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
    case "ReturnStatement":
      if (node.argument) {
        cb(node.argument, node);
        recurseExpression(cb, node.argument);
      }
      break;
    case "SwitchStatement":
      cb(node.discriminant, node);
      recurseExpression(cb, node.discriminant);
      for (const switchCase of node.cases) {
        cb(switchCase, node);
        if (switchCase.test) {
          cb(switchCase.test, switchCase);
          recurseExpression(cb, switchCase.test);
        }
        if (switchCase.consequent) {
          for (const consequent of switchCase.consequent) {
            cb(consequent, switchCase);
            recurseStatement(cb, consequent);
          }
        }
      }
      break;
    case "ThrowStatement":
      cb(node.argument, node);
      recurseExpression(cb, node.argument);
      break;
    case "TryStatement":
      cb(node.block, node);
      recurseBody(cb, node.block);
      if (node.handler) {
        cb(node.handler, node);
        if (node.handler.param) {
          cb(node.handler.param, node.handler);
          recursePattern(cb, node.handler.param);
        }
        cb(node.handler.body, node.handler);
        recurseBody(cb, node.handler.body);
      }
      if (node.finalizer) {
        cb(node.finalizer, node);
        recurseBody(cb, node.finalizer);
      }
      break;
    case "VariableDeclaration":
      recurseVariableDeclaration(cb, node);
      break;
    case "WithStatement":
      cb(node.object, node);
      recurseExpression(cb, node.object);
      cb(node.body, node);
      recurseStatement(cb, node.body);
      break;
  }
}

function recurseExpression(cb: CB, node: acorn.Expression) {
  switch (node.type) {
    case "ArrayExpression":
      for (const element of node.elements) {
        if (!element) continue;
        cb(element, node);
        if (element.type === "SpreadElement") {
          recurseSpreadElement(cb, element);
          continue;
        }
        recurseExpression(cb, element);
      }
      break;
    case "FunctionExpression":
    case "ArrowFunctionExpression":
      if (node.id) cb(node.id, node);
      if (node.body) {
        cb(node.body, node);
        if (node.body.type === "BlockStatement") {
          recurseBody(cb, node.body);
        } else {
          recurseExpression(cb, node.body);
        }
      }
      break;
    case "AssignmentExpression":
      cb(node.left, node);
      recursePattern(cb, node.left);
      cb(node.right, node);
      recurseExpression(cb, node.right);
      break;
    case "AwaitExpression":
      recurseExpression(cb, node.argument);
      break;
    case "BinaryExpression":
      cb(node.left, node);
      if (node.left.type !== "PrivateIdentifier")
        recurseExpression(cb, node.left);
      cb(node.right, node);
      recurseExpression(cb, node.right);
      break;
    case "NewExpression":
    case "CallExpression":
      cb(node.callee, node);
      if (node.callee.type !== "Super") recurseExpression(cb, node.callee);
      for (const arg of node.arguments) {
        if (!arg) continue;
        cb(arg, node);
        if (arg.type === "SpreadElement") {
          recurseSpreadElement(cb, arg);
        } else {
          recurseExpression(cb, arg);
        }
      }
      break;
    case "ChainExpression":
      cb(node.expression, node);
      recurseExpression(cb, node.expression);
      break;
    case "ClassExpression":
      if (node.id) cb(node.id, node);
      cb(node.body, node);
      recurseClassBody(cb, node.body);
      if (node.superClass) {
        cb(node.superClass, node);
        recurseExpression(cb, node.superClass);
      }
      break;
    case "ConditionalExpression":
      cb(node.test, node);
      recurseExpression(cb, node.test);
      cb(node.consequent, node);
      recurseExpression(cb, node.consequent);
      cb(node.alternate, node);
      recurseExpression(cb, node.alternate);
      break;
    case "Identifier":
    case "Literal":
    case "ImportExpression":
    case "ThisExpression":
    case "YieldExpression":
      break;
    case "LogicalExpression":
      cb(node.left, node);
      recurseExpression(cb, node.left);
      cb(node.right, node);
      recurseExpression(cb, node.right);
      break;
    case "MemberExpression":
      cb(node.object, node);
      if (node.object.type !== "Super") recurseExpression(cb, node.object);
      cb(node.property, node);
      if (node.property.type !== "PrivateIdentifier")
        recurseExpression(cb, node.property);
      break;
    case "MetaProperty":
      break;
    case "ObjectExpression":
      for (const prop of node.properties) {
        cb(prop, node);
        if (prop.type === "SpreadElement") {
          recurseExpression(cb, prop.argument);
        } else {
          cb(prop.key, prop);
          recurseExpression(cb, prop.key);
          cb(prop.value, prop);
          recurseExpression(cb, prop.value);
        }
      }
      break;
    case "ParenthesizedExpression":
      cb(node.expression, node);
      recurseExpression(cb, node.expression);
      break;
    case "SequenceExpression":
      for (const exp of node.expressions) {
        cb(exp, node);
        recurseExpression(cb, exp);
      }
      break;
    case "TaggedTemplateExpression":
      cb(node.tag, node);
      recurseExpression(cb, node.tag);
      cb(node.quasi, node);
      for (const exp of node.quasi.expressions) {
        cb(exp, node);
        recurseExpression(cb, exp);
      }
      break;
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        cb(quasi, node);
      }
      for (const exp of node.expressions) {
        cb(exp, node);
        recurseExpression(cb, exp);
      }
      break;
    case "UnaryExpression":
    case "UpdateExpression":
      cb(node.argument, node);
      recurseExpression(cb, node.argument);
      break;
  }
}

function recursePattern(cb: CB, node: acorn.Pattern) {
  switch (node.type) {
    case "ArrayPattern":
      for (const element of node.elements) {
        if (!element) continue;
        cb(element, node);
        recursePattern(cb, element);
      }
      break;
    case "AssignmentPattern":
      cb(node.left, node);
      recursePattern(cb, node.left);
      cb(node.right, node);
      recurseExpression(cb, node.right);
      break;
    case "Identifier":
      break;
    case "MemberExpression":
      cb(node.object, node);
      if (node.object.type !== "Super") recurseExpression(cb, node.object);
      cb(node.property, node);
      if (node.property.type !== "PrivateIdentifier")
        recurseExpression(cb, node.property);
      break;
    case "ObjectPattern":
      for (const prop of node.properties) {
        cb(prop, node);
        if (prop.type === "RestElement") {
          recursePattern(cb, prop);
        } else {
          cb(prop.key, prop);
          recurseExpression(cb, prop.key);
          cb(prop.value, prop);
          recursePattern(cb, prop.value);
        }
      }
      break;
    case "RestElement":
      cb(node.argument, node);
      recursePattern(cb, node.argument);
      break;
  }
}

function recurseVariableDeclaration(cb: CB, node: acorn.VariableDeclaration) {
  for (const decl of node.declarations) {
    cb(decl, node);
    cb(decl.id, decl);
    recursePattern(cb, decl.id);
    if (decl.init) {
      cb(decl.init, decl);
      recurseExpression(cb, decl.init);
    }
  }
}

function recurseClassDeclaration(cb: CB, node: acorn.ClassDeclaration) {
  cb(node.id, node);
  if (node.superClass) {
    cb(node.superClass, node);
    recurseExpression(cb, node.superClass);
  }
  cb(node.body, node);
  recurseClassBody(cb, node.body);
}

function recurseClassBody(cb: CB, node: acorn.ClassBody) {
  for (const line of node.body) {
    cb(line, node);
    switch (line.type) {
      case "MethodDefinition":
        cb(line.key, line);
        if (line.key.type !== "PrivateIdentifier")
          recurseExpression(cb, line.key);
        cb(line.value, line);
        recurseExpression(cb, line.value);
        break;
      case "PropertyDefinition":
        cb(line.key, line);
        if (line.key.type !== "PrivateIdentifier")
          recurseExpression(cb, line.key);
        if (line.value) {
          cb(line.value, line);
          recurseExpression(cb, line.value);
        }
        break;
      case "StaticBlock":
        for (const bodyLine of line.body) {
          cb(bodyLine, line);
          recurseStatement(cb, bodyLine);
        }
        break;
    }
  }
}

function recurseSpreadElement(cb: CB, node: acorn.SpreadElement) {
  cb(node.argument, node);
  recurseExpression(cb, node.argument);
}
