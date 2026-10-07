import { ReactNode } from "react";

import {
  ExplanationCtx,
  Explanations,
  TokenOrCommentType,
  isTokenType
} from "./tokenHelpers";

export const DefaultExplainers: Explanations = {
  "//": () => "This is a comment.",
  "*": attemptExplainDefault,
  console: "console refers to the global console object.",
  ".": (_ctx, tok) => {
    if (!isTokenType(tok)) return null;
    const parentTokAst = tok.astPath.at(-1);
    if (parentTokAst?.type === "MemberExpression") {
      return "Periods are used in Member Expressions to reference a property (on the right) of an object (on the left).";
    }
    return null;
  },
  "(": (_ctx, tok) => {
    if (!isTokenType(tok)) return null;
    const parentTokAst = tok.astPath.at(-1);
    if (!parentTokAst) return null;
    switch (parentTokAst.type) {
      case "CallExpression":
        return "Opening parenthesis are used in function calls to start a list of arguments.";
      case "ForStatement":
        return "Opening parenthesis are used if For Statements to define an iteration condition.";
      default:
        return null;
    }
  },
  ")": (_ctx, tok) => {
    if (!isTokenType(tok)) return null;
    const parentTokAst = tok.astPath.at(-1);
    if (!parentTokAst) return null;
    switch (parentTokAst.type) {
      case "CallExpression":
        return "Closing parenthesis are used in function calls to end a list of arguments.";
      case "ForStatement":
        return "Closing parenthesis are used if For Statements to end the iteration condition.";
      default:
        return null;
    }
  },
  ";": "Statements in JavaScript end with semicolons;",
  log: (_ctx, tok) => {
    if (!isTokenType(tok)) return null;
    const parentTokAst = tok.astPath.at(-2);
    if (parentTokAst?.type === "MemberExpression") {
      if (
        parentTokAst.object.type === "Identifier" &&
        parentTokAst.object.name === "console"
      ) {
        return 'This is the "log" method on the console object.';
      }
    }
    return null;
  },
  require: (_ctx, tok) => {
    if (!isTokenType(tok)) return null;
    const parentTokAst = tok.astPath.at(-2);
    if (parentTokAst?.type === "CallExpression") {
      return (
        <>
          <b>
            <code>require</code>
          </b>{" "}
          is a special function that gets modules by name.
        </>
      );
    }
    return null;
  }
};

export function attemptExplainDefault(
  _ctx: ExplanationCtx,
  explainToken: TokenOrCommentType
): ReactNode {
  if (!explainToken || !isTokenType(explainToken)) return null;
  if (isTokenType(explainToken)) {
    const lastASTNode = explainToken.astPath.at(-1);
    if (!lastASTNode) return null;
    switch (lastASTNode?.type) {
      case "Identifier": {
        const prevAstNode = explainToken.astPath.at(-2);
        if (prevAstNode) {
          switch (prevAstNode.type) {
            case "MemberExpression":
              return `"${explainToken.content}" is an part of a Member Expression; part of an object or array is being referenced here.`;
            default:
              break;
          }
        }
        return `"${explainToken.content}" is an identifier; the name of a variable or function.`;
      }
      case "Literal":
        return `${explainToken.content} is a literal; a raw value.`;
      default:
        switch (explainToken.content) {
          default:
            return `"${explainToken.content}" is part of an ${splitCamelCase(lastASTNode.type)}.`;
        }
    }
  }
  return null;
}

export function splitCamelCase(str: String) {
  const matchExpr = /([A-Z][a-z]+)/g;
  const parts = str.matchAll(matchExpr);
  return [...parts]
    .map((match) => match[1] ?? "")
    .filter((str) => str !== "")
    .join(" ");
}
