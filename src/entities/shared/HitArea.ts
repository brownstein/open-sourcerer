import {
  ActiveCollisionTypes,
  ActiveEvents,
  Collider
} from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import {
  BaseEntityType,
  DamageType,
  ElementalType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps,
  HitShape,
  LevelAPI
} from "src/api/entity";
import { damageCollisionGroup } from "src/engine/constants/collisionGroups";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { IVector2, vector3To2 } from "src/engine/util/vecTypes";
import { isLineOfSightClear } from "src/entities/shared/lineOfSight";

import { StatusBehavior } from "./behaviors/StatusBehavior";
import { hits } from "./hitAlignment";

export enum HitAreaShape {
  Circle = "Circle",
  Rectangle = "Rectangle",
  ConvexHull = "ConvexHull"
}

interface Shape {
  type: HitAreaShape;
}

interface CircleShape extends Shape {
  type: HitAreaShape.Circle;
  radius: number;
}

interface RectangleShape extends Shape {
  type: HitAreaShape.Rectangle;
  size: IVector2;
}

interface ConvexHullShape extends Shape {
  type: HitAreaShape.ConvexHull;
  points: Float32Array;
}

type ShapeOptions = CircleShape | RectangleShape | ConvexHullShape;

export interface HitAreaProps
  extends EntityProps,
    Partial<Omit<EntityHitDetails, "hittingEntity" | "sourceEntity">> {
  sourceEntity: BaseEntityType;
  lifetime?: number;
  damageIntervalMs?: number;
  shape?: ShapeOptions;
  targetAlignment?: EntityAlignment;
  /** When true, checks line of sight from sourceEntity to the target before
   *  dealing damage. When false (default), no LOS check is performed. */
  shouldCheckLineOfSight?: boolean;
  screenShake?: number;
  killScreenShake?: number;
  hitStopMs?: number;
  killHitStopMs?: number;
  hitEntityHitDetailsHook?: (
    otherEntity: BaseEntityType,
    originalHitDetails: Readonly<EntityHitDetails>
  ) => EntityHitDetails;
}

export class HitArea extends CoreEntity {
  static type = "HitArea";
  public type = "HitArea";

  private hitDetails: EntityHitDetails;
  private targetEntityAlignment?: EntityAlignment;
  private readonly damageIntervalMs: number;
  private readonly shouldCheckLineOfSight: boolean;
  private readonly screenShake: number;
  private readonly killScreenShake: number;
  private readonly hitStopMs: number;
  private readonly killHitStopMs: number;
  private readonly hitEntityHitDetailsHook: (
    otherEntity: BaseEntityType,
    originalHitDetails: Readonly<EntityHitDetails>
  ) => EntityHitDetails;

  private shape: HitAreaShape = HitAreaShape.Rectangle;
  private convexHullPoints?: Float32Array;
  private collider?: Collider;
  private colliders: Collider[] = [];
  private hitEntityIds = new Set<string>();

