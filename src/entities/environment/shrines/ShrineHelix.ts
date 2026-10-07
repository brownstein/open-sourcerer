import { ProtoSpriteSheetThree } from "protosprite-three";
import { Object3D } from "three";

import { EntityLevelAPI, EntityProps, LevelAPI } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import { ShrineDarkness } from "src/entities/environment/ShrineDarkness";
import { TileableSpriteBehavior } from "src/entities/shared/behaviors/TileableSpriteBehavior";

import shrineHelixCapPrs from "../sprites/big-shrine/shrine-drill-cap.prs";
import shrineHelixTopPrs from "../sprites/big-shrine/shrine-drill-top.prs";
import shrineHelixPrs from "../sprites/big-shrine/shrine-drill.prs";

export type ShrineHelixProps = EntityProps & {
  extensionSpeed?: number;
  shouldAutoExtend?: boolean;
};

export enum ShrineHelixEvents {
  FullyExtended = "FullyExtended",
  VFXPlayed = "VFXPlayed"
}

type ShrineHelixEventTypes = {
  [ShrineHelixEvents.FullyExtended]: void;
  [ShrineHelixEvents.VFXPlayed]: void;
};

@addResourceLoader(new ProtoSpriteLoader("shrineHelixSheet", shrineHelixPrs))
@addResourceLoader(
  new ProtoSpriteLoader("shrineHelixCapSheet", shrineHelixCapPrs)
)
@addResourceLoader(
  new ProtoSpriteLoader("shrineHelixTopSheet", shrineHelixTopPrs)
)
export class ShrineHelix extends CoreEntity {
  static readonly type = "ShrineHelix";
  public readonly type = ShrineHelix.type;

  public object3D = new Object3D();
  public sprite = getResource<ProtoSpriteSheetThree>(
    ShrineHelix,
    "shrineHelixSheet"
  ).getSprite();
  public helixEvents = createTypedEventEmitter<ShrineHelixEventTypes>();

  public behaviors = {
    tilingSprite: new TileableSpriteBehavior()
  };

  private readonly capSprite = getResource<ProtoSpriteSheetThree>(
    ShrineHelix,
    "shrineHelixCapSheet"
  ).getSprite();

  private readonly topSprite = getResource<ProtoSpriteSheetThree>(
    ShrineHelix,
    "shrineHelixTopSheet"
  ).getSprite();

  private readonly offsetObject3D = new Object3D();

  private readonly desiredHeight: number;
  private readonly extensionSpeed: number;

  private shouldStartExtending = false;
  private currentHeight = 0;
  private linearProgress = 0;

  private startedVFX = false;

  private darkness: ShrineDarkness | null = null;

  constructor(props: ShrineHelixProps) {
    super(props);

    const entityPixelWidth = this.size.width * kPixelScale;
    const entityWidthScaler = entityPixelWidth / this.capSprite.size.x;
    const topSpritePixelHeight = this.topSprite.size.y * entityWidthScaler;

    const OFFSET_FACTOR_TO_ENTER_TOP_SPRITE = 0.74;
    this.desiredHeight =
      this.size.height -
      topSpritePixelHeight * kInvPixelScale * OFFSET_FACTOR_TO_ENTER_TOP_SPRITE;
    this.extensionSpeed = props.extensionSpeed ?? 1;

    if (props.shouldAutoExtend) this.shouldStartExtending = true;

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    // NOTE: ADJUST Y POS POSITION TO ACCOUNT FOR THE Y MOVEMENT UPWARDS WHILE EXTEDNING
    const timeToFullyExtendSec = this.desiredHeight / this.extensionSpeed;
    const yOffsetWhenFullyExtending =
      this.extensionSpeed * timeToFullyExtendSec;
    this.offsetObject3D.position.y -= yOffsetWhenFullyExtending * kPixelScale;

    this.sprite.center();
    this.sprite.mesh.scale.y *= -1;

    this.offsetObject3D.add(this.sprite.mesh);

    this.capSprite.center();
    this.capSprite.mesh.scale.y *= -1;
    this.capSprite.mesh.position.z = 0.1;

    this.capSprite.mesh.scale.multiplyScalar(entityWidthScaler);

    this._updateCapPosition();

    this.offsetObject3D.add(this.capSprite.mesh);

    this.topSprite.center();
    this.topSprite.mesh.scale.y *= -1;
    this.topSprite.mesh.position.z = 0.2;
    this.topSprite.mesh.scale.multiplyScalar(entityWidthScaler);

    const entityPixelHeight = this.size.height * kPixelScale;
    const OFFSET_FACTOR_TO_ACCOUNT_FOR_VFX = 0.9;
    this.topSprite.mesh.position.y =
      entityPixelHeight * 0.5 -
      topSpritePixelHeight * OFFSET_FACTOR_TO_ACCOUNT_FOR_VFX * 0.5;

    this.topSprite.events.once("animationLooped", () => {
      this.topSprite.setAnimationSpeed(0);
    });

    this.object3D.add(this.topSprite.mesh);

    this.behaviors.tilingSprite
      .init(this)
      .attachSprite(this.sprite, this.offsetObject3D)
      .setSize(this.size.width, 0)
      .setRepeatX(false)
      .alignBottom();

    this.object3D.add(this.offsetObject3D);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    for (const entity of level.getEntities().values()) {
      if (entity.type === ShrineDarkness.type) {
        this.darkness = entity as ShrineDarkness;
        this.darkness.addFader(this.object3D);
        break;
      }
    }
  }

  detachFromLevel(level: LevelAPI): void {
    super.detachFromLevel(level);
    if (this.darkness) {
      this.darkness.removeFader(this.object3D);
      this.darkness = null;
    }
  }

  extend(): void {
    this.shouldStartExtending = true;
  }

  instantExtend(): void {
    this.shouldStartExtending = true;
    this.linearProgress = 1;
    this.step(0);
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    if (!this.shouldStartExtending) return;

    const START_VFX_THRESHOLD = 0.99;
    if (this.currentHeight / this.desiredHeight >= START_VFX_THRESHOLD) {
      if (!this.startedVFX) {
        this.helixEvents.emit(ShrineHelixEvents.VFXPlayed);
        this.startedVFX = true;
      }

      this.topSprite.advance(deltaMs);
    }

    if (this.currentHeight >= this.desiredHeight) return;

    this.darkness?.reRender();
    this.sprite.advance(deltaMs);
    this.capSprite.advance(deltaMs);

    const deltaSeconds = deltaMs / 1000;
    this.linearProgress +=
      (this.extensionSpeed * deltaSeconds) / this.desiredHeight;
    this.linearProgress = Math.min(this.linearProgress, 1);

    const eased = 1 - (1 - this.linearProgress) ** 3; // ease-out cubic
    const newHeight = eased * this.desiredHeight;
    const dy = newHeight - this.currentHeight;

    this.offsetObject3D.position.y += dy * kPixelScale;
    this.currentHeight = newHeight;

    this.behaviors.tilingSprite.setSize(this.size.width, this.currentHeight);

    if (this.currentHeight >= this.desiredHeight)
      this.helixEvents.emit(ShrineHelixEvents.FullyExtended);

    this._updateCapPosition();
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
    this.capSprite.dispose();
    this.topSprite.dispose();
  }

  private _updateCapPosition(): void {
    const entityPixelHeight = this.size.height * kPixelScale;
    const currentPixelHeight = this.currentHeight * kPixelScale;

    this.capSprite.mesh.position.y =
      -entityPixelHeight * 0.5 + currentPixelHeight;
  }
}
