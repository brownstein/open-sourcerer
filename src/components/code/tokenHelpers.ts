import * as acorn from "acorn";

export type TokenType = {
  start: number;
  end: number;
  content: string;
  src: acorn.Token;
  astPath: acorn.AnyNode[];
};
export type CommentType = { isComment: true; start: number; end: number };
export type TokenOrCommentType = TokenType | CommentType | null;

export function isTokenType(node: TokenOrCommentType): node is TokenType {
  if (node === null || node === undefined) return false;
  return !(node as CommentType).isComment;
}

export function isCommentType(node: TokenOrCommentType): node is CommentType {
  if (node === null || node === undefined) return false;
  return !!(node as CommentType).isComment;
}

export function tokenizeCode(code: string): TokenOrCommentType[] {
  const result: TokenOrCommentType[] = new Array(code.length);
  result.fill(null);

  let offset = 0;

  const tokenizer = acorn.tokenizer(code, {
    ecmaVersion: 2025,
    onComment: (_isBlock, _text, start, end) => {
      const comment: CommentType = {
        start,
        end,
        isComment: true
      };
      for (let i = start; i < end; i++) {
        result[i] = comment;
      }
      offset = end;
    }
  });

  for (const token of tokenizer) {
    const resultToken: TokenType = {
      start: token.start,
      end: token.end,
      content: code.slice(token.start, token.end),
      src: token,
      astPath: []
    };
    for (let i = token.start; i < token.end; i++) {
      result[i] = resultToken;
    }
    offset = token.end;
  }

  parseAndAddNodes(code, result);

  return result;
}

function parseAndAddNodes(code: string, result: TokenOrCommentType[]) {
  const parsed = acorn.parse(code, {
    ecmaVersion: 2025
  });
  addBodyAnnotation(result, parsed);
}

type TOKS = TokenOrCommentType[];

function applyNodePaths(result: TOKS, node: acorn.AnyNode) {
  let index = node.start;
  while (index < node.end) {
    const tokenOrComment = result[index];
    if (!tokenOrComment) {
      index++;
      continue;
    }
    if (isCommentType(tokenOrComment)) {
      index = tokenOrComment.end;
      continue;
    }
    tokenOrComment.astPath.push(node);
    index = tokenOrComment.end;
  }
}

// TODO(brownstein) use acornUtils for this to avoid duplication.

function addBodyAnnotation(
  result: TOKS,
  node: acorn.Program | acorn.BlockStatement
) {
  applyNodePaths(result, node);
  for (const line of node.body) {
    switch (line.type) {
      case "ImportDeclaration":
      case "ExportAllDeclaration":
      case "ExportDefaultDeclaration":
      case "ExportNamedDeclaration":
        break;
      default:
        addStatementAnnotation(result, line);
        break;
    }
  }
}

