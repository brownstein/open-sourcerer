import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { NavAttackInfo } from "src/api/navigation";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";

import {
  NavPathFollowingBehavior,
  PathFollowingBehaviorEvents
} from "../../behaviors/NavPathFollowingBehavior";

class AIMoveToAttackPositionNode extends AINode {
  private readonly targetPosition: AINodeResolvedInput<Vector2>;

  private pathFollowingBehavior?: NavPathFollowingBehavior;
  private hasInitiatedPathFollowing = false;
  private attackReady = false;
  private pathComplete = false;
  private onAttackReady = (_info: NavAttackInfo) => {
    this.attackReady = true;
  };
  private onPathComplete = () => {
    this.pathComplete = true;
  };
  private onPathPlanningFailed = () => {
    this.pathComplete = true;
  };

  constructor(inTargetPosition: AINodeInput<Vector2>) {
    super();

    this.targetPosition = AINode.ResolveInput(inTargetPosition);
  }

  reset(): void {
    this.hasInitiatedPathFollowing = false;
    this.attackReady = false;
    this.pathComplete = false;

    if (this.pathFollowingBehavior) {
      this.pathFollowingBehavior.cancelPath();
      this.removeListeners();
    }
  }

  run(data: AINodeData): AIResult {
    const pathFollowingBehavior = data.thisEntity.behaviors.pathFollowing;
    if (
      !pathFollowingBehavior ||
      !(pathFollowingBehavior instanceof NavPathFollowingBehavior)
    )
      return AIResult.Failed;
    this.pathFollowingBehavior = pathFollowingBehavior;

    if (!this.hasInitiatedPathFollowing) {
      this.attackReady = false;
      this.pathComplete = false;

      this.pathFollowingBehavior.pathEvents.on(
        PathFollowingBehaviorEvents.AttackReady,
        this.onAttackReady
      );
      this.pathFollowingBehavior.pathEvents.on(
        PathFollowingBehaviorEvents.PathComplete,
        this.onPathComplete
      );
      this.pathFollowingBehavior.pathEvents.on(
        PathFollowingBehaviorEvents.PathPlanningFailed,
        this.onPathPlanningFailed
      );

      this.pathFollowingBehavior.planAndFollowAttackPathToPosition(
        this.targetPosition.value
      );

      this.hasInitiatedPathFollowing = true;
    }

    if (this.attackReady) {
      this.cleanup();
      return AIResult.Succeeded;
    }

    if (this.pathComplete) {
      this.cleanup();
      return AIResult.Failed;
    }

    if (this.pathFollowingBehavior.isPathFollowing()) {
      return AIResult.Running;
    }

    return AIResult.Running;
  }

  private cleanup() {
    this.hasInitiatedPathFollowing = false;
    this.removeListeners();
  }

  private removeListeners() {
    if (this.pathFollowingBehavior) {
      this.pathFollowingBehavior.pathEvents.off(
        PathFollowingBehaviorEvents.AttackReady,
        this.onAttackReady
      );
      this.pathFollowingBehavior.pathEvents.off(
        PathFollowingBehaviorEvents.PathComplete,
        this.onPathComplete
      );
      this.pathFollowingBehavior.pathEvents.off(
        PathFollowingBehaviorEvents.PathPlanningFailed,
        this.onPathPlanningFailed
      );
    }
  }
}

export const MoveToAttackPosition = createNode(AIMoveToAttackPositionNode);
