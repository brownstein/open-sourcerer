import { SpellCtxEvents, SpellsAPIEvents } from "src/api/spells";

import { SpellRuntime } from "./SpellRuntime";

// ─── Existing tests ───────────────────────────────────────────────────────────

describe("SpellRuntime", () => {
  it("Executes a script.", async () => {
    const runtime = new SpellRuntime().setup();
    const spell = await runtime.run('console.log("Hello World");');
    await spell.runCompletePromise();
    expect(spell.consoleOutput).toEqual([
      {
        primitiveValue: "Hello World"
      }
    ]);
  });
  it("Executes a script with asynchronous logic.", async () => {
    const runtime = new SpellRuntime().setup();
    const spell = await runtime.run(`
      setTimeout(() => { console.log("World"); }, 10);
      setTimeout(() => { console.log("Hello"); }, 5);
    `);
    await spell.runCompletePromise();
    expect(spell.consoleOutput).toEqual([
      {
        primitiveValue: "Hello"
      },
      {
        primitiveValue: "World"
      }
    ]);
  });
  it("Executes multiple scripts concurrently, tracking them separately.", async () => {
    const runtime = new SpellRuntime().setup();
    const spellA = await runtime.run(null);
    const spellB = await runtime.run(null);
    spellA.appendAndRun('console.log("Hi from A");');
    spellB.appendAndRun('console.log("Hi from B");');
    await spellA.runCompletePromise();
    await spellB.runCompletePromise();
    expect(spellA.consoleOutput.at(0)?.primitiveValue).toEqual("Hi from A");
    expect(spellB.consoleOutput.at(0)?.primitiveValue).toEqual("Hi from B");
  });
});

// ─── Execution lifecycle ─────────────────────────────────────────────────────

