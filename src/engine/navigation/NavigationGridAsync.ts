import shortid from "shortid";

import { EntityLevelEventTypes, EntityLevelEvents } from "src/api/entity";
import {
  AsyncNavAPI,
  IRBBox,
  ObstacleAABB,
  ObstacleShape,
  PathPlanRequest
} from "src/api/navigation";
import { TypedEventEmitter } from "src/api/util";

import { Scheduler } from "../scheduling/Scheduler";
import {
  NavWorkerRequest,
  NavWorkerResponse,
  NavigationGridEventsFromWorker,
  NavigationGridEventsToWorker,
  WorkerJumpPlanRequest,
  WorkerPathPlanRequest,
  isNavWorkerResponse
} from "./NavigationGridWorkerAPI";
import { TerrainWithObstacles } from "./Terrain";

class NavigationGridConnection {
  private worker?: Worker;
  private pendingResponseResolvers = new Map<
    string,
    (response: NavWorkerResponse) => void
  >();
  constructor() {
    this.onMessage = this.onMessage.bind(this);
  }
  setup() {
    if (this.worker) return;
    this.worker = new Worker(
      new URL("./NavigationGrid.worker", import.meta.url),
      {
        name: "NavigationGrid"
      }
    );
    this.worker.onmessage = this.onMessage;
  }
  onMessage(ev: MessageEvent<unknown>) {
    if (!isNavWorkerResponse(ev.data)) return;
    const resolvePendingResponse = this.pendingResponseResolvers.get(
      ev.data.requestId
    );
    if (resolvePendingResponse) {
      this.pendingResponseResolvers.delete(ev.data.requestId);
      resolvePendingResponse(ev.data);
    }
  }
  sendMessage(msg: NavWorkerRequest) {
    this.worker?.postMessage(msg);
  }
  // One persistent worker.onmessage handler dispatches to the matching pending
  // request by id, so concurrent path requests don't each add (and leak) a
  // listener on a shared emitter.
  sendMessageAndAwaitResponse(
    msg: WorkerPathPlanRequest | WorkerJumpPlanRequest
  ): Promise<NavWorkerResponse> {
    return new Promise((resolve) => {
      this.pendingResponseResolvers.set(msg.id, resolve);
      this.sendMessage(msg);
    });
  }
}

const conn = new NavigationGridConnection();

// Normalizes a bbox into an AABB obstacle shape: `x`/`y` are the box center
// and `width`/`height` its full extents, matching the terrain's AABB fill.
function bboxToAABB(bbox: IRBBox): ObstacleAABB {
  return {
    type: "aabb",
    x: (bbox.xMin + bbox.xMax) * 0.5,
    y: (bbox.yMin + bbox.yMax) * 0.5,
    width: bbox.xMax - bbox.xMin,
    height: bbox.yMax - bbox.yMin
  };
}

export class NavigationGridAsync implements AsyncNavAPI {
  public id = shortid();
  private obstacleMap = new Map<string, ObstacleShape>();
  private scheduler = new Scheduler();
  constructor(
    terrain: TerrainWithObstacles,
    planRes: number,
    defaultGravity: number
  ) {
    this.sendObstacleUpdate = this.sendObstacleUpdate.bind(this);
    conn.setup();
    conn.sendMessage({
      type: NavigationGridEventsToWorker.InitNavGrid,
      gridId: this.id,
      terrain: terrain.serialize(),
      planRes,
      defaultGravity
    });
  }
  setupIncrementalObstacleUpdates(
    ee: TypedEventEmitter<Pick<EntityLevelEventTypes, EntityLevelEvents.Step>>
  ) {
    ee.on(EntityLevelEvents.Step, (ms: number) => {
      this.scheduler.step(ms);
    });
    this.scheduler.add({
      duration: 500,
      invokeFunctionAtComplete: this.sendObstacleUpdate,
      recurring: true
    });
  }
  destroy() {
    conn.sendMessage({
      type: NavigationGridEventsToWorker.DestroyNavGrid,
      gridId: this.id
    });
  }
  sendMessageAndAwaitResponse(
    msgRaw: Omit<WorkerPathPlanRequest | WorkerJumpPlanRequest, "id">
  ) {
    const msgWithId = {
      ...msgRaw,
      id: shortid()
    };
    return conn.sendMessageAndAwaitResponse(msgWithId);
  }
  async planPath(req: PathPlanRequest) {
    const reqMsg: Omit<WorkerPathPlanRequest, "id"> = {
      type: NavigationGridEventsToWorker.PathPlanRequest,
      gridId: this.id,
      request: {
        ...req,
        fromPosition: {
          x: req.fromPosition.x,
          y: req.fromPosition.y
        },
        toPosition: {
          x: req.toPosition.x,
          y: req.toPosition.y
        },
        toPositionSpread: req.toPositionSpread
          ? {
              x: req.toPositionSpread.x,
              y: req.toPositionSpread.y
            }
          : undefined,
        motionCapabilities: {
          ...req.motionCapabilities,
          size: {
            x: req.motionCapabilities.size.x,
            y: req.motionCapabilities.size.y
          }
        }
      }
    };
    const response = await this.sendMessageAndAwaitResponse(reqMsg);
    if (response.type === NavigationGridEventsFromWorker.PathPlanResponse)
      return response.pathPlan;
    return null;
  }
  upsertObstacle(id: string, bbox: IRBBox) {
    this.obstacleMap.set(id, bboxToAABB(bbox));
  }
  upsertObstacleWithShape(id: string, shape: ObstacleShape) {
    this.obstacleMap.set(id, shape);
  }
  deleteObstacle(id: string): void {
    this.obstacleMap.delete(id);
  }
  sendObstacleUpdate() {
    const obstacles: Record<string, ObstacleShape> = {};
    for (const [obsId, shape] of this.obstacleMap) {
      obstacles[obsId] = shape;
    }
    conn.sendMessage({
      type: NavigationGridEventsToWorker.UpdateObstacles,
      gridId: this.id,
      obstacles
    });
  }
}
