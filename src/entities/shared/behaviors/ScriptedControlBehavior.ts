import { BaseEntityType, EntityBehavior } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";

import {
  MotionPathFollowingBehavior,
  MotionPathProvider
} from "./MotionPath";
import { NavPathFollowingBehavior } from "./NavPathFollowingBehavior";

/**
 * The control "profile" describes which motion behaviors are active for a given
 * mode. Every scripted control mode maps to exactly one profile. Profiles are
 * generic — they capture the three distinct toggle combinations that drive an
 * entity's motion, independent of any entity-specific mode naming.
 */
export enum ControlProfile {
  /** Entity drives itself: ground/flight physics control + nav path motion on. */
  SelfDriven = "SelfDriven",
  /** Scripted motion-path following on; entity-driven motion off. */
  MotionPath = "MotionPath",
  /** No motion control of any kind; the entity holds still. */
  Frozen = "Frozen"
}

export enum ScriptedControlEvents {
  ModeChanged = "ModeChanged"
}

type ScriptedControlEventTypes = {
  [ScriptedControlEvents.ModeChanged]: string;
};

/** Minimal surface this behavior needs from a physics control behavior. */
interface PhysicsControlLike {
  enable(): void;
  disable(): void;
}

/**
 * Centralizes the bookkeeping for swapping an entity between its default
 * (self-driven) behavior and scripted control — most importantly scripted
 * motion-path following used by cutscenes.
 *
 * Each entity registers the modes it understands (mapping each to a
 * {@link ControlProfile}) and the control behaviors it owns. {@link setMode}
 * then performs the enable/disable toggling once, in one place, so the mode
 * flag and the active behaviors can never drift out of sync.
 *
 * Behavior trees gate branches on the current mode via the `VerifyControlMode`
 * AI node; coroutine/ActionStack entities can read {@link isScripted} to
 * suspend their own logic while a cutscene drives the entity.
 *
 * @typeParam TMode - the entity's mode union (e.g. a string-literal type).
 */
export class ScriptedControlBehavior<TMode extends string = string>
  implements EntityBehavior
{
  public readonly type = "ScriptedControl";
  public readonly events =
    createTypedEventEmitter<ScriptedControlEventTypes>();

  private entity?: BaseEntityType;

  private physicsControl?: PhysicsControlLike;
  private navPathFollowing?: NavPathFollowingBehavior;
  private motionPathFollowing?: MotionPathFollowingBehavior;

  private readonly profiles = new Map<TMode, ControlProfile>();
  private _mode?: TMode;
  private defaultMode?: TMode;
  /** First mode registered with the MotionPath profile; used by followPath. */
  private pathMode?: TMode;

  init(entity: BaseEntityType): this {
    this.entity = entity;
    return this;
  }

  attachPhysicsControl(behavior: PhysicsControlLike): this {
    this.physicsControl = behavior;
    return this;
  }

  attachNavPathFollowing(behavior: NavPathFollowingBehavior): this {
    this.navPathFollowing = behavior;
    return this;
  }

  attachMotionPathFollowing(behavior: MotionPathFollowingBehavior): this {
    this.motionPathFollowing = behavior;
    return this;
  }

  /**
   * Declares a mode and the control profile it activates. The first mode
   * marked `isDefault` is treated as the non-scripted baseline; the first mode
   * registered with the MotionPath profile becomes the target of
   * {@link followPath}.
   */
  registerMode(
    mode: TMode,
    profile: ControlProfile,
    isDefault: boolean = false
  ): this {
    this.profiles.set(mode, profile);
    if (isDefault && this.defaultMode === undefined) this.defaultMode = mode;
    if (profile === ControlProfile.MotionPath && this.pathMode === undefined)
      this.pathMode = mode;
    return this;
  }

  get mode(): TMode | undefined {
    return this._mode;
  }

  /** True when the current mode is anything other than the default mode. */
  get isScripted(): boolean {
    return this._mode !== undefined && this._mode !== this.defaultMode;
  }

  is(mode: TMode): boolean {
    return this._mode === mode;
  }

  /**
   * Switches the active mode, applying the enable/disable toggling for the
   * mode's profile. Nav path motion is always cancelled first so a stale plan
   * never bleeds across a mode swap.
   */
  setMode(mode: TMode): this {
    const profile = this.profiles.get(mode) ?? ControlProfile.SelfDriven;

    this.navPathFollowing?.cancelPath();

    switch (profile) {
      case ControlProfile.Frozen: {
        this.physicsControl?.disable();
        this.motionPathFollowing?.disable();
        this.navPathFollowing?.disableMotion();
        break;
      }
      case ControlProfile.MotionPath: {
        this.physicsControl?.disable();
        this.navPathFollowing?.disableMotion();
        this.motionPathFollowing?.enable();
        break;
      }
      case ControlProfile.SelfDriven: {
        this.motionPathFollowing?.disable();
        this.physicsControl?.enable();
        this.navPathFollowing?.enableMotion();
        break;
      }
    }

    this._mode = mode;
    this.events.emit(ScriptedControlEvents.ModeChanged, mode);
    return this;
  }

  /** Restores the registered default (non-scripted) mode. */
  release(): this {
    if (this.defaultMode !== undefined) this.setMode(this.defaultMode);
    return this;
  }

  /**
   * Convenience for cutscenes: switch to the motion-path mode and snap onto the
   * given provider in one call. Avoids the swap-then-snap idiom that previously
   * had to be re-issued by hand to take effect.
   */
  followPath(
    pathProvider: MotionPathProvider,
    mode: TMode | undefined = this.pathMode
  ): this {
    if (mode === undefined) return this;
    this.setMode(mode);
    this.motionPathFollowing?.snapOntoPathProvider(pathProvider);
    return this;
  }
}
