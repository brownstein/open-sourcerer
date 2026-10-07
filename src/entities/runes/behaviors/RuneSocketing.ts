import { Vector3 } from "three";

import { BaseEntityType, EntityBehavior, LevelAPI } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";

export type RuneSocketingRuneBehaviorEventTypes = {
  socketed: BaseEntityType;
  unsocketed: void;
};

export class RuneSocketingRuneBehavior implements EntityBehavior {
  public type = "RuneSocketingRuneBehavior";
  public events =
    createTypedEventEmitter<RuneSocketingRuneBehaviorEventTypes>();
  public socket?: SocketEntityAPI;
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  constructor() {
    this.newRuneSocketedHandler = this.newRuneSocketedHandler.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
  }
  detachFromLevel() {
    this.level = undefined;
  }
  detachFromSocket() {
    this.socket?.behaviors.socket.events.off(
      "newRuneSocketed",
      this.newRuneSocketedHandler
    );
    this.socket = undefined;
    this.events.emit("unsocketed");
  }
  doInitialSocket(socket: SocketEntityAPI) {
    this.socket = socket;
    this.socket.behaviors.socket.events.emit("newRuneSocketed");
    this.socket.behaviors.socket.events.on(
      "newRuneSocketed",
      this.newRuneSocketedHandler
    );
    this.events.emit("socketed", socket);
  }
  attemptSocket() {
    if (!this.entity) return;
    const allEntities = this.level?.getEntities();
    if (!allEntities) return;
    let closestSocket: SocketEntityAPI | undefined;
    let closestDistance = Number.MAX_VALUE;
    const delta = new Vector3();
    for (const entity of allEntities.values()) {
      if (!checkForSocketBehavior(entity)) continue;
      const distance = delta
        .copy(this.entity.position)
        .sub(entity.position)
        .length();
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSocket = entity;
      }
    }
    if (closestSocket === this.socket) return;
    if (closestSocket && closestDistance < 0.5) {
      closestSocket.behaviors.socket.events.emit("newRuneSocketed");
      closestSocket.behaviors.socket.events.on(
        "newRuneSocketed",
        this.newRuneSocketedHandler
      );
      this.socket = closestSocket;
      this.events.emit("socketed", closestSocket);
    } else {
      this.socket?.behaviors.socket.events.off(
        "newRuneSocketed",
        this.newRuneSocketedHandler
      );
      this.socket = undefined;
      this.events.emit("unsocketed");
    }
  }
  private newRuneSocketedHandler() {
    this.socket?.behaviors.socket.events.off(
      "newRuneSocketed",
      this.newRuneSocketedHandler
    );
    this.socket = undefined;
    this.events.emit("unsocketed");
  }
}

export type SocketEntityAPI = BaseEntityType & {
  behaviors: {
    socket: RuneSocketingSocketBehavior;
  };
};

export function checkForSocketBehavior(
  entity: BaseEntityType
): entity is SocketEntityAPI {
  return (
    entity &&
    entity.behaviors &&
    (entity as SocketEntityAPI).behaviors.socket instanceof
      RuneSocketingSocketBehavior
  );
}

export type RuneSocketingSocketBehaviorEventTypes = {
  newRuneSocketed: void;
};

export class RuneSocketingSocketBehavior implements EntityBehavior {
  public type = "RuneSocketingSocketBehavior";
  public events =
    createTypedEventEmitter<RuneSocketingSocketBehaviorEventTypes>();
  public entity?: BaseEntityType;
  init(entity: BaseEntityType) {
    this.entity = entity;
  }
  setSocket(entity: BaseEntityType) {
    this.entity = entity;
  }
}
