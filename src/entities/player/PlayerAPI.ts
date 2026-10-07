import { Color, Object3D, Vector2, Vector3 } from "three";

import { BaseEntityType } from "src/api/entity";
import { CasterEntityAPI } from "src/api/entitySpellCasting";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";

import { CentralDataStoreBehavior } from "../shared/behaviors/CentralDataStoreBehavior";
import { CharacterPhysicsBehavior } from "../shared/behaviors/CharacterPhysics";

export type PlayerSpellcastingOpts = {
  color?: Color;
  speed?: number;
  holdEE?: DeferredEmitter;
  jumpToHoldFrame?: boolean;
};

export type InteractionProvider = {
  position: Vector3;
  setFocused: (focused: boolean) => void;
  onInteract: () => void;
};

export type PlayerAPI = BaseEntityType & {
  behaviors: {
    data: CentralDataStoreBehavior;
    physics: CharacterPhysicsBehavior;
  };
} & CasterEntityAPI & {
    // Flag for internal identification.
    _isPlayer: boolean;

    // Require visibility.
    object3D: Object3D;

    // This is used for cutscenes.
    setMovementEnabled(enabled: boolean): void;
    plotAndFollowPath(pos: Vector2): DeferredEmitter;

    // Interacting with the world.
    addInteraction(id: string, provider: InteractionProvider): void;
    removeInteraction(id: string): void;
    getCurrentInteractionProvider(): InteractionProvider | null;
    pickupItem(
      itemObject3D: Object3D,
      deferred: DeferredEmitter
    ): DeferredEmitter<
      {
        done: void;
        heldInTheAir: void;
        cancel: void;
      },
      "done",
      "cancel"
    >;

    // Used for facing right assignment and queries.
    isFacingRight(): boolean;
    faceImmediate(right: boolean): void;
  };

// Use this to termine whether a given thing is a player.
export function isPlayerAPI(entity: unknown): entity is PlayerAPI {
  return !!(entity as PlayerAPI | null | undefined)?._isPlayer;
}

export enum PlayerUpperBodyState {
  idle = "idle",
  jumping = "jumping",
  casting = "casting",
  swordSwing = "swordSwing",
  swordBlock = "swordBlock",
  swordParry = "swordParry",
  swordTransition = "swordTransition",
  obtainingItem = "obtainingItem",
  swimming = "swimming",
  climbing = "climbing",
  dying = "dying"
}

export enum PlayerLowerBodyState {
  synched = "synched",
  running = "running",
  jumping = "jumping"
}
