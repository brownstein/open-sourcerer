import { ProtoSpriteThree } from "protosprite-three";
import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import { SpriteAssets } from "src/assets/allSpriteAssets";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { getAsset } from "src/engine/entity/decorators";
import { showAllLayers } from "src/util/spriteUtils";

import {
  AnimationControlBehavior,
  SpriteFacingDirection
} from "./AnimationControlBehavior";

type TriggerMode = "once" | "while";

export interface APIVFXData<
  TAnimations extends string,
  TLayers extends string
> {
  readonly spriteKey: keyof SpriteAssets;
  readonly frameTag?: TAnimations | null;
  readonly hideLayers?: TLayers[];
  readonly speedScaler?: number;
  readonly sizeScaler?: number;
  readonly flipFacing?: boolean;
  readonly followFacingDirection?: boolean;
  readonly isAnchored?: boolean;
  readonly depthOffset?: number;
  readonly offset?: Vector2;
  readonly opacity?: number;
}

export interface APIVFXTriggerData<
  TAnimations extends string,
  TLayers extends string
> extends APIVFXData<TAnimations, TLayers> {
  readonly trigger: () => boolean;
  readonly triggerMode?: TriggerMode;
  readonly spawnIntervalMs?: number;
  readonly spawnAtStart?: boolean;
}

type VFXData<TAnimations extends string, TLayers extends string> = Required<
  APIVFXData<TAnimations, TLayers>
>;

type VFXTriggerData<
  TAnimations extends string,
  TLayers extends string
> = Required<APIVFXTriggerData<TAnimations, TLayers>> & {
  currentTriggerValue: boolean;
  previousTriggerValue: boolean;
  previousSpawnTimeMs: number;
};

type CompatibleEntity = BaseEntityType<{
  animation?: AnimationControlBehavior<string>;
}>;

export class VFXManagerBehavior implements EntityBehavior<CompatibleEntity> {
  public readonly type = "VFXManager";

  private entity?: CompatibleEntity;
  private level?: LevelAPI;

  private readonly vfxTriggers: VFXTriggerData<string, string>[] = [];

  // a pool of sprites for all sprite keys that lazily grows in size as demand grows for each sprite key
  private readonly spritePool: ProtoSpriteThree[] = [];

  // WARN: never accessed directly, use ._borrowSprite and ._returnSprite
  private readonly availableSprites = new Map<
    keyof SpriteAssets,
    ProtoSpriteThree[]
  >();

  private lifetimeMs: number = 0;

  init(entity: CompatibleEntity): VFXManagerBehavior {
    this.entity = entity;
    return this;
  }

  destroy(): void {
    for (const sprite of this.spritePool) sprite.dispose();

    this.spritePool.length = 0;
    this.availableSprites.clear();
  }

