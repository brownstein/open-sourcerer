import { ProtoSpriteThree } from "protosprite-three";
import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";

import { CentralDataStoreBehavior } from "./CentralDataStoreBehavior";

export enum AnimationPriority {
  PHYSICS = 0,
  MINOR_REACTION = 1, // hitstun animation
  ACTION = 2, // opening a chest or something, idk.
  REACTION = 3, // getting hit
  CRITICAL = 4 // dying and stuff
}

export enum SpriteFacingDirection {
  LEFT = -1,
  RIGHT = 1
}

export interface APIAnimationData<TAnimations extends string> {
  tagName: TAnimations;
  startFrame?: number;
  startingOffset?: number;
  endFrame?: number;
  speedScaler?: number;
  flipFacing?: boolean;
  isLooping?: boolean;
  priorityLevel: AnimationPriority;
}

type AnimationData<TAnimations extends string> = Required<
  APIAnimationData<TAnimations>
>;

type APIAnimationWithConstantPriorityLevel<
  TAnimations extends string,
  Priority extends AnimationPriority
> = Omit<APIAnimationData<TAnimations>, "priorityLevel"> & {
  priorityLevel: Priority;
};

export type APIPhysicsAnimationData<TAnimations extends string> =
  APIAnimationWithConstantPriorityLevel<TAnimations, AnimationPriority.PHYSICS>;

export type APIPhysicsAnimationDataMap<TAnimations extends string> = Partial<{
  idle: APIPhysicsAnimationData<TAnimations>;
  walk: APIPhysicsAnimationData<TAnimations>;
  crouch: APIPhysicsAnimationData<TAnimations>;
  uncrouch: APIPhysicsAnimationData<TAnimations>;
  crouchWalk: APIPhysicsAnimationData<TAnimations>;
  preJump: APIPhysicsAnimationData<TAnimations>;
  jumpRising: APIPhysicsAnimationData<TAnimations>;
  jumpFalling: APIPhysicsAnimationData<TAnimations>;
  falling: APIPhysicsAnimationData<TAnimations>;
  postJump: APIPhysicsAnimationData<TAnimations>;
  flying: APIPhysicsAnimationData<TAnimations>;
  climbing: APIPhysicsAnimationData<TAnimations>;
  swimming: APIPhysicsAnimationData<TAnimations>;
  turn: APIPhysicsAnimationData<TAnimations>;
  fallbackAnimation: APIPhysicsAnimationData<TAnimations>;
}>;

type AnimationWithConstantPriorityLevel<
  TAnimations extends string,
  Priority extends AnimationPriority
> = Omit<AnimationData<TAnimations>, "priorityLevel"> & {
  priorityLevel: Priority;
};

type PhysicsAnimationData<TAnimations extends string> =
  AnimationWithConstantPriorityLevel<TAnimations, AnimationPriority.PHYSICS>;

type PhysicsAnimationDataMap<TAnimations extends string> = Partial<{
  idle: PhysicsAnimationData<TAnimations>;
  walk: PhysicsAnimationData<TAnimations>;
  crouch: PhysicsAnimationData<TAnimations>;
  uncrouch: PhysicsAnimationData<TAnimations>;
  crouchWalk: PhysicsAnimationData<TAnimations>;
  preJump: PhysicsAnimationData<TAnimations>;
  jumpRising: PhysicsAnimationData<TAnimations>;
  jumpFalling: PhysicsAnimationData<TAnimations>;
  falling: PhysicsAnimationData<TAnimations>;
  postJump: PhysicsAnimationData<TAnimations>;
  flying: PhysicsAnimationData<TAnimations>;
  climbing: PhysicsAnimationData<TAnimations>;
  swimming: PhysicsAnimationData<TAnimations>;
  turn: PhysicsAnimationData<TAnimations>;
  fallbackAnimation: PhysicsAnimationData<TAnimations>;
}>;

export type CompositeSpritePart<TAnimations extends string> = {
  sprite: ProtoSpriteThree<string | void, TAnimations>;

  /**
   * When true, this part always follows physics-driven animation unless
   * explicitly targeted by an override via the targetParts option.
   * Overrides without targetParts skip physics-independent parts.
   */
  physicsIndependent?: boolean;

  /** Layer name used to compute positional offset relative to a reference part */
  alignmentLayer?: string;

  /** Name of the reference part to align against */
  alignToPartName?: string;
  speedScaler?: number;
  flipFacing?: boolean;
};

type CompositePartState<TAnimations extends string> = {
  sprite: ProtoSpriteThree<string | void, TAnimations>;
  physicsIndependent: boolean;
  alignmentLayer?: string;
  alignToPartName?: string;
  currentAnimation: AnimationData<TAnimations> | undefined;
  currentAnimationFrame: number;
  hasCurrentAnimationLooped: boolean;
  speedScaler: number;
  flip: number;
};

type CompatibleEntity = BaseEntityType<{
  data: CentralDataStoreBehavior;
}>;