describe("SpellRuntime – execution lifecycle", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("running is true immediately after run() and false after completion", async () => {
    const spell = await runtime.run('console.log("hi");');
    expect(spell.running).toBe(true);
    await spell.runCompletePromise();
    expect(spell.running).toBe(false);
  });

  it("runComplete is true after successful execution", async () => {
    const spell = await runtime.run("1 + 1;");
    await spell.runCompletePromise();
    expect(spell.runComplete).toBe(true);
  });

  it("runComplete is false before execution finishes", async () => {
    const spell = await runtime.run('console.log("hi");');
    // Before awaiting, runComplete should still be false
    expect(spell.runComplete).toBe(false);
    await spell.runCompletePromise();
  });

  it("runStarted event fires when execution begins", async () => {
    const spell = await runtime.run(null);
    let started = false;
    spell.events.on(SpellCtxEvents.runStarted, () => {
      started = true;
    });
    spell.appendAndRun("1;");
    await spell.runCompletePromise();
    expect(started).toBe(true);
  });

  it("runComplete event fires when execution finishes", async () => {
    const spell = await runtime.run(null);
    let completed = false;
    spell.events.on(SpellCtxEvents.runComplete, () => {
      completed = true;
    });
    spell.appendAndRun("1;");
    await spell.runCompletePromise();
    expect(completed).toBe(true);
  });

  it("runSpellStart event fires on the runtime when a spell starts", async () => {
    let fired = false;
    runtime.events.on(SpellsAPIEvents.runSpellStart, () => {
      fired = true;
    });
    await runtime.run("1;");
    expect(fired).toBe(true);
  });

  it("appendAndRun with logResult logs the expression value", async () => {
    const spell = await runtime.run(null);
    spell.appendAndRun("42;", true);
    await spell.runCompletePromise();
    expect(spell.consoleOutput.some((o) => o.primitiveValue === 42)).toBe(true);
  });

  it("run() with an existing ctx appends code without creating a new context", async () => {
    const spell = await runtime.run("var x = 1;");
    await spell.runCompletePromise();

    const returned = await runtime.run(
      'console.log("via existing");',
      null,
      spell
    );
    expect(returned).toBe(spell);
    await spell.runCompletePromise();
    expect(
      spell.consoleOutput.some((o) => o.primitiveValue === "via existing")
    ).toBe(true);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("SpellRuntime – error handling", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("transpile error sets spell.error and resolves runCompletePromise", async () => {
    const spell = await runtime.run(null);
    spell.appendAndRun("^invalid syntax!;");
    await spell.runCompletePromise();
    expect(spell.error).toBeDefined();
    expect(spell.error?.message).toBeTruthy();
    expect(spell.running).toBe(false);
  });

  it("runtime error sets spell.error and resolves runCompletePromise", async () => {
    const spell = await runtime.run("throw new Error('runtime failure');");
    await spell.runCompletePromise();
    expect(spell.error).toBeDefined();
    expect(spell.error?.message).toContain("runtime failure");
    expect(spell.running).toBe(false);
  });

  it("runError event fires on transpile error", async () => {
    const spell = await runtime.run(null);
    let errorFired = false;
    spell.events.on(SpellCtxEvents.runError, () => {
      errorFired = true;
    });
    spell.appendAndRun("^invalid!;");
    await spell.runCompletePromise();
    expect(errorFired).toBe(true);
  });

  it("runError event fires on runtime error", async () => {
    const spell = await runtime.run(null);
    let errorFired = false;
    spell.events.on(SpellCtxEvents.runError, () => {
      errorFired = true;
    });
    spell.appendAndRun("throw new Error('oops');");
    await spell.runCompletePromise();
    expect(errorFired).toBe(true);
  });

  it("error.line is populated for runtime errors", async () => {
    const spell = await runtime.run("throw new Error('lined');");
    await spell.runCompletePromise();
    expect(typeof spell.error?.line).toBe("number");
  });
});

// ─── Variable operations ──────────────────────────────────────────────────────

describe("SpellRuntime – variable operations", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("setVars and getVars round-trip a primitive value", async () => {
    const spell = await runtime.run("var myVar;");
    await spell.runCompletePromise();
    spell.setVars({ myVar: 42 });
    const result = await spell.getVars(["myVar"]);
    expect(result["myVar"]).toBe(42);
  });

  it("setVars sets multiple variables", async () => {
    const spell = await runtime.run("var a; var b;");
    await spell.runCompletePromise();
    spell.setVars({ a: "hello", b: 99 });
    const result = await spell.getVars(["a", "b"]);
    expect(result["a"]).toBe("hello");
    expect(result["b"]).toBe(99);
  });
});

// ─── Execution control ────────────────────────────────────────────────────────

describe("SpellRuntime – execution control", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("pause() sets paused flag to true", async () => {
    const spell = await runtime.run(null);
    spell.pause();
    expect(spell.paused).toBe(true);
  });

  it("resume() sets paused flag to false", async () => {
    const spell = await runtime.run(null);
    spell.pause();
    spell.resume();
    expect(spell.paused).toBe(false);
  });

  it("terminate() sets running to false and fires runTerminated event", async () => {
    const spell = await runtime.run(null);
    let terminated = false;
    spell.events.on(SpellCtxEvents.runTerminated, () => {
      terminated = true;
    });
    spell.terminate();
    expect(spell.running).toBe(false);
    expect(terminated).toBe(true);
  });

  it("setSpeed does not throw", async () => {
    const spell = await runtime.run(null);
    expect(() => spell.setSpeed(2)).not.toThrow();
  });
});

// ─── Console output ───────────────────────────────────────────────────────────

describe("SpellRuntime – console output", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("consoleLog event fires for each console.log call", async () => {
    const spell = await runtime.run(null);
    const logged: unknown[] = [];
    spell.events.on(SpellCtxEvents.consoleLog, (line) => {
      logged.push(line.primitiveValue);
    });
    spell.appendAndRun('console.log("a"); console.log("b");');
    await spell.runCompletePromise();
    expect(logged).toEqual(["a", "b"]);
  });

  it("sharedConsoleOutput collects output from all contexts", async () => {
    const spellA = await runtime.run('console.log("from A");');
    const spellB = await runtime.run('console.log("from B");');
    await spellA.runCompletePromise();
    await spellB.runCompletePromise();
    const values = runtime.sharedConsoleOutput.map((o) => o.primitiveValue);
    expect(values).toContain("from A");
    expect(values).toContain("from B");
  });

  it("sharedConsoleOutput respects sharedConsoleOutputLength cap", async () => {
    runtime.sharedConsoleOutputLength = 3;
    const spell = await runtime.run(
      "console.log(1); console.log(2); console.log(3); console.log(4); console.log(5);"
    );
    await spell.runCompletePromise();
    expect(runtime.sharedConsoleOutput.length).toBeLessThanOrEqual(3);
  });
});

