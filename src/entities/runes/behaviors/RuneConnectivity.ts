import {
  Collider,
  Ray,
  RayColliderIntersection
} from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import { EntityLifecycleEvents, LevelAPI } from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { runeSensorCollisionGroup } from "src/engine/constants/collisionGroups";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { vector3To2 } from "src/engine/util/vecTypes";

import {
  RuneConnectivityBehaviorAPI,
  RuneConnectivityEntityAPI,
  RuneConnectivityEventTypes,
  isRuneConnectionEntityAPI
} from "./RuneBehaviorsShared";

type Conn = {
  id: string;
  relativeOrigin: Vector2;
  radius: number;
  autoPosition?: boolean;
};

type ConnProjection = {
  id: string;
  relativeOrigin: Vector2;
  direction: Vector2;
  distance: number;
  autoPosition?: boolean;
};
export class RuneConnectivityBehavior implements RuneConnectivityBehaviorAPI {
  public type = "RuneConnectionBehavior";
  public events = createTypedEventEmitter<RuneConnectivityEventTypes>();
  public canConnect = true;

  private scheduler = new Scheduler();
  private connections: Conn[] = [
    {
      id: "left",
      relativeOrigin: new Vector2(0, 0),
      radius: 0.125,
      autoPosition: true
    }
  ];
  private connectionToCollider = new Map<string, Collider>();
  private projections: ConnProjection[] = [
    {
      id: "right",
      relativeOrigin: new Vector2(0, 0),
      direction: new Vector2(1, 0),
      distance: 0.5,
      autoPosition: true
    }
  ];
  private projectionToEntity = new Map<string, RuneConnectivityEntityAPI>();
  private projectionRay?: Ray;
  private level?: LevelAPI;
  private entity?: RuneConnectivityEntityAPI;

  connect(entity: RuneConnectivityEntityAPI): void {
    this.events.emit("connected", entity);
    if (this.entity)
      entity.behaviors.connectivity.events.emit("connectedBy", this.entity);
  }
  disconnect(entity: RuneConnectivityEntityAPI): void {
    this.events.emit("disconnected", entity);
    if (this.entity)
      entity.behaviors.connectivity.events.emit("disconnectedBy", this.entity);
  }
  disconnectAll() {
    if (!this.entity) return;
    for (const projection of this.projections) {
      const connectedEntity = this.projectionToEntity.get(projection.id);
      if (connectedEntity) {
        this.disconnect(connectedEntity);
      }
    }
    this.projectionToEntity.clear();
  }
  enable() {
    this.canConnect = true;
  }
  disable() {
    this.canConnect = false;
    this.disconnectAll();
  }

  constructor() {
    this.step = this.step.bind(this);
    this.detectAndProcessAttachment =
      this.detectAndProcessAttachment.bind(this);
  }

