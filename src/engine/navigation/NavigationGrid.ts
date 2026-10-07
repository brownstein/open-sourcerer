import PriorityQueue from "tinyqueue";

import { MotionCapabilities, NavAction, NavAttackCapability, NavAttackInfo, NavJumpInfo, NavNode, PathPlan, PathPlanRequest } from "src/api/navigation";
import { IVector2 } from "src/engine/util/vecTypes";

import { CenteredBBox } from "./CenteredBBox";
import { TerrainWithObstacles } from "./Terrain";
import { getTimeOfApproach, jumpHeightFromVelocity } from "./util";

export class PositionSet {
  protected scale: number;
  protected invScale: number;
  protected data: Set<string> = new Set();
  constructor(planRes: number) {
    this.scale = planRes;
    this.invScale = 1 / planRes;
  }
  has(x: number, y: number) {
    return this.data.has(
      `${Math.floor(x * this.invScale)}:${Math.floor(y * this.invScale)}`
    );
  }
  put(x: number, y: number) {
    this.data.add(
      `${Math.floor(x * this.invScale)}:${Math.floor(y * this.invScale)}`
    );
  }
}

type InternalNavCtx = {
  currentBBox: CenteredBBox;
  checkerBBox: CenteredBBox;
  surfaceCheckDepth: number;
  surfaceCheckOffset: number;
  visited: PositionSet;
  motionCapabilities: MotionCapabilities;
  gravity: number;
  totalOps: number;
  opLimit: number;
  costPerWalkMeter: number;
  costPerJumpMeter: number;
  costPerJump: number;
  costPerFlyMeter: number;
  attackTarget?: IVector2;
  attackCapabilities?: NavAttackCapability[];
  maxAttackReach?: number;
};

type NavChainLink = {
  action: NavAction;
  x: number;
  y: number;
  // Jump starts are queued up with additional cost.
  isJumpStart?: boolean;
  jumpInfo?: NavJumpInfo;
  attackInfo?: NavAttackInfo;
  previous: NavChainLink | null;
  distanceCost: number;
  distFromGoal: number;
  cost: number;
};