// ─── Autocomplete & imports ───────────────────────────────────────────────────

describe("SpellRuntime – autocomplete and imports", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("autoComplete returns an array of completions", async () => {
    const result = await runtime.autoComplete("const x = 1; x.", 0, 16);
    expect(Array.isArray(result)).toBe(true);
  });

  it("autoComplete returns null on timeout (short timeout)", async () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    // Stub the internal send so it never responds; autoComplete has a 500ms
    // built-in timeout. We patch the connection to drop the message.
    const runtime2 = new SpellRuntime().setup();
    const origSend = (
      runtime2 as unknown as { _connection: { send: (m: unknown) => void } }
    )._connection.send.bind(
      (runtime2 as unknown as { _connection: { send: () => void } })._connection
    );
    // Override send to drop autocomplete messages
    (
      runtime2 as unknown as { _connection: { send: (m: unknown) => void } }
    )._connection.send = (msg: unknown) => {
      const m = msg as { type: string };
      if (m.type === "ComputeAutocomplete") return;
      origSend(msg as Parameters<typeof origSend>[0]);
    };
    const result = await runtime2.autoComplete("", 0, 0);
    expect(result).toBeNull();
    runtime2.teardown();
    spy.mockRestore();
  });

  it("computeImports returns imported module names for valid code", async () => {
    const result = await runtime.computeImports("const w = require('wait');");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain("wait");
  });

  it("computeImports returns null for invalid syntax", async () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runtime.computeImports("^invalid!");
    expect(result).toBeNull();
    spy.mockRestore();
  });
});

// ─── Context lookup ───────────────────────────────────────────────────────────

describe("SpellRuntime – context lookup", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("getSavedRunning returns context by savedScriptId", async () => {
    const spell = await runtime.run(null, null, null, "my-script-id");
    const found = runtime.getSavedRunning("my-script-id");
    expect(found).toBe(spell);
  });

  it("getSavedRunning returns null when not found", () => {
    expect(runtime.getSavedRunning("does-not-exist")).toBeNull();
  });

  it("getSpellCtx returns context by id", async () => {
    const spell = await runtime.run(null);
    expect(runtime.getSpellCtx(spell.id)).toBe(spell);
  });

  it("getSpellCtx returns null for unknown id", () => {
    expect(runtime.getSpellCtx("unknown-id")).toBeNull();
  });

  it("getSpellCtxs returns all active contexts as a record", async () => {
    const spellA = await runtime.run(null);
    const spellB = await runtime.run(null);
    const ctxs = runtime.getSpellCtxs();
    expect(ctxs[spellA.id]).toBe(spellA);
    expect(ctxs[spellB.id]).toBe(spellB);
  });
});

// ─── Context cleanup ──────────────────────────────────────────────────────────

describe("SpellRuntime – context cleanup", () => {
  let runtime: SpellRuntime;
  beforeEach(() => {
    runtime = new SpellRuntime().setup();
  });
  afterEach(() => {
    runtime.teardown();
  });

  it("killAllRunningSpells removes all contexts", async () => {
    await runtime.run(null);
    await runtime.run(null);
    runtime.killAllRunningSpells();
    expect(Object.keys(runtime.getSpellCtxs())).toHaveLength(0);
  });

  it("removeSpellContext removes the specific context", async () => {
    const spellA = await runtime.run(null);
    const spellB = await runtime.run(null);
    runtime.removeSpellContext(spellA.id);
    expect(runtime.getSpellCtx(spellA.id)).toBeNull();
    expect(runtime.getSpellCtx(spellB.id)).toBe(spellB);
  });

  it("destroy() marks context as destroyed", async () => {
    const spell = await runtime.run(null);
    spell.destroy();
    expect(spell.destroyed).toBe(true);
  });
});
