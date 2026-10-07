import { RigidBody } from "@dimforge/rapier2d-compat";
import { Object3D } from "three";

import {
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { SoundType } from "src/api/sound";
import { createTypedEventEmitter } from "src/api/util";
import { enemyBackgroundCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { PositionalSound } from "src/engine/sound/Sound";
import {
  sprite_animations,
  sprite_layers
} from "src/entities/environment/sprites/crystal-torch/crystal_torch";
import { CallbackTriggerManagerBehavior } from "src/entities/shared/behaviors/CallbackTriggerManagerBehavior";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

export enum CrystalTorchShape {
  Ground = "Ground",
  Pillar = "Pillar",
  TallPillar = "TallPillar",
  Wall = "Wall",
  Standalone = "Standalone"
}

const crystalShapeToLayer: Record<CrystalTorchShape, sprite_layers> = {
  [CrystalTorchShape.Ground]: "crystal_01",
  [CrystalTorchShape.Pillar]: "crystal_02",
  [CrystalTorchShape.TallPillar]: "crystal_03",
  [CrystalTorchShape.Wall]: "crystal_04",
  [CrystalTorchShape.Standalone]: "crystal"
};

export type CrystalTorchProps = EntityProps & {
  shape?: CrystalTorchShape;
  channel?: string;
  channelInverted?: boolean;
  startActivated?: boolean;
};

export type CrystalTorchEventTypes = {
  interacted: boolean;
};

@setAssetDependencies(() => ["crystalTorchSprite", "spellPickup1Sound"])
export class CrystalTorch extends CoreEntity {
  static type = "CrystalTorch";
  public type = CrystalTorch.type;
  public alignment = EntityAlignment.Environment;
  public object3D = new Object3D();
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & CrystalTorchEventTypes
  >();

  public behaviors = {
    callbackTrigger: new CallbackTriggerManagerBehavior(),
    signal: new SignalConnectionBehavior()
  };

  public isOn = false;

  private channel?: string;
  private channelInverted = false;
  private startActivated = false;

  private shapeName = CrystalTorchShape.Wall;
  private sprite = getAsset("crystalTorchSprite").getSprite<
    sprite_layers,
    sprite_animations
  >();
  private rigidBody?: RigidBody;
  private unsubChannel?: () => void;
  private currentUpdateFromSignal = false;

  private readonly interactSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("spellPickup1Sound")
  )
    .setVolume(2.5)
    .setPitchVariation(30);

  constructor(props: CrystalTorchProps) {
    super(props);

    this.shapeName = props.shape ?? this.shapeName;
    this.channel = props.channel ?? this.channel;
    this.channelInverted = props.channelInverted ?? this.channelInverted;
    this.startActivated = props.startActivated ?? this.startActivated;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.sprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
    this.sprite.hideLayers(
      "crystal_01",
      "crystal_02",
      "crystal_03",
      "crystal_04"
    );
    this.sprite.center();
    this.sprite.showLayers(crystalShapeToLayer[this.shapeName]);
    this.isOn = this.startActivated;
    this.sprite.gotoAnimation(this.startActivated ? "on" : "off");
    this.sprite.events.on("animationLooped", (animation) => {
      const wasUpdateFromSignal = this.currentUpdateFromSignal;
      this.currentUpdateFromSignal = false;
      if (animation.animation === "turn_on") {
        if (this.sprite.getAnimationSpeed() > 0) {
          this.sprite.gotoAnimation("on");
          this.isOn = true;
          if (this.channel) this.level?.state.setValue(this.channel, true);
          if (!wasUpdateFromSignal)
            this.behaviors.signal.transmit({ value: true });
        } else {
          this.sprite.gotoAnimation("off");
          this.isOn = false;
          if (this.channel) this.level?.state.setValue(this.channel, false);
          if (!wasUpdateFromSignal)
            this.behaviors.signal.transmit({ value: false });
        }
      }
    });

    this.behaviors.signal.init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      (signal) => {
        const signalOn = !!signal.signal.value;
        if (signalOn !== this.isOn) {
          this.currentUpdateFromSignal = true;
          if (!this.isOn) {
            this.sprite.gotoAnimation("turn_on");
            this.sprite.gotoAnimationFrame(0);
            this.sprite.setAnimationSpeed(1);
            return;
          }
          this.sprite.gotoAnimation("turn_on");
          this.sprite.gotoAnimationFrame(
            (this.sprite.data.animationState.currentAnimation?.indexEnd ?? 0) -
              (this.sprite.data.animationState.currentAnimation?.indexStart ??
                0)
          );
          this.sprite.setAnimationSpeed(-1);
        }
      }
    );
    this.behaviors.callbackTrigger.init(this).attach({
      mode: "event",
      emitter: this.events,
      event: "interacted",
      onActivation: (isActivated: boolean) => {
        const newPlaybackRate = isActivated ? 1 : -2.2;

        this.interactSound.setPlaybackRate(newPlaybackRate).play();
      }
    });
  }
  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.interactSound.dispose();
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    const { rapier, world } = level;
    const rigidBodyDesc = rapier.RigidBodyDesc.kinematicPositionBased();
    rigidBodyDesc.setTranslation(this.position.x, this.position.y);
    rigidBodyDesc.setRotation(this.angle);
    this.rigidBody = world.createRigidBody(rigidBodyDesc);

    const shape = new rapier.Capsule(0.25, 0.25);
    const colliderDesc = new rapier.ColliderDesc(shape);
    colliderDesc.setCollisionGroups(enemyBackgroundCollisionGroup);
    colliderDesc.setActiveCollisionTypes(rapier.ActiveCollisionTypes.ALL);
    const collider = world.createCollider(colliderDesc, this.rigidBody);

    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.rigidBody.handle,
      colliderHandles: [collider.handle]
    });

    if (this.channel) {
      this.unsubChannel = level.state.subValue(this.channel, (isOn) => {
        if (isOn !== this.channelInverted) {
          this.isOn = true;
          this.sprite.gotoAnimation("on");
          this.sprite.setAnimationSpeed(0);
        } else {
          this.isOn = false;
          this.sprite.gotoAnimation("off");
          this.sprite.setAnimationSpeed(0);
        }
      });
    }
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);

    this.unsubChannel?.();
    this.unsubChannel = undefined;

    level.removeEntityPhysicsHooks(this.id);
    if (this.rigidBody !== undefined) {
      level.world.removeRigidBody(this.rigidBody);
      this.rigidBody = undefined;
    }
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
    this.object3D.rotation.z = this.angle;
  }
  hit(details: EntityHitDetails) {
    console.log("Switch hit", details);
    this.currentUpdateFromSignal = false;
    if (this.sprite.getAnimation() === "off") {
      this.sprite.gotoAnimation("turn_on");
      this.sprite.gotoAnimationFrame(0);
      this.sprite.setAnimationSpeed(1);
      this.events.emit("interacted", true);
      return;
    }
    if (this.sprite.getAnimation() === "on") {
      this.sprite.gotoAnimation("turn_on");
      this.sprite.gotoAnimationFrame(
        (this.sprite.data.animationState.currentAnimation?.indexEnd ?? 0) -
          (this.sprite.data.animationState.currentAnimation?.indexStart ?? 0)
      );
      this.sprite.setAnimationSpeed(-1);
      this.events.emit("interacted", false);
      return;
    }
  }
}
