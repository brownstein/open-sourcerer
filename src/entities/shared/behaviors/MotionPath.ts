import { Vector2, Vector3 } from "three";
import { clamp } from "three/src/math/MathUtils.js";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { vector3To2 } from "src/engine/util/vecTypes";

export type Path = Vector2[];

export type MotionPathProviderBusEventTypes = {
  setMotionEnabled: boolean;
};

export type MotionPathProvider = BaseEntityType & {
  behaviors: {
    motionPath: MotionPathProviderBehavior;
  };
};

export function isMotionPathProvider(
  entity: BaseEntityType
): entity is MotionPathProvider {
  return (
    (entity as MotionPathProvider).behaviors?.motionPath?.type ===
    MotionPathProviderBehavior.type
  );
}

export class MotionPathProviderBehavior
  implements EntityBehavior<MotionPathProvider>
{
  static type = "MotionPathProvider";
  public type = "MotionPathProvider";
  public events = createTypedEventEmitter<MotionPathProviderBusEventTypes>();
  public path?: Path;
  public pathClosed = false;
  private entity?: BaseEntityType;
  init(entity: MotionPathProvider) {
    this.entity = entity;
    return this;
  }
  setPath(path: Path, closed?: boolean) {
    this.path = path;
    this.pathClosed = !!closed;
    if (
      this.pathClosed &&
      this.path
        .at(0)
        ?.clone()
        .sub(this.path.at(-1) || new Vector2())
        .lengthSq()
    ) {
      this.path.push(this.path[0]);
    }
    return this;
  }
  getPathLength() {
    if (!this.path?.length) return 0;
    let len = 0;
    const prev = new Vector2();
    const delta = new Vector2();
    const start = this.path.at(0);
    if (!start) return len;
    prev.copy(start);
    for (let i = 1; i < this.path.length; i++) {
      const next = this.path[i];
      if (!next) return len;
      delta.copy(next).sub(prev);
      len += delta.length();
      prev.copy(next);
    }
    return len;
  }
  getPointAndTangentAlongPath(dist: number): [Vector2, Vector2] {
    if (!this.path?.length || !this.entity)
      return [new Vector2(), new Vector2()];
    const offset = vector3To2(this.entity.position);
    let len = 0;
    const prev = new Vector2();
    const delta = new Vector2();
    const start = this.path.at(0);
    if (!start) return [new Vector2(), new Vector2()];
    prev.copy(start);
    for (let i = 1; i < this.path.length; i++) {
      const next = this.path[i];
      if (!next) return [offset.add(prev), new Vector2()];
      delta.copy(next).sub(prev);
      const segLen = delta.length();
      if (segLen > 0 && len + segLen >= dist) {
        const posAlongEdge = (dist - len) / segLen;
        prev.lerp(next, posAlongEdge);
        delta.normalize();
        return [offset.add(prev), delta];
      }
      len += segLen;
      prev.copy(next);
    }
    delta.normalize();
    return [offset.add(prev), delta];
  }

  /**
   * @returns The nearest position along the path {Vector2},
   *          the distance of that nearest position along the entire path {number},
   *          and the distance of that nearest position from the given position {number}
   */
  getNearestPathPosition(position: Vector2): [Vector2, number, number] {
    if (!this.path?.length || !this.entity) return [new Vector2(), 0, Infinity];

    // this.path coordinates define a local space where the origin begins at this.entity.position
    // translate back to world space for easier calculations. use only this path array from now on
    const pathInWorldSpace = this.path.map((point) =>
      new Vector2().copy(point).add(this.entity!.position)
    );

    const numPathPoints = pathInWorldSpace.length;
    if (numPathPoints === 1)
      return [
        pathInWorldSpace.at(0)!,
        0,
        pathInWorldSpace.at(0)!.distanceTo(position)
      ];

    interface PathSegment {
      start: Vector2;
      end: Vector2;
    }

    const pathSegments: PathSegment[] = [];

    for (const [index, currentPoint] of pathInWorldSpace.entries()) {
      let nextPoint = pathInWorldSpace.at(index + 1);

      if (!nextPoint) {
        if (!this.pathClosed) break;

        nextPoint = pathInWorldSpace.at(0)!;
      }

      if (currentPoint.equals(nextPoint)) continue;

      pathSegments.push({ start: currentPoint, end: nextPoint });
    }

    const getNearestSegmentPosition = (
      pathSegment: PathSegment,
      position: Vector2
    ): Vector2 => {
      const segmentAsVector = new Vector2()
        .copy(pathSegment.end)
        .sub(pathSegment.start);

      const positionRelativeToSegmentVector = new Vector2()
        .copy(position)
        .sub(pathSegment.start);

      const segmentLengthSquared = segmentAsVector.lengthSq();

      let projectionScalar =
        positionRelativeToSegmentVector.dot(segmentAsVector) /
        segmentLengthSquared;
      projectionScalar = clamp(projectionScalar, 0, 1);

      const nearestPosition = new Vector2()
        .copy(segmentAsVector)
        .multiplyScalar(projectionScalar)
        .add(pathSegment.start);

      return nearestPosition;
    };

    let nearestPosition = new Vector2();
    let distanceAlongPath = 0;
    let accumulatedDistanceAlongPath = 0;
    let nearestDistance = Infinity;

    for (const currentSegment of pathSegments) {
      const currentNearestPosition = getNearestSegmentPosition(
        currentSegment,
        position
      );
      const currentNearestDistance =
        currentNearestPosition.distanceTo(position);
      const currentDistanceAlongPath =
        accumulatedDistanceAlongPath +
        currentSegment.start.distanceTo(currentNearestPosition);

      if (currentNearestDistance < nearestDistance) {
        nearestPosition = currentNearestPosition;
        distanceAlongPath = currentDistanceAlongPath;
        nearestDistance = currentNearestDistance;
      }

      accumulatedDistanceAlongPath += currentSegment.start.distanceTo(
        currentSegment.end
      );
    }

    return [nearestPosition, distanceAlongPath, nearestDistance];
  }
}

