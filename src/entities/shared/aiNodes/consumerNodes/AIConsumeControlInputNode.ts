import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CentralDataStoreBehavior } from "../../behaviors/CentralDataStoreBehavior";

class AIConsumeControlInputNode extends AINode {
  private readonly controlEvent: AINodeResolvedInput<ControlEvents>;

  constructor(inControlEvent: AINodeInput<ControlEvents>) {
    super();

    this.controlEvent = AINode.ResolveInput(inControlEvent);
  }

  run(data: AINodeData): AIResult {
    const dataBehavior = data.thisEntity.behaviors.data;
    if (!dataBehavior || !(dataBehavior instanceof CentralDataStoreBehavior))
      return AIResult.Failed;

    const consumed = dataBehavior.consumeInput(this.controlEvent.value);

    return consumed ? AIResult.Succeeded : AIResult.Failed;
  }
}

export const ConsumeControlInput = createNode(AIConsumeControlInputNode);
