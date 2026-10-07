import { RigidBodyType } from "@dimforge/rapier2d-compat";
import { Vector2 } from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { CharacterPhysicsBehavior } from "src/entities/shared/behaviors/CharacterPhysics";
import { StatusBehavior } from "src/entities/shared/behaviors/StatusBehavior";

export type ShieldOfPlantShieldProps = EntityProps & {
  parent: BaseEntityType;
};

export class ShieldOfPlantShield extends CoreEntity implements BaseEntityType {
  public alignment = EntityAlignment.Enemy; // This is an enemy.
  private initialPosition: Vector2 = new Vector2();
  public behaviors = {
    physics: new CharacterPhysicsBehavior().setGroup(enemyCollisionGroup),
    status: new StatusBehavior().setMaxHealth(100)
  };

  constructor(props: ShieldOfPlantShieldProps) {
    super(props);
    this.size = {
      width: 8 * kInvPixelScale,
      height: 48 * kInvPixelScale
    };
    this.behaviors.physics.init(this).setDensity(10);
    this.behaviors.physics.body?.setBodyType(
      RigidBodyType.KinematicPositionBased,
      true
    );
    this.behaviors.status.init(this);

    this.initialPosition.set(this.position.x, this.position.y);
  }
  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
  }
  destroy(): void {
    super.destroy();
  }
  step(ms: number) {
    super.step(ms);
    const body = this.behaviors.physics.body;
    if (body) {
      body.setTranslation(this.initialPosition, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setAngvel(0, true);
    }
  }
  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);
    this.scheduler.add({
      duration: 150,
      invokeFunction: (t) => {
        //TODO : Add health for shield
      }
    });
  }
  activate() {
    this.behaviors.physics.enable();
  }
  deactivate() {
    this.behaviors.physics.disable();
  }
}
