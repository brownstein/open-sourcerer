import {
  IRBBox,
  JumpPlanRequest,
  NavJumpInfo,
  ObstacleShape,
  PathPlan,
  PathPlanRequest
} from "src/api/navigation";

import { TerrainWithObstacles } from "./Terrain";

export enum NavigationGridEventsToWorker {
  InitNavGrid = "InitNavGrid",
  DestroyNavGrid = "DestroyNavGrid",
  PathPlanRequest = "RequestPathPlan",
  JumpPlanRequest = "RequestJumpPlan",
  UpdateObstacles = "UpdateObstacles"
}

export enum NavigationGridEventsFromWorker {
  PathPlanResponse = "PathPlanResponse",
  JumpPlanResponse = "JumpPlanResponse"
}

const NavigationGridEventsToWorkerSet = new Set([
  NavigationGridEventsToWorker.InitNavGrid,
  NavigationGridEventsToWorker.DestroyNavGrid,
  NavigationGridEventsToWorker.PathPlanRequest,
  NavigationGridEventsToWorker.JumpPlanRequest,
  NavigationGridEventsToWorker.UpdateObstacles
]);

const NavigationGridEventsFromWorkerSet = new Set([
  NavigationGridEventsFromWorker.PathPlanResponse,
  NavigationGridEventsFromWorker.JumpPlanResponse
]);

export type WorkerInitNavGrid = {
  type: NavigationGridEventsToWorker.InitNavGrid;
  gridId: string;
  terrain: ReturnType<TerrainWithObstacles["serialize"]>;
  planRes: number;
  defaultGravity: number;
};

export type WorkerDestroyNavGrid = {
  type: NavigationGridEventsToWorker.DestroyNavGrid;
  gridId: string;
};

export type WorkerPathPlanRequest = {
  type: NavigationGridEventsToWorker.PathPlanRequest;
  id: string;
  gridId: string;
  request: PathPlanRequest;
};

export type WorkerJumpPlanRequest = {
  type: NavigationGridEventsToWorker.JumpPlanRequest;
  id: string;
  gridId: string;
  request: JumpPlanRequest;
};

export type WorkerUpdateObstacles = {
  type: NavigationGridEventsToWorker.UpdateObstacles;
  gridId: string;
  obstacles: Record<string, ObstacleShape>;
};

export type NavWorkerRequest =
  | WorkerInitNavGrid
  | WorkerDestroyNavGrid
  | WorkerPathPlanRequest
  | WorkerJumpPlanRequest
  | WorkerUpdateObstacles;

export function isNavWorkerRequest(msg: unknown): msg is NavWorkerRequest {
  if (typeof msg !== "object" || msg === null) return false;
  const typedMsg = msg as NavWorkerRequest;
  return NavigationGridEventsToWorkerSet.has(typedMsg.type);
}

export type WorkerPathPlanResponse = {
  type: NavigationGridEventsFromWorker.PathPlanResponse;
  requestId: string;
  pathPlan: PathPlan | null;
};

export type WorkerJumpPlanResponse = {
  type: NavigationGridEventsFromWorker.JumpPlanResponse;
  requestId: string;
  jumpPlan: NavJumpInfo | null;
};

export type NavWorkerResponse = WorkerPathPlanResponse | WorkerJumpPlanResponse;

export function isNavWorkerResponse(msg: unknown): msg is NavWorkerResponse {
  if (typeof msg !== "object" || msg === null) return false;
  const typedMsg = msg as NavWorkerResponse;
  return NavigationGridEventsFromWorkerSet.has(typedMsg.type);
}
