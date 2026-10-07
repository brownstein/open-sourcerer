import { RigidBody } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import {
  AINodeData,
  AINodeInput,
  AINodeOutput,
  AINodeResolvedInput,
  AIResult
} from "src/api/ai";
import { LevelAPI } from "src/api/entity";
import { CBM } from "src/engine/constants/collisionGroups";
import { AINode, createNode } from "src/engine/entity/AIBehaviorTree";
import { isAnyPlatform } from "src/entities/terrain/allTerrain";
import { getUnobstructedJumpVelocity } from "src/util/physicsUtils";

import { CharacterPhysicsBehavior } from "../../behaviors/CharacterPhysics";

class AIGetUnobstructedJumpVelocityNode extends AINode {
  private readonly unobstructedJumpVelocity: AINodeOutput<Vector2 | null>;
  private readonly targetLandingOffset: AINodeResolvedInput<Vector2>;
  private readonly maxJumpSpeed: AINodeResolvedInput<number | undefined>;
  private readonly minJumpAngle: AINodeResolvedInput<number | undefined>;
  private readonly maxJumpAngle: AINodeResolvedInput<number | undefined>;
  private readonly shouldFindGreatestUnobstructedJumpAngle: AINodeResolvedInput<boolean>;

  constructor(
    outUnobstructedJumpVelocity: AINodeOutput<Vector2 | null>,
    inTargetLandingOffset: AINodeInput<Vector2>,
    inMaxJumpSpeed: AINodeInput<number | undefined> = undefined,
    inMinJumpAngle: AINodeInput<number | undefined> = undefined,
    inMaxJumpAngle: AINodeInput<number | undefined> = undefined,
    inShouldFindGreatestUnobstructedJumpAngle: AINodeInput<boolean> = true
  ) {
    super();

    this.unobstructedJumpVelocity = outUnobstructedJumpVelocity;
    this.targetLandingOffset = AINode.ResolveInput(inTargetLandingOffset);
    this.maxJumpSpeed = AINode.ResolveInput(inMaxJumpSpeed);
    this.minJumpAngle = AINode.ResolveInput(inMinJumpAngle);
    this.maxJumpAngle = AINode.ResolveInput(inMaxJumpAngle);
    this.shouldFindGreatestUnobstructedJumpAngle = AINode.ResolveInput(
      inShouldFindGreatestUnobstructedJumpAngle
    );
  }

  run(data: AINodeData): AIResult {
    const physicsBehavior = data.thisEntity.behaviors.physics;
    if (
      !physicsBehavior ||
      !(physicsBehavior instanceof CharacterPhysicsBehavior)
    )
      return AIResult.Failed;

    const body = physicsBehavior.body;
    if (!body) return AIResult.Failed;

    const jumpVelocity = getUnobstructedJumpVelocity(
      data.level.world,
      body,
      data.level.world.gravity.y * body.gravityScale(),
      this.targetLandingOffset.value,
      this.maxJumpSpeed.value,
      this.minJumpAngle.value,
      this.maxJumpAngle.value,
      this.shouldFindGreatestUnobstructedJumpAngle.value,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const groups = collider.collisionGroups();
        const membership = groups >> 16;

        const isTerrain = (membership & CBM.Terrain) !== 0;

        if (isTerrain) {
          const colliderParentRigidBody = collider.parent();
          if (!colliderParentRigidBody) return isTerrain;

          const terrainEntity = data.level.getEntityForRigidBody(
            colliderParentRigidBody.handle
          );

          if (!terrainEntity) return isTerrain;

          const isPlatform = isAnyPlatform(terrainEntity);

          if (isPlatform) return false;
        }

        return isTerrain;
      }
    );

    this.unobstructedJumpVelocity.value = jumpVelocity;

    if (!jumpVelocity) return AIResult.Failed;

    return AIResult.Succeeded;
  }
}

export const GetUnobstructedJumpVelocity = createNode(
  AIGetUnobstructedJumpVelocityNode
);