  attachToLevel(level: EntityLevelAPI): void {
    this.level = level;

    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  attachVFX<
    TAnimations extends string = string,
    TLayers extends string = string
  >(
    apiVFXTriggerData: APIVFXTriggerData<TAnimations, TLayers>
  ): VFXManagerBehavior {
    const resolvedVFXTriggerData =
      this._resolveAPIVFXTriggerData(apiVFXTriggerData);
    this.vfxTriggers.push(resolvedVFXTriggerData);

    return this;
  }

  readonly step = (deltaMs: number): void => {
    if (!this.entity || !this.level) return;

    this.lifetimeMs += deltaMs;

    for (const sprite of this.spritePool) sprite.advance(deltaMs);

    this._runVFXTriggers();
    const triggeredVFX = this._getTriggeredVFX();

    for (const vfx of triggeredVFX) {
      vfx.previousSpawnTimeMs = this.lifetimeMs;
      this.spawnVFX(vfx);
    }
  };

  spawnVFX<
    TAnimations extends string = string,
    TLayers extends string = string
  >(vfxData: VFXData<TAnimations, TLayers>): void {
    if (!this.entity || !this.level) return;

    const vfxSprite = this._borrowSprite(vfxData.spriteKey);

    vfxSprite.gotoAnimation(vfxData.frameTag);
    vfxSprite.gotoAnimationFrame(0);
    vfxSprite.setAnimationSpeed(vfxData.speedScaler);

    vfxSprite.mesh.scale.set(1, 1, 1);
    vfxSprite.mesh.position.set(0, 0, 0);
    vfxSprite.setOpacity(1, true);
    showAllLayers(vfxSprite);

    // WARN: center before hiding layers to not mess up layer positioning
    vfxSprite.center();
    vfxSprite.hideLayers(...vfxData.hideLayers);

    vfxSprite.mesh.scale.y *= -1;
    vfxSprite.mesh.scale.x *= vfxData.flipFacing ? -1 : 1;
    vfxSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    vfxSprite.mesh.scale.multiplyScalar(vfxData.sizeScaler);

    vfxSprite.setOpacity(vfxData.opacity, true);

    vfxSprite.events.once("animationLooped", () => {
      vfxSprite.setAnimationSpeed(0);
      vfxSprite.mesh.parent?.remove(vfxSprite.mesh);
      this._returnSprite(vfxData.spriteKey, vfxSprite);
    });

    const adjustForFacingDirectionScalar =
      vfxData.followFacingDirection &&
      this.entity.behaviors.animation?.facingDirection ===
        SpriteFacingDirection.LEFT
        ? -1
        : 1;

    const finalXOffset = vfxData.offset.x * adjustForFacingDirectionScalar;
    vfxSprite.mesh.scale.x *= adjustForFacingDirectionScalar;

    if (!vfxData.isAnchored) {
      vfxSprite.mesh.position.set(
        finalXOffset,
        vfxData.offset.y,
        vfxData.depthOffset
      );
      this.entity.object3D?.add(vfxSprite.mesh);
    } else {
      vfxSprite.mesh.position.set(
        this.entity.position.x + finalXOffset,
        this.entity.position.y + vfxData.offset.y,
        this.entity.position.z + vfxData.depthOffset
      );
      this.level.scene.add(vfxSprite.mesh);
    }
  }

  private _runVFXTriggers(): void {
    for (const vfxTrigger of this.vfxTriggers) {
      vfxTrigger.previousTriggerValue = vfxTrigger.currentTriggerValue;
      vfxTrigger.currentTriggerValue = vfxTrigger.trigger();
    }
  }

  private _getTriggeredVFX(): VFXTriggerData<string, string>[] {
    const triggeredVFX: VFXTriggerData<string, string>[] = [];

    for (const trigger of this.vfxTriggers) {
      switch (trigger.triggerMode) {
        case "once": {
          const wasJustTriggered =
            !trigger.previousTriggerValue && trigger.currentTriggerValue;

          if (wasJustTriggered) triggeredVFX.push(trigger);
          break;
        }
        case "while": {
          const wasJustTriggered =
            !trigger.previousTriggerValue && trigger.currentTriggerValue;

          if (wasJustTriggered && !trigger.spawnAtStart) {
            trigger.previousSpawnTimeMs = this.lifetimeMs;
            continue;
          }

          if (!trigger.currentTriggerValue) continue;

          const deltaMsSinceLastSpawn =
            this.lifetimeMs - trigger.previousSpawnTimeMs;
          if (deltaMsSinceLastSpawn >= trigger.spawnIntervalMs)
            triggeredVFX.push(trigger);

          break;
        }
      }
    }

    return triggeredVFX;
  }

  private _borrowSprite(spriteKey: keyof SpriteAssets): ProtoSpriteThree {
    const availableSprites = this.availableSprites.get(spriteKey);
    const possibleAvailableSprite = availableSprites?.pop();

    if (possibleAvailableSprite) return possibleAvailableSprite;

    return this._createSprite(spriteKey);
  }

  private _createSprite(spriteKey: keyof SpriteAssets): ProtoSpriteThree {
    const sprite = getAsset(spriteKey).getSprite();
    this.spritePool.push(sprite);

    return sprite;
  }

  private _returnSprite(
    spriteKey: keyof SpriteAssets,
    sprite: ProtoSpriteThree
  ): void {
    const availableSprites = this.availableSprites.get(spriteKey);
    if (!availableSprites) {
      this.availableSprites.set(spriteKey, [sprite]);
      return;
    }

    availableSprites.push(sprite);
  }

  private _resolveAPIVFXData<
    TAnimations extends string = string,
    TLayers extends string = string
  >(
    apiVFXData: APIVFXData<TAnimations, TLayers>
  ): VFXData<TAnimations, TLayers> {
    const api = apiVFXData;

    // NOTE: explicitly did not use spread so this errors when new data points are added
    const spriteKey = api.spriteKey;
    const frameTag = api.frameTag ?? null;
    const hideLayers = api.hideLayers ?? [];

    // NOTE: for simplcity
    let speedScaler = api.speedScaler ?? 1;
    if (speedScaler === 0) speedScaler = 0.1;

    const sizeScaler = api.sizeScaler ?? 1;
    const flipFacing = api.flipFacing ?? false;
    const followFacingDirection = api.followFacingDirection ?? false;
    const isAnchored = api.isAnchored ?? true;
    const depthOffset = api.depthOffset ?? -0.2;
    const offset = api.offset ?? new Vector2();
    const opacity = api.opacity ?? 1;

    return {
      spriteKey,
      frameTag,
      hideLayers,
      speedScaler,
      sizeScaler,
      flipFacing,
      followFacingDirection,
      isAnchored,
      depthOffset,
      offset,
      opacity
    };
  }

  private _resolveAPIVFXTriggerData<
    TAnimations extends string = string,
    TLayers extends string = string
  >(
    apiVFXTriggerData: APIVFXTriggerData<TAnimations, TLayers>
  ): VFXTriggerData<TAnimations, TLayers> {
    const api = apiVFXTriggerData;

    // NOTE: explicitly did not use spread so this errors when new data points are added
    const {
      spriteKey,
      frameTag,
      hideLayers,
      speedScaler,
      sizeScaler,
      flipFacing,
      followFacingDirection,
      isAnchored,
      depthOffset,
      offset,
      opacity
    } = this._resolveAPIVFXData(apiVFXTriggerData);

    const trigger = api.trigger;
    const triggerMode = api.triggerMode ?? "once";
    const spawnIntervalMs = api.spawnIntervalMs ?? 200;
    const spawnAtStart = api.spawnAtStart ?? true;

    return {
      spriteKey,
      frameTag,
      hideLayers,
      trigger,
      speedScaler,
      sizeScaler,
      flipFacing,
      followFacingDirection,
      triggerMode,
      isAnchored,
      depthOffset,
      offset,
      opacity,
      spawnIntervalMs,
      spawnAtStart,
      currentTriggerValue: trigger(),
      previousTriggerValue: false,
      previousSpawnTimeMs: 0
    };
  }
}
