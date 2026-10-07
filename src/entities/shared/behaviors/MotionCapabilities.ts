import { BaseEntityType, EntityBehavior } from "src/api/entity";
import { MotionCapabilities, NavAttackCapability } from "src/api/navigation";
import { kWorldGravity } from "src/engine/level/Level";
import { jumpVelocityFromHeight } from "src/engine/navigation/util";

export class MotionCapabilitiesBehavior implements EntityBehavior {
  public type = "MotionCapabilities";
  public capabilities: MotionCapabilities;
  constructor(partialCapabilities?: Partial<MotionCapabilities>) {
    this.capabilities = {
      maxGroundSpeedX: 6,
      maxGroundAccelX: 0.05,
      ...partialCapabilities,
      size: {
        x: partialCapabilities?.size?.x ?? 1,
        y: partialCapabilities?.size?.y ?? 1
      }
    };
  }
  setSpeedLimits(groundSpeed: number, flightSpeed?: number) {
    this.capabilities.maxGroundSpeedX = groundSpeed;
    this.capabilities.maxFlySpeed = flightSpeed ?? groundSpeed;
    return this;
  }
  setSwimSpeed(swimSpeed: number) {
    this.capabilities.maxSwimSpeedX = swimSpeed;
    return this;
  }
  setGroundAccel(groundSpeedAccel: number) {
    this.capabilities.maxGroundAccelX = groundSpeedAccel;
    return this;
  }
  setJump(canJump: boolean, jumpImpulse?: number | null, jumpHeight?: number) {
    this.capabilities.canJump = canJump;
    if (canJump) {
      if (jumpImpulse) {
        this.capabilities.maxJumpImpulseY = jumpImpulse;
      } else if (jumpHeight) {
        this.capabilities.maxJumpImpulseY = jumpVelocityFromHeight(
          jumpHeight,
          kWorldGravity.y
        );
      }
    }
    return this;
  }
  setFly(canFly: boolean) {
    this.capabilities.canFly = canFly;
    return this;
  }
  setAttacks(attacks: NavAttackCapability[]) {
    this.capabilities.attackCapabilities = attacks;
    return this;
  }
  init(entity: BaseEntityType) {
    this.capabilities.size = {
      x: entity.size.width,
      y: entity.size.height
    };
    return this;
  }
}
