import {
  Collider,
  ColliderDesc,
  RigidBody,
  RigidBodyDesc
} from "@dimforge/rapier2d-compat";
import { Euler, Object3D, Texture, Vector2, Vector3 } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import {
  terrainCollisionGroup,
  terrainSensorCollisionGroup
} from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { toVector2 } from "src/engine/util/vecTypes";
import { delay } from "src/scripting/core/util";

//TODO Change these placeholders for final.
import leafPlatformJson from "../sprites/leaf-platform/leaf.json";
import leafPlatformPng from "../sprites/leaf-platform/leaf.png";

export type FallingLeafProps = EntityProps & {
  variant?: FallingLeafVariant;
};

export enum FallingLeafEvents {
  PlayerStep = "PlayerStep",
  LeafFalling = "LeafFalling",
  Regenerated = "Regenerated"
}

type FallingLeafEventTypes = {
  [FallingLeafEvents.PlayerStep]: void;
  [FallingLeafEvents.LeafFalling]: void;
  [FallingLeafEvents.Regenerated]: void;
};

type FallingLeafVariant = "green" | "yellow" | "brown";

export enum FallingLeafState {
  "platform",
  "stepped",
  "dropping",
  "dropped",
  "regenerating"
} //Cases "dropping" and "regenerating" are for animation frames if needed.

@addResourceLoader(new TextureResourceLoader("leafTexture", leafPlatformPng))
export class FallingLeaf extends CoreEntity {
  static readonly type = "FallingLeaf";
  public readonly type = FallingLeaf.type;
  public readonly alignment = EntityAlignment.TemporaryTerrain;
  public facingRight = false;
  public currentState = FallingLeafState.platform;

  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & FallingLeafEventTypes
  >();
  public object3D = new Object3D();

  private body?: RigidBody;
  private collider?: Collider;
  private stepTrigger?: Collider;
  private sprite: ThreeAseprite;
  private dropTimeInSecs = 1;
  private readonly LEAF_FALLING_DROPTIME = 1.5;
  private readonly LEAF_REGENERATING_TIME = 1;
  private restoreTimeInSecs = 3;
  private originalPosition: Vector3 = new Vector3();
  private originalRotation: Euler = new Euler();
  private dropScheduler = new Scheduler();

