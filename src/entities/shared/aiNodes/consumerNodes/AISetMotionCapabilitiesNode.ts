import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import { MotionCapabilitiesBehavior } from "../../behaviors/MotionCapabilities";
import { NavPathFollowingBehavior } from "../../behaviors/NavPathFollowingBehavior";

interface MotionCapabilityOptions {
  groundSpeed?: number;
  flightSpeed?: number;
  canJump?: boolean;
  jumpImpulse?: number;
  jumpHeight?: number;
  canFly?: boolean;
}

class AISetMotionCapabilitiesNode extends AINode {
  private readonly motionCapabilityOptions: AINodeResolvedInput<MotionCapabilityOptions>;

  constructor(inOptions: AINodeInput<MotionCapabilityOptions>) {
    super();

    this.motionCapabilityOptions = AINode.ResolveInput(inOptions);
  }

  run(data: AINodeData): AIResult {
    const motionCapabilitiesBehavior =
      data.thisEntity.behaviors.motionCapabilities;
    if (
      !motionCapabilitiesBehavior ||
      !(motionCapabilitiesBehavior instanceof MotionCapabilitiesBehavior)
    )
      return AIResult.Failed;

    const motionCapabilities = motionCapabilitiesBehavior.capabilities;
    const options = this.motionCapabilityOptions.value;
    const mergedOptions: MotionCapabilityOptions = {
      groundSpeed: options.groundSpeed ?? motionCapabilities.maxGroundAccelX,
      flightSpeed: options.flightSpeed ?? motionCapabilities.maxFlySpeed,
      canJump: options.canJump ?? motionCapabilities.canJump,
      jumpImpulse: options.jumpImpulse ?? motionCapabilities.maxJumpImpulseY,
      jumpHeight: options.jumpHeight ?? undefined,
      canFly: options.canFly ?? motionCapabilities.canFly
    };

    if (mergedOptions.groundSpeed !== undefined)
      motionCapabilitiesBehavior.setSpeedLimits(
        mergedOptions.groundSpeed,
        mergedOptions.flightSpeed
      );

    if (mergedOptions.canJump !== undefined)
      motionCapabilitiesBehavior.setJump(
        mergedOptions.canJump,
        mergedOptions.jumpImpulse,
        mergedOptions.jumpHeight
      );

    if (mergedOptions.canFly !== undefined)
      motionCapabilitiesBehavior.setFly(mergedOptions.canFly);

    const pathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      pathFollowingBehavior &&
      pathFollowingBehavior instanceof NavPathFollowingBehavior
    )
      pathFollowingBehavior.setMotionCapabilities(motionCapabilities);

    return AIResult.Succeeded;
  }
}

export const SetMotionCapabilities = createNode(AISetMotionCapabilitiesNode);
