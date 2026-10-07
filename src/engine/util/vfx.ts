import { ProtoSpriteThree } from "protosprite-three";
import { Object3D, Vector2 } from "three";

import { SpriteAssets } from "src/assets/allSpriteAssets";
import { showAllLayers } from "src/util/spriteUtils";

import { kInvPixelScale } from "../constants/scaling";
import { getAsset } from "../entity/decorators";

interface VFXOptions<TAnimations extends string, TLayers extends string> {
  readonly spriteKey: keyof SpriteAssets;
  readonly parent: Object3D;
  readonly speed?: number;
  readonly offset?: Vector2;
  readonly scale?: Vector2;
  readonly frameTag?: TAnimations | null;
  readonly hideLayers?: TLayers[];
  readonly depthOffset?: number;
  readonly opacity?: number;
}

export class SpriteVFX<TAnimations extends string, TLayers extends string> {
  private readonly spriteKey: keyof SpriteAssets;
  private readonly parent: Object3D;

  public speed: number;
  public offset: Vector2;
  public scale: Vector2;
  public frameTag: TAnimations | null;
  public hideLayers: TLayers[];
  public depthOffset: number;
  public opacity: number;

  private readonly spritePool: ProtoSpriteThree[] = [];
  private readonly availableSprites: ProtoSpriteThree[] = [];

  constructor(opts: VFXOptions<TAnimations, TLayers>) {
    this.spriteKey = opts.spriteKey;
    this.parent = opts.parent;

    this.speed = opts.speed ?? 1;
    this.offset = opts.offset?.clone() ?? new Vector2();
    this.scale = opts.scale?.clone() ?? new Vector2(1, 1);
    this.frameTag = opts.frameTag ?? null;
    this.hideLayers = opts.hideLayers ?? [];
    this.depthOffset = opts.depthOffset ?? 0;
    this.opacity = opts.opacity ?? 1;
  }

  play(): void {
    const possiblyAvailableSprite = this.availableSprites.pop();
    if (possiblyAvailableSprite) {
      this._playSprite(possiblyAvailableSprite);
      return;
    }

    const additionalSprite = this._createSprite();
    this._playSprite(additionalSprite);
  }

  private _createSprite(): ProtoSpriteThree {
    const sprite = getAsset(this.spriteKey).getSprite();

    this.spritePool.push(sprite);

    return sprite;
  }

  private _playSprite(sprite: ProtoSpriteThree): void {
    this._setupSprite(sprite);

    sprite.events.once("animationLooped", () => {
      sprite.setAnimationSpeed(0);
      this.parent.remove(sprite.mesh);
      this.availableSprites.push(sprite);
    });
  }

  private _setupSprite(sprite: ProtoSpriteThree): void {
    sprite
      .gotoAnimation(this.frameTag)
      .gotoAnimationFrame(0)
      .setAnimationSpeed(this.speed)
      .setOpacity(this.opacity, true)
      .setAnimationLooping(false);

    showAllLayers(sprite);
    sprite.center();
    sprite.hideLayers(...this.hideLayers);

    sprite.mesh.scale.set(this.scale.x, this.scale.y, 1);
    sprite.mesh.scale.y *= -1;
    sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    sprite.mesh.position.set(this.offset.x, this.offset.y, this.depthOffset);

    this.parent.add(sprite.mesh);
  }

  step(deltaMs: number): void {
    for (const sprite of this.spritePool) sprite.advance(deltaMs);
  }

  dispose(): void {
    for (const sprite of this.spritePool) sprite.dispose();

    this.spritePool.length = 0;
    this.availableSprites.length = 0;
  }
}