export class NavigationGrid {
  public terrain: TerrainWithObstacles;
  protected planRes: number;
  protected invPlanRes: number;
  protected defaultGravity: number;
  protected debug = false;
  protected timeStep = 0.2;
  constructor(
    terrain: TerrainWithObstacles,
    planRes: number,
    defaultGravity: number
  ) {
    this.terrain = terrain;
    this.planRes = planRes;
    this.invPlanRes = 1 / planRes;
    this.defaultGravity = defaultGravity;
  }
  destroy() {}
  private createCtx(
    position: IVector2,
    motionCapabilities: MotionCapabilities,
    gravity: number
  ): InternalNavCtx {
    const bbox = new CenteredBBox(
      this.planRes * Math.round(position.x * this.invPlanRes),
      this.planRes * Math.round(position.y * this.invPlanRes),
      this.planRes * Math.round(motionCapabilities.size.x * this.invPlanRes),
      this.planRes * Math.round(motionCapabilities.size.y * this.invPlanRes)
    );
    const oddSizeY =
      Math.round(motionCapabilities.size.y * this.invPlanRes) % 2 === 1;
    const surfaceCheckDepth = this.planRes * 0.4;
    const surfaceCheckOffset = oddSizeY
      ? this.planRes * 0.25
      : this.planRes * 0.5;
    return {
      currentBBox: bbox.clone(),
      checkerBBox: bbox.clone(),
      surfaceCheckDepth,
      surfaceCheckOffset,
      visited: new PositionSet(this.planRes),
      motionCapabilities,
      gravity,
      totalOps: 0,
      opLimit: 0,
      costPerWalkMeter: 1,
      costPerJumpMeter: 1,
      costPerJump: 1,
      costPerFlyMeter: 1
    };
  }
  private fitBBoxIntoTerrain(
    bbox: CenteredBBox,
    leeway: number = 0,
    passibleMode: boolean = false
  ) {
    // Check initial position.
    if (
      passibleMode
        ? this.terrain.checkPassable(bbox)
        : this.terrain.checkEmpty(bbox)
    )
      return true;
    if (leeway === 0) return false;

    // Expand up to leeway distance away from the initial bbox position,
    // setting the bbox's position and returning true if empty, otherwise false.
    const leewaySq = leeway ** 2;
    const jumpDist = this.planRes;
    const initialX = bbox.x;
    const initialY = bbox.y;
    const checked = new PositionSet(jumpDist);
    checked.put(bbox.x, bbox.y);
    const frontier = new PriorityQueue<[number, number, number]>(
      [],
      (a, b) => a[0] - b[0]
    );
    const addToFrontier = (x: number, y: number) => {
      if (checked.has(x, y)) return;
      checked.put(x, y);
      const distSq = (x - initialX) ** 2 + (y - initialY) ** 2;
      if (distSq <= leewaySq) frontier.push([distSq, x, y]);
    };
    const expand = (x: number, y: number) => {
      addToFrontier(x, y - jumpDist);
      addToFrontier(x, y + jumpDist);
      addToFrontier(x - jumpDist, y);
      addToFrontier(x + jumpDist, y);
    };
    expand(initialX, initialY);
    while (frontier.peek()) {
      const next = frontier.pop();
      if (next === undefined) break;
      bbox.x = next[1];
      bbox.y = next[2];
      if (
        passibleMode
          ? this.terrain.checkPassable(bbox)
          : this.terrain.checkEmpty(bbox)
      )
        return true;
      expand(next[1], next[2]);
    }
    bbox.x = initialX;
    bbox.y = initialY;
    return false;
  }
  private bboxMatchesGoalPosition(bbox: CenteredBBox, goal: IVector2) {
    if (
      bbox.xMin <= goal.x &&
      bbox.xMax >= goal.x &&
      bbox.yMin <= goal.y &&
      bbox.yMax >= goal.y
    )
      return true;
    return false;
  }
  async planPath(req: PathPlanRequest) {
    return this.planPathWrapped(req);
  }
  planPathWrapped(req: PathPlanRequest): PathPlan | null {
    if (this.debug) console.log("Processing pathing request", req);
    const prevTime = Date.now();
    const tempObstacle = req.ignoreObstacleId
      ? this.terrain.getObstacle(req.ignoreObstacleId)
      : null;
    if (req.ignoreObstacleId && tempObstacle)
      this.terrain.clearObstacle(req.ignoreObstacleId);
    const res = this.planPathSync(req);
    if (req.ignoreObstacleId && tempObstacle)
      this.terrain.updateObstacle(req.ignoreObstacleId, tempObstacle);
    const timeDelta = Date.now() - prevTime;
    if (this.debug) console.log(`Path planned in ${timeDelta} ms.`, res);
    return res;
  }
  planPathSync(req: PathPlanRequest): PathPlan | null {
    const {
      fromPosition: fromPositionRaw,
      toPosition: toPositionRaw,
      toPositionSpread,
      motionCapabilities,
      bestEffort = false,
      distanceLimit = this.planRes * 64,
      opLimit = 10000
    } = req;
    const sOffset = {
      x:
        Math.round(motionCapabilities.size.x * this.invPlanRes) % 2
          ? this.planRes * 0.5
          : 0,
      y:
        Math.round(motionCapabilities.size.y * this.invPlanRes) % 2
          ? this.planRes * 0.5
          : 0
    };
    const fromPosition = {
      x:
        this.planRes *
          Math.round((fromPositionRaw.x + sOffset.x) * this.invPlanRes) -
        sOffset.x,
      y:
        this.planRes *
          Math.round((fromPositionRaw.y + sOffset.y) * this.invPlanRes) -
        sOffset.y
    };
    const toPosition = {
      x:
        this.planRes *
          Math.round((toPositionRaw.x + sOffset.x) * this.invPlanRes) -
        sOffset.x,
      y:
        this.planRes *
          Math.round((toPositionRaw.y + sOffset.y) * this.invPlanRes) -
        sOffset.y
    };
    const gravity = motionCapabilities.gravity ?? this.defaultGravity;
    const ctx = this.createCtx(fromPosition, motionCapabilities, gravity);
    ctx.opLimit = opLimit;

    // Set up attack planning context.
    const attackCaps = motionCapabilities.attackCapabilities;
    if (req.attackTarget && attackCaps && attackCaps.length > 0) {
      ctx.attackTarget = req.attackTarget;
      ctx.attackCapabilities = attackCaps;
      ctx.maxAttackReach = 0;
      for (const cap of attackCaps) {
        const reach = cap.range + Math.abs(cap.motion?.dx ?? 0);
        if (reach > ctx.maxAttackReach) ctx.maxAttackReach = reach;
      }
    }

    // If we can't fit the current building box into the grid, bail.
    if (
      !this.fitBBoxIntoTerrain(
        ctx.currentBBox,
        Math.max(
          this.planRes * 1.5,
          motionCapabilities.size.x * 0.75,
          motionCapabilities.size.y * 0.75
        ),
        true
      )
    ) {
      if (this.debug)
        console.log(
          "[NavigationGrid]: Initial position does not fit into terrain."
        );
      return null;
    }
    fromPosition.x = ctx.currentBBox.x;
    fromPosition.y = ctx.currentBBox.y;

    // If not in best effort mode, and we can't fit the goal into the grid, bail.
    ctx.checkerBBox.x = toPosition.x;
    ctx.checkerBBox.y = toPosition.y;
    if (
      !bestEffort &&
      !this.fitBBoxIntoTerrain(
        ctx.checkerBBox,
        Math.max(
          this.planRes * 1.5,
          motionCapabilities.size.x * 0.75,
          motionCapabilities.size.y * 0.75
        ),
        true
      )
    ) {
      if (this.debug)
        console.log("[NavigationGrid]: Goal does not fit into terrain.");
      return null;
    }
    toPosition.x = ctx.checkerBBox.x;
    toPosition.y = ctx.checkerBBox.y;

    // Define a bounding box for the goal.
    const goalBBox = new CenteredBBox(
      toPosition.x,
      toPosition.y,
      this.planRes,
      this.planRes
    );
    if (toPositionSpread) {
      goalBBox.width = toPositionSpread.x;
      goalBBox.height = toPositionSpread.y;
    }

    if (req.toPositionGroundingDistance !== undefined) {
      let grounded = this.terrain.checkOnSurface(
        ctx.checkerBBox,
        ctx.surfaceCheckDepth,
        ctx.surfaceCheckOffset
      );
      if (!grounded) {
        const initialY = toPosition.y;
        for (let dy = 0; dy < req.toPositionGroundingDistance; dy++) {
          ctx.checkerBBox.y -= this.planRes;
          grounded = this.terrain.checkOnSurface(
            ctx.checkerBBox,
            ctx.surfaceCheckDepth,
            ctx.surfaceCheckOffset
          );
          if (grounded) break;
        }
        if (grounded) {
          toPosition.y = ctx.checkerBBox.y;
        } else {
          toPosition.y = initialY;
        }
      }
    }

    if (this.debug)
      console.log(
        "[NavigationGrid]: Plotting from",
        fromPosition,
        "to",
        toPosition
      );

    // If we're already at the goal position, return an empty plan —
    // unless we have an attack target, in which case we still need to
    // run the search to produce an Attack step.
    if (
      !req.attackTarget &&
      this.bboxMatchesGoalPosition(ctx.currentBBox, toPosition)
    ) {
      if (this.debug)
        console.log("[NavigationGrid]: BBox matches goal position.");
      return {
        steps: []
      };
    }

    const startNode: NavChainLink = {
      action: NavAction.Start,
      x: fromPosition.x,
      y: fromPosition.y,
      previous: null,
      distanceCost: 0,
      distFromGoal: Infinity,
      cost: 0
    };
    const posCache = new PositionSet(this.planRes);
    posCache.put(startNode.x, startNode.y);
    const jumpStartCache = new PositionSet(this.planRes);
    const frontier = new PriorityQueue<NavChainLink>(
      [startNode],
      (a, b) => a.cost - b.cost
    );

    let finalNode: NavChainLink | undefined;
    let bestNode: NavChainLink = startNode;
    const { checkerBBox, currentBBox: _currentBBox } = ctx;

    const expand = (
      prevNode: NavChainLink,
      action: NavAction,
      x: number,
      y: number,
      jumpInfo?: NavJumpInfo,
      isJumpStart?: boolean
    ) => {
      if (isJumpStart) {
        if (jumpStartCache.has(x, y)) return;
        jumpStartCache.put(x, y);
      } else {
        if (posCache.has(x, y)) {
          return;
        }
        posCache.put(x, y);
      }
      checkerBBox.x = x;
      checkerBBox.y = y;
      if (!this.terrain.checkBoundaries(checkerBBox)) return;
      let distanceCost = prevNode.distanceCost;

      switch (action) {
        case NavAction.Walk:
        case NavAction.Fall:
        case NavAction.FallThrough:
        case NavAction.Land: {
          const distDelta = Math.sqrt(
            (x - prevNode.x) ** 2 + (y - prevNode.y) ** 2
          );
          distanceCost += distDelta * ctx.costPerWalkMeter;
          break;
        }
        case NavAction.Jump: {
          if (jumpInfo) {
            const distDetla = this.measureJump(ctx, jumpInfo);
            distanceCost += distDetla * ctx.costPerJumpMeter;
          } else distanceCost += ctx.costPerJump;
          break;
        }
        case NavAction.Fly: {
          const distDelta = Math.sqrt(
            (x - prevNode.x) ** 2 + (y - prevNode.y) ** 2
          );
          distanceCost += distDelta * ctx.costPerFlyMeter;
          break;
        }
      }

      if (distanceCost > distanceLimit) return;
      let distFromGoal = Math.sqrt(
        (x - toPosition.x) ** 2 + (y - toPosition.y) ** 2
      );
      if (ctx.maxAttackReach) {
        distFromGoal = Math.max(0, distFromGoal - ctx.maxAttackReach);
      }
      const cost = distanceCost + distFromGoal;
      const nextNode: NavChainLink = {
        action,
        x,
        y,
        previous: prevNode,
        distanceCost,
        distFromGoal,
        cost,
        jumpInfo,
        isJumpStart
      };
      if (distFromGoal < bestNode.distFromGoal) bestNode = nextNode;
      frontier.push(nextNode);
    };

    const expandWalk = (node: NavChainLink) => {
      const { x, y } = node;
      checkerBBox.x = x;
      checkerBBox.y = y;
      const hasGround = this.terrain.checkOnSurface(
        checkerBBox,
        ctx.surfaceCheckDepth,
        ctx.surfaceCheckOffset
      );
      if (ctx.motionCapabilities.canFly) {
        checkerBBox.x = x;
        checkerBBox.y = y + this.planRes;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Fly, x, y + this.planRes);
        }
        checkerBBox.x = x;
        checkerBBox.y = y - this.planRes;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Fly, x, y - this.planRes);
        }
        checkerBBox.x = x + this.planRes;
        checkerBBox.y = y;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Fly, x + this.planRes, y);
        }
        checkerBBox.x = x - this.planRes;
        checkerBBox.y = y;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Fly, x - this.planRes, y);
        }
      }
      if (hasGround) {
        checkerBBox.x = x + this.planRes;
        checkerBBox.y = y;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Walk, x + this.planRes, y);
        }
        checkerBBox.x = x - this.planRes;
        checkerBBox.y = y;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Walk, x - this.planRes, y);
        }
        checkerBBox.x = x;
        checkerBBox.y = y - this.planRes;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.FallThrough, x, y - this.planRes);
        }
        checkerBBox.x = x;
        checkerBBox.y = y;
        if (this.terrain.checkCanAscendLeft(checkerBBox, this.planRes)) {
          expand(node, NavAction.Walk, x - this.planRes, y + this.planRes);
        }
        if (this.terrain.checkCanAscendRight(checkerBBox, this.planRes)) {
          expand(node, NavAction.Walk, x + this.planRes, y + this.planRes);
        }
        expand(node, NavAction.Jump, x, y, undefined, true);
      } else {
        checkerBBox.y -= this.planRes;
        if (this.terrain.checkPassable(checkerBBox)) {
          expand(node, NavAction.Fall, x, y - this.planRes);
        } else {
          if (this.debug)
            console.warn(
              "Broken invariant - checker bbox cannot pass terrain but is not on surface?"
            );
        }
      }
    };

    while (frontier.peek() !== undefined) {
      ctx.totalOps++;
      if (ctx.totalOps > ctx.opLimit) break;
      const node = frontier.pop();
      if (node === undefined) {
        if (this.debug)
          console.warn(
            "Broken invariant - frontier pop operation yielded undefined!"
          );
        break;
      }
      const { x, y, action } = node;
      checkerBBox.x = x;
      checkerBBox.y = y;
      if (finalNode !== undefined) {
        if (finalNode.cost < node.cost) break;
      }
      if (ctx.attackTarget) {
        const atkInfo = this.checkAttackCoversTarget(
          ctx,
          x,
          y,
          ctx.attackTarget.x,
          ctx.attackTarget.y
        );
        if (atkInfo) {
          const attackNode: NavChainLink = {
            action: NavAction.Attack,
            x,
            y,
            attackInfo: atkInfo,
            previous: node,
            distanceCost: node.distanceCost,
            distFromGoal: 0,
            cost: node.distanceCost
          };
          if (!finalNode || attackNode.cost < finalNode.cost) {
            finalNode = attackNode;
          }
          continue;
        }
      } else if (goalBBox.contains(x, y)) {
        finalNode = node;
        continue;
      }
      if (node.isJumpStart) {
        const jumpToGoal = this.planJumpInternal(
          ctx,
          node.x,
          node.y,
          toPosition.x,
          toPosition.y
        );
        if (jumpToGoal !== null) {
          const jumpDist = this.measureJump(ctx, jumpToGoal);
          frontier.push({
            previous: node,
            action: NavAction.Jump,
            x: toPosition.x,
            y: toPosition.y,
            jumpInfo: jumpToGoal,
            distanceCost: node.distanceCost + jumpDist,
            distFromGoal: node.distFromGoal + jumpDist,
            cost: node.distanceCost + jumpDist
          });
          continue;
        }
        const potentialJumps = this.getJumps(ctx, node.x, node.y);
        if (potentialJumps === null) continue;
        for (const jump of potentialJumps) {
          expand(node, NavAction.Jump, jump.finalX, jump.finalY, jump);
        }
        continue;
      }
      switch (action) {
        default:
          expandWalk(node);
          break;
      }
    }

    // In best-effort mode, make the best node the final node.
    if (bestEffort && finalNode === undefined) {
      if (this.debug)
        console.log(
          `[NavigationGrid]: Best effort fallback triggered after ${ctx.totalOps} / ${ctx.opLimit} ops.`
        );
      finalNode = bestNode;
    }

    // Convert to output format.
    if (finalNode === undefined) {
      if (this.debug) console.log("[NavigationGrid]: Final node not set.");
      return null;
    }

    const resultPath: NavNode[] = [];
    let node: NavChainLink | null = finalNode;
    while (node !== null) {
      if (node.isJumpStart) {
        node = node.previous;
        continue;
      }
      switch (node.action) {
        case NavAction.Jump:
          if (node.jumpInfo) {
            resultPath.push({
              action: NavAction.Jump,
              x: node.x,
              y: node.y,
              jump: node.jumpInfo
            });
          }
          break;
        case NavAction.Attack:
          if (node.attackInfo) {
            resultPath.push({
              action: NavAction.Attack,
              x: node.x,
              y: node.y,
              attack: node.attackInfo
            });
          }
          break;
        default:
          resultPath.push({
            action: node.action,
            x: node.x,
            y: node.y
          });
          break;
      }
      node = node.previous;
    }
    resultPath.reverse();
    return {
      steps: resultPath
    };
  }
  private checkAttackCoversTarget(
    ctx: InternalNavCtx,
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number
  ): NavAttackInfo | null {
    if (!ctx.attackCapabilities) return null;
    for (const cap of ctx.attackCapabilities) {
      const direction = targetX >= fromX ? 1 : -1;
      const effectiveReachX = cap.range + Math.abs(cap.motion?.dx ?? 0);
      const horizontalDist = Math.abs(targetX - fromX);
      if (horizontalDist > effectiveReachX) continue;
      const verticalRange =
        cap.verticalRange ?? ctx.motionCapabilities.size.y * 0.5;
      const verticalDist = Math.abs(targetY - fromY);
      if (verticalDist > verticalRange) continue;
      if (cap.motion) {
        const dx = cap.motion.dx * direction;
        const dy = cap.motion.dy;
        if (!this.checkAttackMotionClear(ctx, fromX, fromY, dx, dy)) continue;
      }
      return {
        attackId: cap.id,
        range: cap.range,
        motion: cap.motion,
        direction
      };
    }
    return null;
  }
  private checkAttackMotionClear(
    ctx: InternalNavCtx,
    fromX: number,
    fromY: number,
    dx: number,
    dy: number
  ): boolean {
    const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / this.planRes));
    const stepDx = dx / steps;
    const stepDy = dy / steps;
    const checker = ctx.checkerBBox;
    for (let i = 1; i <= steps; i++) {
      checker.x = fromX + stepDx * i;
      checker.y = fromY + stepDy * i;
      if (!this.terrain.checkPassable(checker)) return false;
    }
    return true;
  }
  private checkPathWithAccelerationEmpty(
    ctx: InternalNavCtx,
    vsx: number,
    vsy: number,
    ax: number,
    ay: number,
    dt: number,
    endT: number
  ) {
    const speedLimitX =
      ctx.motionCapabilities.maxAirSpeedX ??
      ctx.motionCapabilities.maxGroundSpeedX ??
      0;
    const speedLimitY = ctx.motionCapabilities.maxAirSpeedY ?? 0;
    if (speedLimitX === undefined || speedLimitY === undefined) return false;
    const terrain = this.terrain;
    const checker = ctx.checkerBBox;
    const initialY = checker.y;
    let vx = vsx;
    let vy = vsy;
    for (let t = 0; t < endT; t += dt) {
      if (vy < 0 && checker.y < initialY) {
        if (!terrain.checkEmpty(checker)) return false;
      } else {
        if (!terrain.checkPassable(checker)) return false;
      }
      // Apply velocity and acceleration to position.
      checker.x += vx * dt + 0.5 * ax * dt * dt;
      checker.y += vy * dt + 0.5 * ay * dt * dt;
      // Apply acceleration to velocity.
      vx += ax * dt;
      vy += ay * dt;
      // Limit velocity.
      if (speedLimitX !== 0) {
        if (vx > speedLimitX) vx = speedLimitX;
        if (vy < -speedLimitX) vx = -speedLimitX;
      }
      if (speedLimitY !== 0) {
        if (vy > speedLimitY) vy = speedLimitY;
        if (vy < -speedLimitY) vy = -speedLimitY;
      }
    }
    return true;
  }
  private measureJump(ctx: InternalNavCtx, jumpInfo: NavJumpInfo) {
    const dt = 0.1;
    let dist = 0;
    let vx = jumpInfo.initialVelocityX;
    let vy = jumpInfo.initialVelocityY;
    const ax = jumpInfo.accelerationX;
    const ay = -ctx.gravity;
    for (let t = 0; t < jumpInfo.airTime; t++) {
      const dx = vx * dt + 0.5 * ax * dt * dt;
      const dy = vy * dt + 0.5 * ay * dt * dt;
      dist += Math.sqrt(dx * dx + dy * dy) * dt;
      // Apply acceleration to velocity.
      vx += ax * dt;
      vy += ay * dt;
    }
    return dist;
  }
  private planJumpInternal(
    ctx: InternalNavCtx,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
  ) {
    if (
      !ctx.motionCapabilities.canJump ||
      ctx.motionCapabilities.maxJumpImpulseY === undefined
    )
      return null;
    const maxJumpHeight = jumpHeightFromVelocity(
      ctx.motionCapabilities.maxJumpImpulseY,
      ctx.gravity
    );
    if (toY - fromY > maxJumpHeight) return null;
    const t = getTimeOfApproach(
      ctx.gravity,
      ctx.motionCapabilities.maxJumpImpulseY,
      toY - fromY
    );
    if (t === -1) return null;
    const checker = ctx.checkerBBox;
    checker.x = fromX;
    checker.y = fromY;
    const deltaX = toX - fromX;
    const xSpeed = deltaX / t;
    if (
      Math.abs(xSpeed) >
      (ctx.motionCapabilities.maxAirSpeedX ??
        ctx.motionCapabilities.maxAirSpeedX ??
        1)
    )
      return null;
    if (
      !this.checkPathWithAccelerationEmpty(
        ctx,
        xSpeed,
        ctx.motionCapabilities.maxJumpImpulseY,
        0,
        -ctx.gravity,
        this.timeStep,
        t
      )
    )
      return null;
    return {
      initialX: fromX,
      initialY: fromY,
      finalX: toX,
      finalY: toY,
      airTime: t,
      initialVelocityX: xSpeed,
      initialVelocityY: ctx.motionCapabilities.maxJumpImpulseY,
      accelerationX: 0,
      accelerationXT: 0,
      decelerateYT: 0
    } satisfies NavJumpInfo;
  }
  private getJumps(
    ctx: InternalNavCtx,
    fromX: number,
    fromY: number,
    maxSpread: number = this.planRes * 16
  ) {
    if (
      !ctx.motionCapabilities.canJump ||
      ctx.motionCapabilities.maxJumpImpulseY === undefined
    )
      return null;
    const maxJumpHeight = jumpHeightFromVelocity(
      ctx.motionCapabilities.maxJumpImpulseY ?? 0,
      ctx.gravity
    );
    const maxXSpeed =
      ctx.motionCapabilities.maxAirSpeedX ??
      ctx.motionCapabilities.maxGroundSpeedX ??
      1;
    const yMin = fromY - 16 * this.planRes;
    const yMax =
      Math.floor((fromY + maxJumpHeight) * this.invPlanRes) * this.planRes;
    const checker = ctx.checkerBBox;
    const newJumps: NavJumpInfo[] = [];
    for (let y = yMax; y >= yMin; y -= this.planRes) {
      const t = getTimeOfApproach(
        ctx.gravity,
        ctx.motionCapabilities.maxJumpImpulseY,
        y - fromY
      );
      if (t === -1) continue;
      const xSpread = Math.min(maxSpread, t * maxXSpeed);
      for (
        let x = Math.ceil(fromX - xSpread);
        x <= Math.floor(fromX + xSpread);
        x += this.planRes
      ) {
        if (ctx.visited.has(x, y)) continue;
        checker.x = x;
        checker.y = y;
        if (
          !this.terrain.checkPassable(checker) ||
          !this.terrain.checkOnSurface(
            checker,
            ctx.surfaceCheckDepth,
            ctx.surfaceCheckOffset
          )
        )
          continue;
        checker.x = fromX;
        checker.y = fromY;
        if (
          this.checkPathWithAccelerationEmpty(
            ctx,
            (x - fromX) / t,
            ctx.motionCapabilities.maxJumpImpulseY,
            0,
            -ctx.gravity,
            this.timeStep,
            t
          )
        ) {
          newJumps.push({
            initialX: fromX,
            initialY: fromY,
            finalX: x,
            finalY: y,
            airTime: t,
            initialVelocityX: (x - fromX) / t,
            initialVelocityY: ctx.motionCapabilities.maxJumpImpulseY ?? 0,
            accelerationX: 0,
            accelerationXT: 0,
            decelerateYT: 0
          });
        }
      }
    }
    return newJumps;
  }
}