function addStatementAnnotation(result: TOKS, node: acorn.Statement) {
  switch (node.type) {
    case "BlockStatement":
      addBodyAnnotation(result, node);
      break;
    case "ContinueStatement":
    case "BreakStatement":
    case "DebuggerStatement":
    case "EmptyStatement":
      applyNodePaths(result, node);
      break;
    case "ClassDeclaration":
      addClassAnnotation(result, node);
      break;
    case "DoWhileStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.test);
      addStatementAnnotation(result, node.body);
      break;
    case "ExpressionStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.expression);
      break;
    case "ForInStatement":
    case "ForOfStatement":
      applyNodePaths(result, node);
      if (node.left.type === "VariableDeclaration") {
        addVariableDeclarationStatement(result, node.left);
      } else {
        addPatternAnnotation(result, node.left);
      }
      addExpressionAnnotation(result, node.right);
      addStatementAnnotation(result, node.body);
      break;
    case "ForStatement":
      applyNodePaths(result, node);
      if (node.init) {
        if (node.init.type === "VariableDeclaration") {
          addVariableDeclarationStatement(result, node.init);
        } else {
          addExpressionAnnotation(result, node.init);
        }
      }
      if (node.test) addExpressionAnnotation(result, node.test);
      if (node.update) addExpressionAnnotation(result, node.update);
      addStatementAnnotation(result, node.body);
      break;
    case "FunctionDeclaration":
      applyNodePaths(result, node);
      addIdentifierAnnotation(result, node.id);
      addBlockStatementAnnotation(result, node.body);
      for (const param of node.params) {
        addPatternAnnotation(result, param);
      }
      break;
    case "IfStatement":
    case "WhileStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.test);
      break;
    case "LabeledStatement":
      applyNodePaths(result, node);
      addIdentifierAnnotation(result, node.label);
      addStatementAnnotation(result, node.body);
      break;
    case "ReturnStatement":
      applyNodePaths(result, node);
      if (node.argument) addExpressionAnnotation(result, node.argument);
      break;
    case "SwitchStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.discriminant);
      for (const switchCase of node.cases) {
        applyNodePaths(result, switchCase);
        if (switchCase.test) addExpressionAnnotation(result, switchCase.test);
        if (switchCase.consequent) {
          for (const cons of switchCase.consequent) {
            addStatementAnnotation(result, cons);
          }
        }
      }
      break;
    case "ThrowStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.argument);
      break;
    case "TryStatement":
      applyNodePaths(result, node);
      addBodyAnnotation(result, node.block);
      if (node.finalizer) addBodyAnnotation(result, node.finalizer);
      if (node.handler) {
        applyNodePaths(result, node.handler);
        if (node.handler.param)
          addPatternAnnotation(result, node.handler.param);
        addBodyAnnotation(result, node.handler.body);
      }
      break;
    case "VariableDeclaration":
      addVariableDeclarationStatement(result, node);
      break;
    case "WithStatement":
      applyNodePaths(result, node);
      addExpressionAnnotation(result, node.object);
      addStatementAnnotation(result, node.body);
      break;
    default:
      break;
  }
}

function addVariableDeclarationStatement(
  result: TOKS,
  node: acorn.VariableDeclaration
) {
  applyNodePaths(result, node);
  for (const decl of node.declarations) {
    applyNodePaths(result, decl);
    addPatternAnnotation(result, decl.id);
    if (decl.init) addExpressionAnnotation(result, decl.init);
  }
}

