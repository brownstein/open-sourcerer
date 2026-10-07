import { Color, Object3D, Vector2 } from "three";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { SoundType } from "src/api/sound";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  getAsset,
  setAssetDependencies,
  setConsumerDependencies
} from "src/engine/entity/decorators";
import { PositionalSound } from "src/engine/sound/Sound";
import { FireballExplosion } from "src/entities/spells/blasts/FireballExplosion";

import { CallbackTriggerManagerBehavior } from "../shared/behaviors/CallbackTriggerManagerBehavior";
import { CharacterPhysicsBehavior } from "../shared/behaviors/CharacterPhysics";
import { SignalConnectionBehavior } from "../shared/behaviors/SignalConnectionBehavior";
import { StatusBehavior } from "../shared/behaviors/StatusBehavior";

export type ExplodingBarrelProps = EntityProps & {
  variant?: number; // 0-2: which barrel to display
  radius?: number;
  damage?: number;
  hp?: number;
  impulse?: number; // The force of the explosion.
  explosionDelayMs?: number;
};

export enum ExplodingBarrelEvents {
  Ignite = "Ignite",
  Explode = "Explode"
}

@setAssetDependencies(() => ["barrelSprite", "fireSound"])
@setConsumerDependencies(() => [FireballExplosion])
export class ExplodingBarrel extends CoreEntity {
  static readonly type = "ExplodingBarrel";
  public readonly type = ExplodingBarrel.type;

  public readonly alignment = EntityAlignment.EnvironmentalHazard;
  public explodingBarrelEvents = createTypedEventEmitter<{
    [ExplodingBarrelEvents.Ignite]: void;
    [ExplodingBarrelEvents.Explode]: void;
  }>();

  private sprite = getAsset("barrelSprite").getSprite();
  public object3D = new Object3D();
  public persist = true;

  public readonly size = {
    width: 0.608,
    height: 0.848
  };

  private explosionRadius: number;
  private explosionDamage: number;
  private explosionImpulse: number;
  private readonly explosionDelayMs;

  public behaviors = {
    status: new StatusBehavior(),
    callbackTrigger: new CallbackTriggerManagerBehavior(),
    physics: new CharacterPhysicsBehavior(),
    signal: new SignalConnectionBehavior()
  };

  private ignited = false;

  private readonly igniteSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireSound")
  )
    .setVolume(0.3)
    .setDetune(600)
    .setPitchVariation(160);

  constructor(props: ExplodingBarrelProps) {
    super(props);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    //Display the right barrel
    this.sprite.hideLayers("Layer 1", "Layer 2", "Barrel 1");
    switch (props.variant) {
      case 1:
        this.sprite.showLayers("Barrel 1");
        break;
      case 2:
        this.sprite.showLayers("Layer 1");
        break;
      case 3:
        this.sprite.showLayers("Layer 2");
        break;
      default:
        this.sprite.showLayers("Barrel 1");
        break;
    }

    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.sprite.gotoFrame(0);
    this.sprite.center();
    this.sprite.mesh.translateX(-0.05);
    this.sprite.mesh.translateY(0.06);
    this.sprite.setOpacity(1);

    this.object3D.add(this.sprite.mesh);

    this.sprite.events.on("animationLooped", () => {
      this.sprite.gotoFrame(-1);
    });

    this.behaviors.status.init(this).attachProtosSprite(this.sprite);

    this.behaviors.physics
      .init(this)
      .setGroup(terrainCollisionGroup)
      .setDensity(10)
      .setDamping(0.5)
      .setRotationLocked(false)
      .setShouldPushAwayOtherCharacterPhysics(false);

    //Add properties defined in the level
    this.behaviors.status.setMaxHealth(props.hp ?? 5);
    this.behaviors.status.healthBar.setOpacity(0);
    this.explosionDamage = props.damage ?? 20;
    this.explosionImpulse = props.impulse ?? 5;
    this.explosionRadius = props.radius ?? 2;
    this.explosionDelayMs = props.explosionDelayMs ?? 250;

    this.behaviors.callbackTrigger.init(this).attach({
      mode: "event",
      emitter: this.explodingBarrelEvents,
      event: ExplodingBarrelEvents.Ignite,
      trigger: () => this.explosionDelayMs > 0,
      onActivation: () => this.igniteSound.play()
    });

    this.behaviors.signal
      .setShape({
        type: "aabb",
        width: this.size.width,
        height: this.size.height,
        angle: this.angle
      })
      .init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) this.ignite();
      }
    );
  }

  attachToLevel(level: LevelAPI) {
    super.attachToLevel(level);

    this.events.on(EntityLifecycleEvents.Die, () => this.ignite());

    // Let hit impulses bypass the high density
    this.events.on(EntityLifecycleEvents.Hit, (hitDetails) => {
      if (!hitDetails.hitImpulse) return;

      this.behaviors.physics.body?.applyImpulse(
        hitDetails.hitImpulse.clone().multiplyScalar(10),
        true
      );
    });
  }

  private async ignite(): Promise<void> {
    if (this.ignited) return;
    this.ignited = true;

    this.explodingBarrelEvents.emit(ExplodingBarrelEvents.Ignite);
    const white = new Color(1, 1, 1);
    this.scheduler.add({
      id: "flash",
      duration: this.explosionDelayMs,
      invokeFunction: (t) => {
        const tPow = Math.pow(t, 1.8);
        const tFlash = Math.sin(tPow * 12 * Math.PI) * 0.4 + 0.4;
        this.sprite.fadeAllLayers(white, tFlash);
      }
    });
    await this.scheduler.asyncTimeout(this.explosionDelayMs);
    this.explodingBarrelEvents.emit(ExplodingBarrelEvents.Explode);

    const explosion = new FireballExplosion({
      position: this.position.clone(),
      power: this.explosionDamage,
      radius: this.explosionRadius,
      impulseScaler: this.explosionImpulse,
      sourceEntity: this
    });

    this.level?.addEntity(explosion);
    this.level?.removeEntity(this.id);
  }

  destroy(): void {
    super.destroy();

    this.sprite.dispose();
    this.igniteSound.dispose(this.igniteSound.getLongestBufferDurationMs());
  }
}
