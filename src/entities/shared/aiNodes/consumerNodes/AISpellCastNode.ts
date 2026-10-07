import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { SpellsAPI } from "src/api/spells";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

export type SpellCastOptions = {
  /** The spell code to execute */
  spellCode: string;
  /** A function that returns the SpellsAPI, since it may not be available at construction time */
  getSpellApi: () => SpellsAPI | undefined;
};

class AISpellCastNode extends AINode {
  private readonly options: AINodeResolvedInput<SpellCastOptions>;

  constructor(inOptions: AINodeInput<SpellCastOptions>) {
    super();
    this.options = AINode.ResolveInput(inOptions);
  }

  run(data: AINodeData): AIResult {
    const { spellCode, getSpellApi } = this.options.value;
    const spellApi = getSpellApi();
    if (!spellApi) return AIResult.Failed;

    spellApi.run(spellCode, data.thisEntity.id).catch((e) => {
      console.error(e);
    });

    return AIResult.Succeeded;
  }
}

export const SpellCast = createNode(AISpellCastNode);
