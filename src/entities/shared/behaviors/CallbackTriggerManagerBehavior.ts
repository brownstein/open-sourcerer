import { clamp, mapLinear } from "three/src/math/MathUtils.js";

import {
  BaseEntityType,
  EntityBehavior,
  EntityHitDetails,
  EntityLifecycleEvents
} from "src/api/entity";
import { SoundAPI } from "src/api/sound";
import { EmitterEventsMap } from "src/api/util";
import {
  CallbackTrigger,
  CallbackTriggerManager,
  TriggerOptions
} from "src/engine/util/trigger";

import { CentralDataStoreBehavior } from "./CentralDataStoreBehavior";
import {
  CharacterGroundPhysicsControlBehavior,
  CharacterGroundPhysicsControlBehaviorEvents
} from "./CharacterGroundPhysicsController";
import { MotionCapabilitiesBehavior } from "./MotionCapabilities";

interface CallbackPresets {
  stepSound: {
    sound: SoundAPI;
    stepInterval: number;
  };
  jumpSound: {
    jumpSound: SoundAPI;
    preJumpSound?: SoundAPI;
  };
  hitSound: {
    hitSound: SoundAPI;
    healSound?: SoundAPI;
  };
  landSound: {
    sound: SoundAPI;
    lowerYLinvelForMaxFallFactor?: number;
    pitchVariationAmountBasedOnFallFactor?: number;
  };
  landInWaterSound: {
    waterSound: SoundAPI;
    lowYLinvelThresholdForWaterSound?: number;
    highImpactWaterSound?: SoundAPI;
    lowYLinvelThresholdForHighImpactWaterSound?: number;
  };
}

type CompatibleEntity = BaseEntityType<{
  data?: CentralDataStoreBehavior;
  motionCapabilities?: MotionCapabilitiesBehavior;
  physicsControl?: CharacterGroundPhysicsControlBehavior;
  callbackTrigger?: CallbackTriggerManagerBehavior;
}>;

export class CallbackTriggerManagerBehavior implements EntityBehavior {
  public readonly type = "CallbackTriggerManager";

  private readonly callbackTriggerManager = new CallbackTriggerManager();

  private entity?: CompatibleEntity;

  init(entity: CompatibleEntity): this {
    this.entity = entity;

    this.entity.events.on(EntityLifecycleEvents.Step, (deltaMs) =>
      this.callbackTriggerManager.tick(deltaMs)
    );
    this.entity.events.on(EntityLifecycleEvents.Destroy, () =>
      this.callbackTriggerManager.dispose()
    );

    return this;
  }

  attach<
    EventTypes extends EmitterEventsMap = EmitterEventsMap,
    const EventType extends keyof EventTypes = keyof EventTypes
  >(opts: TriggerOptions<EventTypes, EventType>): this {
    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger(opts)
    );

