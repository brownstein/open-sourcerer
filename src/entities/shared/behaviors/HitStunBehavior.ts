import {
  BaseEntityType,
  EntityBehavior,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLifecycleEvents
} from "src/api/entity";
import { Scheduler } from "src/engine/scheduling/Scheduler";

import { AIBehavior } from "./AIBehavior";
import {
  APIAnimationData,
  AnimationControlBehavior,
  AnimationPriority
} from "./AnimationControlBehavior";
import { NavPathFollowingBehavior } from "./NavPathFollowingBehavior";

type CompatibleEntity = BaseEntityType<{
  animation?: AnimationControlBehavior<string>;
  pathFollowing?: NavPathFollowingBehavior;
  ai?: AIBehavior;
}>;

interface APIHitStunProps<TAnimations extends string> {
  stunDamageThreshold?: number;
  stunTimeMs?: number;
  stunCooldownMs?: number;
  dazeDamageThreshold?: number;
  dazeNumSuccessiveHitsThreshold?: number;
  dazeSuccessiveHitsIntervalMs?: number;
  dazeTimeMs?: number;
  dazeCooldownMs?: number;
  stunAnimation?:
    | Omit<APIAnimationData<TAnimations>, "priorityLevel">
    | Omit<APIAnimationData<TAnimations>, "priorityLevel">[];
  dazeAnimation?: Omit<APIAnimationData<TAnimations>, "priorityLevel">;
  isStunHighPriority?: boolean;
  isDazeHighPriority?: boolean;
}

type HitStunProps<TAnimations extends string> = Readonly<
  Required<
    Omit<APIHitStunProps<TAnimations>, "stunAnimation" | "dazeAnimation">
  > & {
    stunAnimations: APIAnimationData<TAnimations>[];
    dazeAnimation?: APIAnimationData<TAnimations>;
  }
>;