export class AnimationControlBehavior<TAnimations extends string>
  implements EntityBehavior<CompatibleEntity>
{
  public type = "AnimationControl";

  public currentAnimation: AnimationData<TAnimations> | undefined = undefined;
  public currentAnimationFrame: number = 0;
  public hasCurrentAnimationLooped: boolean = false;
  private _facingDirection: SpriteFacingDirection = SpriteFacingDirection.RIGHT;
  public intendedFacingDirection: SpriteFacingDirection =
    SpriteFacingDirection.RIGHT;
  public isTurning: boolean = false;
  public speedScaler: number = 1;

  public get facingDirection(): SpriteFacingDirection {
    return this._facingDirection;
  }
  // Writes to facingDirection are treated as "immediate" — they also update
  // intendedFacingDirection so _updateTurnState doesn't revert the override
  // on the next tick (and, with a turn animation configured, doesn't interpret
  // the mismatch as a request to start a turn). The sprite mesh is also
  // flipped synchronously so the change is visible this frame, even when a
  // higher-priority animation is playing or the write happens after this
  // behavior's step() has already run.
  public set facingDirection(direction: SpriteFacingDirection) {
    this._facingDirection = direction;
    this.intendedFacingDirection = direction;
    if (this.compositeParts) {
      for (const [, part] of this.compositeParts) {
        this._syncPartFacingDirection(part);
      }
    } else {
      this._syncFacingDirection();
    }
  }

  private sprite?: ProtoSpriteThree<string | void, TAnimations>;

  private dataStore?: CentralDataStoreBehavior;

  private flip: number = 1;

  private originalClimbingSpeedScalar = 0;
  private originalTurnSpeedScaler = 0;
  private _physicsAnimationDataMap:
    | PhysicsAnimationDataMap<TAnimations>
    | undefined = undefined;

  private get physicsAnimationDataMap():
    | PhysicsAnimationDataMap<TAnimations>
    | undefined {
    return this._physicsAnimationDataMap;
  }
  private set physicsAnimationDataMap(
    dataMap: PhysicsAnimationDataMap<TAnimations> | undefined
  ) {
    const previousClimbingData = this._physicsAnimationDataMap?.climbing;
    const previousTurnData = this._physicsAnimationDataMap?.turn;
    this._physicsAnimationDataMap = dataMap;

    // Only update the original climbing speed when the climbing animation data
    // reference actually changes, to avoid capturing a mutated speedScaler
    if (dataMap?.climbing && dataMap.climbing !== previousClimbingData) {
      this.originalClimbingSpeedScalar = dataMap.climbing.speedScaler ?? 1;
    } else if (!dataMap?.climbing) {
      this.originalClimbingSpeedScalar = 0;
    }

    // Same reference-change guard as climbing; turn's speedScaler is mutated
    // every frame to flip forward/reverse, so we can't read it on every set.
    if (dataMap?.turn && dataMap.turn !== previousTurnData) {
      this.originalTurnSpeedScaler = Math.abs(dataMap.turn.speedScaler ?? 1);
    } else if (!dataMap?.turn) {
      this.originalTurnSpeedScaler = 0;
    }
  }

  // we defer the resolution of the physics animation data until a sprite is attached,
  // because resolving the data relies on having a sprite attached
  private unresolvedPhysicsAnimationDataMap: APIPhysicsAnimationDataMap<TAnimations>;

  // Composite sprite state (undefined in single-sprite mode)
  private compositeParts?: Map<string, CompositePartState<TAnimations>>;
  private primaryPartName?: string;
  private activeOverridePartName?: string;
  private explicitlyOverriddenParts = new Set<string>();
  private mirrorOverrideToIdleParts = false;

  // Reusable vectors for composite alignment computation
  private readonly alignmentVecA = new Vector2();
  private readonly alignmentVecB = new Vector2();
  private readonly alignmentOrigin = new Vector2();

  private isDisabled = false;

  private faceTowardsHorizontalVelocity = false;

  constructor(
    apiPysicsAnimationDataMap: APIPhysicsAnimationDataMap<TAnimations>
  ) {
    this.unresolvedPhysicsAnimationDataMap = apiPysicsAnimationDataMap;
  }

  init(entity: CompatibleEntity): AnimationControlBehavior<TAnimations> {
    this.dataStore = entity.behaviors.data;
    return this;
  }

  disable(): void {
    this.isDisabled = true;
  }

  enable(): void {
    this.isDisabled = false;
  }

  shouldFaceTowardsHorizontalVelocity(shouldFace: boolean): void {
    this.faceTowardsHorizontalVelocity = shouldFace;
  }

  setPhysicsAnimations(
    apiPhysicsAnimationDataMap: APIPhysicsAnimationDataMap<TAnimations>
  ): void {
    // this gets resolved in the attachSprite call
    if (!this.sprite) {
      this.unresolvedPhysicsAnimationDataMap = {
        ...this.unresolvedPhysicsAnimationDataMap,
        ...apiPhysicsAnimationDataMap
      };

      return;
    }

    const resolvedPhysicsAnimations = this._resolveAPIPhysicsAnimationsDataMap(
      apiPhysicsAnimationDataMap
    );

    this.physicsAnimationDataMap = {
      ...this.physicsAnimationDataMap,
      ...resolvedPhysicsAnimations
    };
  }

  unsetPhysicsAnimation(
    ...physicsAnimation: (keyof APIPhysicsAnimationDataMap<TAnimations>)[]
  ): void {
    for (const animation of physicsAnimation) {
      delete this.physicsAnimationDataMap?.[animation];
    }
  }

  scaleAllPhysicsAnimationSpeeds(speedScalingAmount: number): void {
    if (!this.physicsAnimationDataMap) return;

    for (const physicsAnimation of Object.values(
      this.physicsAnimationDataMap
    )) {
      physicsAnimation.speedScaler *= speedScalingAmount;
    }

    this.originalClimbingSpeedScalar *= speedScalingAmount;
    this.originalTurnSpeedScaler *= Math.abs(speedScalingAmount);
  }

  attachSprite(
    sprite: ProtoSpriteThree<string | void, TAnimations>
  ): AnimationControlBehavior<TAnimations> {
    this.sprite = sprite;

    this.sprite.events.on(
      "animationLooped",
      () => (this.hasCurrentAnimationLooped = true)
    );

    this.physicsAnimationDataMap = this._resolveAPIPhysicsAnimationsDataMap(
      this.unresolvedPhysicsAnimationDataMap
    );

    return this;
  }

  attachCompositeSprites(
    parts: Record<string, CompositeSpritePart<TAnimations>>
  ): AnimationControlBehavior<TAnimations> {
    this.compositeParts = new Map();

    for (const [name, part] of Object.entries(parts)) {
      if (!this.primaryPartName) this.primaryPartName = name;

      const state: CompositePartState<TAnimations> = {
        sprite: part.sprite,
        physicsIndependent: part.physicsIndependent ?? false,
        alignmentLayer: part.alignmentLayer,
        alignToPartName: part.alignToPartName,
        currentAnimation: undefined,
        currentAnimationFrame: 0,
        hasCurrentAnimationLooped: false,
        speedScaler: part.speedScaler ?? 1,
        flip: part.flipFacing ? -1 : 1
      };

      part.sprite.events.on("animationLooped", () => {
        state.hasCurrentAnimationLooped = true;
      });

      this.compositeParts.set(name, state);
    }

    // Use the primary part's sprite for animation data resolution
    const primaryPart = this.compositeParts.get(this.primaryPartName!);
    if (primaryPart) {
      this.sprite = primaryPart.sprite;
    }

    this.physicsAnimationDataMap = this._resolveAPIPhysicsAnimationsDataMap(
      this.unresolvedPhysicsAnimationDataMap
    );

    return this;
  }

  attachToLevel(level: LevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: LevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  readonly step = (deltaMs: number): void => {
    if (this.isDisabled) return;

    if (this.compositeParts) {
      this._stepComposite(deltaMs);
      return;
    }

    if (!this.sprite) return;

    if (
      this.currentAnimation &&
      this.currentAnimation.priorityLevel > AnimationPriority.PHYSICS
    ) {
      this._syncFacingDirection();
      this._advanceAnimation(deltaMs);
      return;
    }

    this._calculateFacingDirection();
    this._updateTurnState();
    this._syncFacingDirection();

    const nextPhysicsAnimation =
      this._getNextPhysicsAnimation() ??
      this.physicsAnimationDataMap?.fallbackAnimation ??
      this.physicsAnimationDataMap?.idle;

    if (!nextPhysicsAnimation) {
      this._swapAnimation(undefined);
      return;
    }

    if (this.currentAnimation !== nextPhysicsAnimation) {
      this._swapAnimation(nextPhysicsAnimation);
    } else {
      this.sprite.setAnimationSpeed(
        nextPhysicsAnimation.speedScaler * this.speedScaler
      );
    }

    this._advanceAnimation(deltaMs);
  };

  requestOverride(
    apiAnimationData: APIAnimationData<TAnimations>,
    options?: { targetParts?: string[]; mirrorToIdleParts?: boolean }
  ): boolean {
    if (this.compositeParts) {
      let targetParts: string[];
      if (options?.targetParts) {
        // Explicit targeting — override specified parts regardless of physicsIndependent
        targetParts = options.targetParts;
      } else {
        // Default — override all parts except physics-independent ones
        targetParts = [];
        for (const [name, part] of this.compositeParts) {
          if (!part.physicsIndependent) targetParts.push(name);
        }
      }
      return this._requestCompositeOverride(
        apiAnimationData,
        targetParts,
        options?.mirrorToIdleParts ?? false
      );
    }

    // Single-sprite mode
    if (
      !this.currentAnimation ||
      this.currentAnimation.priorityLevel <= apiAnimationData.priorityLevel
    ) {
      this._swapAnimation(this._resolveAPIAnimationData(apiAnimationData));
      return true;
    }

    return false;
  }

  /**
   * Unconditionally clears all override state, returning all composite parts
   * (or the single sprite) to physics-driven animation.
   */
  clearAllOverrides(): void {
    if (this.compositeParts) {
      for (const [, part] of this.compositeParts) {
        if (
          part.currentAnimation &&
          part.currentAnimation.priorityLevel > AnimationPriority.PHYSICS
        ) {
          this._swapPartAnimation(part, undefined);
        }
      }
      this.activeOverridePartName = undefined;
      this.currentAnimation = undefined;
      this.mirrorOverrideToIdleParts = false;
      this.explicitlyOverriddenParts.clear();
      return;
    }

    // Single-sprite mode
    if (
      this.currentAnimation &&
      this.currentAnimation.priorityLevel > AnimationPriority.PHYSICS
    ) {
      this._swapAnimation(undefined);
    }
  }

  clearOverride(
    apiAnimationData: APIAnimationData<TAnimations>,
    options?: { targetParts?: string[] }
  ): void {
    if (this.compositeParts) {
      const targetParts = options?.targetParts ?? [
        ...this.compositeParts.keys()
      ];
      for (const partName of targetParts) {
        const part = this.compositeParts.get(partName);
        if (part && apiAnimationData === part.currentAnimation) {
          this._swapPartAnimation(part, undefined);
        }
      }

      // If the active override part was cleared, update behavior-level state
      if (this.activeOverridePartName) {
        const activePart = this.compositeParts.get(this.activeOverridePartName);
        if (
          !activePart?.currentAnimation ||
          activePart.currentAnimation.priorityLevel <= AnimationPriority.PHYSICS
        ) {
          this.activeOverridePartName = undefined;
          this.currentAnimation = undefined;
          this.mirrorOverrideToIdleParts = false;
          this.explicitlyOverriddenParts.clear();
        }
      }
      return;
    }

    // Single-sprite mode
    if (apiAnimationData === this.currentAnimation)
      this._swapAnimation(undefined);
  }

  /** Returns the primary sprite (single-sprite mode or composite primary) */
  getSprite(): ProtoSpriteThree<string | void, TAnimations> | undefined {
    return this.sprite;
  }

  /** Returns the sprite for a named composite part */
  getPartSprite(
    name: string
  ): ProtoSpriteThree<string | void, TAnimations> | undefined {
    return this.compositeParts?.get(name)?.sprite;
  }

  /** Iterate all sprites for bulk operations (layer fades, outlines, etc.) */
  forEachSprite(
    callback: (
      sprite: ProtoSpriteThree<string | void, TAnimations>,
      partName?: string
    ) => void
  ): void {
    if (this.compositeParts) {
      for (const [name, part] of this.compositeParts) {
        callback(part.sprite, name);
      }
      return;
    }

    if (this.sprite) {
      callback(this.sprite);
    }
  }

  /** Get the current animation frame for a specific composite part */
  getCurrentCompositeAnimationFrame(name: string): number | undefined {
    return this.compositeParts?.get(name)?.currentAnimationFrame;
  }

  /** Get the tag of the animation currently playing on a composite part. */
  getPartAnimationTag(name: string): TAnimations | undefined {
    return this.compositeParts?.get(name)?.currentAnimation?.tagName;
  }

  /** Check if a specific composite part's animation has looped */
  hasCurrentCompositeAnimationLooped(name: string): boolean | undefined {
    return this.compositeParts?.get(name)?.hasCurrentAnimationLooped;
  }

  /**
   * Set arbitrary rotation on a named composite part's mesh.
   * The alignment computation will account for this rotation.
   */
  setPartRotation(name: string, rotation: number): void {
    const part = this.compositeParts?.get(name);
    if (!part) return;
    part.sprite.mesh.rotation.z = rotation;
  }

  /** Get the current rotation of a named composite part */
  getPartRotation(name: string): number | undefined {
    return this.compositeParts?.get(name)?.sprite.mesh.rotation.z;
  }

  /** Set the flip facing of a named composite part */
  setPartFlipFacing(name: string, flipFacing: boolean): void {
    const part = this.compositeParts?.get(name);
    if (!part) return;
    part.flip = flipFacing ? -1 : 1;
  }

  /** Set the flip facing of a named composite part */
  setPartSpeedScaler(name: string, speedScaler: number): void {
    const part = this.compositeParts?.get(name);
    if (!part) return;
    part.speedScaler = speedScaler;
  }

  /** Get the current flip of a named composite part */
  getPartFlipFacing(name: string): boolean | undefined {
    const part = this.compositeParts?.get(name);
    if (!part) return;
    return part.flip === 1 ? false : true;
  }

  /** Whether a specific composite part's current animation is playing in reverse */
  isCurrentCompositeAnimationReverse(name: string): boolean | undefined {
    const part = this.compositeParts?.get(name);
    if (!part?.currentAnimation) return undefined;
    return part.currentAnimation.speedScaler < 0;
  }

  /** Whether the current (non-composite) animation is playing in reverse */
  get isCurrentAnimationReverse(): boolean {
    return (this.currentAnimation?.speedScaler ?? 1) < 0;
  }

  // --- Composite mode internals ---

  private _stepComposite(deltaMs: number): void {
    if (this.isDisabled) return;

    if (!this.compositeParts) return;

    this._calculateFacingDirection();
    this._updateTurnState();

    const nextPhysicsAnimation =
      this._getNextPhysicsAnimation() ??
      this.physicsAnimationDataMap?.fallbackAnimation ??
      this.physicsAnimationDataMap?.idle;

    // Determine the active override animation from non-physicsIndependent parts
    // so physicsIndependent parts can mirror it when the entity is idle
    let activeOverrideAnimation: AnimationData<TAnimations> | undefined;
    if (this.mirrorOverrideToIdleParts) {
      for (const [, part] of this.compositeParts) {
        if (
          !part.physicsIndependent &&
          part.currentAnimation &&
          part.currentAnimation.priorityLevel > AnimationPriority.PHYSICS
        ) {
          activeOverrideAnimation = part.currentAnimation;
          break;
        }
      }
    }

    const physicsIsIdle =
      nextPhysicsAnimation === this.physicsAnimationDataMap?.idle;

    for (const [partName, part] of this.compositeParts) {
      const hasActiveOverride =
        part.currentAnimation &&
        part.currentAnimation.priorityLevel > AnimationPriority.PHYSICS;

      if (part.physicsIndependent) {
        if (hasActiveOverride && this.explicitlyOverriddenParts.has(partName)) {
          // Physics-independent part was explicitly targeted by an override
          // (e.g. death animation) — advance it without interference.
          this._advancePartAnimation(part, deltaMs);
        } else if (physicsIsIdle && activeOverrideAnimation) {
          // Mirror the override animation when idle and mirrorToIdleParts
          // was requested.
          if (part.currentAnimation !== activeOverrideAnimation) {
            this._swapPartAnimation(part, activeOverrideAnimation);
          }
          this._advancePartAnimation(part, deltaMs);
        } else {
          // Follow physics animation.
          if (!nextPhysicsAnimation) {
            this._swapPartAnimation(part, undefined);
          } else if (part.currentAnimation !== nextPhysicsAnimation) {
            this._swapPartAnimation(part, nextPhysicsAnimation);
          } else {
            part.sprite.setAnimationSpeed(
              nextPhysicsAnimation.speedScaler *
                part.speedScaler *
                this.speedScaler
            );
          }
          this._advancePartAnimation(part, deltaMs);
        }
      } else if (hasActiveOverride) {
        // Non-physicsIndependent part has an active override — advance it
        this._advancePartAnimation(part, deltaMs);
      } else {
        // Apply physics animation
        if (!nextPhysicsAnimation) {
          this._swapPartAnimation(part, undefined);
        } else if (part.currentAnimation !== nextPhysicsAnimation) {
          this._swapPartAnimation(part, nextPhysicsAnimation);
        } else {
          part.sprite.setAnimationSpeed(
            nextPhysicsAnimation.speedScaler *
              part.speedScaler *
              this.speedScaler
          );
        }
        this._advancePartAnimation(part, deltaMs);
      }

      // Sync facing direction for all parts
      this._syncPartFacingDirection(part);
    }

    // Compute alignment offsets between parts
    this._computeCompositeAlignment();

    // Update behavior-level frame tracking from the active part
    this._syncFrameTrackingFromParts();
  }

  private _requestCompositeOverride(
    apiAnimationData: APIAnimationData<TAnimations>,
    targetParts: string[],
    mirrorToIdleParts: boolean
  ): boolean {
    const resolvedAnimation = this._resolveAPIAnimationData(apiAnimationData);
    let anySucceeded = false;

    for (const partName of targetParts) {
      const part = this.compositeParts!.get(partName);
      if (!part) continue;

      if (
        !part.currentAnimation ||
        part.currentAnimation.priorityLevel <= apiAnimationData.priorityLevel
      ) {
        this._swapPartAnimation(part, resolvedAnimation);
        this.activeOverridePartName = partName;
        anySucceeded = true;
      }
    }

    if (anySucceeded) {
      this.currentAnimation = resolvedAnimation;
      this.mirrorOverrideToIdleParts = mirrorToIdleParts;
      this.explicitlyOverriddenParts = new Set(targetParts);
      // Sync behavior-level frame tracking immediately so AI nodes
      // reading currentAnimationFrame in the same tick see the new
      // override's frame, not a stale value from the previously tracked part.
      if (this.activeOverridePartName) {
        const activePart = this.compositeParts!.get(
          this.activeOverridePartName
        );
        if (activePart) {
          this.currentAnimationFrame = activePart.currentAnimationFrame;
          this.hasCurrentAnimationLooped = activePart.hasCurrentAnimationLooped;
        }
      }
    }

    return anySucceeded;
  }

  private _swapPartAnimation(
    part: CompositePartState<TAnimations>,
    animationData: AnimationData<TAnimations> | undefined
  ): void {
    if (!animationData) {
      part.currentAnimation = undefined;
      return;
    }

    const isReverse =
      animationData.speedScaler * part.speedScaler * this.speedScaler < 0;
    const initialFrame = isReverse
      ? animationData.endFrame - animationData.startingOffset
      : animationData.startFrame + animationData.startingOffset;
    part.currentAnimationFrame = initialFrame;
    part.hasCurrentAnimationLooped = false;

    part.sprite.setAnimationLooping(animationData.isLooping);
    part.sprite.setAnimationSpeed(
      animationData.speedScaler * part.speedScaler * this.speedScaler
    );
    part.sprite.gotoAnimation(animationData.tagName);
    part.sprite.gotoAnimationFrame(initialFrame);

    part.currentAnimation = animationData;
  }

  private _advancePartAnimation(
    part: CompositePartState<TAnimations>,
    deltaMs: number
  ): void {
    if (!part.currentAnimation) return;

    const anim = part.currentAnimation;
    const isReverse =
      anim.speedScaler * part.speedScaler * this.speedScaler < 0;

    // NOTE: we capture if an animation has looped for the single frame it looped
    //      (standard ProtoSpriteThree behavior will make this true every single frame
    //      if looping is set to false at the end of the frame tag)
    part.hasCurrentAnimationLooped = false;

    // Terminus is the frame the animation naturally reaches at the end of a
    // cycle — startFrame for reverse, endFrame for forward. Origin is where
    // the animation wraps back to after completing a cycle.
    const terminus = isReverse ? anim.startFrame : anim.endFrame;
    const origin = isReverse ? anim.endFrame : anim.startFrame;

    // Pre-advance boundary guard: already at terminus → wrap or freeze
    const atTerminus = isReverse
      ? part.currentAnimationFrame <= terminus
      : part.currentAnimationFrame >= terminus;

    if (atTerminus) {
      part.hasCurrentAnimationLooped = true;
      if (anim.isLooping) {
        part.sprite.gotoAnimationFrame(origin);
        part.currentAnimationFrame = origin;
      } else {
        part.sprite.gotoAnimationFrame(terminus);
        part.currentAnimationFrame = terminus;
        return;
      }
    }

    part.sprite.advance(deltaMs);

    const currentFrame = part.sprite.getAnimationFrame();

    // Custom boundary crossing detection
    const pastTerminus = isReverse
      ? currentFrame < terminus
      : currentFrame > terminus;
    if (pastTerminus) part.hasCurrentAnimationLooped = true;

    // Safety clamp for opposite boundary (shouldn't happen normally)
    const pastOrigin = isReverse
      ? currentFrame > origin
      : currentFrame < origin;
    if (pastOrigin) {
      if (anim.isLooping) {
        part.sprite.gotoAnimationFrame(origin);
        part.currentAnimationFrame = origin;
      } else {
        part.sprite.gotoAnimationFrame(
          isReverse ? anim.endFrame : anim.startFrame
        );
        part.currentAnimationFrame = isReverse
          ? anim.endFrame
          : anim.startFrame;
      }
      return;
    }

    if (!part.hasCurrentAnimationLooped) {
      part.currentAnimationFrame = currentFrame;
      return;
    }

    // Override looping behavior to support custom start/end frames
    if (anim.isLooping) {
      let framesPastTerminus: number;

      if (isReverse) {
        framesPastTerminus = terminus - currentFrame;

        // Adjustment for if ProtoSpriteThree has already looped internally
        if (currentFrame > terminus) {
          framesPastTerminus =
            terminus +
            (this._getAnimationNumFramesFromSprite(anim.tagName, part.sprite) -
              1 -
              currentFrame) +
            1;
        }
      } else {
        framesPastTerminus = currentFrame - terminus;

        // Adjustment for if ProtoSpriteThree has already looped internally
        if (currentFrame < terminus) {
          const actualAnimationTagEndingFrame =
            this._getAnimationNumFramesFromSprite(anim.tagName, part.sprite) -
            1;
          const numFramesToActualEndingFrameToAccountForLooping =
            actualAnimationTagEndingFrame - terminus;
          framesPastTerminus =
            numFramesToActualEndingFrameToAccountForLooping + currentFrame + 1;
        }
      }

      const numFrames = anim.endFrame - anim.startFrame + 1;
      const offset = (framesPastTerminus - 1) % numFrames;
      const targetFrame = isReverse ? origin - offset : origin + offset;

      part.sprite.gotoAnimationFrame(targetFrame);
      part.currentAnimationFrame = targetFrame;
      return;
    }

    // Non-looping: clamp to terminus
    part.sprite.gotoAnimationFrame(terminus);
    part.currentAnimationFrame = terminus;
  }

  private _syncPartFacingDirection(
    part: CompositePartState<TAnimations>
  ): void {
    part.sprite.mesh.scale.x =
      this.facingDirection *
      Math.abs(part.sprite.mesh.scale.x) *
      part.flip *
      this.flip;
  }

  private _computeCompositeAlignment(): void {
    if (!this.compositeParts) return;

    for (const [, part] of this.compositeParts) {
      if (!part.alignmentLayer || !part.alignToPartName) continue;

      const referencePart = this.compositeParts.get(part.alignToPartName);
      if (!referencePart) continue;

      const partBounds = part.sprite.getLayerBounds(part.alignmentLayer);
      const referenceBounds = referencePart.sprite.getLayerBounds(
        part.alignmentLayer
      );

      partBounds.getCenter(this.alignmentVecA);
      referenceBounds.getCenter(this.alignmentVecB);

      this.alignmentVecA.x *= part.sprite.mesh.scale.x;
      this.alignmentVecA.y *= part.sprite.mesh.scale.y;
      this.alignmentVecB.x *= referencePart.sprite.mesh.scale.x;
      this.alignmentVecB.y *= referencePart.sprite.mesh.scale.y;

      // If the part has rotation, rotate its alignment vector to keep
      // the anchor point correct when the part is rotated
      const rotation = part.sprite.mesh.rotation.z;
      if (rotation !== 0) {
        this.alignmentVecA.rotateAround(this.alignmentOrigin, rotation);
      }

      this.alignmentVecA.sub(this.alignmentVecB);

      part.sprite.mesh.position.x = -this.alignmentVecA.x;
      part.sprite.mesh.position.y = -this.alignmentVecA.y;
    }
  }

  private _syncFrameTrackingFromParts(): void {
    if (!this.compositeParts) return;

    // If there's an active override part, track its state
    if (this.activeOverridePartName) {
      const activePart = this.compositeParts.get(this.activeOverridePartName);
      if (activePart) {
        this.currentAnimationFrame = activePart.currentAnimationFrame;
        this.hasCurrentAnimationLooped = activePart.hasCurrentAnimationLooped;
        return;
      }
    }

    // Otherwise track the primary part
    if (this.primaryPartName) {
      const primaryPart = this.compositeParts.get(this.primaryPartName);
      if (primaryPart) {
        this.currentAnimationFrame = primaryPart.currentAnimationFrame;
        this.hasCurrentAnimationLooped = primaryPart.hasCurrentAnimationLooped;
      }
    }
  }

  private _getAnimationNumFramesFromSprite(
    animation: TAnimations,
    sprite: ProtoSpriteThree<string | void, TAnimations>
  ): number {
    const animationData = sprite.data.sprite.maps.animationMap.get(animation);
    if (!animationData) return 0;
    return animationData.indexEnd - animationData.indexStart + 1;
  }

  // --- Single-sprite internals (unchanged) ---

  private _getNextPhysicsAnimation(): AnimationData<TAnimations> | undefined {
    const store = this.dataStore;
    const physicsData = this.physicsAnimationDataMap;
    if (!store || !physicsData) return undefined;

    if (this.isTurning && physicsData.turn) return physicsData.turn;

    // TODO:
    const canBeIdle =
      !store.current.hSpeedRatio &&
      !store.current.vSpeedRatio &&
      store.current.isGrounded &&
      physicsData.idle;
    const canBeWalking =
      store.current.hSpeedRatio && store.current.isGrounded && physicsData.walk;
    const canBeFlying =
      !store.current.isGrounded &&
      !store.current.isJumping &&
      !store.current.isFalling &&
      physicsData.flying;
    const canBePreJumping = store.current.isPreJumping && physicsData.preJump;
    const canBeJumpRising =
      store.current.isJumpRising && physicsData.jumpRising;
    const canBeJumpFalling =
      store.current.isJumpFalling && physicsData.jumpFalling;
    const canBeFalling =
      store.current.isFalling &&
      !store.current.isJumping &&
      physicsData.falling;
    const canBeClimbing = store.current.isClimbing && physicsData.climbing;
    const canBeSwimming = store.current.isInWater && physicsData.swimming;

    // i guess order returned could matter here
    if (canBeClimbing && physicsData.climbing) {
      const climbingSpeedScalar =
        store.current.climbingDirection === "up"
          ? 1
          : store.current.climbingDirection === "down"
            ? -1
            : 0;

      physicsData.climbing.speedScaler =
        this.originalClimbingSpeedScalar * climbingSpeedScalar;
      return physicsData.climbing;
    }
    if (canBeFlying) return physicsData.flying;
    if (canBePreJumping) return physicsData.preJump;
    if (canBeWalking) return physicsData.walk;
    if (canBeIdle) return physicsData.idle;
    if (canBeSwimming) return physicsData.swimming;
    if (canBeJumpRising) return physicsData.jumpRising;
    if (canBeJumpFalling) return physicsData.jumpFalling;
    if (canBeFalling) return physicsData.falling;
  }

  private _swapAnimation(
    animationData: AnimationData<TAnimations> | undefined
  ): void {
    if (this.isDisabled) return;

    if (!this.sprite) return;
    if (!animationData) {
      this.currentAnimation = undefined;
      return;
    }

    const isReverse = animationData.speedScaler * this.speedScaler < 0;
    const initialFrame = isReverse
      ? animationData.endFrame - animationData.startingOffset
      : animationData.startFrame + animationData.startingOffset;
    this.currentAnimationFrame = initialFrame;
    this.hasCurrentAnimationLooped = false;

    this.sprite.setAnimationLooping(animationData.isLooping);
    this.sprite.setAnimationSpeed(animationData.speedScaler * this.speedScaler);
    this.sprite.gotoAnimation(animationData.tagName);
    this.sprite.gotoAnimationFrame(initialFrame);

    this.flip = animationData.flipFacing ? -1 : 1;

    this.currentAnimation = animationData;
  }

  private _advanceAnimation(deltaMs: number): void {
    if (!this.currentAnimation || !this.sprite) return;

    const anim = this.currentAnimation;
    const isReverse = anim.speedScaler * this.speedScaler < 0;

    // NOTE: we capture if an animation has looped for the single frame it looped
    //      (standard ProtoSpriteThree behavior will make this true every single frame
    //      if looping is set to false at the end of the frame tag)
    this.hasCurrentAnimationLooped = false;

    const terminus = isReverse ? anim.startFrame : anim.endFrame;
    const origin = isReverse ? anim.endFrame : anim.startFrame;

    // Pre-advance boundary guard: already at terminus → wrap or freeze
    const atTerminus = isReverse
      ? this.currentAnimationFrame <= terminus
      : this.currentAnimationFrame >= terminus;

    if (atTerminus) {
      this.hasCurrentAnimationLooped = true;
      if (anim.isLooping) {
        this.sprite.gotoAnimationFrame(origin);
        this.currentAnimationFrame = origin;
      } else {
        this.sprite.gotoAnimationFrame(terminus);
        this.currentAnimationFrame = terminus;
        return;
      }
    }

    this.sprite.advance(deltaMs);

    const currentAnimationFrame = this.sprite.getAnimationFrame();

    // Custom boundary crossing detection
    const pastTerminus = isReverse
      ? currentAnimationFrame < terminus
      : currentAnimationFrame > terminus;
    if (pastTerminus) this.hasCurrentAnimationLooped = true;

    // Safety clamp for opposite boundary
    const pastOrigin = isReverse
      ? currentAnimationFrame > origin
      : currentAnimationFrame < origin;
    if (pastOrigin) {
      if (anim.isLooping) {
        this.sprite.gotoAnimationFrame(origin);
        this.currentAnimationFrame = origin;
      } else {
        this.sprite.gotoAnimationFrame(
          isReverse ? anim.endFrame : anim.startFrame
        );
        this.currentAnimationFrame = isReverse
          ? anim.endFrame
          : anim.startFrame;
      }
      return;
    }

    if (!this.hasCurrentAnimationLooped) {
      this.currentAnimationFrame = currentAnimationFrame;
      return;
    }

    // Override looping behavior to support custom start/end frames
    if (anim.isLooping) {
      let framesPastTerminus: number;

      if (isReverse) {
        framesPastTerminus = terminus - currentAnimationFrame;

        if (currentAnimationFrame > terminus) {
          framesPastTerminus =
            terminus +
            (this._getAnimationNumFrames(anim.tagName) -
              1 -
              currentAnimationFrame) +
            1;
        }
      } else {
        framesPastTerminus = currentAnimationFrame - terminus;

        // adjustment for if ProtoSpriteThree has already looped our animation frame
        if (currentAnimationFrame < terminus) {
          const actualAnimationTagEndingFrame =
            this._getAnimationNumFrames(anim.tagName) - 1;
          const numFramesToActualEndingFrameToAccountForLooping =
            actualAnimationTagEndingFrame - terminus;
          framesPastTerminus =
            numFramesToActualEndingFrameToAccountForLooping +
            currentAnimationFrame +
            1;
        }
      }

      const numFrames = anim.endFrame - anim.startFrame + 1;
      const offset = (framesPastTerminus - 1) % numFrames;
      const targetFrame = isReverse ? origin - offset : origin + offset;

      this.sprite.gotoAnimationFrame(targetFrame);
      this.currentAnimationFrame = targetFrame;
      return;
    }

    // Non-looping: clamp to terminus
    this.sprite.gotoAnimationFrame(terminus);
    this.currentAnimationFrame = terminus;
  }

  private _calculateFacingDirection(): void {
    if (!this.dataStore) return;

    const source = this.faceTowardsHorizontalVelocity
      ? this.dataStore.current.linvel.x
      : this.dataStore.current.hSpeedRatio;

    if (source > 0) this.intendedFacingDirection = SpriteFacingDirection.RIGHT;
    if (source < 0) this.intendedFacingDirection = SpriteFacingDirection.LEFT;
  }

  private _updateTurnState(): void {
    const turnAnim = this.physicsAnimationDataMap?.turn;

    if (!turnAnim) {
      this.facingDirection = this.intendedFacingDirection;
      this.isTurning = false;
      return;
    }

    // In composite mode `this.currentAnimation` only tracks overrides, so read
    // the primary part's state to detect that the turn animation is active.
    let playingAnim: AnimationData<TAnimations> | undefined;
    let hasLooped: boolean;
    if (this.compositeParts) {
      const primary = this.primaryPartName
        ? this.compositeParts.get(this.primaryPartName)
        : undefined;
      playingAnim = primary?.currentAnimation;
      hasLooped = primary?.hasCurrentAnimationLooped ?? false;
    } else {
      playingAnim = this.currentAnimation;
      hasLooped = this.hasCurrentAnimationLooped;
    }
    const isPlayingTurn = playingAnim === turnAnim;

    // A forward turn reaching terminus commits the new facing; a reverse turn
    // reaching its origin cancels the pending turn without flipping.
    if (this.isTurning && isPlayingTurn && hasLooped) {
      if (turnAnim.speedScaler > 0) {
        this.facingDirection = this.intendedFacingDirection;
      }
      this.isTurning = false;
    }

    // Drop stale isTurning left behind when an override interrupted a turn
    // and the intended direction settled before the override ended.
    if (
      this.isTurning &&
      !isPlayingTurn &&
      this.facingDirection === this.intendedFacingDirection
    ) {
      this.isTurning = false;
    }

    if (
      !this.isTurning &&
      this.facingDirection !== this.intendedFacingDirection
    ) {
      this.isTurning = true;
      // If the prior turn just completed this same tick, the sprite is still
      // clamped to the turn anim's terminus frame. Clear the tracked
      // animation so the main step path re-swaps and reseeks to frame 0.
      if (this.compositeParts) {
        for (const [, part] of this.compositeParts) {
          if (part.currentAnimation === turnAnim)
            part.currentAnimation = undefined;
        }
      } else if (this.currentAnimation === turnAnim) {
        this.currentAnimation = undefined;
      }
    }

    if (this.isTurning) {
      const shouldBeForward =
        this.intendedFacingDirection !== this.facingDirection;
      turnAnim.speedScaler = shouldBeForward
        ? this.originalTurnSpeedScaler
        : -this.originalTurnSpeedScaler;
    }
  }

  private _syncFacingDirection(): void {
    if (!this.sprite) return;

    this.sprite.mesh.scale.x =
      this.facingDirection * Math.abs(this.sprite.mesh.scale.x) * this.flip;
  }

  private _resolveAPIAnimationData(
    apiData: APIAnimationData<TAnimations>
  ): AnimationData<TAnimations> {
    apiData.startFrame = apiData.startFrame ?? 0;

    apiData.endFrame =
      apiData.endFrame ?? this._getAnimationNumFrames(apiData.tagName) - 1;

    apiData.speedScaler = apiData.speedScaler ?? 1;
    apiData.isLooping = apiData.isLooping ?? true;
    apiData.startingOffset = apiData.startingOffset ?? 0;

    return apiData as AnimationData<TAnimations>;
  }

  private _getAnimationNumFrames(animation: TAnimations): number {
    if (!this.sprite) return 0;

    const animationData =
      this.sprite.data.sprite.maps.animationMap.get(animation);

    if (!animationData) return 0;

    return animationData.indexEnd - animationData.indexStart + 1;
  }

  private _resolveAPIPhysicsAnimationsDataMap(
    apiPhysicsAnimationsDataMap: APIPhysicsAnimationDataMap<TAnimations>
  ): PhysicsAnimationDataMap<TAnimations> {
    const unresolvedPhysicsDataMap = Object.entries(
      apiPhysicsAnimationsDataMap
    );

    const resolvedPhysicsDataEntries = unresolvedPhysicsDataMap.map(
      ([action, apiData]) => {
        // NOTE: turn animation should never be looping and causes visual bugs if so
        if (action === "turn") apiData.isLooping = false;

        const resolvedApiData = this._resolveAPIAnimationData(apiData);
        return [action, resolvedApiData];
      }
    );

    return Object.fromEntries(resolvedPhysicsDataEntries);
  }
}
