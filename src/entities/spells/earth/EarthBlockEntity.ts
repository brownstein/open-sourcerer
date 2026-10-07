import { Object3D } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLifecycleEventTypes,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { DeferredEmitter } from "src/engine/util/deferredEmitter";
import { arr2 } from "src/engine/util/vecTypes";

import {
  RasterShapeBehavior,
  RasterShapeEvents
} from "src/entities/shared/behaviors/RasterShapeBehavior";
import { setAssetDependencies } from "src/engine/entity/decorators";

export enum EarthBlockLifecycle {
  Initializing = "Initializing",
  TerrainNotFound = "TerrainNotFound",
  Growing = "Growing",
  Stable = "Stable",
  Shrinking = "Shrinking",
  Error = "Error"
}

export enum EarthBlockLifecycleEvents {
  LifecycleUpdate = "LifecycleUpdate"
}

export type EarthBlockLifecycleEventTypes = {
  [EarthBlockLifecycleEvents.LifecycleUpdate]: EarthBlockLifecycle;
};

export type EarthBlockProps = EntityProps & {
  shape?: arr2[];
  holes?: arr2[][];
};

@setAssetDependencies(() => ["terrainCracks"])
export class EarthBlock extends CoreEntity implements BaseEntityType {
  static type = "EarthBlock";
  public type = EarthBlock.type;
  public object3D = new Object3D();
  public lifeycleStage: EarthBlockLifecycle = EarthBlockLifecycle.Initializing;
  public events = createTypedEventEmitter<
    EntityLifecycleEventTypes & EarthBlockLifecycleEventTypes
  >();
  public successfulInitialGrowth = new DeferredEmitter();
  public behaviors = {
    shape: new RasterShapeBehavior()
  };
  override get canBindToVariable() {
    return true;
  }

  // Allow the player and enemies to land on this terrain.
  public alignment = EntityAlignment.TemporaryTerrain;

  constructor(props: EarthBlockProps) {
    super(props);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.behaviors.shape.init(this).setShape(
      props.shape ?? [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5]
      ],
      props.holes
    );
    this.behaviors.shape.events.on(RasterShapeEvents.GeomDestroyed, () => {
      this.level?.removeEntity(this.id);
      this.destroy();
    });
    this.behaviors.shape.events.on(
      RasterShapeEvents.Subdivided,
      ({ newChunks, disappear }) => {
        for (const newChunk of newChunks) {
          const chunkEntity = new EarthBlock({
            position: newChunk.position,
            shape: newChunk.shape
          });
          chunkEntity.behaviors.shape.spawnFullGrown().setCanDamage(false);
          if (newChunk.color)
            chunkEntity.behaviors.shape.setColor(newChunk.color);
          if (disappear)
            chunkEntity.behaviors.shape.scheduleRandomizedDisappear();
          this.level?.addEntity(chunkEntity);
        }
      }
    );
    this.behaviors.shape.events.on(
      RasterShapeEvents.SizeChanged,
      (size) => (this.size = size)
    );
    this.behaviors.shape.events.on(RasterShapeEvents.GrowthFinished, () => {
      this.lifeycleStage = EarthBlockLifecycle.Stable;
      this.events.emit(
        EarthBlockLifecycleEvents.LifecycleUpdate,
        EarthBlockLifecycle.Stable
      );
      this.successfulInitialGrowth.emit("done");
    });
    this.behaviors.shape.events.on(
      RasterShapeEvents.RejectedDueToMissingTerrain,
      () => {
        this.lifeycleStage = EarthBlockLifecycle.TerrainNotFound;
        this.scheduler.add({
          startIn: 1,
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id);
          }
        });
        this.events.emit(
          EarthBlockLifecycleEvents.LifecycleUpdate,
          EarthBlockLifecycle.TerrainNotFound
        );
        this.successfulInitialGrowth.emit("cancel");
      }
    );
    this.behaviors.shape.events.on(
      RasterShapeEvents.RejectedDueToBadGeometry,
      () => {
        this.lifeycleStage = EarthBlockLifecycle.Error;
        this.scheduler.add({
          startIn: 1,
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id);
          }
        });
        this.events.emit(
          EarthBlockLifecycleEvents.LifecycleUpdate,
          EarthBlockLifecycle.Error
        );
        this.successfulInitialGrowth.emit("cancel");
      }
    );
  }
  shatter() {
    this.behaviors.shape.shatterAll();
  }
  clear() {
    this.behaviors.shape.shatterAll();
  }
  extraSpellBindingData() {
    return {
      angle: this.angle
    };
  }
  detachFromTerrain() {
    this.behaviors.shape.detach();
  }
  hit(details: EntityHitDetails) {
    // Emit the Hit lifecycle event so RasterShapeBehavior can apply knockback
    // impulse and structural (cell) damage.
    super.hit(details);
    this.shake(150);
  }
}

export class EarthShardsJuice extends CoreEntity implements BaseEntityType {
  static type = "EarthShardsJuice";
  public type = "EarthShardsJuice";
}
