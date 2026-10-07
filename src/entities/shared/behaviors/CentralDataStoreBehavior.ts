import { Vector2 } from "three";

import {
  ControlEventEmitter,
  ControlEventTypes,
  ControlEvents
} from "src/api/controls";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import { EventsProxy } from "src/engine/util/eventsProxy";
import { Text } from "src/entities/environment/Text";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";

import {
  CharacterGroundPhysicsControlBehavior,
  CharacterGroundPhysicsControlBehaviorEventTypes,
  CharacterGroundPhysicsControlBehaviorEvents
} from "./CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEventTypes,
  CharacterPhysicsEvents
} from "./CharacterPhysics";
import { NavPathFollowingBehavior } from "./NavPathFollowingBehavior";

type CompatibleEntity = BaseEntityType<{
  physics?: CharacterPhysicsBehavior;
  physicsControl?: CharacterGroundPhysicsControlBehavior;
  pathFollowing?: NavPathFollowingBehavior;
}>;

type dataEventsTypes = ControlEventTypes &
  CharacterPhysicsEventTypes &
  CharacterGroundPhysicsControlBehaviorEventTypes;

interface EntityData {
  hSpeedRatio: number;
  vSpeedRatio: number;
  linvel: Vector2;

  isFallingThroughPlatforms: boolean;
  isInWater: boolean;
  isFalling: boolean;
  isGrounded: boolean;
  isClimbing: boolean;
  climbingDirection: "up" | "down" | undefined;

  isJumping: boolean;
  isPreJumping: boolean;
  isJumpRising: boolean;
  isJumpPastApex: boolean;
  isJumpFalling: boolean;
}