export enum MotionPathFollowingEvents {
  PositionUpdate = "PositionUpdate",
  PathEndpointReached = "PathEndpointReached"
}

export type MotionPathFollowingEventTypes = {
  [MotionPathFollowingEvents.PositionUpdate]: [Vector2, Vector2];
  [MotionPathFollowingEvents.PathEndpointReached]: boolean;
};

export class MotionPathFollowingBehavior implements EntityBehavior {
  public type = "MotionPathFollowing";
  public traversalSpeed = 2;
  public traversalDuration?: number;
  public desiredPosition = new Vector3();
  public enabled = true;
  public pathProvider?: MotionPathProvider;
  public readonly events =
    createTypedEventEmitter<MotionPathFollowingEventTypes>();
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  private snapDistance = 1;
  private pathProgress = 0;
  private pathTraversalForwards = true;
  private pathLength = 0;
  private autoSnap = true;
  private signalingEnabled = false;
  private signalingPathProvider?: MotionPathProvider;
  constructor() {
    this.step = this.step.bind(this);
    this.snapOntoNearestPathProvider =
      this.snapOntoNearestPathProvider.bind(this);
  }
  enable() {
    this.enabled = true;
    if (!this.pathProvider) this.snapOntoNearestPathProvider();
    return this;
  }
  disable() {
    this.enabled = false;
    return this;
  }
  enableSignaling() {
    this.signalingEnabled = true;
    return this;
  }
  disableSignaling() {
    this.signalingEnabled = false;
    return this;
  }
  resetPathProgress() {
    this.pathProgress = 0;
    this.pathTraversalForwards = true;
    return this;
  }
  setSnapDistance(distance: number) {
    this.snapDistance = distance;
    return this;
  }
  setAutoSnap(autoSnap: boolean) {
    this.autoSnap = autoSnap;
    return this;
  }
  setTraversalSpeed(speed: number) {
    this.traversalSpeed = speed;
    return this;
  }
  setTraversalDuration(duration?: number) {
    this.traversalDuration = duration && duration > 0 ? duration : undefined;
    return this;
  }
  private getEffectiveTraversalSpeed(pathLength: number) {
    if (this.traversalDuration && this.traversalDuration > 0 && pathLength > 0) {
      const circuitLength = this.pathProvider?.behaviors.motionPath.pathClosed
        ? pathLength
        : pathLength * 2;
      return circuitLength / this.traversalDuration;
    }
    return this.traversalSpeed;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.desiredPosition.copy(this.entity.position);
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    if (!this.autoSnap) return;
    if (level.fullyPreLoaded) {
      this.snapOntoNearestPathProvider();
    } else {
      this.level.on(
        EntityLevelEvents.PreloadComplete,
        this.snapOntoNearestPathProvider
      );
    }
  }
  detachFromLevel(level: LevelAPI) {
    level.off(
      EntityLevelEvents.PreloadComplete,
      this.snapOntoNearestPathProvider
    );
    this.signalingPathProvider?.behaviors.motionPath.events.off(
      "setMotionEnabled",
      this.onSetMotionEnabled
    );
    this.signalingPathProvider = undefined;
    this.level = undefined;
  }
  destroy() {
    this.signalingPathProvider?.behaviors.motionPath.events.off(
      "setMotionEnabled",
      this.onSetMotionEnabled
    );
    this.signalingPathProvider = undefined;
  }
  private readonly onSetMotionEnabled = (enabled: boolean) => {
    if (!this.signalingEnabled) return;
    this.enabled = enabled;
  };
  step(ms: number) {
    if (!this.entity || !this.pathProvider || !this.enabled) return null;

    const pathLength = this.pathProvider.behaviors.motionPath.getPathLength();
    const traversalSpeed = this.getEffectiveTraversalSpeed(pathLength);

    this.pathProgress +=
      ms * 0.001 * traversalSpeed * (this.pathTraversalForwards ? 1 : -1);

    if (this.pathProgress > pathLength) {
      if (this.pathProvider?.behaviors.motionPath.pathClosed) {
        this.pathProgress -= pathLength;
      } else {
        this.pathProgress = 2 * pathLength - this.pathProgress;
        this.pathTraversalForwards = false;
      }

      this.events.emit(MotionPathFollowingEvents.PathEndpointReached, true);
    }
    if (this.pathProgress < 0) {
      this.pathProgress = -this.pathProgress;
      this.pathTraversalForwards = true;

      this.events.emit(MotionPathFollowingEvents.PathEndpointReached, false);
    }

    const newPathPos =
      this.pathProvider.behaviors.motionPath.getPointAndTangentAlongPath(
        this.pathProgress
      );

    if (newPathPos) {
      const [pos] = newPathPos;
      this.desiredPosition.x = pos.x;
      this.desiredPosition.y = pos.y;

      this.events.emit(MotionPathFollowingEvents.PositionUpdate, newPathPos);

      return pos;
    }

    return null;
  }
  snapOntoPathProvider(pathProvider: MotionPathProvider) {
    if (!this.entity) return false;
    const pos2 = vector3To2(this.entity.position);
    const [pathPos, pathProgress, _pathDist] =
      pathProvider.behaviors.motionPath.getNearestPathPosition(pos2);

    this.pathProvider = pathProvider;
    this.pathProgress = pathProgress;

    this.events.emit(MotionPathFollowingEvents.PositionUpdate, [
      pathPos.clone(),
      new Vector2()
    ]);

    this.pathLength = this.pathProvider.behaviors.motionPath.getPathLength();

    this.pathTraversalForwards = true;
  }
  snapOntoNearestPathProvider() {
    if (!this.entity || !this.level || !this.enabled) return;

    const allMotionPathProviders: MotionPathProvider[] = [
      ...this.level.getEntities().values()
    ].filter((entity) => {
      if (isMotionPathProvider(entity)) return true;

      return false;
    }) as MotionPathProvider[];

    const thisEntityPosition = vector3To2(this.entity.position);
    let bestDistance = Infinity;
    let bestPathProvider: MotionPathProvider | undefined = undefined;
    let progressAlongBestPathProvider = 0;
    let projectedPositionOnBestPathProvider = new Vector2();

    for (const pathProvider of allMotionPathProviders) {
      const [pathProjectedPosition, pathProgress, pathDistance] =
        pathProvider.behaviors.motionPath.getNearestPathPosition(
          thisEntityPosition
        );

      if (pathDistance > this.snapDistance) continue;

      if (pathDistance < bestDistance) {
        bestPathProvider = pathProvider;
        bestDistance = pathDistance;
        progressAlongBestPathProvider = pathProgress;
        projectedPositionOnBestPathProvider.copy(pathProjectedPosition);
      }
    }

    if (bestPathProvider) {
      this.pathProvider = bestPathProvider;
      this.pathProgress = progressAlongBestPathProvider;

      this.events.emit(MotionPathFollowingEvents.PositionUpdate, [
        projectedPositionOnBestPathProvider.clone(),
        new Vector2()
      ]);

      this.pathLength = this.pathProvider.behaviors.motionPath.getPathLength();
      this.pathTraversalForwards = true;

      this.signalingPathProvider?.behaviors.motionPath.events.off(
        "setMotionEnabled",
        this.onSetMotionEnabled
      );
      this.signalingPathProvider = this.pathProvider;
      this.pathProvider.behaviors.motionPath.events.on(
        "setMotionEnabled",
        this.onSetMotionEnabled
      );
    }
  }
}
