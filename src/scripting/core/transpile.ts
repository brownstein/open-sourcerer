import transformArrowFunctions from "@babel/plugin-transform-arrow-functions";
import transformBlockScoping from "@babel/plugin-transform-block-scoping";
import transformClasses from "@babel/plugin-transform-classes";
import transformDestructuring from "@babel/plugin-transform-destructuring";
import transformForOf from "@babel/plugin-transform-for-of";
import transformShorthandProperties from "@babel/plugin-transform-shorthand-properties";
import * as babel from "@babel/standalone";
import * as acorn from "acorn";
import transformAsyncToPromises from "babel-plugin-transform-async-to-promises";
import Interpreter from "js-interpreter";

import { SourceMapping } from "./SourceMapping";

export const babelPlugins = [
  transformArrowFunctions,
  [transformClasses, { loose: true }],
  transformDestructuring,
  transformAsyncToPromises,
  transformShorthandProperties,
  transformBlockScoping,
  [transformForOf, { assumeArray: true }]
];

export type TranspileResult = {
  transpiledString: string;
  transpiledAST: acorn.Program;
  sourceMapping: SourceMapping;
};

// TODO: put this in a worker.
export async function transpileToES5(code: string): Promise<TranspileResult> {
  if (code.trim() === "") throw new SyntaxError("No code provided to run.");

  let babelResult = babel.transform(code, {
    plugins: babelPlugins,
    presets: [],
    ast: true,
    generatorOpts: {
      sourceMaps: true
    }
  });

  if (!babelResult.code || !babelResult.map || !babelResult.ast)
    throw new Error("Missing results from Babel transpilation.");

  let transpiledString = babelResult.code;

  // Do multiple passes if a `const` slipped by - there's an issue with the transform async
  // to promises plugin where `const` can make it into the output for looping await behavior.
  let passes = 1;
  while (/(\n|\s)const\s/g.test(transpiledString) && passes < 3) {
    passes++;
    babelResult = babel.transform(transpiledString, {
      plugins: babelPlugins,
      presets: [],
      ast: true,
      generatorOpts: {
        sourceMaps: true
      }
    });
    if (!babelResult.code || !babelResult.map || !babelResult.ast)
      throw new Error("Missing results from Babel transpilation.");
    transpiledString = babelResult.code;
  }

  const transpiledAST = acorn.parse(
    transpiledString,
    Interpreter.PARSE_OPTIONS
  );

  return {
    transpiledString,
    transpiledAST,
    sourceMapping: new SourceMapping(
      code,
      babelResult.ast,
      babelResult.map,
      transpiledAST
    )
  };
}
