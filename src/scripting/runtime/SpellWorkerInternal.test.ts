import { SpellWorkerInternal } from "./SpellWorkerInternal";
import * as API from "./SpellWorkerAPI";

// ─── Test helper ─────────────────────────────────────────────────────────────

function createTestWorker() {
  const emitter = API.createMessageEmitter();
  const outbox: API.MessageFromWorker[] = [];
  const subscribers: Array<(msg: API.MessageFromWorker) => void> = [];

  const worker = new SpellWorkerInternal(emitter, (msg) => {
    outbox.push(msg);
    for (const s of subscribers) s(msg);
  });

  const send = (msg: API.MessageToWorker) => emitter.emit("message", msg);

  function waitFor<T extends API.MessageFromWorker>(
    predicate: (msg: API.MessageFromWorker) => msg is T,
    timeoutMs = 3000
  ): Promise<T> {
    const existing = outbox.find(predicate);
    if (existing) return Promise.resolve(existing as T);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = subscribers.indexOf(handler);
        if (idx !== -1) subscribers.splice(idx, 1);
        reject(new Error("waitFor timed out"));
      }, timeoutMs);

      const handler = (msg: API.MessageFromWorker) => {
        if (!predicate(msg)) return;
        clearTimeout(timer);
        const idx = subscribers.indexOf(handler);
        if (idx !== -1) subscribers.splice(idx, 1);
        resolve(msg as T);
      };
      subscribers.push(handler);
    });
  }

  const mkId = () => `msg-${Math.random().toString(36).slice(2)}`;
  const mkRunnerId = () => `runner-${Math.random().toString(36).slice(2)}`;

  async function createRunner() {
    const runnerId = mkRunnerId();
    const id = mkId();
    send({ type: API.MessageToWorkerType.CreateRunner, id, runnerId });
    await waitFor(
      (msg): msg is API.AckMessage =>
        msg.type === API.MessageFromWorkerType.Ack &&
        (msg as API.AckMessage).messageToWorkerId === id
    );
    return runnerId;
  }

  return { worker, outbox, send, waitFor, mkId, mkRunnerId, createRunner };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("SpellWorkerInternal", () => {
  describe("message routing", () => {
    it("acks Init with empty runnerId", async () => {
      const { send, waitFor, mkId } = createTestWorker();
      const id = mkId();
      send({ type: API.MessageToWorkerType.Init, id });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack
      );
      expect(ack.runnerId).toBe("");
      expect(ack.messageToWorkerId).toBe(id);
    });

    it("does not crash on unknown message type", () => {
      const spy = jest.spyOn(console, "error").mockImplementation(() => {});
      const { send } = createTestWorker();
      expect(() => {
        (send as (msg: unknown) => void)({
          type: "NotARealType",
          id: "x",
          runnerId: "y"
        });
      }).not.toThrow();
      spy.mockRestore();
    });
  });

  describe("runner lifecycle", () => {
    it("CreateRunner sends Ack with correct runnerId", async () => {
      const { send, waitFor, mkId, mkRunnerId } = createTestWorker();
      const runnerId = mkRunnerId();
      const id = mkId();
      send({ type: API.MessageToWorkerType.CreateRunner, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack.runnerId).toBe(runnerId);
    });

    it("DestroyRunner sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.DestroyRunner, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack.runnerId).toBe(runnerId);
    });

    it("DestroyRunner for unknown runnerId does not crash", () => {
      const { send, mkId, mkRunnerId } = createTestWorker();
      expect(() => {
        send({
          type: API.MessageToWorkerType.DestroyRunner,
          id: mkId(),
          runnerId: mkRunnerId()
        });
      }).not.toThrow();
    });
  });

  describe("script execution", () => {
    it("ExecuteScript sends Ack before ExecutionFinished", async () => {
      const { send, waitFor, mkId, createRunner, outbox } =
        createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id,
        runnerId,
        code: "1 + 1;"
      });
      await waitFor(
        (msg): msg is API.ExecutionFinishedMessage =>
          msg.type === API.MessageFromWorkerType.ExecutionFinished &&
          msg.runnerId === runnerId
      );
      const ackIdx = outbox.findIndex(
        (m) =>
          m.type === API.MessageFromWorkerType.Ack &&
          (m as API.AckMessage).messageToWorkerId === id
      );
      const finishedIdx = outbox.findIndex(
        (m) =>
          m.type === API.MessageFromWorkerType.ExecutionFinished &&
          m.runnerId === runnerId
      );
      expect(ackIdx).toBeGreaterThanOrEqual(0);
      expect(ackIdx).toBeLessThan(finishedIdx);
    });

    it("ExecuteScript sends ExecutionStarted before ExecutionFinished", async () => {
      const { send, waitFor, mkId, createRunner, outbox } =
        createTestWorker();
      const runnerId = await createRunner();
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id: mkId(),
        runnerId,
        code: "2 + 2;"
      });
      await waitFor(
        (msg): msg is API.ExecutionFinishedMessage =>
          msg.type === API.MessageFromWorkerType.ExecutionFinished &&
          msg.runnerId === runnerId
      );
      const startedIdx = outbox.findIndex(
        (m) =>
          m.type === API.MessageFromWorkerType.ExecutionStarted &&
          m.runnerId === runnerId
      );
      const finishedIdx = outbox.findIndex(
        (m) =>
          m.type === API.MessageFromWorkerType.ExecutionFinished &&
          m.runnerId === runnerId
      );
      expect(startedIdx).toBeGreaterThanOrEqual(0);
      expect(startedIdx).toBeLessThan(finishedIdx);
    });

    it("ExecuteScript forwards console.log as ConsoleOutput", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id: mkId(),
        runnerId,
        code: 'console.log("hello");'
      });
      const consoleMsg = await waitFor(
        (msg): msg is API.ConsoleOutputMessage =>
          msg.type === API.MessageFromWorkerType.ConsoleOutput &&
          msg.runnerId === runnerId
      );
      expect(consoleMsg.output.primitiveValue).toBe("hello");
    });

    it("ExecuteScript sends ExecutionError on runtime error", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id: mkId(),
        runnerId,
        code: "throw new Error('boom');"
      });
      const errMsg = await waitFor(
        (msg): msg is API.ExecutionErrorMessage =>
          msg.type === API.MessageFromWorkerType.ExecutionError &&
          msg.runnerId === runnerId
      );
      expect(errMsg.error.message).toContain("boom");
    });

    it("ExecuteScript for unknown runnerId acks and does not crash", async () => {
      const { send, waitFor, mkId, mkRunnerId } = createTestWorker();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id,
        runnerId: mkRunnerId(),
        code: "1 + 1;"
      });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("AppendCode executes code in an existing context", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();

      // Initialize with first script
      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id: mkId(),
        runnerId,
        code: "var x = 1;"
      });
      await waitFor(
        (msg): msg is API.ExecutionFinishedMessage =>
          msg.type === API.MessageFromWorkerType.ExecutionFinished &&
          msg.runnerId === runnerId
      );

      // Append more code
      const appendId = mkId();
      send({
        type: API.MessageToWorkerType.AppendCode,
        id: appendId,
        runnerId,
        code: 'console.log("appended");'
      });
      await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === appendId
      );
      const consoleMsg = await waitFor(
        (msg): msg is API.ConsoleOutputMessage =>
          msg.type === API.MessageFromWorkerType.ConsoleOutput &&
          msg.runnerId === runnerId &&
          (msg as API.ConsoleOutputMessage).output.primitiveValue === "appended"
      );
      expect(consoleMsg.output.primitiveValue).toBe("appended");
    });

    it("AppendCode with logResult wraps expression in console output", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();

      send({
        type: API.MessageToWorkerType.ExecuteScript,
        id: mkId(),
        runnerId,
        code: "var x = 42;"
      });
      await waitFor(
        (msg): msg is API.ExecutionFinishedMessage =>
          msg.type === API.MessageFromWorkerType.ExecutionFinished &&
          msg.runnerId === runnerId
      );

      send({
        type: API.MessageToWorkerType.AppendCode,
        id: mkId(),
        runnerId,
        code: "x;",
        logResult: true
      });
      const consoleMsg = await waitFor(
        (msg): msg is API.ConsoleOutputMessage =>
          msg.type === API.MessageFromWorkerType.ConsoleOutput &&
          msg.runnerId === runnerId &&
          (msg as API.ConsoleOutputMessage).output.primitiveValue === 42
      );
      expect(consoleMsg.output.primitiveValue).toBe(42);
    });
  });

  describe("variable operations", () => {
    it("SetVariable then GetVariables returns the written value", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();

      send({
        type: API.MessageToWorkerType.SetVariable,
        id: mkId(),
        runnerId,
        var: "testVar",
        value: 99
      });

      const getVarsId = mkId();
      send({
        type: API.MessageToWorkerType.GetVariables,
        id: getVarsId,
        runnerId,
        vars: ["testVar"]
      });
      const result = await waitFor(
        (msg): msg is API.VariablesResultMessage =>
          msg.type === API.MessageFromWorkerType.VariablesResult &&
          (msg as API.VariablesResultMessage).messageToWorkerId === getVarsId
      );
      expect(result.results).toEqual([["testVar", 99]]);
    });

    it("SetVariables sets multiple key/value pairs", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();

      send({
        type: API.MessageToWorkerType.SetVariables,
        id: mkId(),
        runnerId,
        pairs: [
          ["varA", 1],
          ["varB", 2]
        ]
      });

      const getVarsId = mkId();
      send({
        type: API.MessageToWorkerType.GetVariables,
        id: getVarsId,
        runnerId,
        vars: ["varA", "varB"]
      });
      const result = await waitFor(
        (msg): msg is API.VariablesResultMessage =>
          msg.type === API.MessageFromWorkerType.VariablesResult &&
          (msg as API.VariablesResultMessage).messageToWorkerId === getVarsId
      );
      expect(result.results).toEqual([
        ["varA", 1],
        ["varB", 2]
      ]);
    });
  });

  describe("execution control", () => {
    it("Terminate sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.Terminate, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("PauseExecution sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.PauseExecution, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("UnPauseExecution sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.UnPauseExecution, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("StepExecution sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.StepExecution, id, runnerId });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("SetSpeed sends Ack", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({ type: API.MessageToWorkerType.SetSpeed, id, runnerId, speed: 2 });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });
  });

  describe("module RPC", () => {
    it("ModuleRPC sends Ack for a known runner", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ModuleRPC,
        id,
        runnerId,
        moduleName: "wait",
        data: null
      });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("ModuleRPCHeadless acks for a module without initHeadlessPseudo", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      // wait module has no initHeadlessPseudo
      send({
        type: API.MessageToWorkerType.ModuleRPCHeadless,
        id,
        runnerId,
        moduleName: "wait",
        data: null
      });
      const ack = await waitFor(
        (msg): msg is API.AckMessage =>
          msg.type === API.MessageFromWorkerType.Ack &&
          (msg as API.AckMessage).messageToWorkerId === id
      );
      expect(ack).toBeDefined();
    });

    it("ModuleRPCHeadless for unknown module sends no Ack and does not crash", async () => {
      const { send, outbox, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();
      const id = mkId();
      const sizeBefore = outbox.length;

      send({
        type: API.MessageToWorkerType.ModuleRPCHeadless,
        id,
        runnerId,
        moduleName: "nonExistentModule",
        data: null
      });

      // Give async code time to complete
      await new Promise((r) => setTimeout(r, 100));

      const newAcks = outbox
        .slice(sizeBefore)
        .filter(
          (m) =>
            m.type === API.MessageFromWorkerType.Ack &&
            (m as API.AckMessage).messageToWorkerId === id
        );
      expect(newAcks).toHaveLength(0);
    });

    it("ModuleRPCHeadless is idempotent for repeated calls to the same module", async () => {
      const { send, waitFor, mkId, createRunner } = createTestWorker();
      const runnerId = await createRunner();

      for (let i = 0; i < 3; i++) {
        const id = mkId();
        send({
          type: API.MessageToWorkerType.ModuleRPCHeadless,
          id,
          runnerId,
          moduleName: "wait",
          data: null
        });
        await waitFor(
          (msg): msg is API.AckMessage =>
            msg.type === API.MessageFromWorkerType.Ack &&
            (msg as API.AckMessage).messageToWorkerId === id
        );
      }
      // No crash, all three calls acked
    });
  });

  describe("ComputeAutocomplete", () => {
    it("sends ComputeAutocompleteResult with the request id", async () => {
      const { send, waitFor, mkId } = createTestWorker();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ComputeAutocomplete,
        id,
        code: "const x = 1; x.",
        currentRow: 0,
        currentCol: 16
      });
      const result = await waitFor(
        (msg): msg is API.ComputeAutocompleteResultMessage =>
          msg.type === API.MessageFromWorkerType.ComputeAutocompleteResult &&
          (msg as API.ComputeAutocompleteResultMessage).requestId === id
      );
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe("ComputeImports", () => {
    it("sends ComputeImportsResult with imports for valid code", async () => {
      const { send, waitFor, mkId } = createTestWorker();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ComputeImports,
        id,
        code: "const wait = require('wait');"
      });
      const result = await waitFor(
        (msg): msg is API.ComputeImportsResultMessage =>
          msg.type === API.MessageFromWorkerType.ComputeImportsResult &&
          (msg as API.ComputeImportsResultMessage).requestId === id
      );
      expect(result.failed).toBeFalsy();
      expect(result.imports).toContain("wait");
    });

    it("sends ComputeImportsResult with failed=true for invalid syntax", async () => {
      const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { send, waitFor, mkId } = createTestWorker();
      const id = mkId();
      send({
        type: API.MessageToWorkerType.ComputeImports,
        id,
        code: "^invalid syntax!@#"
      });
      const result = await waitFor(
        (msg): msg is API.ComputeImportsResultMessage =>
          msg.type === API.MessageFromWorkerType.ComputeImportsResult &&
          (msg as API.ComputeImportsResultMessage).requestId === id
      );
      expect(result.failed).toBe(true);
      spy.mockRestore();
    });
  });

  describe("SyncEntities", () => {
    it("does not crash for unknown runnerId", () => {
      const { send, mkId, mkRunnerId } = createTestWorker();
      expect(() => {
        send({
          type: API.MessageToWorkerType.SyncEntities,
          id: mkId(),
          runnerId: mkRunnerId(),
          updates: []
        });
      }).not.toThrow();
    });

    it("processes entity sync for a known runner without error", async () => {
      const { send, waitFor, mkId, createRunner, outbox } =
        createTestWorker();
      const runnerId = await createRunner();
      const sizeBefore = outbox.length;

      send({
        type: API.MessageToWorkerType.SyncEntities,
        id: mkId(),
        runnerId,
        updates: []
      });

      await new Promise((r) => setTimeout(r, 50));

      const executionErrors = outbox
        .slice(sizeBefore)
        .filter((m) => m.type === API.MessageFromWorkerType.ExecutionError);
      expect(executionErrors).toHaveLength(0);
    });
  });

  describe("teardown", () => {
    it("tears down with active runners without crashing", async () => {
      const { createRunner, worker } = createTestWorker();
      await createRunner();
      await createRunner();
      expect(() => worker.teardown()).not.toThrow();
    });
  });
});
