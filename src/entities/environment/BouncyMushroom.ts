import { RigidBody } from "@dimforge/rapier2d-compat";
import { Color, Object3D, Vector2 } from "three";

import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import {
  BouncyEntityAPI,
  SolidEntityAPI,
  isBouncable
} from "src/api/entityInteractions";
import { CollisionBehavior } from "src/api/physics";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import * as BMTypes from "src/entities/environment/sprites/mushroom/mushroom_top";

export type BouncyMushroomProps = EntityProps & {
  bounceMultiplier?: number;
  bounceOffset?: number;
};

@setAssetDependencies(() => ["mushroomPlatform"])
export class BouncyMushroom
  extends CoreEntity
  implements BaseEntityType, BouncyEntityAPI, SolidEntityAPI
{
  static type = "BouncyMushroom";
  public type = BouncyMushroom.type;
  public readonly bouncy = true;
  public readonly bounceVector = new Vector2(0, 1);
  public readonly solidTerrainLike = true;
  public readonly solidPlatformLike = true;
  public bounceStrengthMultiplier = 0.98;
  public bounceStrengthOffset = 2;

  public object3D = new Object3D();

  private sprite =
    getAsset("mushroomPlatform").getSprite<BMTypes.sprite_layers>();
  private body?: RigidBody;

  constructor(props: BouncyMushroomProps) {
    super(props);

    if (props.bounceMultiplier)
      this.bounceStrengthMultiplier = props.bounceMultiplier;
    if (props.bounceOffset !== undefined)
      this.bounceStrengthOffset = props.bounceOffset;
    this.bounceVector.rotateAround(new Vector2(), this.angle);

    const bounciness =
      this.bounceStrengthMultiplier * 0.5 + this.bounceStrengthOffset * 0.5;
    const bouncinessR = Math.min(1, (bounciness + 1) / bounciness - 1);
    const bouncinessG = Math.max(0, 0.5 - bouncinessR) * 2;
    const bouncinessB = Math.max(0, 0.8 - bouncinessR) * 2;

    this.sprite.multiplyLayers(
      new Color(bouncinessR, bouncinessG, bouncinessB),
      0.9,
      "Color",
      false
    );
    this.sprite.fadeLayers(
      new Color(bouncinessR, bouncinessG * 0.3, bouncinessB * 0.6),
      0.25,
      "Color"
    );

    this.sprite.setAnimationSpeed(0);
    this.sprite.setAnimationLooping(false);
    this.sprite.center();
    this.sprite.centerOffset.y--;
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.y *= -1;
    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.rotation.z = this.angle;
    this.sprite.events.on("animationLooped", () => {
      this.sprite.setAnimationSpeed(0);
      this.sprite.gotoFrame(0);
    });
  }
  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);

    const { rapier } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.fixed();
    this.body = level.world.createRigidBody(rigidBodyDesc);
    this.body.setTranslation(
      new Vector2(0, 0.1)
        .rotateAround(new Vector2(), this.angle)
        .add(vector3To2(this.position)),
      true
    );
    this.body.setRotation(this.angle, true);

    const colliderDesc = ColliderDesc.cuboid(0.75, 0.2);
    if (colliderDesc === null) return;
    colliderDesc.setCollisionGroups(terrainCollisionGroup);
    const collider = level.world.createCollider(colliderDesc, this.body);
    collider.setActiveEvents(level.rapier.ActiveEvents.COLLISION_EVENTS);
    collider.setActiveHooks(level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.body.handle,
      acceptCollisionByDefault: false,
      beginCollision: (
        _thisEntity,
        otherEntity,
        normal,
        _thisCollHandle,
        otherCollHandle
      ) => {
        if (normal.dot(this.bounceVector) <= 0.1)
          return CollisionBehavior.NoCollide;
        const otherColl = level.world.getCollider(otherCollHandle);
        const rb = otherColl.parent();
        if (rb && !rb.isFixed()) {
          const rbLinVel = rb.linvel();
          const relativeVel = new Vector2(rbLinVel.x, rbLinVel.y).dot(
            this.bounceVector
          );
          if (relativeVel < -2) {
            const rbMass = rb.mass();
            let impulseStrength = -relativeVel;
            impulseStrength +=
              impulseStrength * this.bounceStrengthMultiplier +
              this.bounceStrengthOffset;
            impulseStrength = Math.max(0, impulseStrength);
            const impulse = this.bounceVector
              .clone()
              .multiplyScalar(impulseStrength * rbMass);
            rb.applyImpulse(impulse, true);
            this.sprite.gotoFrame(0);
            this.sprite.setAnimationSpeed(3);
            if (otherEntity && isBouncable(otherEntity)) otherEntity.doBounce();
          }
        }
        return CollisionBehavior.Collide;
      }
    });
  }
  detachFromLevel(level: EntityLevelAPI) {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) level.world.removeRigidBody(this.body);
    this.body = undefined;
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }
  step(ms: number) {
    super.step(ms);
    this.sprite.advance(ms);
  }
  setBounciness(multiplier: number, offset: number) {
    this.bounceStrengthMultiplier = multiplier;
    this.bounceStrengthOffset = offset;

    const bounciness =
      this.bounceStrengthMultiplier * 0.5 + this.bounceStrengthOffset * 0.5;
    const bouncinessR = Math.min(1, (bounciness + 1) / bounciness - 1);
    const bouncinessG = Math.max(0, bouncinessR - 0.5) * 2;
    const bouncinessB = Math.abs(1 - bouncinessR);

    this.sprite.multiplyLayers(
      new Color(bouncinessR, bouncinessG, bouncinessB),
      0.9,
      "Color",
      false
    );
    this.sprite.fadeLayers(
      new Color(bouncinessR, bouncinessG, bouncinessB),
      0.25,
      "Color"
    );
  }
}
