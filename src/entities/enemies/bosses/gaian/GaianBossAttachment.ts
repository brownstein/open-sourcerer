import { Collider, RigidBody, Shape } from "@dimforge/rapier2d-compat";
import { RegionAttachment } from "@esotericsoftware/spine-core";
import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import {
  AABB,
  ThreeSpine,
  ThreeSpineEvents
} from "src/engine/spine/ThreeSpine";
import { vector3To2 } from "src/engine/util/vecTypes";

export type GaianBossAttachmentProps = EntityProps & {
  parent: BaseEntityType;
  threeSpine: ThreeSpine;
  boneName: string;
  slotName: string;
  customShape?: (aabb: AABB) => Shape;
  flashIntensity?: number;
};

export class GaianBossAttachment extends CoreEntity {
  public alignment = EntityAlignment.Enemy; // This is an enemy.
  private parent: BaseEntityType;
  private threeSpine: ThreeSpine;
  private boneName: string;
  private slotName: string;
  private customShape?: (aabb: AABB) => Shape;
  private rigidBody?: RigidBody;
  private collider?: Collider;
  private needsAttachmentUpdate = true;
  private flashIntensity = 1;
  private active = true;
  constructor(props: GaianBossAttachmentProps) {
    super(props);
    this.parent = props.parent;
    this.threeSpine = props.threeSpine;
    this.boneName = props.boneName;
    this.slotName = props.slotName;
    this.customShape = props.customShape;
    this.flashIntensity = props.flashIntensity ?? this.flashIntensity;

    this.threeSpine.events.on(ThreeSpineEvents.AddAttachment, (toggleData) => {
      if (toggleData.slotName === this.slotName)
        this.needsAttachmentUpdate = true;
    });
    this.threeSpine.events.on(
      ThreeSpineEvents.RemoveAttachment,
      (toggleData) => {
        if (toggleData.slotName === this.slotName)
          this.needsAttachmentUpdate = true;
      }
    );
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.updateFromAttachment();
  }
  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    if (this.rigidBody) level.world.removeRigidBody(this.rigidBody);
    level.removeEntityPhysicsHooks(this.id);
    this.rigidBody = undefined;
    this.collider = undefined;
  }
  destroy(): void {
    super.destroy();
    this.rigidBody = undefined;
    this.collider = undefined;
  }
  step(ms: number) {
    super.step(ms);
    if (this.needsAttachmentUpdate) this.updateFromAttachment();
  }
  repositionFromBone() {
    const attachmentBounds = this.threeSpine.getAABBForBone(
      this.boneName,
      this.slotName
    );
    attachmentBounds.position.add(vector3To2(this.parent.position));
    attachmentBounds.size.multiplyScalar(kInvPixelScale);

    if (this.rigidBody) {
      this.rigidBody.setTranslation(attachmentBounds.position, true);
      this.rigidBody.setRotation(attachmentBounds.rotation, true);
      this.rigidBody.setLinvel(new Vector2(), true);
      this.rigidBody.setAngvel(0, true);
    }
  }
  updateFromAttachment() {
    if (!this.level) return;
    const { rapier, world } = this.level;

    this.needsAttachmentUpdate = false;
    const bone = this.threeSpine.skeleton.findBone(this.boneName);
    if (!bone) {
      console.log(`Bone ${this.boneName} not found.`);
      return;
    }
    const slot = this.threeSpine.skeleton.findSlot(this.slotName);
    if (!slot) {
      console.log(`Slot ${this.slotName} not found.`);
      return;
    }
    const attachment = slot.getAttachment();
    if (attachment && attachment instanceof RegionAttachment) {
      const attachmentBounds = this.threeSpine.getAABBForBone(this.boneName);
      attachmentBounds.position.add(vector3To2(this.parent.position));
      this.position.x = attachmentBounds.position.x;
      this.position.y = attachmentBounds.position.y;
      if (this.rigidBody && this.collider) {
        this.rigidBody.setEnabled(this.active);
        this.collider.setShape(
          this.customShape?.(attachmentBounds) ??
            new rapier.Cuboid(
              attachmentBounds.size.x * kInvPixelScale * 0.5,
              attachmentBounds.size.y * kInvPixelScale * 0.5
            )
        );
      } else {
        const rbDesc = new rapier.RigidBodyDesc(
          rapier.RigidBodyType.Dynamic
        ).setTranslation(
          attachmentBounds.position.x,
          attachmentBounds.position.y
        );
        const collDesc = new rapier.ColliderDesc(
          this.customShape?.(attachmentBounds) ??
            new rapier.Cuboid(
              attachmentBounds.size.x * kInvPixelScale * 0.5,
              attachmentBounds.size.y * kInvPixelScale * 0.5
            )
        ).setCollisionGroups(enemyCollisionGroup);
        this.rigidBody = world.createRigidBody(rbDesc);
        this.collider = world.createCollider(collDesc, this.rigidBody);
        this.level.registerEntityPhysicsHooks({
          entityId: this.id,
          rigidBodyHandle: this.rigidBody.handle,
          colliderHandles: [this.collider.handle]
        });
      }
    } else {
      if (this.rigidBody) {
        this.rigidBody.setEnabled(false);
      }
    }
  }
  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    this.scheduler.add({
      duration: 150,
      invokeFunction: (t) => {
        this.threeSpine.setSlotShaderOverride(this.slotName, {
          fadeAmount: Math.sin(t * Math.PI) * this.flashIntensity * 0.5,
          fadeColor: 0xffffff,
          outlineAmount: Math.sin(t * Math.PI) * this.flashIntensity,
          outlineColor: 0xffffff
        });
      }
    });
  }
  deactivate() {
    this.active = false;
    this.rigidBody?.setEnabled(false);
  }
}