  constructor(props: HitAreaProps) {
    super(props);

    this.hitDetails = {
      hittingEntity: this,
      sourceEntity: props.sourceEntity,
      damage: props.damage ?? 0,
      damageType: props.damageType,
      elementalDamageType: props.elementalDamageType,
      hitImpulse: props.hitImpulse
    };

    this.targetEntityAlignment =
      props.targetAlignment ?? this.targetEntityAlignment;

    this.damageIntervalMs = props.damageIntervalMs ?? Infinity;
    this.shouldCheckLineOfSight = props.shouldCheckLineOfSight ?? false;
    this.screenShake = props.screenShake ?? 0;
    this.killScreenShake = props.killScreenShake ?? 0;
    this.hitStopMs = props.hitStopMs ?? 0;
    this.killHitStopMs = props.killHitStopMs ?? 0;
    this.hitEntityHitDetailsHook =
      props.hitEntityHitDetailsHook ?? (() => this.hitDetails);

    switch (props.shape?.type) {
      case HitAreaShape.Circle: {
        this.setCircle(props.shape.radius);
        break;
      }
      case HitAreaShape.Rectangle: {
        this.setRect(props.shape.size);
        break;
      }
      case HitAreaShape.ConvexHull: {
        this.setConvexHull(props.shape.points);
        break;
      }
      default: {
        break;
      }
    }

    const lifetime = props.lifetime ?? 100;

    if (lifetime > 0) {
      this.scheduler.add({
        startIn: lifetime,
        invokeFunctionAtComplete: () => {
          if (this.level) {
            this.detachFromLevel(this.level);
          }
        }
      });
    }
  }
  setTargetAlignment(alignment: EntityAlignment) {
    this.targetEntityAlignment = alignment;
    return this;
  }
  setImpulse(impulse: Vector2) {
    this.hitDetails.hitImpulse = impulse;
    return this;
  }
  setCircle(radius: number) {
    this.shape = HitAreaShape.Circle;
    this.size = {
      width: radius * 2,
      height: radius * 2
    };
    this.hitDetails.hitShape = {
      type: "circle",
      center: vector3To2(this.position),
      radius
    };
    return this;
  }
  setRect(size: IVector2) {
    this.shape = HitAreaShape.Rectangle;
    this.size = {
      width: size.x,
      height: size.y
    };
    this.hitDetails.hitShape = undefined;
    return this;
  }
  setConvexHull(points: Float32Array) {
    this.shape = HitAreaShape.ConvexHull;
    this.convexHullPoints = points;
    this.hitDetails.hitShape = undefined;
    return this;
  }
  setDamage(
    damage: number,
    elementalDamageType?: ElementalType,
    damageType?: DamageType
  ) {
    this.hitDetails.damage = damage;
    this.hitDetails.damageType = damageType;
    this.hitDetails.elementalDamageType = elementalDamageType;
    return this;
  }
  attachToLevel(level: LevelAPI): void {
    super.attachToLevel(level);
    const { rapier, world } = level;
    const { ColliderDesc } = rapier;

    if (this.shape === HitAreaShape.ConvexHull && this.convexHullPoints) {
      const colliderDesc = ColliderDesc.convexHull(this.convexHullPoints);
      if (colliderDesc !== null) {
        colliderDesc.setRotation(this.angle);
        colliderDesc.setTranslation(this.position.x, this.position.y);
        colliderDesc.setSensor(true);
        colliderDesc.setCollisionGroups(damageCollisionGroup);
        colliderDesc.setActiveCollisionTypes(ActiveCollisionTypes.ALL);

        this.collider = world.createCollider(colliderDesc);
        this.colliders.push(this.collider);
        level.registerSensor(this.id, this.collider.handle);
      }
    } else {
      const colliderDesc =
        this.shape === HitAreaShape.Circle
          ? ColliderDesc.ball(this.size.width * 0.5)
          : ColliderDesc.cuboid(this.size.width * 0.5, this.size.height * 0.5);
      colliderDesc.setRotation(this.angle);
      colliderDesc.setTranslation(this.position.x, this.position.y);
      colliderDesc.setSensor(true);
      colliderDesc.setCollisionGroups(damageCollisionGroup);
      colliderDesc.setActiveCollisionTypes(ActiveCollisionTypes.ALL);

      this.collider = world.createCollider(colliderDesc);
      this.colliders.push(this.collider);
      level.registerSensor(this.id, this.collider.handle);
    }

    level.registerEntityPhysicsHooks({
      entityId: this.id,
      acceptCollisionByDefault: true,
      colliderHandles: this.colliders.map((c) => c.handle)
    });
  }
  detachFromLevel(level: LevelAPI): void {
    super.detachFromLevel(level);
    const { world } = level;
    for (const collider of this.colliders) {
      world.removeCollider(collider, false);
    }
    this.colliders = [];
    this.collider = undefined;
  }
  step(ms: number) {
    super.step(ms);
    const { level } = this;
    if (level === undefined) return;
    for (const collider of this.colliders) {
      level.world.intersectionPairsWith(collider, (collider2) => {
        const otherEntityId = level.getEntityIdForCollider(collider2.handle);
        if (otherEntityId === undefined) return;

        if (this.hitEntityIds.has(otherEntityId)) return;
        this.hitEntityIds.add(otherEntityId);

        this.scheduler.add({
          startIn: this.damageIntervalMs,
          invokeFunctionAtComplete: () => {
            this.hitEntityIds.delete(otherEntityId);
          }
        });

        const otherEntity = level.getEntity(otherEntityId);
        if (!otherEntity) return;

        if (!hits(this.targetEntityAlignment, otherEntity.alignment)) return;

        if (
          this.shouldCheckLineOfSight &&
          !isLineOfSightClear(
            level,
            this.hitDetails.sourceEntity.position.x,
            this.hitDetails.sourceEntity.position.y,
            otherEntity.position.x,
            otherEntity.position.y,
            collider2.parent() ?? undefined
          )
        )
          return;

        if (otherEntity.hit) {
          const overridedHitDetails = this.hitEntityHitDetailsHook(
            otherEntity,
            this.hitDetails
          );
          otherEntity.hit(overridedHitDetails);

          this._applyScreenShakeAndHitStop(otherEntity);
        }
      });
    }
  }

  private _applyScreenShakeAndHitStop(hitEntity: BaseEntityType) {
    const cameraDirector = this.level?.cameraDirector;
    if (!cameraDirector) return;

    if (this.screenShake > 0) {
      cameraDirector.pushScriptedRequest({ shake: this.screenShake }, 0);
      cameraDirector.popScriptedRequest(500);
    }

    const statusBehavior = (hitEntity.behaviors as any)
      .status as StatusBehavior;
    if (statusBehavior && statusBehavior.dead && this.killScreenShake > 0) {
      cameraDirector.pushScriptedRequest({ shake: this.killScreenShake }, 0);
      cameraDirector.popScriptedRequest(750);
    }

    this.level?.hitStop(this.hitStopMs);

    if (statusBehavior && statusBehavior.dead)
      this.level?.hitStop(this.killHitStopMs);
  }
}
