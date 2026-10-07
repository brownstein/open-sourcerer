import { CodingChallenge } from "src/api/codingChallenge";
import {
  SpellValidatorTestResult,
  createSpellValidationDeferredEmitter
} from "src/api/spellValidation";
import { DummyFloat } from "src/entities/enemies/robots/Dummy";

export const cSparkNavigation: CodingChallenge = {
  id: "SparkNavigation",
  challengeName: () => "SparkNavigation",
  segments: [
    {
      type: "coding",
      contentName: "SparkNavigation",
      validate: (ctx) => {
        const deferred = createSpellValidationDeferredEmitter();
        const { moduleConstructorCounts } = ctx.spellCtx.getMetrics();
        const createdSparkTest: SpellValidatorTestResult = {
          name: "Created a Spark",
          success: (moduleConstructorCounts["spark"] ?? 0) > 0
        };
        const createdProjectileTest: SpellValidatorTestResult = {
          name: "Created a Projectile",
          success: (moduleConstructorCounts["projectile"] ?? 0) > 0
        };
        const dummyFloatCount =
          ctx.level?.getEntitiesForType(DummyFloat).length;
        const destroyedDummyTest: SpellValidatorTestResult = {
          name: "Destroyed the floating target dummy",
          success: dummyFloatCount === 0
        };
        const tests = [
          createdSparkTest,
          createdProjectileTest,
          destroyedDummyTest
        ];
        deferred.emit(
          "done",
          tests.every((t) => t.success)
            ? {
                type: "valid",
                tests
              }
            : {
                type: "invalid",
                tests
              }
        );
        return deferred;
      }
    }
  ]
};
