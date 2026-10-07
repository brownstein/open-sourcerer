import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { DamageType } from "src/api/entity";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import {
  AnimationControlBehavior,
  AnimationPriority
} from "src/entities/shared/behaviors/AnimationControlBehavior";
import { EnemyAggroBehavior } from "src/entities/shared/behaviors/EnemyAggroBehavior";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

function isAggroTargetAttacking(data: AINodeData): boolean {
  const aggro = data.thisEntity.behaviors.aggro;
  if (!(aggro instanceof EnemyAggroBehavior)) return false;
  const target = aggro.resolveCurrentTarget();
  if (!target) return false;
  const anim = (target.behaviors as Record<string, unknown>).animation;
  if (!(anim instanceof AnimationControlBehavior)) return false;
  return anim.currentAnimation?.priorityLevel === AnimationPriority.ACTION;
}

class AIIsHealthAboveThresholdNode extends AINode {
  private readonly threshold: AINodeResolvedInput<number>;

  constructor(inThreshold: AINodeInput<number>) {
    super();
    this.threshold = AINode.ResolveInput(inThreshold);
  }

  run(data: AINodeData): AIResult {
    const status = data.thisEntity.behaviors.status;
    if (!(status instanceof StatusBehavior)) return AIResult.Failed;
    return status.health > status.maxHealth * this.threshold.value
      ? AIResult.Succeeded
      : AIResult.Failed;
  }
}

class AIIsAggroedEntityAttackingNode extends AINode {
  run(data: AINodeData): AIResult {
    return isAggroTargetAttacking(data) ? AIResult.Succeeded : AIResult.Failed;
  }
}

class AIWaitWhileAggroedEntityAttackingNode extends AINode {
  private readonly gracePeriodMs: AINodeResolvedInput<number>;
  private lastSeenAttackingMs = -Infinity;
  private hasSeenAttack = false;

  constructor(inGracePeriodMs: AINodeInput<number>) {
    super();
    this.gracePeriodMs = AINode.ResolveInput(inGracePeriodMs);
  }

  reset(): void {
    super.reset();
    this.lastSeenAttackingMs = -Infinity;
    this.hasSeenAttack = false;
  }

  run(data: AINodeData): AIResult {
    if (isAggroTargetAttacking(data)) {
      this.lastSeenAttackingMs = data.totalMs;
      this.hasSeenAttack = true;
    }
    if (!this.hasSeenAttack) return AIResult.Succeeded;
    if (data.totalMs - this.lastSeenAttackingMs < this.gracePeriodMs.value)
      return AIResult.Running;
    return AIResult.Succeeded;
  }
}

type ProximityHitConfig = {
  damage: number;
  damageType: DamageType;
  impulse: Vector2;
  range: number;
};

class AIProximityHitOnceNode extends AINode {
  private hasHit = false;
  private readonly config: AINodeResolvedInput<ProximityHitConfig>;

  constructor(inConfig: AINodeInput<ProximityHitConfig>) {
    super();
    this.config = AINode.ResolveInput(inConfig);
  }

  reset(): void {
    super.reset();
    this.hasHit = false;
  }

  run(data: AINodeData): AIResult {
    if (this.hasHit) return AIResult.Running;

    const aggro = data.thisEntity.behaviors.aggro;
    if (!(aggro instanceof EnemyAggroBehavior)) return AIResult.Running;
    const target = aggro.resolveCurrentTarget();
    if (!target) return AIResult.Running;

    const dx = target.position.x - data.thisEntity.position.x;
    const dy = target.position.y - data.thisEntity.position.y;
    const { range, damage, damageType, impulse } = this.config.value;
    if (dx * dx + dy * dy >= range * range) return AIResult.Running;

    this.hasHit = true;
    const anim = data.thisEntity.behaviors.animation;
    const dir =
      anim instanceof AnimationControlBehavior ? anim.facingDirection : 1;
    target.hit?.({
      hittingEntity: data.thisEntity,
      sourceEntity: data.thisEntity,
      damage,
      damageType,
      hitImpulse: new Vector2(impulse.x * dir, impulse.y)
    });
    return AIResult.Running;
  }
}

const IsHealthAboveThreshold = createNode(AIIsHealthAboveThresholdNode);
export const IsPhase1 = () => IsHealthAboveThreshold(0.5);
export const IsPhase2 = () => IsHealthAboveThreshold(0.25);
export const IsAggroedEntityAttacking = createNode(
  AIIsAggroedEntityAttackingNode
);
export const ProximityHitOnce = createNode(AIProximityHitOnceNode);
export const WaitWhileAggroedEntityAttacking = createNode(
  AIWaitWhileAggroedEntityAttackingNode
);
