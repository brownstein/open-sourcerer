import { CodingChallenge } from "src/api/codingChallenge";
import { createSpellValidationDeferredEmitter } from "src/api/spellValidation";

export const cPing: CodingChallenge = {
  id: "Ping",
  challengeName: () => "Ping",
  segments: [
    {
      type: "coding",
      contentName: "Ping",
      validate: (ctx) => {
        const deferred = createSpellValidationDeferredEmitter();
        deferred.emit("done", { type: "valid" });
        return deferred;
      }
    }
  ]
};