function addExpressionAnnotation(result: TOKS, node: acorn.Expression) {
  applyNodePaths(result, node);
  switch (node.type) {
    case "ArrayExpression": {
      for (const element of node.elements) {
        if (!element) continue;
        if (element.type === "SpreadElement") {
          addSpreadElementAnnotation(result, element);
        } else {
          addExpressionAnnotation(result, element);
        }
      }
      break;
    }
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      if (node.id) addIdentifierAnnotation(result, node.id);
      if (node.body) {
        if (node.body.type === "BlockStatement") {
          addBlockStatementAnnotation(result, node.body);
        } else {
          addExpressionAnnotation(result, node.body);
        }
      }
      break;
    }
    case "AssignmentExpression":
      addPatternAnnotation(result, node.left);
      addExpressionAnnotation(result, node.right);
      break;
    case "AwaitExpression":
      addExpressionAnnotation(result, node.argument);
      break;
    case "BinaryExpression":
      if (node.left.type === "PrivateIdentifier") {
        applyNodePaths(result, node.left);
      } else {
        addExpressionAnnotation(result, node.left);
      }
      addExpressionAnnotation(result, node.right);
      break;
    case "NewExpression":
    case "CallExpression":
      if (node.callee.type === "Super") {
        applyNodePaths(result, node.callee);
      } else {
        addExpressionAnnotation(result, node.callee);
      }
      for (const arg of node.arguments) {
        if (!arg) continue;
        if (arg.type === "SpreadElement") {
          addExpressionAnnotation(result, arg.argument);
        } else {
          addExpressionAnnotation(result, arg);
        }
      }
      break;
    case "ChainExpression":
      addExpressionAnnotation(result, node.expression);
      break;
    case "ClassExpression":
      if (node.id) addIdentifierAnnotation(result, node.id);
      addClassBodyAnnotation(result, node.body);
      if (node.superClass) addExpressionAnnotation(result, node.superClass);
      break;
    case "ConditionalExpression":
      addExpressionAnnotation(result, node.test);
      addExpressionAnnotation(result, node.consequent);
      addExpressionAnnotation(result, node.alternate);
      break;
    case "Identifier":
    case "Literal":
      break;
    case "ImportExpression":
      break;
    case "LogicalExpression":
      addExpressionAnnotation(result, node.left);
      addExpressionAnnotation(result, node.right);
      break;
    case "MemberExpression":
      if (node.object.type === "Super") {
        applyNodePaths(result, node.object);
      } else {
        addExpressionAnnotation(result, node.object);
      }
      if (node.property.type === "PrivateIdentifier") {
        applyNodePaths(result, node.property);
      } else {
        addExpressionAnnotation(result, node.property);
      }
      break;
    case "MetaProperty":
      addIdentifierAnnotation(result, node.property);
      break;
    case "ObjectExpression":
      for (const prop of node.properties) {
        applyNodePaths(result, prop);
        if (prop.type === "SpreadElement") {
          addExpressionAnnotation(result, prop.argument);
        } else {
          addExpressionAnnotation(result, prop.key);
          addExpressionAnnotation(result, prop.value);
        }
      }
      break;
    case "ParenthesizedExpression":
      addExpressionAnnotation(result, node.expression);
      break;
    case "SequenceExpression":
      for (const exp of node.expressions) addExpressionAnnotation(result, exp);
      break;
    case "TaggedTemplateExpression":
      addExpressionAnnotation(result, node.tag);
      applyNodePaths(result, node.quasi);
      for (const exp of node.quasi.expressions) {
        addExpressionAnnotation(result, exp);
      }
      break;
    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        applyNodePaths(result, quasi);
      }
      for (const exp of node.expressions) {
        addExpressionAnnotation(result, exp);
      }
      break;
    case "ThisExpression":
      break;
    case "UnaryExpression":
      addExpressionAnnotation(result, node.argument);
      break;
    case "UpdateExpression":
      addExpressionAnnotation(result, node.argument);
      break;
    case "YieldExpression":
      break;
  }
}

function addPatternAnnotation(result: TOKS, node: acorn.Pattern) {
  applyNodePaths(result, node);
  switch (node.type) {
    case "ArrayPattern":
      for (const element of node.elements) {
        if (!element) continue;
        addPatternAnnotation(result, element);
      }
      break;
    case "AssignmentPattern":
      addPatternAnnotation(result, node.left);
      addExpressionAnnotation(result, node.right);
      break;
    case "Identifier":
      break;
    case "MemberExpression":
      if (node.object.type === "Super") {
        applyNodePaths(result, node.object);
      } else {
        addExpressionAnnotation(result, node.object);
      }
      if (node.property.type === "PrivateIdentifier") {
        applyNodePaths(result, node.property);
      } else {
        addExpressionAnnotation(result, node.property);
      }
      break;
    case "ObjectPattern":
      for (const prop of node.properties) {
        if (prop.type === "RestElement") {
          addPatternAnnotation(result, prop);
        } else {
          applyNodePaths(result, prop);
          addExpressionAnnotation(result, prop.key);
          addPatternAnnotation(result, prop.value);
        }
      }
      break;
    case "RestElement":
      addPatternAnnotation(result, node.argument);
      break;
    default:
      break;
  }
}

function addClassAnnotation(result: TOKS, node: acorn.ClassDeclaration) {
  applyNodePaths(result, node);
  addIdentifierAnnotation(result, node.id);
  if (node.superClass) addExpressionAnnotation(result, node.superClass);
  addClassBodyAnnotation(result, node.body);
}

