import RAPIER from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

export enum CollisionBehavior {
  Undefined,
  Collide,
  NoCollide,
  Callback,
  NoCollideWithCallback
}

export type PhysicsHooksAPI<EntityType> = {
  entityId: string;
  rigidBodyHandle?: number;
  colliderHandles?: number[];
  acceptCollisionByDefault?: boolean;
  beginCollision?: (
    thisEntity: EntityType,
    otherEntity: EntityType | undefined,
    normal: Vector2,
    thisColliderHandle: number,
    otherColliderHandle: number,
    isSolid: boolean
  ) => CollisionBehavior | void;
  handleOngoingCollision?: (
    otherEntity: EntityType,
    otherRigidBody: RAPIER.RigidBody,
    ms: number
  ) => void;
  endCollision?: (
    thisEntity: EntityType,
    otherEntity: EntityType | undefined,
    thisColliderHandle: number,
    otherColliderHandle: number,
    isSolid: boolean
  ) => void;
};
