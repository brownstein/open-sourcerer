import {
  MotionCapabilities,
  NavAction,
  NavTerrainBlockType,
  PathPlanRequest
} from "src/api/navigation";

import { NavigationGrid } from "./NavigationGrid";
import { TerrainWithObstacles } from "./Terrain";

/**
 * Creates a flat terrain: 20 units wide, 10 tall, scale 1.
 * Solid floor at y=0 and y=1. Empty above.
 * A 1x1 entity with planRes=1 walks at bbox y=3.
 */
function createFlatTerrain(): TerrainWithObstacles {
  const terrain = new TerrainWithObstacles(20, 10, 1, 1, 0, 0);
  for (let x = 0; x < 20; x++) {
    terrain.mark(x, 0, NavTerrainBlockType.Solid);
    terrain.mark(x, 1, NavTerrainBlockType.Solid);
  }
  return terrain;
}

const PLAN_RES = 1;
const DEFAULT_GRAVITY = 20;

function createGrid(terrain?: TerrainWithObstacles): NavigationGrid {
  return new NavigationGrid(
    terrain ?? createFlatTerrain(),
    PLAN_RES,
    DEFAULT_GRAVITY
  );
}

/** Base motion capabilities — no attacks, no jump, no fly. */
const BASE_MC: MotionCapabilities = {
  size: { x: 1, y: 1 },
  maxGroundSpeedX: 6,
  maxGroundAccelX: 0.05
};

/**
 * After planRes snapping a 1x1 entity starting at raw y=2 ends up at
 * bbox y=3. Set attackTarget y=3 so vertical distance is 0 and the
 * default verticalRange (size.y * 0.5 = 0.5) is never the limiting factor.
 */
const ENTITY_Y = 3;

