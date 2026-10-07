import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityHitDetails,
  EntityLifecycleEvents
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { isPlayerAPI } from "src/entities/player/PlayerAPI";

import { PerceptionBehavior, PerceptionEvents } from "./Perception";

export enum EnemyAggroEvents {
  BeginAggro = "BeginAggro",
  EndAggro = "EndAggro"
}

export type EnemyAggroEventTypes = {
  [EnemyAggroEvents.BeginAggro]: BaseEntityType;
  [EnemyAggroEvents.EndAggro]: string;
};

export type EnemyAggroBehaviorCompatibleEntity = BaseEntityType<{
  perception?: PerceptionBehavior;
}>;

interface AggroProps {
  aggroOnSight?: boolean;
  loseAggroWithoutSight?: boolean;
  aggroCooldown?: number;
}

//By default, Aggro starts when hit Aggro ends when sight lost.
export class EnemyAggroBehavior
  implements EntityBehavior<EnemyAggroBehaviorCompatibleEntity>
{
  public type = "EnemyAggro";
  public events = createTypedEventEmitter<EnemyAggroEventTypes>();
  public aggroOnSight = true;
  public loseAggroWithoutSight = true;
  private currentTarget?: BaseEntityType;
  private _seesCurrentTarget = false;
  private _forcedAggro = false;
  private entity?: EnemyAggroBehaviorCompatibleEntity;
  private perceptionBehavior?: PerceptionBehavior;
  private scheduler = new Scheduler();
  private aggroCooldownMs = 100;
  constructor(props?: AggroProps) {
    this.step = this.step.bind(this);
    this.onHit = this.onHit.bind(this);

    if (!props) return;

    this.aggroOnSight = props.aggroOnSight ?? this.aggroOnSight;
    this.loseAggroWithoutSight =
      props.loseAggroWithoutSight ?? this.loseAggroWithoutSight;
    this.aggroCooldownMs = props.aggroCooldown ?? this.aggroCooldownMs;
  }
  init(entity: EnemyAggroBehaviorCompatibleEntity) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.entity.events.on(EntityLifecycleEvents.Hit, this.onHit);
    this.perceptionBehavior = entity.behaviors.perception;
    this.perceptionBehavior?.perceptionEvents.on(
      PerceptionEvents.EntityTrackingStart,
      (entity) => {
        if (this.aggroOnSight) {
          if (entity.alignment === EntityAlignment.Player)
            this._beginAggro(entity);
        } else {
          if (this.currentTarget?.id === entity.id) {
            this._seesCurrentTarget = true;
            this.scheduler.cancel("loseAggroWithoutSight");
          }
        }
      }
    );
    this.perceptionBehavior?.perceptionEvents.on(
      PerceptionEvents.EntityTrackingEnd,
      (entityId) => {
        if (this.currentTarget?.id === entityId)
          this._seesCurrentTarget = false;
      }
    );
    return this;
  }
  step(ms: number) {
    this.scheduler.step(ms);
    if (
      this.loseAggroWithoutSight &&
      this.currentTarget &&
      !this._seesCurrentTarget &&
      !this._forcedAggro
    ) {
      if (!this.scheduler.hasEvent("loseAggroWithoutSight")) {
        this.scheduler.add({
          id: "loseAggroWithoutSight",
          startIn: this.aggroCooldownMs,
          invokeFunctionAtComplete: () => this._endAggro()
        });
      }
    }
  }
  onHit(details: EntityHitDetails) {
    const { sourceEntity } = details;

    if (!this.currentTarget) {
      if (isPlayerAPI(sourceEntity)) this._beginAggro(sourceEntity);
    }
  }
  get seesCurrentTarget(): boolean {
    return this._seesCurrentTarget;
  }
  resolveCurrentTarget() {
    return this.currentTarget;
  }
  setAggro(target: BaseEntityType) {
    this._beginAggro(target);
  }
  forceAggro(target: BaseEntityType) {
    this._forcedAggro = true;
    this._beginAggro(target);
    this._seesCurrentTarget = true;
  }
  clearAggro() {
    this._endAggro();
  }
  setAggroCooldown(ms: number) {
    this.aggroCooldownMs = ms;
  }
  private _beginAggro(target: BaseEntityType) {
    this.currentTarget = target;
    this._seesCurrentTarget =
      this.perceptionBehavior?.isTrackingEntity(target.id) ?? false;
    this.scheduler.cancel("loseAggroWithoutSight");
    this.events.emit(EnemyAggroEvents.BeginAggro, target);
  }
  private _endAggro() {
    const target = this.currentTarget;
    if (!target) return;
    this.currentTarget = undefined;
    this._seesCurrentTarget = false;
    this._forcedAggro = false;
    this.events.emit(EnemyAggroEvents.EndAggro, target.id);
  }
}
