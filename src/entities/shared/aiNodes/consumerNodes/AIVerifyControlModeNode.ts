import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { ScriptedControlBehavior } from "../../behaviors/ScriptedControlBehavior";

/**
 * Succeeds when the entity's ScriptedControlBehavior is currently in the given
 * mode, otherwise fails. Gate a behavior-tree branch on this to make it the
 * active branch only while a particular (often cutscene-driven) control mode is
 * set. Fails (rather than throwing) if the entity has no ScriptedControlBehavior.
 */
class AIVerifyControlModeNode extends AINode {
  private readonly mode: AINodeResolvedInput<string>;

  constructor(inMode: AINodeInput<string>) {
    super();
    this.mode = AINode.ResolveInput(inMode);
  }

  run(data: AINodeData): AIResult {
    const scriptedControl = data.thisEntity.behaviors.scriptedControl;
    if (
      !scriptedControl ||
      !(scriptedControl instanceof ScriptedControlBehavior)
    )
      return AIResult.Failed;

    return scriptedControl.mode === this.mode.value
      ? AIResult.Succeeded
      : AIResult.Failed;
  }
}

export const VerifyControlMode = createNode(AIVerifyControlModeNode);