  init(entity: RuneConnectivityEntityAPI) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    for (const conn of this.connections) {
      if (!conn.autoPosition) continue;
      conn.relativeOrigin.x = -entity.size.width * 0.45;
    }
    for (const proj of this.projections) {
      if (!proj.autoPosition) continue;
      proj.relativeOrigin.x = entity.size.width * 0.45;
    }
  }

  attachToLevel(level: LevelAPI) {
    if (!this.entity) return;
    this.level = level;
    const { rapier, world } = level;

    for (const connection of this.connections) {
      const connDesc = rapier.ColliderDesc.ball(connection.radius);
      const connPos = vector3To2(this.entity.position).add(
        connection.relativeOrigin
      );
      connDesc.setSensor(true);
      connDesc.setTranslation(connPos.x, connPos.y);
      connDesc.setCollisionGroups(runeSensorCollisionGroup);
      const connCollider = world.createCollider(connDesc);
      this.connectionToCollider.set(connection.id, connCollider);
      level.registerSensor(this.entity.id, connCollider.handle);
    }

    const projectOrigin = vector3To2(this.entity.position);
    const projectDir = new Vector2(1, 0);
    const firstProjection = this.projections.at(0);
    if (firstProjection) {
      projectOrigin.add(firstProjection.relativeOrigin);
      projectDir.copy(firstProjection.direction);
    }
    this.projectionRay = new rapier.Ray(
      {
        x: projectOrigin.x,
        y: projectOrigin.y
      },
      {
        x: projectDir.x,
        y: projectDir.y
      }
    );

    // We can't immediately detect collisions with other Runes - use a
    // scheduler to schedule it happening once things are running.
    this.scheduler.add({
      id: "detect",
      duration: 500,
      recurring: true,
      invokeFunctionAtComplete: this.detectAndProcessAttachment
    });

    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
  }
  detachFromLevel() {
    if (!this.level) return;
    for (const collider of this.connectionToCollider.values()) {
      this.level.world.removeCollider(collider, false);
    }
    this.connectionToCollider.clear();
    this.level = undefined;
  }
  step(ms: number) {
    if (!this.entity) return;
    this.scheduler.step(ms);
    for (const conn of this.connections) {
      const collider = this.connectionToCollider.get(conn.id);
      if (!collider) continue;
      const pos = vector3To2(this.entity.position);
      pos.add(conn.relativeOrigin);
      collider.setTranslation({
        x: pos.x,
        y: pos.y
      });
    }
  }
  detectAndProcessAttachment() {
    if (!this.level || !this.entity || !this.projectionRay) return false;
    if (!this.canConnect) {
      if (this.projectionToEntity.size) {
        for (const entity of this.projectionToEntity.values()) {
          this.disconnect(entity);
          entity.behaviors.connectivity.disconnect(this.entity);
        }
        this.projectionToEntity.clear();
      }
      return;
    }
    const level = this.level;
    const { world } = level;
    const projOrigin3 = vector3To2(this.entity.position);
    const projOrigin = new Vector2();
    for (const proj of this.projections) {
      projOrigin.copy(projOrigin3).add(proj.relativeOrigin);
      this.projectionRay.origin.x = projOrigin.x;
      this.projectionRay.origin.y = projOrigin.y;
      this.projectionRay.dir.x = proj.direction.x;
      this.projectionRay.dir.y = proj.direction.y;
      let nearestDist = Number.MAX_VALUE;
      let nearestEntity: RuneConnectivityEntityAPI | undefined;
      const hitCb = (hit: RayColliderIntersection) => {
        const hitEntityId = level.getEntityIdForCollider(hit.collider.handle);
        if (!hitEntityId) return true;
        const hitEntity = level.getEntity(hitEntityId);
        if (!hitEntity) return true;
        const isSensor = hit.collider.isSensor();
        if (
          isSensor &&
          isRuneConnectionEntityAPI(hitEntity) &&
          hitEntity !== this.entity
        ) {
          if (!hitEntity.behaviors.connectivity.canConnect) return true;
          const hitDistance = hit.timeOfImpact;
          if (hitDistance < nearestDist) {
            nearestDist = hitDistance;
            nearestEntity = hitEntity;
          }
        }
        return true;
      };
      world.intersectionsWithRay(
        this.projectionRay,
        proj.distance,
        false,
        hitCb
      );
      const currentProjectionEntity = this.projectionToEntity.get(proj.id);
      if (nearestEntity !== currentProjectionEntity) {
        // TODO: ensure that if there's more than one ray we don't disconnect if
        // one of the rays still intersects.
        if (currentProjectionEntity) {
          this.disconnect(currentProjectionEntity);
        }
        if (nearestEntity) {
          this.projectionToEntity.set(proj.id, nearestEntity);
          this.connect(nearestEntity);
        } else {
          this.projectionToEntity.delete(proj.id);
        }
      }
    }
  }
  updateConnectors(conns: Conn[]) {
    this.connections = conns;
    return this;
  }
  updateProjections(projs: ConnProjection[]) {
    this.projections = projs;
    return this;
  }
}
