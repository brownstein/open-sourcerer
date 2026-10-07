import { CodingChallenge } from "src/api/codingChallenge";
import {
  SpellValidatorTestResult,
  createSpellValidationDeferredEmitter
} from "src/api/spellValidation";

export const cVariables: CodingChallenge = {
  id: "Variables",
  challengeName: (t) => t("challenges.names.variables"),
  segments: [
    {
      type: "coding",
      contentName: "Variables",
      validate: (ctx) => {
        const { spellCtx } = ctx;
        const deferred = createSpellValidationDeferredEmitter();
        const check = async () => {
          const vars = await spellCtx.getVars(["tests"]);
          const correct = vars.tests === "pass";
          const exited = spellCtx.runComplete && !spellCtx.error;
          const tests: SpellValidatorTestResult[] = [
            {
              name: "Defined a variable called tests",
              success: vars.tests !== undefined
            },
            {
              name: 'Assigned that variable\'s value to "pass"',
              success: correct
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
