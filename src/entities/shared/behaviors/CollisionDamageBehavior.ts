import {
  BaseEntityType,
  DamageType,
  ElementalType,
  EntityAlignment,
  EntityBehavior,
  EntityHitDetails,
  EntityLevelAPI,
  EntityLevelEvents
} from "src/api/entity";
import { Scheduler } from "src/engine/scheduling/Scheduler";

import { CharacterPhysicsBehavior } from "./CharacterPhysics";

type CompatibleEntity = BaseEntityType<{
  physics: CharacterPhysicsBehavior;
}>;

export class CollisionDamageBehavior
  implements EntityBehavior<CompatibleEntity>
{
  public readonly type = "CollisionDamage";

  private entity?: CompatibleEntity;

  private damageToDeal: number;
  private readonly otherEntityImpulseMultiplier: number;
  private readonly selfImpulseMultiplier: number;
  private readonly selfDamageAmount: number;
  private readonly damageType?: DamageType;
  private readonly elementalDamageType?: ElementalType;

  private readonly entitiesOnDamageCooldown = new Set<BaseEntityType>();
  private readonly collisionDamageCooldownMs = 1000;
  private readonly scheduler = new Scheduler();

  private isDisabled = false;

  constructor(
    damageToDeal: number,
    otherEntityImpulseMultiplier: number,
    selfImpulseMultiplier?: number,
    selfDamageAmount?: number,
    damageType?: DamageType,
    elementalDamageType?: ElementalType
  ) {
    this.damageToDeal = damageToDeal;
    this.otherEntityImpulseMultiplier = otherEntityImpulseMultiplier;
    this.selfImpulseMultiplier = selfImpulseMultiplier ?? 0;
    this.selfDamageAmount = selfDamageAmount ?? 0;
    this.damageType = damageType;
    this.elementalDamageType = elementalDamageType;
  }

  updateDamage(damageToDeal: number): void {
    if (damageToDeal === this.damageToDeal) return;

    this.damageToDeal = damageToDeal;
    this.entitiesOnDamageCooldown.clear();
    this.scheduler.cancelAll();
  }

  init(entity: CompatibleEntity): void {
    this.entity = entity;
  }

  attachToLevel(level: EntityLevelAPI): void {
    level.on(EntityLevelEvents.Step, this.step);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    level.off(EntityLevelEvents.Step, this.step);
  }

  disable(): void {
    this.isDisabled = true;
  }

  enable(): void {
    this.isDisabled = false;
  }

  readonly step = (deltaMs: number): void => {
    this.scheduler.step(deltaMs);

    if (!this.entity) return;
    if (this.isDisabled) return;

    const currentAlignment = this.entity.alignment;
    if (
      currentAlignment !== EntityAlignment.Player &&
      currentAlignment !== EntityAlignment.Enemy
    )
      return;

    const targetAlignment =
      currentAlignment === EntityAlignment.Player
        ? EntityAlignment.Enemy
        : EntityAlignment.Player;

    const filteredCollidedWithEntitiesToNormals = new Map(
      this.entity.behaviors.physics.collidedEntitiesToNormal
    );
    filteredCollidedWithEntitiesToNormals.forEach((_normal, entity) => {
      if (entity.alignment !== targetAlignment)
        filteredCollidedWithEntitiesToNormals.delete(entity);
    });

    filteredCollidedWithEntitiesToNormals.forEach((normal, entity) => {
      if (this.entitiesOnDamageCooldown.has(entity)) return;

      this.entitiesOnDamageCooldown.add(entity);

      this.scheduler.add({
        duration: this.collisionDamageCooldownMs,
        invokeFunctionAtComplete: () =>
          this.entitiesOnDamageCooldown.delete(entity)
      });

      const entityHitDetails: EntityHitDetails = {
        hittingEntity: this.entity!,
        sourceEntity: this.entity!,
        damage: this.damageToDeal,
        damageType: this.damageType,
        elementalDamageType: this.elementalDamageType,
        hitImpulse: normal
          .clone()
          .multiplyScalar(this.otherEntityImpulseMultiplier)
      };

      const selfHitDetails: EntityHitDetails | undefined =
        this.selfDamageAmount === 0 && this.selfImpulseMultiplier === 0
          ? undefined
          : {
              hittingEntity: entity,
              sourceEntity: entity,
              damage: this.selfDamageAmount,
              hitImpulse: normal
                .clone()
                .negate()
                .multiplyScalar(this.selfImpulseMultiplier)
            };

      entity.hit?.(entityHitDetails);

      if (selfHitDetails) this.entity!.hit?.(selfHitDetails);
    });
  };
}
