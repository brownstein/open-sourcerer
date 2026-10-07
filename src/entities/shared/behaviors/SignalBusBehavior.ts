import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { SignalBus } from "src/engine/signal/SignalBus";
import { SignalNetwork } from "src/engine/signal/SignalNetwork";
import { vector3To2 } from "src/engine/util/vecTypes";

/**
 * Provider behavior for entities that want to *be* a geometric bus (e.g. a
 * wire). The host entity hands its polyline to the behavior; the behavior
 * owns a {@link SignalBus} registered with the level's signal network, keeps
 * the bus origin synced to the entity's position, and exposes the bus so the
 * host can read propagation state for rendering.
 *
 * Polyline points are in the host entity's local space (relative to
 * `entity.position`), matching the convention used by `MotionPathProviderBehavior`.
 */
export class SignalBusBehavior implements EntityBehavior {
  static type = "SignalBus";
  public type = SignalBusBehavior.type;

  public readonly bus: SignalBus;

  private entity?: BaseEntityType;
  private network?: SignalNetwork;

  constructor(options?: { propagationSpeed?: number }) {
    this.bus = new SignalBus({ propagationSpeed: options?.propagationSpeed });
    this.step = this.step.bind(this);
  }

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.bus.setOrigin(vector3To2(entity.position));
    entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }

  setPolyline(polyline: Vector2[], closed = false) {
    this.bus.setPolyline(polyline, closed);
    return this;
  }

  setPropagationSpeed(speed?: number) {
    this.bus.propagationSpeed = speed;
    return this;
  }

  attachToLevel(level: LevelAPI) {
    this.network = level.signalNetwork;
    this.network.registerBus(this.bus);
  }

  detachFromLevel() {
    this.network?.unregisterBus(this.bus);
    this.network = undefined;
  }

  step() {
    if (this.entity) this.bus.setOrigin(vector3To2(this.entity.position));
  }

  destroy() {
    this.entity?.events.off(EntityLifecycleEvents.Step, this.step);
    this.network?.unregisterBus(this.bus);
    this.bus.destroy();
  }
}
