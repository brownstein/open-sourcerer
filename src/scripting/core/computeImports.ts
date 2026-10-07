import * as babel from "@babel/standalone";
import * as T from "@babel/types";

export function computeImports(code: string) {
  let parsedCode: ReturnType<typeof babel.transform>;
  try {
    parsedCode = babel.transform(code, {
      plugins: [],
      presets: [],
      ast: true
    });
  } catch (err) {
    console.warn("[computeImports] failed to parse code:", err);
    return null;
  }

  if (!parsedCode.ast) return null;

  const importsSet = new Set<string>();

  const traverse = (node: T.Node) => {
    switch (node.type) {
      case "File":
        traverse(node.program);
        break;
      case "Program":
        for (const bn of node.body) traverse(bn);
        break;
      case "VariableDeclaration": {
        for (const vd of node.declarations) traverse(vd);
        break;
      }
      case "VariableDeclarator":
        if (node.init) traverse(node.init);
        break;
      case "CallExpression":
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "StringLiteral"
        ) {
          importsSet.add(node.arguments[0].value);
        }
        break;
      default:
        break;
    }
  };

  traverse(parsedCode.ast);

  return [...importsSet.values()];
}
