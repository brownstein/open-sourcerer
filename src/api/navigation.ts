import { arr2, IVector2 } from "src/engine/util/vecTypes";
import { arr2Polygon, arr2Polygons } from "src/util/polygons";

export type NavAttackCapability = {
  id: string;
  range: number;
  verticalRange?: number;
  motion?: NavAttackMotion;
};

export type NavAttackMotion = {
  dx: number;
  dy: number;
};

export type NavAttackInfo = {
  attackId: string;
  range: number;
  motion?: NavAttackMotion;
  direction: number;
};

export type MotionCapabilities = {
  size: IVector2;
  canJump?: boolean;
  canFly?: boolean;
  gravity?: number;
  // These properties are used for jump planning.
  maxGroundAccelX?: number;
  maxGroundSpeedX?: number;
  maxAirAccelX?: number;
  maxAirSpeedX?: number;
  maxJumpImpulseY?: number;
  maxAirSpeedY?: number;
  maxFlySpeed?: number;
  // Horizontal drive speed while submerged. Falls back to maxGroundSpeedX.
  maxSwimSpeedX?: number;
  attackCapabilities?: NavAttackCapability[];
};

export enum NavAction {
  Start,
  Walk,
  Jump,
  Fall,
  Land,
  FallThrough,
  Fly,
  Attack
}

export type NavBase = {
  x: number;
  y: number;
};

export type NavStart = NavBase & { action: NavAction.Start };
export type NavWalk = NavBase & { action: NavAction.Walk };
export type NavJump = NavBase & {
  action: NavAction.Jump;
  jump: NavJumpInfo;
};
export type NavFall = NavBase & { action: NavAction.Fall };
export type NavFallThrough = NavBase & { action: NavAction.FallThrough };
export type NavLand = NavBase & { action: NavAction.Land };
export type NavFly = NavBase & { action: NavAction.Fly };
export type NavAttack = NavBase & { action: NavAction.Attack; attack: NavAttackInfo };

export type NavNode =
  | NavStart
  | NavWalk
  | NavJump
  | NavFall
  | NavFallThrough
  | NavLand
  | NavFly
  | NavAttack;

export type NavJumpInfo = {
  airTime: number;
  initialX: number;
  initialY: number;
  finalX: number;
  finalY: number;
  initialVelocityX: number;
  initialVelocityY: number;
  accelerationX: number;
  accelerationXT: number;
  decelerateYT: number;
};

export enum NavTerrainBlockType {
  Empty,
  Solid,
  Platform,
  SlopeLeft,
  SlopeRight,
  PlatformSlopeLeft,
  PlatformSlopeRight,
  Ladder,
  LadderPlatformIntersect
}

export type PathPlanRequest = {
  fromPosition: IVector2;
  toPosition: IVector2;
  toPositionSpread?: IVector2;
  toPositionGroundingDistance?: number;
  motionCapabilities: MotionCapabilities;
  bestEffort?: boolean;
  distanceLimit?: number;
  opLimit?: number;
  ignoreObstacleId?: string;
  attackTarget?: IVector2;
};

export type JumpPlanRequest = {
  fromPosition: IVector2;
  toPosition: IVector2;
  toPositionGroundingDistance?: number;
  motionCapabilities: MotionCapabilities;
};

export type PathPlan = {
  steps: NavNode[];
};

export type IRBBox = {
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
};

export type ObstacleAABB = {
  type: "aabb",
  width: number;
  height: number;
  x: number;
  y: number;
};

export type ObstaclePolygons = {
  type: "polygons";
  polygons: arr2Polygons;
  x: number;
  y: number;
};

export type ObstacleShape = ObstacleAABB | ObstaclePolygons;

export type AsyncNavAPI = {
  planPath: (req: PathPlanRequest) => Promise<PathPlan | null>;
  destroy(): void;
  upsertObstacle(id: string, bbox: IRBBox): void;
  upsertObstacleWithShape(id: string, shape: ObstacleShape): void;
  deleteObstacle(id: string): void;
};