function addSpreadElementAnnotation(result: TOKS, node: acorn.SpreadElement) {
  applyNodePaths(result, node);
  addExpressionAnnotation(result, node.argument);
}

function addBlockStatementAnnotation(result: TOKS, node: acorn.BlockStatement) {
  applyNodePaths(result, node);
}

function addClassBodyAnnotation(result: TOKS, node: acorn.ClassBody) {
  applyNodePaths(result, node);
}

function addIdentifierAnnotation(result: TOKS, node: acorn.Identifier) {
  applyNodePaths(result, node);
}

export type ExplanationCtx = {
  code: string;
  tokenizedCode: TokenOrCommentType[];
};

export type ExplanationFunction = (
  ctx: ExplanationCtx,
  token: TokenOrCommentType
) => React.ReactNode;

export type Explanations = Record<
  string,
  | React.ReactNode
  | ExplanationFunction
  | Array<React.ReactNode | ExplanationFunction>
>;

export function explainThisToken(
  code: string,
  tokenizedCode: TokenOrCommentType[],
  token: TokenOrCommentType,
  explanations?: Explanations
): React.ReactNode {
  if (!token) return null;
  let explanationSymbol: string;
  if (isCommentType(token)) {
    explanationSymbol = "//";
  } else {
    explanationSymbol = token.content;
  }
  const ctx: ExplanationCtx = { code, tokenizedCode };
  if (explanations && explanationSymbol in explanations) {
    const expsRaw = explanations[explanationSymbol];
    const exps = Array.isArray(expsRaw) ? expsRaw : [expsRaw];
    for (const exp of exps) {
      if (typeof exp === "string") return exp;
      if (typeof exp === "function") {
        const evaluatedExp = exp(ctx, token);
        if (evaluatedExp) return evaluatedExp;
        continue;
      }
      return exp;
    }
  }
  const expsRaw = explanations?.["*"];
  if (expsRaw === undefined) return null;
  const exps = Array.isArray(expsRaw) ? expsRaw : [expsRaw];
  for (const exp of exps) {
    if (typeof exp === "string") return exp;
    if (typeof exp === "function") {
      const evaluatedExp = exp(ctx, token);
      if (evaluatedExp) return evaluatedExp;
      continue;
    }
    return exp;
  }
  return null;
}

export function mergeExplainers(...arr: (Explanations | undefined)[]) {
  const result: Explanations = {};
  for (const exps of arr) {
    if (!exps) continue;
    for (const [key, value] of Object.entries(exps)) {
      if (result[key] === undefined) {
        result[key] = value;
        continue;
      }
      const current = result[key];
      const currentArr = Array.isArray(current) ? current : [current];
      const valueArr = Array.isArray(value) ? value : [value];
      result[key] = [...valueArr, ...currentArr];
    }
  }
  return result;
}

// function getTokenChain(ctx: ExplanationCtx, token: TokenOrCommentType) {
//   if (!isTokenType(token)) return null;
//   let lastTokenIndex = token.start;
//   let foundPreviousStatement = false;
//   while (lastTokenIndex >= 0) {
//     const prevToken = ctx.tokenizedCode.at(lastTokenIndex - 1);
//     if (!prevToken) {
//       lastTokenIndex--;
//       continue;
//     }
//     if (isCommentType(prevToken)) {
//       lastTokenIndex = prevToken.start;
//       continue;
//     }
//     switch (prevToken.src.type.label) {
//       case ";":
//         lastTokenIndex = prevToken.end;
//         foundPreviousStatement = true;
//         break;
//       default:
//         lastTokenIndex = prevToken.start;
//         break;
//     }
//     if (foundPreviousStatement) break;
//   }
//   let tokenChain: TokenChainLink = {};
//   while (lastTokenIndex < token.start) {
//     const nextToken = ctx.tokenizedCode.at(lastTokenIndex);
//     if (!nextToken) {
//       lastTokenIndex++;
//       continue;
//     }
//     if (isCommentType(nextToken)) {
//       lastTokenIndex = nextToken.end;
//       continue;
//     }
//     switch (nextToken.src.type.label) {
//       case ";":
//         return
//         break;
//       case "(":
//         expressionStack.push(nextToken);
//         break;
//       case ")": {

