import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import {
  BaseEntityType,
  DamageType,
  ElementalType,
  EntityProps
} from "src/api/entity";
import { SoundType } from "src/api/sound";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  addResourceLoader,
  getAsset,
  getResource,
  setAssetDependencies
} from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { PositionalSound } from "src/engine/sound/Sound";
import { vector3To2 } from "src/engine/util/vecTypes";
import type { EntityNetSummary } from "src/multiplayer/api";
import { HitArea, HitAreaShape } from "src/entities/shared/HitArea";

import * as explosionTypes from "./sprites/explosion-types";
import explosionPrs from "./sprites/explosion.prs";

export type FireballExplosionProps = EntityProps & {
  power?: number;
  radius?: number;
  impulseScaler?: number;
  sourceEntity?: BaseEntityType;
};

@addResourceLoader(new ProtoSpriteLoader("explosionSheet", explosionPrs))
@setAssetDependencies(() => ["fireExplosionSound"])
export class FireballExplosion extends CoreEntity {
  static type = "FireballExplosion";
  public type = FireballExplosion.type;
  public object3D = new Object3D();
  public sourceEntity?: BaseEntityType;
  public behaviors = {};

  private sprite = getResource<ProtoSpriteSheetThree>(
    FireballExplosion,
    "explosionSheet"
  ).getSprite<explosionTypes.sprite_layers, explosionTypes.sprite_animations>();
  private done = false;

  private readonly radius: number;

  private readonly baseExplosionVolume = 0.2;
  private readonly explosionSound = new PositionalSound(
    SoundType.SFX,
    this.object3D,
    getAsset("fireExplosionSound")
  )
    .setDetune(-600)
    .setPitchVariation(300);

  private readonly power: number;

  constructor(props: FireballExplosionProps) {
    super(props);

    const power = props.power ?? 5;
    this.power = power;
    const impulseScaler = props.impulseScaler ?? 3;

    const radius = props.radius ?? 1;
    this.radius = radius;

    this.sourceEntity = props.sourceEntity;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.multiplyScalar(radius);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.sprite.gotoFrame(0);
    this.sprite.center();

    this.sprite.events.on("animationLooped", () => {
      this.done = true;
      this.level?.removeEntity(this.id);
    });

    // Spawn HitArea for AOE damage
    const hitArea = new HitArea({
      position: this.position.clone(),
      sourceEntity: this.sourceEntity ?? this,
      damage: power,
      elementalDamageType: ElementalType.Fire,
      damageType: DamageType.Explosion,
      shape: {
        type: HitAreaShape.Circle,
        radius: radius * 0.75
      },
      shouldCheckLineOfSight: true,
      hitEntityHitDetailsHook: (otherEntity, originalHitDetails) => {
        const hitImpulse = vector3To2(otherEntity.position)
          .sub(this.position)
          .normalize()
          .multiplyScalar(impulseScaler);
        return {
          ...originalHitDetails,
          hitImpulse
        };
      }
    });
    this.level?.addEntity(hitArea);
    this._pendingHitArea = hitArea;
  }

  private _pendingHitArea?: HitArea;

  attachToLevel(level: import("src/api/entity").LevelAPI) {
    super.attachToLevel(level);
    if (this._pendingHitArea) {
      level.addEntity(this._pendingHitArea);
      this._pendingHitArea = undefined;
    }

    const explosionVolume = clamp(
      this.baseExplosionVolume + this.radius * 0.05,
      0,
      0.6
    );
    this.explosionSound.setVolume(explosionVolume, 0).play();
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
    this.explosionSound.dispose();
  }

  step(ms: number) {
    super.step(ms);
    if (!this.done) {
      this.sprite.advance(ms);
    }
  }

  /** Multiplayer summary — the spawn report is the whole story (static
   *  one-shot VFX + AOE, applied victim-side by the stub). */
  getNetSummary(): EntityNetSummary {
    return {
      pos: { x: this.position.x, y: this.position.y },
      power: this.power,
      radius: this.radius
    };
  }
}
