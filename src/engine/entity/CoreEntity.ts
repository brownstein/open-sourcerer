import shortid from "shortid";
import { Object3D, Vector3 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLifecycleEventTypes,
  EntityLifecycleEvents,
  EntityProps,
  EntitySnapshot,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { Scheduler } from "src/engine/scheduling/Scheduler";
import { ReadSizeAttributes } from "src/engine/util/vecTypes";

export class CoreEntity implements BaseEntityType {
  public type = "BaseEntity";
  public id: string;
  public name?: string;
  public layerName?: string;
  public alignment?: EntityAlignment;
  public boundToVariableName?: string;
  public position: Vector3;
  public angle = 0;
  public size: ReadSizeAttributes;
  public initialProps: EntityProps;
  public lifetimeMs = 0;
  public object3D?: Object3D;
  public behaviors = {};
  public events = createTypedEventEmitter<EntityLifecycleEventTypes>();
  protected scheduler = new Scheduler();
  public getScheduler(): Scheduler {
    return this.scheduler;
  }
  get canBindToVariable(): boolean {
    return this.alignment === EntityAlignment.Enemy;
  }
  protected level?: LevelAPI;

  private static readonly SHAKE_BASE_AMPLITUDE = 0.06;
  private static readonly SHAKE_EVENT_ID = crypto.randomUUID();
  private readonly shakeOffset = new Vector3();
  private readonly shakePromiseResolvers: (() => void)[] = [];

  constructor(props: EntityProps) {
    this.initialProps = props;
    this.id = props.id ?? shortid();
    this.name = props.name;
    this.position = new Vector3(
      props.position.x,
      props.position.y,
      props.position.z
    );
    this.angle = props.angle ?? 0;
    this.size = props.size ?? {
      width: 0,
      height: 0
    };
    this.layerName = props.layerName;
  }
  step(deltaMs: number) {
    if (this.object3D && this.shakeOffset.lengthSq() > 0) {
      this.object3D.position.sub(this.shakeOffset);
    }

    this.lifetimeMs += deltaMs;
    this.scheduler.step(deltaMs);
    this.events.emit(EntityLifecycleEvents.Step, deltaMs);
  }
  postStep(deltaMs: number) {
    if (this.object3D && this.shakeOffset.lengthSq() > 0) {
      this.object3D.position.add(this.shakeOffset);
    }

    this.events.emit(EntityLifecycleEvents.PostStep, deltaMs);
  }

  shake(durationMs = 500, intensity = 1): Promise<void> {
    if (!this.object3D) return Promise.resolve();
    const amplitude = CoreEntity.SHAKE_BASE_AMPLITUDE * intensity;

    this.scheduler.cancel(CoreEntity.SHAKE_EVENT_ID);

    this.scheduler.add({
      id: CoreEntity.SHAKE_EVENT_ID,
      duration: durationMs,
      invokeFunction: (progress, elapsed) => {
        const decay = amplitude * (1 - progress);

        this.shakeOffset.set(
          Math.sin(elapsed * 0.09) * decay,
          Math.sin(elapsed * 0.13 + 1.1) * decay * 0.6,
          0
        );
      },
      invokeFunctionAtComplete: () => {
        this.shakeOffset.set(0, 0, 0);
        this.resolveShakePromises();
      }
    });

    return new Promise<void>((resolve) =>
      this.shakePromiseResolvers.push(resolve)
    );
  }
  private resolveShakePromises() {
    this.shakePromiseResolvers.forEach((shakeResolver) => shakeResolver());
    this.shakePromiseResolvers.length = 0;
  }

  getSnapshot(): EntitySnapshot {
    const partialSnapshot: Record<string, unknown> = {};
    for (const behavior of Object.values(
      this.behaviors
    ) as Iterable<EntityBehavior>) {
      const behaviorSnapshot = behavior.getSnapshot?.();
      if (behaviorSnapshot) Object.assign(partialSnapshot, behaviorSnapshot);
    }
    return {
      ...partialSnapshot,
      type: this.type,
      id: this.id,
      position: this.position,
      angle: this.angle,
      size: this.size
    };
  }
  applySnapshot(snapshot: EntitySnapshot) {
    this.id = snapshot.id;
    this.position.set(
      snapshot.position.x,
      snapshot.position.y,
      snapshot.position.z
    );
    this.teleport(this.position);
    this.angle = snapshot.angle ?? this.angle;
    this.size = snapshot.size ?? this.size;
    for (const behavior of Object.values(
      this.behaviors
    ) as Iterable<EntityBehavior>) {
      behavior.applySnapshot?.(snapshot);
    }
    if (this.object3D) this.object3D.position.copy(this.position);
  }
  destroy() {
    for (const behavior of Object.values(
      this.behaviors
    ) as Iterable<EntityBehavior>) {
      behavior.destroy?.();
    }

    this.resolveShakePromises();

    this.events.emit(EntityLifecycleEvents.Destroy);
  }
  attachToLevel(level: EntityLevelAPI) {
    this.level = level;
    for (const behavior of Object.values(
      this.behaviors
    ) as Iterable<EntityBehavior>) {
      behavior.attachToLevel?.(level);
    }
    this.events.emit(EntityLifecycleEvents.AttachToLevel, level);
  }
  detachFromLevel(level: EntityLevelAPI) {
    for (const behavior of Object.values(
      this.behaviors
    ) as Iterable<EntityBehavior>) {
      behavior.detachFromLevel?.(level);
    }
    this.events.emit(EntityLifecycleEvents.DetachFromLevel, level);
    this.level = undefined;
  }
  updatePosition(position: Vector3) {
    this.position.copy(position);
  }
  hit(hitDetails: EntityHitDetails) {
    this.events.emit(EntityLifecycleEvents.Hit, hitDetails);
  }
  die() {
    this.events.emit(EntityLifecycleEvents.Die);
  }
  teleport(position: Vector3) {
    this.position.copy(position);
    this.object3D?.position.copy(position);
    this.events.emit(EntityLifecycleEvents.Teleport, position);
  }
  // This is still experimental.
  bindToVariable(variableName: string) {
    if (variableName !== this.boundToVariableName) {
      this.boundToVariableName = variableName;
      this.events.emit(EntityLifecycleEvents.BindToVariableName, variableName);
    }
  }
}
