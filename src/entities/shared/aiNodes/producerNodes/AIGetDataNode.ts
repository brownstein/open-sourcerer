import { AINodeData, AINodeOutput, AIResult } from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

class AIGetDataNode extends AINode {
  private readonly data: AINodeOutput<AINodeData>;

  constructor(outData: AINodeOutput<AINodeData>) {
    super();

    this.data = outData;
  }

  run(data: AINodeData): AIResult {
    this.data.value = { ...data };
    return AIResult.Succeeded;
  }
}

export const GetData = createNode(AIGetDataNode);
