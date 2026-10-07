import {
  CodingChallenge,
} from "src/api/codingChallenge";
import {
  SpellValidatorTestResult,
  createSpellValidationDeferredEmitter
} from "src/api/spellValidation";
import { SpellCtxEvents } from "src/api/spells";

export const cHelloWorld: CodingChallenge = {
  id: "HelloWorld",
  challengeName: (t) => t("challenges.names.helloWorld"),
  segments: [
    {
      type: "text",
      contentName: "HelloWorldPreface"
    },
    {
      type: "coding",
      contentName: "HelloWorld",
      validatesLive: true,
      validate: (ctx) => {
        const { spellCtx } = ctx;
        const deferred = createSpellValidationDeferredEmitter();
        let logged = false;
        const updateState = (done?: boolean, aborted?: boolean) => {
          if (deferred.getDone() || deferred.getCancelled()) return;
          const logTest: SpellValidatorTestResult = {
            name: "Logged Hello World to console.",
            success: logged,
            inProgress: !done
          };
          const exitTest: SpellValidatorTestResult = {
            name: "Script completed successfully.",
            success: done && !spellCtx.error,
            inProgress: !done && !aborted
          };
          const tests = [logTest, exitTest];
          if (!done) {
            deferred.emit("progress", {
              type: "progress",
              tests
            });
          } else if (spellCtx.error || aborted) {
            deferred.emit("error", {
              type: "invalid",
              tests,
              error: spellCtx.error,
              aborted
            });
          } else {
            deferred.emit("done", {
              type: tests.every((t) => t.success) ? "valid" : "invalid",
              tests,
            });
          }
        };
        if (spellCtx.runComplete) {
          for (const logLine of spellCtx.consoleOutput) {
            if (typeof logLine.primitiveValue !== "string") continue;
            if (logLine.primitiveValue.toLowerCase().includes("hello world")) {
              logged = true;
              break;
            }
          }
          updateState(true, false);
        } else {
          spellCtx.events.on(SpellCtxEvents.runProgress, () =>
            updateState(false)
          );
          spellCtx.events.on(SpellCtxEvents.consoleLog, (logLine) => {
            if (typeof logLine.primitiveValue !== "string") return;
            if (logLine.primitiveValue.toLowerCase().includes("hello world")) {
              logged = true;
            }
          });
          spellCtx.events.on(SpellCtxEvents.runComplete, () => updateState(true));
          spellCtx.events.on(SpellCtxEvents.runTerminated, () =>
            updateState(false, true)
          );
        }
        return deferred;
      }
    }
  ]
};
