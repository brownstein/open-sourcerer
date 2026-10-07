import {
  BaseEntityType,
  DamageType,
  EntityBehavior,
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";

import { CentralDataStoreBehavior } from "./CentralDataStoreBehavior";

type FallDamageThreshold = {
  minImpactSpeedSq: number;
  damagePercent: number;
};

type CompatibleEntity = BaseEntityType<{
  data: CentralDataStoreBehavior;
}>;

export class FallDamageBehavior implements EntityBehavior<CompatibleEntity> {
  public type = "FallDamage";

  private entity?: CompatibleEntity;
  private dataStore?: CentralDataStoreBehavior;
  private thresholds: FallDamageThreshold[] = [];
  private _maxHealth: number | (() => number) = 0;
  private shouldDisableNextDamage = false;
  private isEnabled = true;

  private get maxHealth(): number {
    if (typeof this._maxHealth === "function") return this._maxHealth();
    return this._maxHealth;
  }

  private set maxHealth(maxHealth: number | (() => number)) {
    this._maxHealth = maxHealth;
  }

  init(entity: CompatibleEntity): void {
    this.entity = entity;
    this.dataStore = entity.behaviors.data;
  }

  setMaxHealth(maxHealth: number | (() => number)): FallDamageBehavior {
    this.maxHealth = maxHealth;
    return this;
  }

  addFallDamageThreshold(
    minImpactSpeed: number,
    damagePercent: number
  ): FallDamageBehavior {
    this.thresholds.push({
      minImpactSpeedSq: minImpactSpeed * minImpactSpeed,
      damagePercent
    });
    this.thresholds.sort((a, b) => a.minImpactSpeedSq - b.minImpactSpeedSq);
    return this;
  }

  attachToLevel(level: EntityLevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  readonly step = (): void => {
    if (!this.entity || !this.dataStore) return;
    if (!this.isEnabled) {
      this.shouldDisableNextDamage = false;
      return;
    }

    const wasGrounded = this.dataStore.previous.isGrounded;
    const isGrounded = this.dataStore.current.isGrounded;

    if (!wasGrounded && isGrounded) {
      const impactSpeedSq = this.dataStore.previous.linvel.lengthSq();
      const damagePercent = this.shouldDisableNextDamage
        ? 0
        : this._calculateDamagePercent(impactSpeedSq);
      if (damagePercent > 0) {
        this.entity.hit?.({
          hittingEntity: this.entity,
          sourceEntity: this.entity,
          damage: damagePercent * this.maxHealth,
          damageType: DamageType.Force
        });
      }
      this.shouldDisableNextDamage = false;
    }
  };

  private _calculateDamagePercent(impactSpeedSq: number): number {
    return this.thresholds.reduce((damagePercent, threshold) => {
      if (impactSpeedSq >= threshold.minImpactSpeedSq)
        return threshold.damagePercent;
      return damagePercent;
    }, 0);
  }

  disableNextDamage() {
    this.shouldDisableNextDamage = true;
  }

  enable() {
    this.isEnabled = true;
  }
  disable() {
    this.isEnabled = false;
  }
}