    return this;
  }

  attachPreset<PresetKey extends keyof CallbackPresets>(
    preset: PresetKey,
    opts: CallbackPresets[PresetKey]
  ): this {
    switch (preset) {
      case "stepSound": {
        const presetOpts = opts as CallbackPresets["stepSound"];
        this._stepSoundPreset(presetOpts);
        break;
      }

      case "jumpSound": {
        const presetOpts = opts as CallbackPresets["jumpSound"];
        this._jumpSoundPreset(presetOpts);
        break;
      }

      case "hitSound": {
        const presetOpts = opts as CallbackPresets["hitSound"];
        this._hitSoundPreset(presetOpts);
        break;
      }

      case "landSound": {
        const presetOpts = opts as CallbackPresets["landSound"];
        this._landSoundPreset(presetOpts);
        break;
      }

      case "landInWaterSound": {
        const presetOpts = opts as CallbackPresets["landInWaterSound"];
        this._landInWaterSoundPreset(presetOpts);
        break;
      }
    }

    return this;
  }

  private _stepSoundPreset(opts: CallbackPresets["stepSound"]): void {
    const dataStore = this.entity?.behaviors.data;
    if (!dataStore) return;

    const maxVolume = opts.sound.getVolume();

    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger({
        mode: "while",
        activationOffsetMs: opts.stepInterval,
        activationIntervalMs: opts.stepInterval,
        trigger: () =>
          dataStore.current.isGrounded && dataStore.current.hSpeedRatio !== 0,
        onActivation: () => {
          const absXLinvel = Math.abs(dataStore.current.linvel.x);
          const maxGroundSpeedX =
            this.entity?.behaviors.motionCapabilities?.capabilities
              .maxGroundSpeedX ?? 0;
          const xLinvelFactor = clamp(absXLinvel / maxGroundSpeedX, 0, 1);

          const newVolume = maxVolume * xLinvelFactor;

          opts.sound.setVolume(newVolume).play();
        }
      })
    );
  }

  private _jumpSoundPreset(opts: CallbackPresets["jumpSound"]): void {
    const groundPhysics = this.entity?.behaviors.physicsControl;
    if (!groundPhysics) return;

    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger({
        mode: "event",
        emitter: groundPhysics.events,
        event: CharacterGroundPhysicsControlBehaviorEvents.Jump,
        onActivation: () => opts.jumpSound.play()
      })
    );

    if (opts.preJumpSound) {
      const preJumpSound = opts.preJumpSound;

      this.callbackTriggerManager.attachCallbackTrigger(
        new CallbackTrigger({
          mode: "event",
          emitter: groundPhysics.events,
          event: CharacterGroundPhysicsControlBehaviorEvents.PreJump,
          onActivation: () => preJumpSound.play()
        })
      );
    }
  }

  private _hitSoundPreset(opts: CallbackPresets["hitSound"]): void {
    const entity = this.entity;
    if (!entity) return;

    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger({
        mode: "event",
        emitter: entity.events,
        event: EntityLifecycleEvents.Hit,
        onActivation: (hitDetails: EntityHitDetails) => {
          const damage = hitDetails.damage;

          if (damage === 0) return;
          else if (damage > 0) opts.hitSound.play();
          else opts.healSound?.play();
        }
      })
    );
  }

  private _landSoundPreset(opts: CallbackPresets["landSound"]): void {
    const dataStore = this.entity?.behaviors.data;
    if (!dataStore) return;

    const maxVolume = opts.sound.getVolume();
    const baseDetune = opts.sound.getDetune();

    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger({
        mode: "edge",
        trigger: () => !dataStore.current.isFalling,
        onActivation: () => {
          if (dataStore.current.isInWater) return;

          const yLinvel = dataStore.current.linvel.y;
          if (yLinvel >= 0) return;

          const lowerYLinvelForMaxFallFactor =
            opts.lowerYLinvelForMaxFallFactor ?? -20;
          const fallFactor = mapLinear(
            yLinvel,
            0,
            lowerYLinvelForMaxFallFactor,
            0,
            1
          );

          const newVolume = maxVolume * fallFactor;

          const pitchVariationAmountBasedOnFallFactor =
            opts.pitchVariationAmountBasedOnFallFactor ?? 1200;
          const lowDetuneRange =
            baseDetune - pitchVariationAmountBasedOnFallFactor;
          const highDetuneRange =
            baseDetune + pitchVariationAmountBasedOnFallFactor;

          const newDetune = mapLinear(
            fallFactor,
            0,
            1,
            highDetuneRange,
            lowDetuneRange
          );

          opts.sound.setVolume(newVolume).setDetune(newDetune).play();
        }
      })
    );
  }

  private _landInWaterSoundPreset(
    opts: CallbackPresets["landInWaterSound"]
  ): void {
    const dataStore = this.entity?.behaviors.data;
    if (!dataStore) return;

    this.callbackTriggerManager.attachCallbackTrigger(
      new CallbackTrigger({
        mode: "edge",
        trigger: () => dataStore.current.isInWater,
        onActivation: () => {
          const yLinvel = dataStore.current.linvel.y;
          if (yLinvel >= 0) return;

          const lowYLinvelThresholdForWaterSound =
            opts.lowYLinvelThresholdForWaterSound ?? -5;
          const lowYLinvelThresholdForHighImpactWaterSound =
            opts.lowYLinvelThresholdForHighImpactWaterSound ?? -10;

          if (yLinvel < lowYLinvelThresholdForWaterSound)
            opts.waterSound.play();
          if (yLinvel < lowYLinvelThresholdForHighImpactWaterSound)
            opts.highImpactWaterSound?.play();
        }
      })
    );
  }
}
