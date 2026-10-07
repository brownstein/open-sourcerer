import {
  Collider,
  ColliderDesc,
  RigidBody,
  RigidBodyDesc
} from "@dimforge/rapier2d-compat";
import { ProtoSpriteThree } from "protosprite-three";
import { Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from "three";

import { EntityAlignment, EntityProps, LevelAPI } from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { SpriteAssets } from "src/assets/allSpriteAssets";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";

import { TileableSpriteBehavior } from "../shared/behaviors/TileableSpriteBehavior";

type HorizontalAlign = "left" | "center" | "right";
type VerticalAlign = "top" | "center" | "bottom";

export type ResizableTerrainProps = EntityProps & {
  sprite?: keyof SpriteAssets;
  color?: ColorRepresentation;
  alignX?: HorizontalAlign;
  alignY?: VerticalAlign;
  shouldRepeatX?: boolean;
  shouldRepeatY?: boolean;
};

@setAssetDependencies<ResizableTerrainProps>((props) =>
  props?.sprite ? [props.sprite] : []
)
export class ResizableTerrain extends CoreEntity {
  static readonly type = "ResizableTerrain";
  public readonly type = ResizableTerrain.type;

  public object3D = new Object3D();
  public alignment = EntityAlignment.TemporaryTerrain;

  public readonly sprite?: ProtoSpriteThree;
  private readonly mesh?: Mesh;

  public targetWidth: number;
  public targetHeight: number;
  private actualWidth: number;
  private actualHeight: number;

  private readonly alignX: HorizontalAlign;
  private readonly alignY: VerticalAlign;

  public behaviors: {
    tilingSprite?: TileableSpriteBehavior;
  } = {};

  private body?: RigidBody;
  private collider?: Collider;

  private readonly RESIZING_SPEED_PER_SEC = 10;

  constructor(props: ResizableTerrainProps) {
    super(props);

    const spriteKey = props.sprite;
    const colorRepresentation = props.color ?? "#FFFFFF";

    if (spriteKey) {
      this.sprite = getAsset(spriteKey).getSprite();
    } else {
      this.mesh = new Mesh(
        new PlaneGeometry(1, 1),
        new MeshBasicMaterial({ color: colorRepresentation })
      );
    }

    this.alignX = props.alignX ?? "center";
    this.alignY = props.alignY ?? "center";

    this.targetWidth = this.size.width;
    this.targetHeight = this.size.height;
    this.actualWidth = this.targetWidth;
    this.actualHeight = this.targetHeight;

    const shouldRepeatX = props.shouldRepeatX ?? true;
    const shouldRepeatY = props.shouldRepeatY ?? true;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.object3D.rotateZ(this.angle);

    if (this.sprite) {
      this.object3D.scale.multiplyScalar(kInvPixelScale);

      this.sprite.center();
      this.sprite.mesh.scale.y *= -1;

      this.object3D.add(this.sprite.mesh);

      this.behaviors.tilingSprite = new TileableSpriteBehavior();

      this.behaviors.tilingSprite
        .init(this)
        .attachSprite(this.sprite)
        .setSize(this.actualWidth, this.actualHeight)
        .setRepeatX(shouldRepeatX)
        .setRepeatY(shouldRepeatY);

      if (this.alignX === "left") this.behaviors.tilingSprite.alignLeft();
      else if (this.alignX === "right")
        this.behaviors.tilingSprite.alignRight();

      if (this.alignY === "top") this.behaviors.tilingSprite.alignTop();
      else if (this.alignY === "bottom")
        this.behaviors.tilingSprite.alignBottom();
    } else if (this.mesh) {
      this.object3D.add(this.mesh);
      this._updateMeshTransform();
    }
  }

  setWidth(width: number): void {
    this.targetWidth = Math.max(0, width);
  }

  setHeight(height: number): void {
    this.targetHeight = Math.max(0, height);
  }

  setWidthInstant(width: number): void {
    this.targetWidth = width;
    this.actualWidth = width;
    this._updateSize();
  }

  setHeightInstant(height: number): void {
    this.targetHeight = height;
    this.actualHeight = height;
    this._updateSize();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    const deltaSeconds = deltaMs / 1000;
    const deltaResize = this.RESIZING_SPEED_PER_SEC * deltaSeconds;

    const deltaWidth = this.targetWidth - this.actualWidth;
    const deltaHeight = this.targetHeight - this.actualHeight;

    if (deltaWidth === 0 && deltaHeight === 0) return;

    this.actualWidth +=
      Math.sign(deltaWidth) * Math.min(deltaResize, Math.abs(deltaWidth));
    this.actualHeight +=
      Math.sign(deltaHeight) * Math.min(deltaResize, Math.abs(deltaHeight));

    this._updateSize();
  }

  attachToLevel(level: LevelAPI): void {
    super.attachToLevel(level);

    const { world } = level;

    const bodyDescription = RigidBodyDesc.fixed()
      .setTranslation(this.position.x, this.position.y)
      .setRotation(this.angle);

    this.body = world.createRigidBody(bodyDescription);
    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.body.handle
    });

    this._updateTerrainCollision();
  }

  destroy(): void {
    super.destroy();

    this.sprite?.dispose();

    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as MeshBasicMaterial).dispose();
    }

    if (this.body) {
      this.level?.world.removeRigidBody(this.body);
    }

    this.level?.removeEntityPhysicsHooks(this.id);
  }

  private _updateSize(): void {
    this.behaviors.tilingSprite?.setSize(this.actualWidth, this.actualHeight);

    this._updateMeshTransform();
    this._updateTerrainCollision();
  }

  private _updateMeshTransform(): void {
    if (!this.mesh) return;

    this.mesh.scale.set(this.actualWidth, this.actualHeight, 1);

    const halfActualWidth = this.actualWidth * 0.5;
    const halfActualHeight = this.actualHeight * 0.5;

    const xAlignmentOffsetFactor =
      this.alignX === "right" ? 1 : this.alignX === "left" ? -1 : 0;

    const yAlignmentOffsetFactor =
      this.alignY === "top" ? 1 : this.alignY === "bottom" ? -1 : 0;

    const xAlignmentOffset =
      (this.size.width * 0.5 - halfActualWidth) * xAlignmentOffsetFactor;
    const yAlignmentOffset =
      (this.size.height * 0.5 - halfActualHeight) * yAlignmentOffsetFactor;

    this.mesh.position.set(xAlignmentOffset, yAlignmentOffset, 0);
  }

  private _updateTerrainCollision(): void {
    if (!this.level) return;

    const { world } = this.level;

    if (this.collider) {
      world.removeCollider(this.collider, false);
      this.collider = undefined;
    }

    if (this.actualWidth === 0 || this.actualHeight === 0) return;

    const halfActualWidth = this.actualWidth * 0.5;
    const halfActualHeight = this.actualHeight * 0.5;

    const xAlignmentOffsetFactor =
      this.alignX === "right" ? 1 : this.alignX === "left" ? -1 : 0;

    const yAlignmentOffsetFactor =
      this.alignY === "top" ? 1 : this.alignY === "bottom" ? -1 : 0;

    const xAlignmentOffset =
      (this.size.width * 0.5 - halfActualWidth) * xAlignmentOffsetFactor;
    const yAlignmentOffset =
      (this.size.height * 0.5 - halfActualHeight) * yAlignmentOffsetFactor;

    const test = ColliderDesc.cuboid(halfActualWidth, halfActualHeight)
      .setCollisionGroups(terrainCollisionGroup)
      .setTranslation(xAlignmentOffset, yAlignmentOffset);

    this.collider = world.createCollider(test, this.body);

    if (this.body) {
      this.level.updateEntityPhysicsHooks({
        entityId: this.id,
        rigidBodyHandle: this.body.handle
      });
    }
  }
}
