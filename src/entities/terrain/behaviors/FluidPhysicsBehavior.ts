import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { Box2, Vector2 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { vector3To2 } from "src/engine/util/vecTypes";

export type FluidSurfacePoint = {
  onSurface: boolean;
  boundsMin: number;
  boundsMax: number;
  x: number;
  offset: number;
  vel: number;
  wavePressureRight: number;
  wavePressureLeft: number;
};

export type TrackedEntityInFluid = {
  volumeDisplaced: number;
};

export enum FluidPhysicsEvents {
  Init = "Init",
  StepUpdated = "StepUpdated"
}

export type FluidPhysicsEventTypes = {
  [FluidPhysicsEvents.Init]: void;
  [FluidPhysicsEvents.StepUpdated]: void;
};

export class FluidPhysicsBehavior implements EntityBehavior {
  public type = "FluidTerrain";
  public entity?: BaseEntityType;
  public terrainDef?: TiledLevelAPI.MapTerrain;
  public surface: FluidSurfacePoint[] = [];
  public events = createTypedEventEmitter<FluidPhysicsEventTypes>();
  public bbox2 = new Box2();
  private level?: EntityLevelAPI;
  private rigidBody?: RigidBody;
  private colliders: Collider[] = [];
  private timeToNextSystemTickMs = 0;
  private systemTickIntervalMs = 22;
  private waterRes = 0.125;
  private trackingEntities = new Map<string, TrackedEntityInFluid>();
  private fluidLeft?: FluidPhysicsBehavior;
  private fluidRight?: FluidPhysicsBehavior;
  private pendingImpulses: [number, Vector2][] = [];
  private preloadBox2?: Box2;
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    return this;
  }
  setTerrain(terrain: TiledLevelAPI.MapTerrain) {
    this.terrainDef = terrain;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;

    if (!this.entity || !this.terrainDef) return;
    const { position } = this.entity;
    const pos2 = vector3To2(position);

    // Bookkeeping for bounds.
    const box2 = new Box2();

    // Set up physics.
    const { ColliderDesc, RigidBodyDesc } = level.rapier;
    const rigidBodyDesc = RigidBodyDesc.fixed().setTranslation(
      position.x,
      position.y
    );
    const rigidBody = level.world.createRigidBody(rigidBodyDesc);
    this.rigidBody = rigidBody;
    for (const convex of this.terrainDef.convexComponentPolygons ?? []) {
      const convexArr = new Float32Array(convex.length * 2);
      for (let vi = 0; vi < convex.length; vi++) {
        const vtx = convex[vi];
        convexArr[vi * 2 + 0] = vtx.x;
        convexArr[vi * 2 + 1] = vtx.y;
        box2.expandByPoint(vtx);
      }
      const colliderDesc = ColliderDesc.convexHull(convexArr);
      if (colliderDesc === null) continue;
      colliderDesc.setActiveCollisionTypes(
        level.rapier.ActiveCollisionTypes.ALL
      );
      colliderDesc.setActiveHooks(
        level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS
      );
      colliderDesc.setActiveEvents(
        level.rapier.ActiveEvents.CONTACT_FORCE_EVENTS
      );
      colliderDesc.setCollisionGroups(terrainCollisionGroup);
      const collider = level.world.createCollider(colliderDesc, rigidBody);
      this.colliders.push(collider);
    }
    box2.min.add(pos2);
    box2.max.add(pos2);
    level.registerEntityPhysicsHooks({
      entityId: this.entity.id,
      rigidBodyHandle: rigidBody.handle,
      acceptCollisionByDefault: false,
      beginCollision: (_thisEntity, otherEntity) => {
        if (otherEntity?.id && !this.trackingEntities.has(otherEntity.id))
          this.trackingEntities.set(otherEntity.id, {
            volumeDisplaced: 0
          });
        return CollisionBehavior.NoCollideWithCallback;
      },
      handleOngoingCollision: (otherEntity, otherRigidBody, ms) => {
        const velRaw = otherRigidBody.linvel();
        const vel = new Vector2(velRaw.x, velRaw.y);
        const otherPos = otherRigidBody.translation();
        // Sample nearby buckets.
        const [ixMin, ixMax] = this.getBucketRange(
          otherPos.x,
          otherEntity.size.width
        );
        let bucketAvgOffset = 0;
        let bucketAvgDiv = 0;
        for (let ix = ixMin; ix <= ixMax; ix++) {
          const bucket = this.surface[ix];
          if (!bucket) continue;
          bucketAvgOffset += bucket.offset;
          bucketAvgDiv++;
        }
        if (bucketAvgDiv > 0) bucketAvgOffset /= bucketAvgDiv;
        // Ok, back to calculations.
        const otherY = otherPos.y;
        const otherYTop = otherY + otherEntity.size.height * 0.5;
        const fracSubmerged = Math.max(
          0,
          Math.min(
            1,
            (box2.max.y +
              bucketAvgOffset -
              otherYTop +
              otherEntity.size.height) /
              otherEntity.size.height
          )
        );
        let wFrac = 1;
        if (
          otherEntity.position.x - otherEntity.size.width * 0.5 <
          box2.min.x
        ) {
          wFrac *= Math.min(
            1,
            (otherEntity.position.x +
              otherEntity.size.width * 0.5 -
              box2.min.x) /
              otherEntity.size.width
          );
        }
        if (
          otherEntity.position.x + otherEntity.size.width * 0.5 >
          box2.max.x
        ) {
          wFrac *= Math.min(
            1,
            -(
              otherEntity.position.x -
              otherEntity.size.width * 0.5 -
              box2.max.x
            ) / otherEntity.size.width
          );
        }
        if (!Number.isFinite(wFrac)) wFrac = 0; // Infinity here is BAD.
        const speed = vel.length();
        const delta = vel
          .clone()
          .normalize()
          .multiplyScalar(-speed * fracSubmerged * wFrac * 0.2);

        const yCenterDelta =
          otherRigidBody.translation().y - box2.max.y - bucketAvgOffset;
        if (yCenterDelta < 0) {
          let totalArea = 0;
          for (let i = 0; i < otherRigidBody.numColliders(); i++) {
            const otherCollider = otherRigidBody.collider(i);
            totalArea += otherCollider.volume();
          }
          delta.y -= totalArea * yCenterDelta * fracSubmerged * 0.5;
        }
        let volumeDisplaced =
          (otherEntity.area?.() ??
            otherEntity.size.width * otherEntity.size.height) * fracSubmerged;
        volumeDisplaced *= wFrac;

        delta.multiplyScalar(ms * 0.1);

        // Safety first.
        if (Number.isNaN(delta.x) || Number.isNaN(delta.y)) {
          return;
        }

        // If this isn't terrain, queue an impulse.
        this.pendingImpulses.push([otherRigidBody.handle, delta]);

        this.applyWaterDisplacement(
          otherEntity.id,
          otherPos.x,
          vel.x,
          vel.y,
          otherEntity.size.width * wFrac,
          volumeDisplaced,
          ms
        );
      }
      // endCollision: (_thisEntity, otherEntity) => {}
    });

    // Set up local water physics.
    this.bbox2.copy(box2);
    const width = box2.max.x - box2.min.x;
    const sampleRay = new level.rapier.Ray({ x: 0, y: 0 }, { x: 0, y: -1 });
    const gBoundsMin = this.bbox2.min.y;
    const gBoundsMax = this.bbox2.max.y;
    for (let i = 0; i <= width / this.waterRes; i++) {
      const x = this.bbox2.min.x + i * this.waterRes;
      let boundsMax = gBoundsMin;
      let boundsMin = gBoundsMax;
      for (const collider of this.colliders) {
        sampleRay.origin.x = x;
        sampleRay.dir.x = 0;
        sampleRay.origin.y = gBoundsMax;
        sampleRay.dir.y = -1;
        const rayToi = collider.castRay(
          sampleRay,
          gBoundsMax - gBoundsMin,
          true
        );
        if (rayToi !== -1) {
          const rayY = sampleRay.origin.y + sampleRay.dir.y * rayToi;
          if (rayY > boundsMax) boundsMax = rayY;
        }
        sampleRay.origin.y = gBoundsMin;
        sampleRay.dir.y = 1;
        const rayToi2 = collider.castRay(
          sampleRay,
          gBoundsMax - gBoundsMin,
          true
        );
        if (rayToi2 !== -1) {
          const rayY = sampleRay.origin.y + sampleRay.dir.y * rayToi2;
          if (rayY < boundsMin) boundsMin = rayY;
        }
      }
      this.surface.push({
        onSurface: boundsMax === gBoundsMax,
        boundsMin: boundsMin - this.entity.position.y,
        boundsMax: boundsMax - this.entity.position.y,
        x: x - this.entity.position.x,
        offset: 0,
        vel: 0,
        wavePressureLeft: 0,
        wavePressureRight: 0
      });
    }

    // Handle connectibity with other fluid behaviors.
    this.preloadBox2 = box2;
    this.level.on(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);

    this.events.emit(FluidPhysicsEvents.Init);
  }
  private readonly onPreloadComplete = (): void => {
    const level = this.level;
    const box2 = this.preloadBox2;
    if (!level || !box2) return;
    const ray = new level.rapier.Ray(
      { x: box2.max.x + 0.1, y: box2.max.y - 0.1 },
      { x: 1, y: 0 }
    );
    const rbRightHit = level.world.castRay(ray, 1, true);
    if (!rbRightHit) return;
    const rbRightColl = rbRightHit.collider;
    const entityIdRight = level.getEntityIdForCollider(rbRightColl.handle);
    if (!entityIdRight) return;
    const entityRight = level.getEntity<
      BaseEntityType & {
        behaviors: {
          physics?: FluidPhysicsBehavior;
        };
      }
    >(entityIdRight);
    if (entityRight?.behaviors.physics?.type !== "FluidTerrain") return;
    this.fluidRight = entityRight.behaviors.physics;
    this.fluidRight.fluidLeft = this;
  };
  detachFromLevel() {
    this.level?.off(EntityLevelEvents.PreloadComplete, this.onPreloadComplete);
    if (this.entity) this.level?.removeEntityPhysicsHooks(this.entity.id);
    if (this.rigidBody) this.level?.world.removeRigidBody(this.rigidBody);
    this.rigidBody = undefined;
    this.level = undefined;
    this.preloadBox2 = undefined;
  }
  step(ms: number) {
    // Apply impulses. We do this outside of the collision handlers to prevent Rust issues.
    if (this.pendingImpulses.length > 0) {
      for (const [handle, impulse] of this.pendingImpulses) {
        const otherRigidBody = this.level?.world.getRigidBody(handle);
        if (!otherRigidBody) continue;
        otherRigidBody.applyImpulse(impulse, true);
      }
      this.pendingImpulses = [];
    }

    // Update water.
    this.timeToNextSystemTickMs -= ms;
    let updated = false;
    while (this.timeToNextSystemTickMs < 0) {
      updated = true;
      this.timeToNextSystemTickMs += this.systemTickIntervalMs;
      // Transfer waves from the next fluid body over.
      if (this.fluidLeft) {
        const leftBucket = this.fluidLeft.surface.at(-1);
        const rightBucket = this.surface.at(0);
        if (leftBucket?.onSurface && rightBucket?.onSurface) {
          leftBucket.wavePressureLeft = rightBucket.wavePressureLeft;
          rightBucket.wavePressureRight = leftBucket.wavePressureRight;
        }
      }
      if (this.fluidRight) {
        const leftBucket = this.surface.at(-1);
        const rightBucket = this.fluidRight.surface.at(0);
        if (leftBucket?.onSurface && rightBucket?.onSurface) {
          rightBucket.wavePressureRight = leftBucket.wavePressureRight;
          leftBucket.wavePressureLeft = rightBucket.wavePressureLeft;
        }
      }
      // Transfer pressure waves right.
      for (let i = this.surface.length - 1; i > 0; i--) {
        const bucketA = this.surface[i - 1];
        const bucketB = this.surface[i];
        if (!bucketA.onSurface || !bucketB.onSurface) {
          if (bucketA.onSurface) {
            bucketA.wavePressureLeft = bucketA.wavePressureRight;
            bucketA.wavePressureRight = 0;
          }
          bucketB.wavePressureLeft = 0;
          bucketB.wavePressureRight = 0;
          continue;
        }
        bucketB.wavePressureRight = bucketA.wavePressureRight;
      }
      // Transfer pressure waves left.
      for (let i = 0; i < this.surface.length - 1; i++) {
        const bucketA = this.surface[i];
        const bucketB = this.surface[i + 1];
        if (!bucketA.onSurface || !bucketB.onSurface) {
          if (bucketB.onSurface) {
            bucketB.wavePressureRight = bucketB.wavePressureLeft;
            bucketB.wavePressureLeft = 0;
          }
          bucketA.wavePressureLeft = 0;
          bucketA.wavePressureRight = 0;
          continue;
        }
        bucketA.wavePressureLeft = bucketB.wavePressureLeft;
      }
      const bucketLeft = this.surface[0];
      const bucketRight = this.surface.at(-1);
      if (
        bucketLeft?.onSurface &&
        !this.fluidLeft?.surface?.at(-1)?.onSurface
      ) {
        bucketLeft.wavePressureRight = bucketLeft.wavePressureLeft;
        bucketLeft.wavePressureLeft = 0;
      }
      if (
        bucketRight?.onSurface &&
        !this.fluidRight?.surface.at(0)?.onSurface
      ) {
        bucketRight.wavePressureLeft = bucketRight.wavePressureRight;
        bucketRight.wavePressureRight = 0;
      }
      // Perturb the surface.
      for (let i = 0; i < this.surface.length; i++) {
        const bucket = this.surface[i];
        if (!bucket.onSurface) continue;
        const _initialBucketOffset = bucket.offset;
        // Apply pressure dissipation.
        bucket.wavePressureLeft *=
          0.97 - Math.sqrt(bucket.boundsMax - bucket.boundsMin) * 0.05;
        bucket.wavePressureRight *=
          0.97 - Math.sqrt(bucket.boundsMax - bucket.boundsMin) * 0.05;
        // Apply pressure offsets.
        bucket.offset +=
          0.5 * (bucket.wavePressureLeft + bucket.wavePressureRight);
        // Apply velocity offsets.
        bucket.vel *= 0.98;
        bucket.vel -= bucket.offset * 0.5;
        const offsetDelta = bucket.vel * 0.02;
        bucket.offset += offsetDelta;
        if (bucket.offset <= bucket.boundsMin - bucket.boundsMax) {
          bucket.offset = bucket.boundsMin - bucket.boundsMax;
          bucket.vel = Math.max(bucket.vel, 0);
        }
        if (bucket.offset > 2) {
          bucket.offset = 2;
        }
        // reset buckets that hit errors.
        if (
          Number.isNaN(bucket.offset) ||
          Number.isNaN(bucket.vel) ||
          Number.isNaN(bucket.wavePressureLeft) ||
          Number.isNaN(bucket.wavePressureRight)
        ) {
          bucket.offset = 0;
          bucket.vel = 0;
          bucket.wavePressureLeft = 0;
          bucket.wavePressureRight = 0;
        }
      }
      // Maintain constanst volume.
      const avgOffset =
        this.surface.reduce((acc, b) => acc + b.offset, 0) /
        this.surface.length;
      for (const bucket of this.surface) {
        bucket.offset -= avgOffset * 0.25;
      }
      // Smooth the surface
      if (bucketLeft.onSurface && this.fluidLeft?.surface.at(-1)?.onSurface) {
        const otherBucket = this.fluidLeft?.surface.at(-1);
        if (otherBucket) {
          const avg = (bucketLeft.offset + otherBucket.offset) * 0.5;
          bucketLeft.offset = avg;
          otherBucket.offset = avg;
        }
      }
    }
    if (updated) this.events.emit(FluidPhysicsEvents.StepUpdated);
  }
  getBucketRange(posX: number, width: number): [number, number] {
    const ixMin = Math.round(
      (posX - this.bbox2.min.x - width * 0.5) / this.waterRes
    );
    const ixMax = Math.round(
      (posX - this.bbox2.min.x + width * 0.5) / this.waterRes
    );
    return [Math.max(0, ixMin), Math.min(this.surface.length, ixMax)];
  }
  applyWaterDisplacement(
    entityId: string,
    posX: number,
    velX: number,
    velY: number,
    width: number,
    volumeDisplaced: number,
    ms: number
  ) {
    if (!this.entity) return;
    let tracked = this.trackingEntities.get(entityId);
    if (!tracked) {
      tracked = {
        volumeDisplaced: 0
      };
      this.trackingEntities.set(entityId, tracked);
    }
    const deltaVolume = volumeDisplaced - tracked.volumeDisplaced;
    tracked.volumeDisplaced = volumeDisplaced;
    const [ixMin, ixMax] = this.getBucketRange(posX, width);
    const bucketCount = ixMax - ixMin + 1;
    const displacementPerBucket = deltaVolume / (bucketCount * this.waterRes);
    for (let ix = ixMin; ix <= ixMax; ix++) {
      const bucket = this.surface[ix];
      if (!bucket?.onSurface) continue;
      bucket.offset -=
        displacementPerBucket *
        0.25 *
        Math.sqrt(Math.min(1, Math.abs(velY))) *
        Math.sqrt(
          Math.max(
            0,
            1 -
              Math.abs((2 * (posX - this.entity.position.x - bucket.x)) / width)
          )
        );
    }
    // const minBucket = this.surface[ixMin];
    // const maxBucket = this.surface[ixMax];
    const minBucket = this.surface[Math.round(ixMin * 0.75 + ixMax * 0.25)];
    const maxBucket = this.surface[Math.round(ixMin * 0.25 + ixMax * 0.75)];
    if (minBucket?.onSurface) {
      minBucket.wavePressureLeft += deltaVolume * 0.05 * ms;
      minBucket.wavePressureLeft -=
        (volumeDisplaced * velX * 0.00001 * ms * ms) / width;
    }
    if (maxBucket?.onSurface) {
      maxBucket.wavePressureRight += deltaVolume * 0.05 * ms;
      maxBucket.wavePressureRight +=
        (volumeDisplaced * velX * 0.00001 * ms * ms) / width;
    }
  }
}