export class HitStunBehavior<TAnimations extends string = string>
  implements EntityBehavior
{
  public type = "HitStun";

  private readonly props: HitStunProps<TAnimations>;

  private stunCooldownTimerMs = 0;
  private dazeCooldownTimerMs = 0;
  private numSuccessiveHits = 0;

  private entity?: CompatibleEntity;

  private readonly scheduler = new Scheduler();
  private readonly stunSchedulerId = "HitStun";
  private readonly dazeSchedulerId = "Daze";

  private isCurrentlyStunned = false;
  private isCurrentlyDazed = false;

  private activeStunAnimation?: APIAnimationData<TAnimations>;

  constructor(props: APIHitStunProps<TAnimations>) {
    const stunDamageThreshold = props.stunDamageThreshold ?? -Infinity;
    const stunTimeMs = props.stunTimeMs ?? 200;
    const stunCooldownMs = props.stunCooldownMs ?? 500;
    const dazeDamageThreshold = props.dazeDamageThreshold ?? Infinity;
    const dazeNumSuccessiveHitsThreshold =
      props.dazeNumSuccessiveHitsThreshold ?? 0;
    const dazeSuccessiveHitsIntervalMs =
      props.dazeSuccessiveHitsIntervalMs ?? 500;
    const dazeTimeMs = props.dazeTimeMs ?? 1000;
    const dazeCooldownMs = props.dazeCooldownMs ?? 5000;
    const isStunHighPriority = props.isStunHighPriority ?? false;
    const isDazeHighPriority = props.isDazeHighPriority ?? true;

    const stunAnimationInputs = props.stunAnimation
      ? Array.isArray(props.stunAnimation)
        ? props.stunAnimation
        : [props.stunAnimation]
      : [];
    const stunAnimations: APIAnimationData<TAnimations>[] =
      stunAnimationInputs.map((animation) => ({
        ...animation,
        isLooping: animation.isLooping ?? true,
        priorityLevel: isStunHighPriority
          ? AnimationPriority.REACTION
          : AnimationPriority.MINOR_REACTION
      }));

    const dazeAnimation: APIAnimationData<TAnimations> | undefined =
      props.dazeAnimation
        ? {
            ...props.dazeAnimation,
            isLooping: props.dazeAnimation.isLooping ?? true,
            priorityLevel: isDazeHighPriority
              ? AnimationPriority.REACTION
              : AnimationPriority.MINOR_REACTION
          }
        : undefined;

    this.props = {
      stunDamageThreshold,
      stunTimeMs,
      stunCooldownMs,
      dazeDamageThreshold,
      dazeNumSuccessiveHitsThreshold,
      dazeSuccessiveHitsIntervalMs,
      dazeTimeMs,
      dazeCooldownMs,
      stunAnimations,
      dazeAnimation,
      isStunHighPriority,
      isDazeHighPriority
    };
  }

  init(entity: CompatibleEntity): this {
    this.entity = entity;

    entity.events.on(EntityLifecycleEvents.Step, (deltaMs) =>
      this.step(deltaMs)
    );
    entity.events.on(EntityLifecycleEvents.Hit, (hitDetails) =>
      this._handleHit(hitDetails)
    );

    return this;
  }

  step(deltaMs: number): void {
    this.scheduler.step(deltaMs);

    this.stunCooldownTimerMs -= deltaMs;
    this.dazeCooldownTimerMs -= deltaMs;
  }

  detachFromLevel(_level: EntityLevelAPI): void {
    this.scheduler.cancelAll();
  }

  startStun(): void {
    const stunAnimation = this._pickStunAnimation();
    if (stunAnimation) {
      const wasStunAnimationOverrideSuccessful =
        !!this.entity?.behaviors.animation?.requestOverride(stunAnimation);

      if (!wasStunAnimationOverrideSuccessful) return;

      this.activeStunAnimation = stunAnimation;
    }

    this.isCurrentlyStunned = true;

    this.stunCooldownTimerMs = this.props.stunCooldownMs;

    this.entity?.behaviors.ai?.disable();
    this.entity?.behaviors.pathFollowing?.cancelPath();

    this.scheduler.cancel(this.stunSchedulerId);

    this.scheduler.add({
      id: this.stunSchedulerId,
      duration: this.props.stunTimeMs,
      invokeFunctionAtComplete: () => this.endStun()
    });
  }

  endStun(): void {
    this.scheduler.cancel(this.stunSchedulerId);

    this.isCurrentlyStunned = false;

    if (!this.isCurrentlyStunned && !this.isCurrentlyDazed)
      this.entity?.behaviors.ai?.enable();

    if (this.activeStunAnimation) {
      this.entity?.behaviors.animation?.clearOverride(this.activeStunAnimation);
      this.activeStunAnimation = undefined;
    }
  }

  private _pickStunAnimation(): APIAnimationData<TAnimations> | undefined {
    const animations = this.props.stunAnimations;
    if (animations.length === 0) return undefined;
    return animations[Math.floor(Math.random() * animations.length)];
  }

  startDaze(): void {
    if (this.props.dazeAnimation) {
      const wasDazeAnimationOverrideSuccessful =
        !!this.entity?.behaviors.animation?.requestOverride(
          this.props.dazeAnimation
        );

      if (!wasDazeAnimationOverrideSuccessful) return;
    }

    this.isCurrentlyDazed = true;

    this.dazeCooldownTimerMs = this.props.dazeCooldownMs;

    this.entity?.behaviors.ai?.disable();
    this.entity?.behaviors.pathFollowing?.cancelPath();

    this.scheduler.cancel(this.dazeSchedulerId);

    this.scheduler.add({
      id: this.dazeSchedulerId,
      duration: this.props.dazeTimeMs,
      invokeFunctionAtComplete: () => this.endDaze()
    });
  }

  endDaze(): void {
    this.scheduler.cancel(this.dazeSchedulerId);

    this.isCurrentlyDazed = false;

    if (!this.isCurrentlyStunned && !this.isCurrentlyDazed)
      this.entity?.behaviors.ai?.enable();

    if (this.props.dazeAnimation)
      this.entity?.behaviors.animation?.clearOverride(this.props.dazeAnimation);
  }

  private _handleHit(hitDetails: EntityHitDetails): void {
    const { damage } = hitDetails;

    if (damage <= 0) return;

    if (damage >= this.props.dazeDamageThreshold) {
      this.numSuccessiveHits++;

      this.scheduler.add({
        duration: this.props.dazeSuccessiveHitsIntervalMs,
        invokeFunctionAtComplete: () => this.numSuccessiveHits--
      });

      if (
        this.numSuccessiveHits >= this.props.dazeNumSuccessiveHitsThreshold &&
        this.dazeCooldownTimerMs <= 0
      ) {
        this.startDaze();
      }
    }

    if (
      damage >= this.props.stunDamageThreshold &&
      this.stunCooldownTimerMs <= 0 &&
      !this.isCurrentlyDazed
    ) {
      this.startStun();
    }
  }
}
