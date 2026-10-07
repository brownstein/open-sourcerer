import { ObstacleShape } from "src/api/navigation";
import { NavigationGrid } from "./NavigationGrid";
import * as API from "./NavigationGridWorkerAPI";
import { TerrainWithObstacles } from "./Terrain";
import { IRBBox } from "./types";

const ctx: Worker = global.self as unknown as Worker;

const gridIdToGrid = new Map<string, NavigationGrid>();
const gridIdToObstacles = new Map<string, Map<string, ObstacleShape>>();

async function handleMsg(msg: unknown) {
  if (!API.isNavWorkerRequest(msg)) return;
  switch (msg.type) {
    case API.NavigationGridEventsToWorker.InitNavGrid:
      gridIdToGrid.set(
        msg.gridId,
        new NavigationGrid(
          TerrainWithObstacles.parse(msg.terrain),
          msg.planRes,
          msg.defaultGravity
        )
      );
      gridIdToObstacles.set(msg.gridId, new Map());
      return;
    case API.NavigationGridEventsToWorker.DestroyNavGrid:
      gridIdToGrid.delete(msg.gridId);
      gridIdToObstacles.delete(msg.gridId);
      return;
    case API.NavigationGridEventsToWorker.PathPlanRequest: {
      const grid = gridIdToGrid.get(msg.gridId);
      const pathPlan = grid ? await grid.planPath(msg.request) : null;
      const res: API.WorkerPathPlanResponse = {
        type: API.NavigationGridEventsFromWorker.PathPlanResponse,
        requestId: msg.id,
        pathPlan
      };
      ctx.postMessage(res);
      return;
    }
    case API.NavigationGridEventsToWorker.UpdateObstacles: {
      const grid = gridIdToGrid.get(msg.gridId);
      const extantObstacles = gridIdToObstacles.get(msg.gridId);
      if (!grid || !extantObstacles) return;
      const terrain = grid.terrain;
      for (const obsId of extantObstacles.keys()) {
        terrain.clearObstacle(obsId);
      }
      const newObstacles = new Map<string, ObstacleShape>();
      for (const [obsId, obsShape] of Object.entries(msg.obstacles)) {
        newObstacles.set(obsId, obsShape);
      }
      for (const [obsId, obsBBox] of newObstacles) {
        terrain.updateObstacle(obsId, obsBBox);
      }
      gridIdToObstacles.set(msg.gridId, newObstacles);
      return;
    }
    default:
      return;
  }
}

ctx.addEventListener("message", (ev) => handleMsg(ev.data));
