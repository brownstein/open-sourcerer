import { Object3D } from "three";

import {
  BaseEntityType,
  ElementalType,
  EntityAlignment,
  EntityHitDetails,
  EntityProps
} from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { setAssetDependencies } from "src/engine/entity/decorators";
import { arr2 } from "src/engine/util/vecTypes";
import {
  CellAppearanceFn,
  RasterShapeBehavior,
  RasterShapeEvents
} from "src/entities/shared/behaviors/RasterShapeBehavior";
import { getArea } from "src/util/polygons";

// Ambient melt: the ice sits intact for a grace period, then sheds one full
// outer ring of cells per interval.
const ICE_MELT_INTERVAL_MS = 3000;
const ICE_MELT_DELAY_MS = 5000;
// Accelerated interval used on teardown/destroy so ice dissolves quickly.
const ICE_FAST_MELT_INTERVAL_MS = 120;
// Mana spent from the block's reserve to spare one outer ring from melting.
const ICE_MELT_MANA_COST = 5;

// Frosted-edge ice shading: a 2-cell-thick whitish rim around a translucent
// blue interior, the whole block lit by the nearest-edge normal. The outline
// uses boundaryDistance (1 = outermost ring, 2 = next ring in) so it stays a
// consistent thickness as the shape grows and melts.
const iceCellAppearance: CellAppearanceFn = ({
  boundaryDistance,
  shadeFactor
}) => {
  if (boundaryDistance <= 2) {
    // Outer ring brighter/more opaque; inner ring a touch softer.
    const opacity = boundaryDistance === 1 ? 0.6 : 0.3;
    return {
      color: [0.85 * shadeFactor, 0.95 * shadeFactor, 1.0 * shadeFactor],
      opacity
    };
  }
  return {
    color: [0.5 * shadeFactor, 0.8 * shadeFactor, 1.0 * shadeFactor],
    opacity: 0.15
  };
};

type IceBlockProps = EntityProps & {
  shape?: arr2[];
  holes?: arr2[][];
};

@setAssetDependencies(() => ["terrainCracks"])
export class IceBlock extends CoreEntity implements BaseEntityType {
  static type = "IceBlock";
  public type = IceBlock.type;
  public alignment = EntityAlignment.TemporaryTerrain;
  public object3D = new Object3D();
  public behaviors = {
    shape: new RasterShapeBehavior()
  };

  // Mana reserve that resists ambient melting. Each ring that would melt spends
  // ICE_MELT_MANA_COST from this pool instead, sparing the ring until it runs dry.
  private mana = 0;

  constructor(props: IceBlockProps) {
    super(props);
    this.object3D.position.copy(this.position);

    this.behaviors.shape
      .init(this)
      .setAnchorToTerrain(false)
      .setFriction(0, "min")
      .setEnableCcd(true)
      .setContactDamageType(ElementalType.Ice)
      .setElementalDamageMultipliers({ [ElementalType.Fire]: 3 })
      .setCellAppearance(iceCellAppearance)
      .setShape(
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

    // Spend stored mana to spare a ring instead of melting it. Only gates
    // ambient melt — startShrinking() clears the reserve so forced destruction
    // (teardown/destroy) always proceeds.
    this.behaviors.shape.setMeltGuard(() => {
      if (this.mana < ICE_MELT_MANA_COST) return false;
      this.mana -= ICE_MELT_MANA_COST;
      return true;
    });

    // After a grace period, shed one outer ring per interval.
    this.behaviors.shape.events.on(RasterShapeEvents.GrowthFinished, () => {
      this.behaviors.shape.startMelt(ICE_MELT_INTERVAL_MS, ICE_MELT_DELAY_MS);
    });

    // Fire (or other excess) damage can shatter ice into icy shards.
    this.behaviors.shape.events.on(
      RasterShapeEvents.Subdivided,
      ({ newChunks, disappear }) => {
        for (const newChunk of newChunks) {
          const chunk = new IceBlock({
            position: newChunk.position,
            shape: newChunk.shape
          });
          chunk.behaviors.shape.spawnFullGrown().setCanDamage(false);
          if (newChunk.color) chunk.behaviors.shape.setColor(newChunk.color);
          if (newChunk.opacity !== undefined) {
            chunk.behaviors.shape.setOpacity(newChunk.opacity);
          }
          if (disappear) chunk.behaviors.shape.scheduleRandomizedDisappear();
          this.level?.addEntity(chunk);
        }
      }
    );

    this.behaviors.shape.events.on(
      RasterShapeEvents.SizeChanged,
      (size) => (this.size = size)
    );

    // Bad geometry (e.g. a degenerate cast shape) — clean up.
    this.behaviors.shape.events.on(
      RasterShapeEvents.RejectedDueToBadGeometry,
      () => {
        this.scheduler.add({
          startIn: 1,
          invokeFunctionAtComplete: () => this.level?.removeEntity(this.id)
        });
      }
    );
  }

  // Accelerate the melt so the block dissolves quickly. Kept under the
  // historical name for the spell runtime bindings. Drains the mana reserve so
  // the melt guard can't keep the block alive during forced destruction.
  startShrinking() {
    this.mana = 0;
    this.behaviors.shape.startMelt(ICE_FAST_MELT_INTERVAL_MS);
  }

  // Mana reserve API — mirrors ManaSpark so casters can debit/credit mana.
  addMana(mana: number) {
    this.mana += mana;
    return true;
  }
  subMana(mana: number) {
    if (this.mana < mana) return false;
    this.mana -= mana;
    return true;
  }
  // Surfaced to spell scripts as the IceBlock's `mana` property via sync.
  extraSpellBindingData() {
    return { mana: this.mana };
  }
  clear() {
    this.startShrinking();
  }
  hit(hit: EntityHitDetails) {
    super.hit(hit);
    this.shake(150);
  }
  area() {
    return this.behaviors.shape.currentShape?.reduce((acc, val) => acc + getArea(val.outer), 0);
  }
}
