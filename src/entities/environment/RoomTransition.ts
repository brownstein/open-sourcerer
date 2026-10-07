import { Collider } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import { ControlEvents } from "src/api/controls";
import {
  Direction,
  getDirectionalVector,
  getOppositeDirection
} from "src/api/directions";
import { EntityLevelAPI, EntityLevelEvents, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setConsumerDependencies } from "src/engine/entity/decorators";
import { vector3To2 } from "src/engine/util/vecTypes";
import { Player } from "src/entities/player/Player";
import { getNextLevelIdForWalkingTransition } from "src/levels/levels/levelAdjacencies";
import {
  selectActiveAllies,
  selectLevelTransitionData
} from "src/redux/gameState/selectors";
import { gotoLevel } from "src/redux/gameState/slice";
import { store } from "src/redux/store";

import { BeanBot } from "../npcs/bean-bot/BeanBot";

export type RoomTransitionProps = EntityProps & {
  doorId?: string;
  toDoorId?: string;
  direction?: Direction;
};
@setConsumerDependencies(() => [Player])
export class RoomTransition extends CoreEntity {
  static type = "RoomTransition";
  public type = "RoomTransition";
  public persist = false;
  public doorId?: string;
  public toDoorId?: string;
  private collidingWithPlayer?: Player;
  private collider?: Collider;
  private direction?: Direction;
  private directionalVectorOfEntry?: Vector2;
  private attachedLevel?: EntityLevelAPI;
  private initialTransitionComplete = true;

  constructor(props: RoomTransitionProps) {
    super(props);
    this.doorId = props.doorId;
    this.toDoorId = props.toDoorId;
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    let direction: Direction = Direction.left;
    const directionRaw: string | undefined =
      this.initialProps.direction &&
      typeof this.initialProps.direction === "string"
        ? this.initialProps.direction
        : undefined;
    if (directionRaw) {
      switch (directionRaw) {
        case Direction.left:
          direction = Direction.left;
          break;
        case Direction.right:
          direction = Direction.right;
          break;
        case Direction.up:
          direction = Direction.up;
          break;
        case Direction.down:
          direction = Direction.down;
          break;
        default:
          break;
      }
    } else {
      const relativePos = vector3To2(this.position);
      const roomCenter = new Vector2();
      const roomSize = new Vector2();
      const roomBounds = level.getWorldBoundaries();
      roomBounds.getCenter(roomCenter);
      roomBounds.getSize(roomSize);
      relativePos.sub(roomCenter).divide(roomSize);
      if (Math.abs(relativePos.x) > Math.abs(relativePos.y)) {
        direction = relativePos.x > 0 ? Direction.right : Direction.left;
      } else {
        direction = relativePos.y > 0 ? Direction.up : Direction.down;
      }
    }
    this.direction = direction;
    this.attachedLevel = level;
    this.directionalVectorOfEntry = getDirectionalVector(
      getOppositeDirection(direction)
    );

    // On preload, teleport the player and move them manually out of the
    // transition zone.
    level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);

    // Build transition zone sensor.
    const { ColliderDesc } = level.rapier;
    const colliderDesc = ColliderDesc.cuboid(
      this.size.width * 0.5,
      this.size.height * 0.5
    )
      .setTranslation(this.position.x, this.position.y)
      .setSensor(true);
    this.collider = level.world.createCollider(colliderDesc);
    level.registerSensor(this.id, this.collider.handle);
  }
  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    level.removeEntityPhysicsHooks(this.id);
    if (this.collider) level.world.removeCollider(this.collider, false);
    this.collider = undefined;
    this.attachedLevel = undefined;
  }
  private readonly onPreloadComplete = (): void => {
    const level = this.attachedLevel;
    if (!level || !this.direction || !this.directionalVectorOfEntry) return;
    const direction = this.direction;
    const directionalVectorOfEntry = this.directionalVectorOfEntry;
    const state = store.getState();
    const levelTransitionData = selectLevelTransitionData(state);
    const activeAllies = selectActiveAllies(state);
    let matched = true;
    if (levelTransitionData.levelTransitionDirection !== direction)
      matched = false;
    if (
      levelTransitionData.levelTransitionDoorName &&
      levelTransitionData.levelTransitionDoorName !== this.doorId
    )
      matched = false;
    if (!matched) return;
    let player: Player | undefined;
    for (const entity of level.getEntities().values()) {
      if (entity.type === Player.type && entity instanceof Player) {
        player = entity;
        break;
      }
    }

    // If the level lacks an initial player, add one in the correct position.
    if (player === undefined) {
      player = new Player({
        position: this.position.clone()
      });
      level.addEntity(player);
    }

    const tpPosition = this.position.clone();
    tpPosition.y -= this.size.height / 2;
    tpPosition.y += player.size.height / 2;
    player.teleport(tpPosition);
    player.faceImmediate(directionalVectorOfEntry.x >= 0);

    const body = player.behaviors.physics?.body;
    if (directionalVectorOfEntry.y > 0 && body) {
      body.setLinvel({ x: body.linvel().x, y: 8 }, true);
    }

    if (directionalVectorOfEntry.x) {
      this.scheduler.add({
        duration: 500,
        invokeFunction: () => {
          level.controls?.events.emit(
            ControlEvents.MoveHorizontally,
            directionalVectorOfEntry.x * 0.5
          );
        },
        invokeFunctionAtComplete: () => {
          level.controls?.events.emit(
            ControlEvents.MoveHorizontally,
            level.controls?.getCurrentHorizontalMotion()
          );
        }
      });
    }

    this.initialTransitionComplete = false;
    this.scheduler.add({
      duration: 500,
      invokeFunctionAtComplete: () => {
        this.initialTransitionComplete = true;
      }
    });

    for (const ally of activeAllies) {
      switch (ally) {
        case "BeanBot":
          const beanBot = new BeanBot({
            position: tpPosition
          });
          beanBot.swapControlMethod("physicsFollowPlayer");
          beanBot.setOpacity(0, 0);
          beanBot.setOpacity(1, 500);
          level.addEntity(beanBot);
          break;
        default:
          break;
      }
    }
  };
  step(ms: number) {
    super.step(ms);
    if (!this.collider) return;
    this.level?.world.intersectionPairsWith(this.collider, (collider2) => {
      const otherEntityId = this.level?.getEntityIdForCollider(
        collider2.handle
      );
      if (!otherEntityId) return;
      const otherEntity = this.level?.getEntity(otherEntityId);
      if (!otherEntity) return;
      if (otherEntity.type === Player.type && otherEntity instanceof Player) {
        this.collidingWithPlayer = otherEntity;
      }
    });
    if (this.collidingWithPlayer && this.direction) {
      const playerPosRelative = this.collidingWithPlayer.position
        .clone()
        .sub(this.position);
      const playerIsOnCorrectSide =
        getDirectionalVector(this.direction).dot(
          vector3To2(playerPosRelative)
        ) > 0;
      if (playerIsOnCorrectSide && this.initialTransitionComplete) {
        const _state = store.getState();
        const levelId = this.level?.id;
        if (!levelId || !this.direction) return;
        const nextLevelId = getNextLevelIdForWalkingTransition(
          levelId,
          this.direction,
          this.doorId
        );
        if (!nextLevelId) return;
        store.dispatch(
          gotoLevel({
            levelId: nextLevelId,
            direction: getOppositeDirection(this.direction),
            doorName: this.toDoorId
          })
        );
      }
    }
    // I'd like to put this in above, but TypeScript does not recognize
    // the callback above as executing synchronously.
    this.collidingWithPlayer = undefined;
  }
}
