import { Object3D, Vector2 } from "three";

import { ControlEvents } from "src/api/controls";
import { EntityAlignment, EntityProps } from "src/api/entity";
import { NavAttackInfo } from "src/api/navigation";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import { CharacterGroundPhysicsControlBehavior } from "../shared/behaviors/CharacterGroundPhysicsController";
import {
  CharacterPhysicsBehavior,
  CharacterPhysicsEvents
} from "../shared/behaviors/CharacterPhysics";
import { MotionCapabilitiesBehavior } from "../shared/behaviors/MotionCapabilities";
import {
  NavPathFollowingBehavior,
  PathFollowingBehaviorEvents
} from "../shared/behaviors/NavPathFollowingBehavior";
import { NavigationObstacleBehavior } from "../shared/behaviors/NavigationObstacle";
import { DevPathRenderingBehavior } from "./behaviors/DevPathRenderingBehavior";
import { DevPathToClickBehavior } from "./behaviors/DevPathToClickBehavior";
import { DevRenderBehavior } from "./behaviors/DevRenderBehavior";

export class NavigationTester extends CoreEntity {
  static type = "NavigationTester";
  public type = "NavigationTester";
  public object3D = new Object3D();
  public alignment = EntityAlignment.Enemy;

  public behaviors = {
    motionCapabilities: new MotionCapabilitiesBehavior()
      .setJump(true, 9)
      .setSpeedLimits(4)
      .setAttacks([
        {
          id: "lunge",
          range: 1.5,
          verticalRange: 1.5,
          motion: { dx: 1, dy: 0 }
        }
      ]),
    physics: new CharacterPhysicsBehavior(),
    control: new CharacterGroundPhysicsControlBehavior(),
    pathFollowing: new NavPathFollowingBehavior(),
    devPathToClick: new DevPathToClickBehavior(),
    render: new DevRenderBehavior(),
    renderPath: new DevPathRenderingBehavior(),
    navObstacle: new NavigationObstacleBehavior()
  };

  constructor(props: EntityProps) {
    super(props);
    this.object3D.position.copy(this.position);
    this.behaviors.motionCapabilities.init(this);
    this.behaviors.physics.init(this);
    this.behaviors.control
      .init(this)
      .attachPhysicsBehavior(this.behaviors.physics)
      .assignMotionCapabilities(this.behaviors.motionCapabilities.capabilities);
    this.behaviors.pathFollowing
      .init(this)
      .setMotionCapabilities(this.behaviors.motionCapabilities.capabilities)
      .setPhysicsControl(this.behaviors.control);
    this.behaviors.devPathToClick
      .init(this)
      .attachPathFollowing(this.behaviors.pathFollowing)
      .attachMotionCapabilities(this.behaviors.motionCapabilities.capabilities);
    this.behaviors.control.attachControlEvents(
      this.behaviors.pathFollowing.controlEvents
    );
    this.behaviors.render.init(this);
    this.behaviors.renderPath
      .init(this)
      .attachPathFollowing(this.behaviors.pathFollowing);
    this.behaviors.navObstacle.init(this);

    // Listen for attack-ready events from the path planner.
    this.behaviors.pathFollowing.pathEvents.on(
      PathFollowingBehaviorEvents.AttackReady,
      (attackInfo: NavAttackInfo) => {
        this.performLungeAttack(attackInfo);
      }
    );
  }

  private lungeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  private performLungeAttack(attackInfo: NavAttackInfo) {
    const dir = attackInfo.direction;
    const lungeDx = attackInfo.motion?.dx ?? 0;
    const body = this.behaviors.physics.body;
    if (!body) return;

    // Apply impulse to lunge forward with a small hop to reduce ground friction
    const mass = body.mass();
    const lungeForce = 20;
    body.applyImpulse(
      { x: dir * lungeDx * mass * lungeForce, y: mass * 3 },
      true
    );

    // Track whether we've already hit the player
    let hasHitPlayer = false;

    // Listen for collisions during the lunge
    const onCollide = ([collidedEntity]: [any, any]) => {
      if (
        collidedEntity.alignment === EntityAlignment.Player &&
        !hasHitPlayer
      ) {
        hasHitPlayer = true;

        // Stop horizontal motion on impact
        this.behaviors.pathFollowing.controlEvents.emit(
          ControlEvents.MoveHorizontally,
          0
        );

        // Apply damage and knockback to the player
        collidedEntity.hit?.({
          hittingEntity: this,
          sourceEntity: this,
          damage: 5,
          hitImpulse: new Vector2(dir * 8, 1)
        });

        cleanup();
      }
    };

    this.behaviors.physics.events.on(
      CharacterPhysicsEvents.CollideWithEntity,
      onCollide
    );

    // Clean up listener after the lunge window expires
    const timeoutId = setTimeout(() => cleanup(), 300);
    this.lungeTimeouts.add(timeoutId);

    const cleanup = () => {
      clearTimeout(timeoutId);
      this.lungeTimeouts.delete(timeoutId);
      this.behaviors.physics.events.off(
        CharacterPhysicsEvents.CollideWithEntity,
        onCollide
      );
    };
  }

  destroy() {
    super.destroy();
    for (const timeoutId of this.lungeTimeouts) {
      clearTimeout(timeoutId);
    }
    this.lungeTimeouts.clear();
  }
}
