import { RigidBody } from "@dimforge/rapier2d-compat";
import { ProtoSpriteThree } from "protosprite-three";
import { Object3D } from "three";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";

import {
  AreaSensorBehavior,
  AreaSensorEvents
} from "../shared/behaviors/AreaSensorBehavior";
import * as shrineBridgeTileTypes from "./sprites/shrines/shrine-bridge-tile";

type TileSprite = ProtoSpriteThree<
  shrineBridgeTileTypes.sprite_layers,
  shrineBridgeTileTypes.sprite_animations
>;

const FRAME_OFFSET_PER_TILE = 10;
const TILE_SIZE = 24;
const ANIMATION_LENGTH = 30;

export type ShrineBridgeTiledProps = EntityProps & {
  flip?: boolean;
  useSensor?: boolean;
  sensorWidth?: number;
  sensorHeight?: number;
};

@setAssetDependencies(() => ["shrineBridgeTileSprite"])
export class ShrineBridgeTiled extends CoreEntity {
  static type = "ShrineBridgeTiled";
  public type = ShrineBridgeTiled.type;
  public alignment = EntityAlignment.TemporaryTerrain;

  public object3D = new Object3D();
  public behaviors: { sensor?: AreaSensorBehavior };
  public bridgeEvents = createTypedEventEmitter<{
    colliderAdded: void;
    colliderRemoved: void;
  }>();

  private tiles: TileSprite[] = [];
  private rigidBody?: RigidBody;

  private animationSpeed = 1;

  constructor(props: ShrineBridgeTiledProps) {
    super(props);

    this.behaviors = {};
    if (props.useSensor !== false) {
      const sensorWidth = props.sensorWidth ?? 5;
      const sensorHeight = props.sensorHeight ?? 5;
      const paddingX = (this.size.width - sensorWidth) / 2;
      const paddingY = (this.size.height - sensorHeight) / 2;
      const sensor = new AreaSensorBehavior({
        paddingLeft: paddingX,
        paddingRight: paddingX,
        paddingTop: paddingY,
        paddingBottom: paddingY
      });
      sensor.init(this);
      sensor.events.on(AreaSensorEvents.EntityContact, () =>
        this.setAnimationSpeed(1)
      );
      this.behaviors.sensor = sensor;
    }

    const flipX = props.flip ? -1 : 1;
    const sheet = getAsset("shrineBridgeTileSprite");

    const tileWorldWidth = TILE_SIZE * kInvPixelScale;

    const tileCount = Math.floor(this.size.width / tileWorldWidth);
    const startX = -(tileCount * tileWorldWidth) / 2;

    for (let i = 0; i < tileCount; i++) {
      const tile: TileSprite = sheet.getSprite<
        shrineBridgeTileTypes.sprite_layers,
        shrineBridgeTileTypes.sprite_animations
      >();

      tile.center();
      tile.gotoAnimation("Bridge");
      tile.gotoAnimationFrame(0);
      tile.mesh.scale.multiplyScalar(kInvPixelScale);
      tile.mesh.scale.x *= flipX;
      tile.mesh.scale.y *= -1;
      tile.mesh.position.y = 16 * kInvPixelScale;
      tile.setAnimationSpeed(0);
      tile.setAnimationLooping(false);

      // origin is now at sprite center, so offset by half a tile to left-align within the row
      tile.mesh.position.x = startX + (i + 0.5) * tileWorldWidth;

      this.object3D.add(tile.mesh);
      this.tiles.push(tile);
    }

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.position.z = 2;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
  }

  detachFromLevel(level: LevelAPI): void {
    super.detachFromLevel(level);
    if (this.rigidBody) {
      level.world.removeRigidBody(this.rigidBody);
      this.rigidBody = undefined;
    }
  }

  private addCollider(): void {
    if (!this.level) return;
    const { ColliderDesc, RigidBodyDesc } = this.level?.rapier;
    const body = this.level?.world.createRigidBody(
      RigidBodyDesc.fixed().setTranslation(this.position.x, this.position.y)
    );

    this.rigidBody = body;

    const colliderDesc = ColliderDesc.cuboid(
      this.size.width / 2,
      this.size.height / 2
    ).setCollisionGroups(terrainCollisionGroup);

    this.level?.world.createCollider(colliderDesc, this.rigidBody);

    this.level?.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: body.handle,
      acceptCollisionByDefault: false,
      beginCollision: (_thisEntity, _otherEntity, normal) =>
        normal.y > 0.1 ? CollisionBehavior.Collide : CollisionBehavior.NoCollide
    });
  }

  setAnimationSpeed(speed = 1) {
    this.animationSpeed = speed;
    for (const tile of this.tiles) {
      tile.setAnimationSpeed(speed);
    }
  }

  getAnimationSpeed() {
    return this.animationSpeed;
  }

  step(ms: number) {
    super.step(ms);

    if (this.animationSpeed === 0) return;
    let i;
    for (i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      tile.advance(ms);
      if (tile.getAnimationFrame() < FRAME_OFFSET_PER_TILE) break;
    }

    if (i === this.tiles.length) {
      if (
        this.tiles[i - 1].getAnimationFrame() === ANIMATION_LENGTH &&
        !this.rigidBody
      ) {
        this.addCollider();
        this.setAnimationSpeed(0);
        this.bridgeEvents.emit("colliderAdded");
      } else {
        if (this.rigidBody) {
          this.level?.world.removeRigidBody(this.rigidBody);
          this.rigidBody = undefined;
          this.bridgeEvents.emit("colliderRemoved");
        }
      }
    }
  }

  destroy() {
    super.destroy();
    for (const tile of this.tiles) {
      tile.dispose();
    }
  }
}
