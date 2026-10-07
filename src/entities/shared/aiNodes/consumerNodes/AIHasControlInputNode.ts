import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { ControlEvents } from "src/api/controls";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { CentralDataStoreBehavior } from "../../behaviors/CentralDataStoreBehavior";

/**
 * Non-consuming check for whether a control input is currently active.
 * For continuous inputs (movement) this checks the current ratio.
 * For edge-triggered inputs (attack, parry, etc.) this checks the activated
 * flag without consuming it.
 *
 * Use ConsumeControlInput when the input should be consumed on read.
 */
class AIHasControlInputNode extends AINode {
  private readonly controlEvent: AINodeResolvedInput<ControlEvents>;

  constructor(inControlEvent: AINodeInput<ControlEvents>) {
    super();

    this.controlEvent = AINode.ResolveInput(inControlEvent);
  }

  run(data: AINodeData): AIResult {
    const dataBehavior = data.thisEntity.behaviors.data;
    if (!dataBehavior || !(dataBehavior instanceof CentralDataStoreBehavior))
      return AIResult.Failed;

    return dataBehavior.isInputActive(this.controlEvent.value)
      ? AIResult.Succeeded
      : AIResult.Failed;
  }
}

export const HasControlInput = createNode(AIHasControlInputNode);
