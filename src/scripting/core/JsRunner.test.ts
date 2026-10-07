import Interpreter from "js-interpreter";

import { JSRunner } from "./JsRunner";
import { transpileToES5 } from "./transpile";
import { delay, isPseudoObject } from "./util";

const rawScript = `
"use strict";
var myVariable = require()()();
`;

const rawScript2 = `
module.exports = () => JSON.stringify({ foo: "bar" });
`;

const consoleLogScript = `
var a = {};
var b = {};
a.b = b;
b.a = a;
console.log(a);
`;

// Note that setTimeout results in an error if a return value is provided.
const randomTimeoutScript = `
for (let i = 0; i < 99; i++) {
  setTimeout(() => {
    console.log(i);
  }, Math.random() * 100);
}
`;

const requireScript = `
const helloWorld = require("helloWorld");
console.log(helloWorld);
`;

const requireAsyncScript = `
const helloWorld = require("helloWorld");
console.log(helloWorld());
`;

const exportsScript = `
module.exports = {
  hello: "world"
};
`;

const runScript = `
for (let i = 0; i < 100; i++) {
  console.log(i);
}
`;

const tryRequireScript = `
var helloWorld;
try {
  helloWorld = require("helloWorld");
} catch (err) {
  console.error(err);
}
console.log(helloWorld);
`;

describe("jsRunner", () => {
  test("interpreter console.log", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(consoleLogScript);
    await runner.run();
    expect(runner.logLines.length).toEqual(1);
  });
  test("doCurrentLine w/ random timeouts and async execution", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(randomTimeoutScript);
    await runner.run();
    expect(runner.logLines.length).toEqual(99);
  });
  test("require", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(requireScript);
    runner.modules.helloWorld = {
      name: "helloWorld",
      requirePseudo: () => "Hello World!"
    };
    await runner.run();
    expect(runner.logLines.at(0)?.primitiveValue).toEqual("Hello World!");
  });
  test("require resolving an async function", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(requireAsyncScript);
    runner.modules.helloWorld = {
      name: "helloWorld",
      requirePseudo: (ctx) =>
        ctx.runner.interpreter.createAsyncFunction(async function (
          cb: (value: unknown) => void
        ) {
          await delay(100);
          cb(
            ctx.runner.interpreter.nativeToPseudo({
              hello: "world"
            })
          );
        })
    };
    await runner.run();
    expect(runner.error).toEqual(undefined);
    expect(runner.logLines.length).toEqual(1);
    expect(runner.logLines.at(0)?.primitiveValue).toEqual(undefined);
    expect(runner.logLines.at(0)?.objectValue).toEqual({
      hello: "world"
    });
  });
  test("[experimental] require resolving a relative module", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(requireScript);
    runner.moduleResolver = () => exportsScript;
    await runner.run();
    expect(runner.error).toEqual(undefined);
    expect(runner.logLines.length).toEqual(1);
    expect(runner.logLines.at(0)?.primitiveValue).toEqual(undefined);
    expect(runner.logLines.at(0)?.objectValue).toEqual({
      hello: "world"
    });
  });
  test("require depending on an external context", async () => {
    type ContextType = {
      test: number;
    };
    const externalCtx: ContextType = {
      test: 123
    };
    const runner = new JSRunner(externalCtx);
    await runner.transpileAndAppendES6(requireScript);
    runner.modules.helloWorld = {
      name: "helloWorld",
      requirePseudo: (ctx) => ctx.runner.interpreter.nativeToPseudo(ctx.test)
    };
    await runner.run();
    expect(runner.error).toEqual(undefined);
    expect(runner.logLines.length).toEqual(1);
    expect(runner.logLines.at(0)?.primitiveValue).toEqual(123);
  });
  test("require missing dependency", async () => {
    const runner = new JSRunner();
    runner.events.on("error", () => {});
    await runner.transpileAndAppendES6(requireScript);
    await runner.run();
    expect(runner.error?.message).toEqual(
      'require: module "helloWorld" not found.'
    );
  });
  test("require missing dependency in catch statement", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6(tryRequireScript);
    await runner.run();
    expect(runner.error).toEqual(undefined);
    expect(runner.logLines.length).toEqual(2);
    const expectedErrMessage =
      'Error: require: module "helloWorld" not found.\n  at code:3:15';
    expect(runner.logLines.at(0)).toMatchObject({
      primitiveValue: expectedErrMessage,
      type: "error"
    });
  });
  test("run speed", async () => {
    const measureTime = async (inner: () => Promise<unknown>) => {
      const started = Date.now();
      await inner();
      const ended = Date.now();
      return ended - started;
    };
    const fastRunner = new JSRunner();
    await fastRunner.transpileAndAppendES6(runScript);
    fastRunner.speed = 1000;
    const fastTime = await measureTime(() => fastRunner.run());
    const slowRunner = new JSRunner();
    await slowRunner.transpileAndAppendES6(runScript);
    slowRunner.speed = 0.5;
    const slowTime = await measureTime(() => slowRunner.run());
    // speed is lines/ms; the 2000x setting gap must produce a materially
    // longer wall-clock for the throttled run on the same machine. The
    // relative check survives slow/noisy CI where an absolute fastTime
    // ceiling would flake.
    expect(slowTime).toBeGreaterThan(200);
    expect(slowTime).toBeGreaterThan(fastTime * 2);
  });
  test("transpilation errors", async () => {
    const runner = new JSRunner();
    let error: Error | undefined;
    runner.events.on("error", (err) => (error = err));
    await runner.transpileAndAppendES6("^not-es6!;");
    const errAsSyntaxError = error as
      | {
          message: string;
          loc: {
            line: number;
          };
        }
      | undefined;
    expect(errAsSyntaxError?.loc.line).toEqual(1);
  });
  test("console log wrapping", async () => {
    const runner = new JSRunner();
    await runner.transpileAndAppendES6("const a = 1; a;", false, true);
    await runner.run();
    expect(runner.logLines).toEqual([{ primitiveValue: 1 }]);
  });
});