describe("NavigationGrid", () => {
  describe("attack-aware pathfinding", () => {
    it("plans a normal path without Attack steps when attackTarget is not set", () => {
      const grid = createGrid();
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: BASE_MC,
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      expect(result!.steps.length).toBeGreaterThan(0);
      const attackSteps = result!.steps.filter(
        (s) => s.action === NavAction.Attack
      );
      expect(attackSteps).toHaveLength(0);
    });

    it("ends path with an Attack step when attackTarget is set", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 1.5 }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      expect(result!.steps.length).toBeGreaterThan(1);
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
    });

    it("stops within attack range, not at the target itself", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 2 }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
      const distToTarget = Math.abs(10 - lastStep.x);
      expect(distToTarget).toBeLessThanOrEqual(2);
      expect(distToTarget).toBeGreaterThan(0);
    });

    it("sets direction=1 when the target is to the right", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 1.5 }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
      if (lastStep.action === NavAction.Attack) {
        expect(lastStep.attack.direction).toBe(1);
        expect(lastStep.attack.attackId).toBe("slash");
      }
    });

    it("sets direction=-1 when approaching from the right", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 1.5 }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 15, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
      if (lastStep.action === NavAction.Attack) {
        expect(lastStep.attack.direction).toBe(-1);
      }
    });

    it("produces an Attack on the first step when already in range", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 2 }]
      };
      // Raw x=8 snaps to bbox x=9, dist to target x=10 is 1 <= range 2.
      const result = grid.planPathSync({
        fromPosition: { x: 8, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      expect(result!.steps.length).toBeLessThanOrEqual(3);
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
    });

    it("extends effective reach with lunge motion", () => {
      const grid = createGrid();
      const mcWithLunge: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [
          { id: "lunge", range: 1, motion: { dx: 2, dy: 0 } }
        ]
      };
      const mcWithoutLunge: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 1 }]
      };
      const baseReq: PathPlanRequest = {
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        attackTarget: { x: 10, y: ENTITY_Y },
        motionCapabilities: mcWithLunge,
        bestEffort: true,
        distanceLimit: 32
      };

      const resultLunge = grid.planPathSync(baseReq);
      const resultNoLunge = grid.planPathSync({
        ...baseReq,
        motionCapabilities: mcWithoutLunge
      });

      expect(resultLunge).not.toBeNull();
      expect(resultNoLunge).not.toBeNull();

      const lastLunge = resultLunge!.steps[resultLunge!.steps.length - 1];
      const lastNoLunge = resultNoLunge!.steps[resultNoLunge!.steps.length - 1];
      expect(lastLunge.action).toBe(NavAction.Attack);
      expect(lastNoLunge.action).toBe(NavAction.Attack);

      // Lunge entity should stop further from the target.
      const distLunge = Math.abs(10 - lastLunge.x);
      const distNoLunge = Math.abs(10 - lastNoLunge.x);
      expect(distLunge).toBeGreaterThan(distNoLunge);
    });

    it("includes attack motion info in the Attack step", () => {
      const grid = createGrid();
      const motion = { dx: 1.5, dy: 0 };
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "lunge-slash", range: 1, motion }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
      if (lastStep.action === NavAction.Attack) {
        expect(lastStep.attack.attackId).toBe("lunge-slash");
        expect(lastStep.attack.motion).toEqual(motion);
        expect(lastStep.attack.range).toBe(1);
      }
    });

    it("does not attack when lunge path is blocked by a wall", () => {
      const terrain = createFlatTerrain();
      // Wall at x=9 blocks the lunge path from x=8 toward x=10+.
      for (let y = 2; y < 10; y++) {
        terrain.mark(9, y, NavTerrainBlockType.Solid);
      }
      const grid = createGrid(terrain);
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [
          { id: "lunge", range: 1, motion: { dx: 2, dy: 0 } }
        ]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 12, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 11, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const attackSteps = result!.steps.filter(
        (s) => s.action === NavAction.Attack
      );
      expect(attackSteps).toHaveLength(0);
    });

    it("falls back to normal pathfinding when no attack capabilities exist", () => {
      const grid = createGrid();
      // attackTarget is set but BASE_MC has no attackCapabilities.
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: BASE_MC,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const attackSteps = result!.steps.filter(
        (s) => s.action === NavAction.Attack
      );
      expect(attackSteps).toHaveLength(0);
    });

    it("selects the first matching attack capability at the chosen range", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [
          { id: "short-slash", range: 0.5 },
          { id: "long-slash", range: 3 }
        ]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const lastStep = result!.steps[result!.steps.length - 1];
      expect(lastStep.action).toBe(NavAction.Attack);
      if (lastStep.action === NavAction.Attack) {
        // At the outermost attack position only long-slash can reach.
        expect(lastStep.attack.attackId).toBe("long-slash");
      }
    });

    it("returns bestEffort path without Attack when target is behind a wall", () => {
      const terrain = createFlatTerrain();
      for (let y = 2; y < 10; y++) {
        terrain.mark(7, y, NavTerrainBlockType.Solid);
      }
      const grid = createGrid(terrain);
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 1.5 }]
      };
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 12, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 12, y: ENTITY_Y },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const attackSteps = result!.steps.filter(
        (s) => s.action === NavAction.Attack
      );
      expect(attackSteps).toHaveLength(0);
    });

    it("does not attack when vertical distance exceeds verticalRange", () => {
      const grid = createGrid();
      const mc: MotionCapabilities = {
        ...BASE_MC,
        attackCapabilities: [{ id: "slash", range: 3, verticalRange: 0.1 }]
      };
      // Target y=6 is far above entity y=3, exceeding verticalRange=0.1.
      const result = grid.planPathSync({
        fromPosition: { x: 2, y: 2 },
        toPosition: { x: 10, y: 2 },
        motionCapabilities: mc,
        attackTarget: { x: 10, y: 6 },
        bestEffort: true,
        distanceLimit: 32
      });
      expect(result).not.toBeNull();
      const attackSteps = result!.steps.filter(
        (s) => s.action === NavAction.Attack
      );
      expect(attackSteps).toHaveLength(0);
    });
  });
});
