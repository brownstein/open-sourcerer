import {
  BaseEntityType,
  DamageType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";

const OUT_OF_BOUNDS_MARGIN = 2;
const KILL_DAMAGE = 999;

export class OutOfBoundsBehaviour implements EntityBehavior {
  public type = "OutOfBounds";

  private entity?: BaseEntityType;
  private attachedLevel?: EntityLevelAPI;
  private killY?: number;

  private isEnabled = true;

  init(entity: BaseEntityType): void {
    this.entity = entity;
  }

  attachToLevel(level: EntityLevelAPI): void {
    this.attachedLevel = level;
    level.once(EntityLevelEvents.PreloadComplete, this.captureKillBoundary);
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.PreloadComplete, this.captureKillBoundary);
    level.off(EntityLevelEvents.Step, this.step);
    this.attachedLevel = undefined;
  }

  private readonly captureKillBoundary = (): void => {
    const level = this.attachedLevel;
    if (!level) return;
    const bounds = level.getWorldBoundaries();
    if (!bounds.isEmpty()) {
      this.killY = bounds.min.y - OUT_OF_BOUNDS_MARGIN;
    }
  };

  readonly step = (): void => {
    if (this.killY === undefined || !this.entity) return;

    if (this.entity.dead || this.entity.position.y >= this.killY) return;

    if (!this.isEnabled) return;

    this.entity.hit?.({
      hittingEntity: this.entity,
      sourceEntity: this.entity,
      damage: KILL_DAMAGE,
      damageType: DamageType.Force
    });
  };

  enable(): void {
    this.isEnabled = true;
  }
  disable(): void {
    this.isEnabled = false;
  }
}