export class CentralDataStoreBehavior
  implements EntityBehavior<CompatibleEntity>
{
  public type = "CentralDataStore";

  // NOTE: these are the buffered entity data that gets copied to the current entity data
  // every game tick in the step method, so data points are determinstic and predictable
  private readonly staged: EntityData = {
    hSpeedRatio: 0,
    vSpeedRatio: 0,
    linvel: new Vector2(),
    isFallingThroughPlatforms: false,
    isInWater: false,
    isFalling: false,
    isGrounded: false,
    isClimbing: false,
    climbingDirection: undefined,
    isJumping: false,
    isPreJumping: false,
    isJumpRising: false,
    isJumpPastApex: false,
    isJumpFalling: false
  };

  public readonly current: EntityData = {
    hSpeedRatio: 0,
    vSpeedRatio: 0,
    linvel: new Vector2(),
    isFallingThroughPlatforms: false,
    isInWater: false,
    isFalling: false,
    isGrounded: false,
    isClimbing: false,
    climbingDirection: undefined,
    isJumping: false,
    isPreJumping: false,
    isJumpRising: false,
    isJumpPastApex: false,
    isJumpFalling: false
  };
  public readonly previous: EntityData = {
    hSpeedRatio: 0,
    vSpeedRatio: 0,
    linvel: new Vector2(),
    isFallingThroughPlatforms: false,
    isInWater: false,
    isFalling: false,
    isGrounded: false,
    isClimbing: false,
    climbingDirection: undefined,
    isJumping: false,
    isPreJumping: false,
    isJumpRising: false,
    isJumpPastApex: false,
    isJumpFalling: false
  };

  // TODO: data store should probably not be the one in charge of this
  private activeInputsEventPool = new Set<ControlEvents>();
  private activeInputs = new Set<ControlEvents>();

  private level?: LevelAPI;
  private shouldListenToPlayerControlEvents = false;
  private hasListenedToPLayerControlsEvents = false;
  private shouldDisablePlayerControls = false;
  private hasDisabledPlayerControls = false;

  private readonly dataEventsProxy = new EventsProxy<dataEventsTypes>();
  private playerControlsEmitter?: ControlEventEmitter;

  get controlEvents(): ControlEventEmitter {
    return this.dataEventsProxy as unknown as ControlEventEmitter;
  }

  private physicsControl?: CharacterGroundPhysicsControlBehavior;
  private physics?: CharacterPhysicsBehavior;
  private pathFollowing?: NavPathFollowingBehavior;

  private entity?: CompatibleEntity;
  private debugTextEntity?: Text;

  init(entity: CompatibleEntity, showDebug: boolean = false): void {
    this.entity = entity;

    if (showDebug) {
      this.debugTextEntity = new Text({
        position: entity.position.clone(),
        troika: true,
        textPixelSize: 8,
        textAlign: "center",
        textWrap: false,
        textColor: "#FFFFFFFF",
        outline: true,
        outlineColor: "#000000FF"
      });
    }

    this.physicsControl = entity.behaviors.physicsControl;
    this.physics = entity.behaviors.physics;
    this.pathFollowing = entity.behaviors.pathFollowing;

    const isPlayer = isPlayerAPI(entity);
    this.shouldListenToPlayerControlEvents = isPlayer;

    if (this.pathFollowing) {
      this.dataEventsProxy.subscribe(
        this.pathFollowing.controlEvents,
        Object.values(ControlEvents)
      );
    }

    if (this.physicsControl) {
      this.dataEventsProxy.subscribe(
        this.physicsControl.events,
        Object.values(CharacterGroundPhysicsControlBehaviorEvents)
      );
    }

    if (this.physics) {
      this.dataEventsProxy.subscribe(
        this.physics.events,
        Object.values(CharacterPhysicsEvents)
      );
    }

    for (const event of Object.values(ControlEvents)) {
      if (
        event === ControlEvents.MoveHorizontally ||
        event === ControlEvents.MoveVertically
      ) {
        this.dataEventsProxy.on(event, (value: number) => {
          if (value !== 0) this.activeInputsEventPool.add(event);
          else this.activeInputsEventPool.delete(event);
        });
      } else {
        this.dataEventsProxy.on(event, () =>
          this.activeInputsEventPool.add(event)
        );
      }
    }

    this.dataEventsProxy.on(ControlEvents.MoveHorizontally, (dx) => {
      this.staged.hSpeedRatio = dx;
    });
    this.dataEventsProxy.on(
      ControlEvents.MoveVertically,
      (dy) => (this.staged.vSpeedRatio = dy)
    );
    this.dataEventsProxy.on(
      ControlEvents.FallThrough,
      () => (this.staged.isFallingThroughPlatforms = true)
    );
    this.dataEventsProxy.on(
      ControlEvents.FallThroughEnd,
      () => (this.staged.isFallingThroughPlatforms = false)
    );

    this.dataEventsProxy.on(
      CharacterGroundPhysicsControlBehaviorEvents.PreJump,
      () => (this.staged.isPreJumping = true)
    );
    this.dataEventsProxy.on(
      CharacterGroundPhysicsControlBehaviorEvents.Jump,
      () => {
        this.staged.isPreJumping = false;
        this.staged.isJumpRising = true;
        this.staged.isJumping = true;
      }
    );
    this.dataEventsProxy.on(
      CharacterGroundPhysicsControlBehaviorEvents.JumpApex,
      () => {
        this.staged.isJumpRising = false;
        this.staged.isJumpFalling = true;
        this.staged.isFalling = true;
        this.staged.isJumpPastApex = true;
      }
    );
    this.dataEventsProxy.on(
      CharacterGroundPhysicsControlBehaviorEvents.Fall,
      () => {
        // this is not related to jumps, but for walking off edges
        this.staged.isFalling = true;
      }
    );
    this.dataEventsProxy.on(
      CharacterGroundPhysicsControlBehaviorEvents.Land,
      () => {
        this.staged.isJumping = false;
        this.staged.isPreJumping = false;
        this.staged.isJumpRising = false;
        this.staged.isJumpPastApex = false;
        this.staged.isJumpFalling = false;
        this.staged.isFalling = false;
      }
    );

    this.dataEventsProxy.on(
      CharacterPhysicsEvents.AttachLadder,
      () => (this.staged.isClimbing = true)
    );
    this.dataEventsProxy.on(
      CharacterPhysicsEvents.DetachLadder,
      () => (this.staged.isClimbing = false)
    );
  }

  /**
   * Disables the player keyboard control events emitter on the proxy,
   * blocking keyboard input from reaching the physics controller while
   * allowing physics events (Fall, Land, etc.) and programmatic control
   * event emits to continue propagating.
   */
  disableControls(): void {
    this.shouldDisablePlayerControls = true;

    if (this.playerControlsEmitter) {
      this.hasDisabledPlayerControls = true;
      this.dataEventsProxy.disableEmitter(this.playerControlsEmitter);
    }
  }

  /**
   * Re-enables the player keyboard control events emitter after a prior
   * disableControls() call.
   */
  enableControls(): void {
    if (this.playerControlsEmitter) {
      this.dataEventsProxy.enableEmitter(this.playerControlsEmitter);
    }
  }

  /**
   * Checks and consumes a control input. Returns true if the input was
   * activated since the last frame and removes it so subsequent calls in the
   * same frame return false.
   */
  consumeInput(event: ControlEvents): boolean {
    return this.activeInputs.delete(event);
  }

  /**
   * Non-consuming check for whether a control input is currently active.
   */
  isInputActive(event: ControlEvents): boolean {
    return this.activeInputs.has(event);
  }

  attachToLevel(level: EntityLevelAPI): void {
    this.level = level;
    level.on(EntityLevelEvents.Step, this.step);
    if (this.debugTextEntity) level.addEntity(this.debugTextEntity);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);

    if (this.debugTextEntity) level.removeEntity(this.debugTextEntity.id);

    if (this.pathFollowing) {
      this.dataEventsProxy.unsubscribe(this.pathFollowing.controlEvents);
    }

    if (this.physicsControl) {
      this.dataEventsProxy.unsubscribe(this.physicsControl.events);
    }

    if (this.physics) {
      this.dataEventsProxy.unsubscribe(this.physics.events);
    }

    if (this.hasListenedToPLayerControlsEvents && level.controls) {
      this.dataEventsProxy.unsubscribe(level.controls.events);
    }
  }

  readonly step = (_deltaMs: number): void => {
    this.activeInputs.clear();
    for (const event of this.activeInputsEventPool) {
      this.activeInputs.add(event);
    }
    this.activeInputsEventPool.clear();

    if (
      this.shouldListenToPlayerControlEvents &&
      !this.hasListenedToPLayerControlsEvents &&
      this.level &&
      this.level.controls
    ) {
      this.hasListenedToPLayerControlsEvents = true;
      this.playerControlsEmitter = this.level.controls.events;
      this.dataEventsProxy.subscribe(
        this.playerControlsEmitter,
        Object.values(ControlEvents)
      );

      if (this.shouldDisablePlayerControls && !this.hasDisabledPlayerControls)
        this.disableControls();
    }

    this._updateNonEventDrivenDataPoints();

    this._fillInPreviousDataPoints();
    this._resolveNewDataPoints();

    this._updateDebugText();
  };

  private _updateNonEventDrivenDataPoints(): void {
    if (this.physicsControl) {
      this.staged.isGrounded = !!this.physicsControl.isGrounded();
    }

    if (this.staged.isClimbing) {
      if (this.staged.vSpeedRatio < 0) this.staged.climbingDirection = "down";
      else if (this.staged.vSpeedRatio === 0)
        this.staged.climbingDirection = undefined;
      else this.staged.climbingDirection = "up";
    } else this.staged.climbingDirection = undefined;

    if (this.physics) {
      this.staged.isInWater = this.physics.isInWater();
    }

    const body = this.physics?.body;
    if (body) {
      this.staged.linvel.copy(body.linvel());
    }
  }

  private _fillInPreviousDataPoints(): void {
    // WARN: let's keep this explicit and not use Object.assign, since we could store
    // non primitive data types at some point

    this.previous.hSpeedRatio = this.current.hSpeedRatio;
    this.previous.vSpeedRatio = this.current.vSpeedRatio;
    this.previous.linvel.copy(this.current.linvel);

    this.previous.isFallingThroughPlatforms =
      this.current.isFallingThroughPlatforms;

    this.previous.isJumping = this.current.isJumping;
    this.previous.isPreJumping = this.current.isPreJumping;
    this.previous.isJumpRising = this.current.isJumpRising;
    this.previous.isJumpPastApex = this.current.isJumpPastApex;
    this.previous.isJumpFalling = this.current.isJumpFalling;

    this.previous.isFalling = this.current.isFalling;
    this.previous.isGrounded = this.current.isGrounded;
    this.previous.isClimbing = this.current.isClimbing;
    this.previous.climbingDirection = this.current.climbingDirection;

    this.previous.isInWater = this.current.isInWater;
  }

  private _resolveNewDataPoints(): void {
    // WARN: let's keep this explicit and not use Object.assign, since we could store
    // non primitive data types at some point

    this.current.hSpeedRatio = this.staged.hSpeedRatio;
    this.current.vSpeedRatio = this.staged.vSpeedRatio;
    this.current.linvel.copy(this.staged.linvel);
    this.current.isFallingThroughPlatforms =
      this.staged.isFallingThroughPlatforms;

    this.current.isJumping = this.staged.isJumping;
    this.current.isPreJumping = this.staged.isPreJumping;
    this.current.isJumpRising = this.staged.isJumpRising;
    this.current.isJumpPastApex = this.staged.isJumpPastApex;
    this.current.isJumpFalling = this.staged.isJumpFalling;

    this.current.isFalling = this.staged.isFalling;
    this.current.isGrounded = this.staged.isGrounded;
    this.current.isClimbing = this.staged.isClimbing;
    this.current.climbingDirection = this.staged.climbingDirection;

    this.current.isInWater = this.staged.isInWater;
  }

  private _updateDebugText(): void {
    if (this.debugTextEntity && this.entity) {
      this.debugTextEntity.position.copy(this.entity.position).y +=
        this.entity.size.height * 0.5 + 3.2;

      // prettier-ignore
      this.debugTextEntity.update(
        `hSpeedRatio: ${this.current.hSpeedRatio} | ` +
        `hSpeedRatioLastFrame: ${this.previous.hSpeedRatio}\n` +
        `xVel: ${this.current.linvel.x.toFixed(2)} | ` +
        `yVel: ${this.current.linvel.y.toFixed(2)}\n` +
        `vSpeedRatio: ${this.current.vSpeedRatio} | ` +
        `isFallingThroughPlatforms: ${this.current.isFallingThroughPlatforms}\n` +
        `isJumping: ${this.current.isJumping} | ` +
        `isPreJumping: ${this.current.isPreJumping}\n` +
        `isJumpRising: ${this.current.isJumpRising} | ` +
        `isJumpPastApex: ${this.current.isJumpPastApex}\n` +
        `isJumpFalling: ${this.current.isJumpFalling} | ` +
        `isFalling: ${this.current.isFalling}\n` +
        `isGrounded: ${this.current.isGrounded} | ` +
        `wasGroundedLastFrame: ${this.previous.isGrounded}\n` +
        `isClimbing: ${this.current.isClimbing} | ` +
        `climbingDirection: ${this.current.climbingDirection}\n` +
        `isInWater: ${this.current.isInWater}\n`
      );
    }
  }
}