//         break;
//       }
//     }
//     lastTokenIndex = nextToken.end;
//   }
// }

// Everything from here down is old.
// TODO: remove this when CodeExplainer is no more.

export type TokenData = {
  type: "token";
  chars: string;
  token: acorn.Token;
};

export type SpaceData = {
  type: "space";
  chars: string;
  isComment?: boolean;
};

export type TokenDataLine = (TokenData | SpaceData)[];

export function traverseAcornTreeAsLines(code: string): TokenDataLine[] {
  const tokenizer = acorn.tokenizer(code, {
    ecmaVersion: 6
  });
  const indexToToken = new Map<number, acorn.Token>();
  for (const token of tokenizer) {
    for (let i = token.start; i < token.end; i++) {
      indexToToken.set(i, token);
    }
  }
  const tokenDataByLine: TokenDataLine[] = [];
  let currentTokenDataLine: TokenDataLine = [];
  tokenDataByLine.push(currentTokenDataLine);
  let lastToken: acorn.Token | null = null;
  let lastTokenData: TokenData | null = null;
  let lastSpace: SpaceData | null = null;
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === "\n") {
      lastToken = null;
      lastSpace = null;
      currentTokenDataLine = [];
      tokenDataByLine.push(currentTokenDataLine);
      continue;
    }
    const indexedToken = indexToToken.get(i);
    if (!indexedToken) {
      if (lastSpace === null) {
        lastToken = null;
        lastSpace = {
          type: "space",
          chars: char
        };
        currentTokenDataLine.push(lastSpace);
      } else if (lastSpace) {
        lastSpace.chars += char;
      }
      continue;
    }
    if (indexedToken !== lastToken) {
      lastToken = indexedToken;
      lastSpace = null;
      lastTokenData = {
        type: "token",
        chars: char,
        token: indexedToken
      };
      currentTokenDataLine.push(lastTokenData);
    } else if (lastTokenData) {
      lastTokenData.chars += char;
    }
  }
  for (const line of tokenDataByLine) {
    const firstToken = line.at(0);
    if (firstToken?.type === "space" && firstToken.chars.startsWith("//")) {
      firstToken.isComment = true;
    }
  }
  return tokenDataByLine;
}

export type LegacyTokenExplanationOpt = {
  token: TokenData;
  allTokenLines: TokenDataLine[];
  lineIndex: number;
  tokenIndex: number;
};
export type LegacyTokenExplanationHandler = (
  opt: LegacyTokenExplanationOpt
) => React.ReactNode;
export type LegacyTokenExplanations = Record<
  string,
  LegacyTokenExplanationHandler | React.ReactNode
>;

// TODO: make this incremental rather than a lookback for obvious
// performance reasons.
export function findPreviousToken(
  opt: LegacyTokenExplanationOpt,
  predicate: (opt: LegacyTokenExplanationOpt) => boolean,
  maxDistance?: number
) {
  let d = 0;
  for (let lineIndex = opt.lineIndex; lineIndex >= 0; lineIndex--) {
    const line = opt.allTokenLines[lineIndex];
    for (let tokenIndex = line.length - 1; tokenIndex >= 0; tokenIndex--) {
      if (lineIndex === opt.lineIndex && tokenIndex >= opt.tokenIndex) continue;
      const token = line[tokenIndex];
      if (token.type === "space") continue;
      if (maxDistance !== undefined && d++ > maxDistance) return null;
      const shouldBeDone = predicate({
        token,
        allTokenLines: opt.allTokenLines,
        lineIndex,
        tokenIndex
      });
      if (shouldBeDone) return token;
    }
  }
  return null;
}