  constructor(props: FallingLeafProps) {
    super(props);

    this.sprite = new ThreeAseprite({
      texture: getResource<Texture>(FallingLeaf, "leafTexture"),
      sourceJSON: leafPlatformJson,
      //offset: new Vector2(2, 7),
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`
    });

    this.sprite.gotoFrame(0);
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);

    this.sprite.animate(100);

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    switch (props.variant) {
      case "green":
        this.dropTimeInSecs = 3;
        this.sprite.setLayerOpacities({ Green: 1 }, 0);
        break;
      case "yellow":
        this.dropTimeInSecs = 2;
        this.sprite.setLayerOpacities({ Yellow: 1 }, 0);
        break;
      case "brown":
        this.dropTimeInSecs = 0.5;
        this.sprite.setLayerOpacities({ Brown: 1 }, 0);
        break;
      default:
        this.dropTimeInSecs = 1;
        break;
    }
  }

  step(ms: number): void {
    super.step(ms);
  }

  async fallingSoon() {
    if (this.currentState !== FallingLeafState.platform) return;
    this.originalPosition.copy(this.sprite.mesh.position);
    this.originalRotation.copy(this.sprite.mesh.rotation);

    this.currentState = FallingLeafState.stepped;
    this.events.emit(FallingLeafEvents.PlayerStep);

    //Animate leaf unsafe shaking
    this.scheduler.add({
      startIn: 0,
      duration: this.dropTimeInSecs * 1000,
      invokeFunction: (r, t) => {
        const finalShakenPos: Vector2 = toVector2(this.originalPosition);
        finalShakenPos.add(new Vector2(Math.cos(r * 60.0) / 20, 0));
        this.sprite.mesh.position.setX(finalShakenPos.x);
      },
      invokeFunctionAtComplete: () => {
        this.sprite.mesh.position.setX(this.originalPosition.x);
      }
    });

    await delay(this.dropTimeInSecs * 1000);
    this.dropLeaf();
  }

  async dropLeaf() {
    this.events.emit(FallingLeafEvents.LeafFalling);
    this.currentState = FallingLeafState.dropping;
    this.collider?.setEnabled(false);

    //Animate leaf falling
    this.scheduler.add({
      startIn: 0,
      duration: this.LEAF_FALLING_DROPTIME * 1000,
      invokeFunction: (t) => {
        const finalFallingPos: Vector2 = toVector2(this.originalPosition);
        const finalFallingRot: Euler = this.originalRotation.clone();
        
        const x = Math.sin(t*2);
        finalFallingPos.add(new Vector2(4 * x * (1-x), -t));
        finalFallingRot.z = Math.sin(t*3);

        this.sprite.setOpacity(1 - t);
        this.sprite.mesh.position.setX(finalFallingPos.x);
        this.sprite.mesh.position.setY(finalFallingPos.y);
        this.sprite.mesh.setRotationFromEuler(finalFallingRot);
      },
      invokeFunctionAtComplete: () => {
        this.sprite.setOpacity(0);
        this.sprite.mesh.position.setX(this.originalPosition.y);
        this.sprite.mesh.position.setY(this.originalPosition.y);
        this.sprite.mesh.setRotationFromEuler(this.originalRotation);
        this.currentState = FallingLeafState.dropped;
        this.restoreLeaf();
      }
    });
  }

  async restoreLeaf() {
    await delay(this.restoreTimeInSecs * 1000);
    this.currentState = FallingLeafState.regenerating;

    //Animate leaf regenerating
    this.scheduler.add({
      startIn: 0,
      duration: this.LEAF_REGENERATING_TIME * 1000,
      invokeFunction: (t) => {
        this.sprite.setOpacity(t);
      },
      invokeFunctionAtComplete: () => {
        this.sprite.setOpacity(1);
        this.collider?.setEnabled(true);
        this.events.emit(FallingLeafEvents.Regenerated);
        this.currentState = FallingLeafState.platform;
      }
    });
  }

  updateSprite() {
    let directionConstant: number = this.facingRight ? 1 : -1;
    this.sprite.mesh.scale.x = kInvPixelScale * directionConstant;
  }

  attachToLevel(level: LevelAPI): void {
    super.attachToLevel(level);

    const { world } = level;

    const bodyDesc = RigidBodyDesc.fixed()
      .setTranslation(this.position.x, this.position.y)
      .setRotation(0)
      .setCcdEnabled(true);

    this.body = world.createRigidBody(bodyDesc);

    const colliderDescription = ColliderDesc.cuboid(0.7, 0.25);
    colliderDescription.setCollisionGroups(terrainCollisionGroup);
    this.collider = world.createCollider(colliderDescription, this.body);
    this.collider.setTranslationWrtParent(new Vector2(0, 0.5));

    const stepTriggerDescription = ColliderDesc.cuboid(0.7, 0.05);
    stepTriggerDescription.setCollisionGroups(terrainSensorCollisionGroup);
    this.stepTrigger = world.createCollider(stepTriggerDescription, this.body);
    this.stepTrigger.setTranslationWrtParent(new Vector2(0, 0.8));

    level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.body.handle,
      acceptCollisionByDefault: false,
      colliderHandles: [this.collider.handle, this.stepTrigger.handle],
      beginCollision: (_thisEntity, otherEntity, normal) => {
        if (normal.y > 0.1) {
          if (otherEntity?.type === "Player") {
            this.fallingSoon();
          }
          return CollisionBehavior.Collide;
        }
        return CollisionBehavior.NoCollide;
      }
    });
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.body) level.world.removeRigidBody(this.body);
    this.body = undefined;
    this.collider = undefined;
    this.stepTrigger = undefined;
  }

  destroy(): void {
    super.destroy();
    this.sprite.dispose();
  }
}
