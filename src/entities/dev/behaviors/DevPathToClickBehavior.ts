
import { ControlEvents, ControlsAPI } from "src/api/controls";
import {
  BaseEntityType,
  EntityBehavior,
  EntityLevelEvents,
  LevelAPI
} from "src/api/entity";
import { MotionCapabilities } from "src/api/navigation";
import { NavPathFollowingBehavior } from "src/entities/shared/behaviors/NavPathFollowingBehavior";

export class DevPathToClickBehavior implements EntityBehavior {
  public type = "DevPathToClick";
  private entity?: BaseEntityType;
  private controls?: ControlsAPI<BaseEntityType>;
  private motionCapabilities?: MotionCapabilities;
  private level?: LevelAPI;
  private pathFollowing?: NavPathFollowingBehavior;
  init(entity: BaseEntityType) {
    this.entity = entity;
    return this;
  }
  attachMotionCapabilities(motionCapabilities: MotionCapabilities) {
    this.motionCapabilities = motionCapabilities;
    return this;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
    this.level.on(EntityLevelEvents.AttachControls, this.attachControls);
    if (this.level.controls) this.attachControls(this.level.controls);
  }
  detachFromLevel(level: LevelAPI) {
    level.off(EntityLevelEvents.AttachControls, this.attachControls);
    this.controls?.events.off(ControlEvents.Click, this.handleClick);
    this.level = undefined;
  }
  attachPathFollowing(pathFollowing: NavPathFollowingBehavior) {
    this.pathFollowing = pathFollowing;
    return this;
  }
  readonly attachControls = (controls: ControlsAPI<BaseEntityType>) => {
    this.controls?.events.off(ControlEvents.Click, this.handleClick);
    this.controls = controls;
    this.controls.events.on(ControlEvents.Click, this.handleClick);
    return this;
  };
  private readonly handleClick = () => {
    const toPos = this.controls?.cursorScenePosition;
    if (!toPos) return;
    this.pathFollowing?.planAndFollowAttackPathToPosition(toPos);
  };
}
