import { parse } from "acorn";

import { CodingChallenge } from "src/api/codingChallenge";
import {
  SpellValidatorTestResult,
  createSpellValidationDeferredEmitter
} from "src/api/spellValidation";
import { recurseIntoAcornProgram } from "src/util/acornUtills";

export const cConditionalsAndLoops: CodingChallenge = {
  id: "ConditionalsAndLoops",
  challengeName: () => "Conditionals and Loops",
  segments: [
    {
      type: "coding",
      contentName: "Conditionals",
      validate: (ctx) => {
        console.log("check 1 run");
        const { spellCtx } = ctx;
        const deferred = createSpellValidationDeferredEmitter();
        const check = () => {
          let usedConditional = false;
          const program = parse(spellCtx.initialCode, {
            ecmaVersion: 2025
          });
          recurseIntoAcornProgram((node) => {
            if (node.type === "IfStatement") usedConditional = true;
          }, program);
          const exited = spellCtx.runComplete && !spellCtx.error;
          const tests: SpellValidatorTestResult[] = [
            {
              name: "Used a conditional",
              success: usedConditional
            },
            {
              name: "Exited successfully",
              success: exited
            }
          ];
          deferred.emit("done", {
            type: tests.every((t) => t.success) ? "valid" : "invalid",
            tests
          });
        };
        check();
        return deferred;
      }
    },
    {
      type: "coding",
      contentName: "Loops",
      validate: (ctx) => {
        const { spellCtx } = ctx;
        const deferred = createSpellValidationDeferredEmitter();
        const check = () => {
          console.log("check 2 run");
          let usedForLoop = false;
          const program = parse(spellCtx.initialCode, {
            ecmaVersion: 2025
          });
          recurseIntoAcornProgram((node) => {
            if (node.type === "ForStatement") usedForLoop = true;
          }, program);
          let logLinesMatched = true;
          const expectedLogLines: string[] = [];
          for (let i = 1; i <= 30; i++) {
            if (i % 3 === 0 && i % 5 === 0) {
              expectedLogLines.push(`fizzbuzz ${i}`);
              continue;
            }
            if (i % 3 === 0) {
              expectedLogLines.push(`fizz ${i}`);
              continue;
            }
            if (i % 5 === 0) {
              expectedLogLines.push(`buzz ${i}`);
              continue;
            }
          }
          for (let i = 0; i < expectedLogLines.length; i++) {
            if (spellCtx.consoleOutput.at(i)?.primitiveValue !== expectedLogLines[i]) {
              logLinesMatched = false;
              break;
            }
          }
          const exited = spellCtx.runComplete && !spellCtx.error;
          const tests: SpellValidatorTestResult[] = [
            {
              name: "Used a for loop",
              success: usedForLoop
            },
            {
              name: "Program output matches expected behavior",
              success: logLinesMatched
            },
            {
              name: "Exited successfully",
              success: exited
            }
          ];
          deferred.emit("done", {
            type: tests.every((t) => t.success) ? "valid" : "invalid",
            tests
          });
        };
        check();
        return deferred;
      }
    }
  ]
};
