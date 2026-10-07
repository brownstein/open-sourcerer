import { Collider, RigidBody } from "@dimforge/rapier2d-compat";

import {
  BaseEntityType,
  EntityBehavior,
  EntityHitDetails,
  LevelAPI
} from "src/api/entity";
import { inactiveEnemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { createTypedEventEmitter } from "src/api/util";

export enum AreaHitSwitchEvents {
  SwitchOn = "SwitchOn",
  SwitchOff = "SwitchOff"
}

export type AreaHitSwitchEventTypes = {
  [AreaHitSwitchEvents.SwitchOn]: EntityHitDetails;
  [AreaHitSwitchEvents.SwitchOff]: EntityHitDetails;
};

export type AreaHitSwitchBehaviorProps = {
  timeOut?: number;
};

export class AreaHitSwitchBehavior implements EntityBehavior {
  public type = "AreaHitSwitchBehavior";
  public readonly events = createTypedEventEmitter<AreaHitSwitchEventTypes>();
  public switched = false;
  public timeOut?: number;

  private entity?: BaseEntityType;
  private body?: RigidBody;
  private collider?: Collider;
  private level?: LevelAPI;
  private switchOffTimer?: ReturnType<typeof setTimeout>;

  constructor(props?: AreaHitSwitchBehaviorProps) {
    this.timeOut = props?.timeOut;
  }

  init(entity: BaseEntityType) {
    this.entity = entity;
  }

  attachToLevel(level: LevelAPI) {
    this.level = level;
    const { entity } = this;
    if (!entity) return;
    const { rapier, world } = level;
    const { ColliderDesc, RigidBodyDesc } = rapier;

    const rigidBodyDesc = RigidBodyDesc.dynamic()
      .lockTranslations()
      .lockRotations()
      .setGravityScale(0)
      .setTranslation(entity.position.x, entity.position.y);
    this.body = world.createRigidBody(rigidBodyDesc);

    const colliderDesc = ColliderDesc.cuboid(
      entity.size.width * 0.5,
      entity.size.height * 0.5
    ).setCollisionGroups(inactiveEnemyCollisionGroup);
    this.collider = world.createCollider(colliderDesc, this.body);

    level.registerEntityPhysicsHooks({
      entityId: entity.id,
      rigidBodyHandle: this.body.handle,
      colliderHandles: [this.collider.handle]
    });
  }

  detachFromLevel() {
    const { body, level } = this;
    if (body && level) {
      level.world.removeRigidBody(body);
    }
    this.body = undefined;
    this.collider = undefined;
    this.level = undefined;
  }

  onHit(hitDetails: EntityHitDetails) {
    clearTimeout(this.switchOffTimer);
    this.switchOffTimer = undefined;
    if (!this.switched) this.events.emit(AreaHitSwitchEvents.SwitchOn, hitDetails);
    this.switched = true;
    if (this.timeOut !== undefined) {
      this.switchOffTimer = setTimeout(() => {
        this.switched = false;
        this.events.emit(AreaHitSwitchEvents.SwitchOff, hitDetails);
      }, this.timeOut);
    }
  }

  destroy() {
    clearTimeout(this.switchOffTimer);
  }
}
