
import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  LevelAPI
} from "src/api/entity";
import { ObstacleAABB } from "src/api/navigation";

export class NavigationObstacleBehavior implements EntityBehavior {
  public type = "NavigationObstacle";
  private entity?: BaseEntityType;
  private level?: LevelAPI;
  // Reused AABB shape; `x`/`y` (center) are refreshed each step from the
  // entity position, sent to the nav grid as the obstacle's footprint.
  private shape: ObstacleAABB = {
    type: "aabb",
    x: 0,
    y: 0,
    width: 1,
    height: 1
  };
  constructor() {
    this.step = this.step.bind(this);
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step);
    this.shape.width = this.entity.size.width * 0.9;
    this.shape.height = this.entity.size.height * 0.9;
  }
  attachToLevel(level: LevelAPI) {
    this.level = level;
  }
  step() {
    const { level, entity } = this;
    if (!level || !entity) return;
    this.shape.x = entity.position.x;
    this.shape.y = entity.position.y;
    // level.navigation?.upsertObstacleWithShape(entity.id, this.shape);
  }
  destroy() {
    const { level, entity } = this;
    if (!level || !entity) return;
    // level.navigation?.deleteObstacle(entity.id);
  }
}