function curlyBraceStartsCodeBlock(opt: LegacyTokenExplanationOpt) {
  const lastThing = findPreviousToken(
    opt,
    (pOpt) =>
      pOpt.token.chars === "(" ||
      pOpt.token.chars === ")" ||
      pOpt.token.chars === "="
  );
  switch (lastThing?.chars) {
    case ")":
      return true;
    case "(":
    case "=":
      return false;
    default:
      return null;
  }
}

export const defaultTokenExplanations: LegacyTokenExplanations = {
  "=": 'The "=" assignment operator assigns a value to a variable.',
  "==": 'The "==" equality check checks for loose equality between left and right values.',
  "===":
    'The "===" equality check checks for exact equality between left and right values.',
  ";": "The semicolon denotes the end of a logical statement.",
  ":": "The colon is used to map object attributes to values in inline object notation",
  ".": "Periods access properties of objects.",
  "{": (opt) => {
    const startsBlock = curlyBraceStartsCodeBlock(opt);
    if (startsBlock) {
      return "This curly brace is used to start a code block.";
    }
    if (startsBlock === false)
      return "This curly brace is used to start an object.";
    return "This curly brace could denote an object or code block.";
  },
  "}": "The closing curly brace denotes the end of a code block or object definition.",
  "(": "Opening parenthesis start a function argument list, function call, loop, or logical encapsulation.",
  ")": "Closing parenthesis end a function argument list, function call, loop, or logical encapsulation.",
  var: "Variable definition keyword.",
  let: "Block-scoped mutable variable definition keyword.",
  const: "Block-scoped constant variable definition keyword.",
  console: "The global console object.",
  log: "The logging function of the global console object.",
  function: 'The "function" keyword denotes a function definition.',
  for: 'The "for" keyword starts a loop instruction.',
  while: 'The "while" keyword starts a loop insteuction.',
  "+": "Addition operator.",
  "++": "Increment operator."
};

export function codePointToString(line: number, index: number) {
  return `${line}:${index}`;
}

export type TokenExplanationNodeMap = Map<string, React.ReactNode>;

export function generateDefaultTokenExplanation(
  opt: LegacyTokenExplanationOpt
): string {
  switch (opt.token.token.type.label) {
    case "name":
      const prevFunctionDec = findPreviousToken(
        opt,
        (pOpt) => pOpt.token.chars === "function",
        1
      );
      if (prevFunctionDec) return "The name of the defined function";
      return `A variable or attribute name`;
    case "string":
      return "A string literal";
    case "num":
      return `A number literal (${opt.token.chars})`;
    case "bool":
      return "A boolean literal";
    case "null":
      return "Null value literal";
    default:
      return "";
  }
}

export function generateTokenExplanations(
  allTokenLines: TokenDataLine[],
  extraExplanations: LegacyTokenExplanations
): TokenExplanationNodeMap {
  const result: TokenExplanationNodeMap = new Map();
  for (let lineIndex = 0; lineIndex < allTokenLines.length; lineIndex++) {
    const tokenLine = allTokenLines[lineIndex];
    for (let tokenIndex = 0; tokenIndex < tokenLine.length; tokenIndex++) {
      const tokenData = tokenLine[tokenIndex];
      if (tokenData.type === "space") continue;
      const exp =
        extraExplanations[tokenData.chars] ??
        defaultTokenExplanations[tokenData.chars];
      let expResult: React.ReactNode = null;
      if (exp) {
        if (typeof exp === "function") {
          expResult = exp({
            token: tokenData,
            allTokenLines,
            lineIndex,
            tokenIndex
          });
        } else {
          expResult = exp;
        }
      } else {
        expResult = generateDefaultTokenExplanation({
          token: tokenData,
          allTokenLines,
          lineIndex,
          tokenIndex
        });
      }
      if (expResult) {
        result.set(codePointToString(lineIndex, tokenIndex), expResult);
      }
    }
  }
  return result;
}
