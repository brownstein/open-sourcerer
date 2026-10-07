import { Direction } from "src/api/directions";
import {
  DefaultDoorId,
  LevelAdjacencies,
  MapOfLevelAdjacencies
} from "src/api/level";
import { selectLevelAdjacencyOverrides } from "src/redux/gameState/selectors";
import { store } from "src/redux/store";

import { OLD_Caves_01 } from "./game/OLD-act-1-caves/Caves_01";
import { OLD_Caves_02 } from "./game/OLD-act-1-caves/Caves_02";
import { OLD_Caves_03 } from "./game/OLD-act-1-caves/Caves_03";
import { OLD_Caves_04 } from "./game/OLD-act-1-caves/Caves_04";
import { OLD_Caves_05 } from "./game/OLD-act-1-caves/Caves_05";
import { OLD_Caves_06 } from "./game/OLD-act-1-caves/Caves_06";
import { Caves_01 } from "./game/act-1-caves/Caves_01";
import { Caves_02 } from "./game/act-1-caves/Caves_02";
import { Caves_03 } from "./game/act-1-caves/Caves_03";
import { Caves_04 } from "./game/act-1-caves/Caves_04";
import { Caves_05 } from "./game/act-1-caves/Caves_05";
import { Caves_06 } from "./game/act-1-caves/Caves_06";
import { Caves_07 } from "./game/act-1-caves/Caves_07";
import { Caves_08 } from "./game/act-1-caves/Caves_08";
import { Caves_09_01 } from "./game/act-1-caves/Caves_09_01";
import { Caves_09_02 } from "./game/act-1-caves/Caves_09_02";
import { Caves_09_03 } from "./game/act-1-caves/Caves_09_03";
import { Caves_09_04 } from "./game/act-1-caves/Caves_09_04";
import { Caves_10 } from "./game/act-1-caves/Caves_10";
import { Caves_10a } from "./game/act-1-caves/Caves_10a";
import { Caves_11_01 } from "./game/act-1-caves/Caves_11_01";
import { Caves_11_02 } from "./game/act-1-caves/Caves_11_02";
import { Caves_12 } from "./game/act-1-caves/Caves_12";
import { Caves_12a } from "./game/act-1-caves/Caves_12a";
import { Caves_12b } from "./game/act-1-caves/Caves_12b";
import { Caves_12c } from "./game/act-1-caves/Caves_12c";
import { Cryo_0_409 } from "./game/act-1-cryo/Cryo_0_409";
import { Cryo_0_728 } from "./game/act-1-cryo/Cryo_0_728";
import { Shrine01CaveEntrance } from "./game/shrines/entrances/Shrine_01_Caves_Entrance";

const defaultLevelAdjacencies: MapOfLevelAdjacencies = {
  /*
   * ==================================================================
   *    ACT 1
   * ==================================================================
   */
  [Cryo_0_728.id]: {
    sides: {
      [Direction.right]: Caves_01.id
    }
  },

  /*
   * ==================================================================
   *    ACT 1 CAVES
   * ==================================================================
   */
  [Caves_01.id]: {
    sides: {
      [Direction.left]: Cryo_0_728.id,
      [Direction.right]: Caves_02.id
    }
  },
  [Caves_02.id]: {
    sides: {
      [Direction.left]: Caves_01.id,
      [Direction.right]: Caves_03.id,
      [Direction.down]: Caves_07.id
    }
  },
  [Caves_03.id]: {
    sides: {
      [Direction.left]: Caves_02.id,
      [Direction.up]: Caves_04.id,
      [Direction.down]: Caves_09_01.id
    }
  },
  [Caves_04.id]: {
    sides: {
      [Direction.down]: Caves_03.id,
      [Direction.right]: Caves_05.id
    }
  },
  [Caves_05.id]: {
    sides: {
      [Direction.left]: Caves_04.id,
      [Direction.right]: Caves_06.id
    }
  },
  [Caves_06.id]: {
    sides: {
      [Direction.left]: Caves_05.id
    }
  },
  [Caves_07.id]: {
    sides: {
      [Direction.up]: Caves_02.id,
      [Direction.right]: Caves_08.id
    }
  },
  [Caves_08.id]: {
    sides: {
      [Direction.left]: Caves_07.id
    }
  },
  [Caves_09_01.id]: {
    sides: {
      [Direction.up]: Caves_03.id,
      [Direction.right]: Caves_09_02.id
    }
  },
  [Caves_09_02.id]: {
    sides: {
      [Direction.left]: Caves_09_01.id,
      [Direction.right]: Caves_09_03.id
    }
  },
  [Caves_09_03.id]: {
    sides: {
      [Direction.left]: Caves_09_02.id,
      [Direction.right]: Caves_09_04.id
    }
  },
  [Caves_09_04.id]: {
    sides: {
      [Direction.left]: Caves_09_03.id,
      [Direction.right]: Caves_11_01.id
    }
  },
  [Caves_10.id]: {
    sides: {
      [Direction.up]: Caves_10a.id,
      [Direction.down]: Caves_11_01.id
    }
  },
  [Caves_10a.id]: {
    sides: {
      [Direction.down]: Caves_10.id
    }
  },
  [Caves_11_01.id]: {
    sides: {
      [Direction.left]: Caves_09_04.id,
      [Direction.up]: Caves_10.id,
      [Direction.down]: Caves_11_02.id
    }
  },
  [Caves_11_02.id]: {
    sides: {
      [Direction.up]: Caves_11_01.id,
      [Direction.down]: Caves_12.id
    }
  },
  [Caves_12.id]: {
    sides: {
      [Direction.up]: Caves_11_02.id
    },
    doors: {
      a: [Caves_12a.id],
      b: [Caves_12b.id],
      c: [Caves_12c.id]
    }
  },
  [Caves_12a.id]: {
    sides: {
      [Direction.right]: Caves_12.id
    }
  },
  [Caves_12b.id]: {
    sides: {
      [Direction.right]: Caves_12.id
    }
  },
  [Caves_12c.id]: {
    sides: {
      [Direction.right]: Caves_12.id
    }
  },

  /*
   * ==================================================================
   *    OLD CAVE LEVELS
   * ==================================================================
   */
  [OLD_Caves_01.id]: {
    sides: {
      [Direction.left]: Cryo_0_409.id,
      [Direction.right]: OLD_Caves_02.id
    }
  },
  [OLD_Caves_02.id]: {
    sides: {
      [Direction.left]: OLD_Caves_01.id,
      [Direction.right]: OLD_Caves_03.id
    }
  },
  [OLD_Caves_03.id]: {
    sides: {
      [Direction.left]: OLD_Caves_02.id,
      [Direction.right]: OLD_Caves_04.id
    }
  },
  [OLD_Caves_04.id]: {
    sides: {
      [Direction.left]: OLD_Caves_03.id,
      [Direction.right]: OLD_Caves_05.id
    }
  },
  [OLD_Caves_05.id]: {
    sides: {
      [Direction.left]: OLD_Caves_04.id,
      [Direction.right]: OLD_Caves_06.id
    }
  },
  [OLD_Caves_06.id]: {
    sides: {
      [Direction.left]: OLD_Caves_05.id,
      [Direction.right]: Shrine01CaveEntrance.id
    }
  },
  [Shrine01CaveEntrance.id]: {
    sides: {
      [Direction.left]: OLD_Caves_06.id
    }
  },

  /*
   * ==================================================================
   *    DEV LEVELS
   * ==================================================================
   */
  SimpleTester: {
    sides: {
      [Direction.left]: "DoorsTest",
      [Direction.right]: "MikesPlayground"
    }
  },
  MikesPlayground: {
    sides: {
      [Direction.left]: "SimpleTester"
    }
  },
  DoorsTest: {
    sides: {
      [Direction.left]: "DoorsTest2",
      [Direction.up]: "DoorsTest2",
      [Direction.down]: "DoorsTest2"
    },
    doors: {
      A: ["SimpleTester"],
      B: ["DoorsTest2"]
    }
  },
  DoorsTest2: {
    sides: {
      [Direction.left]: "DoorsTest",
      [Direction.up]: "DoorsTest",
      [Direction.down]: "DoorsTest"
    },
    doors: {
      A: ["SimpleTester"],
      B: ["DoorsTest"]
    }
  },

  RBHallway1: {
    sides: {
      [Direction.right]: "RBHallway2"
    }
  },
  RBHallway2: {
    sides: {
      [Direction.left]: "RBHallway1"
    }
  }
};

function getLevelAdjacencies(): Record<string, LevelAdjacencies> {
  const state = store.getState();
  const stateAdjacencies = selectLevelAdjacencyOverrides(state);
  const keySet = new Set([
    ...Object.keys(defaultLevelAdjacencies),
    ...Object.keys(stateAdjacencies ?? {})
  ]);
  const result: Record<string, LevelAdjacencies> = {};
  for (const key of keySet) {
    result[key] = {
      sides: {
        ...defaultLevelAdjacencies[key]?.sides,
        ...stateAdjacencies?.[key]?.sides
      },
      doors: {
        ...defaultLevelAdjacencies[key]?.doors,
        ...stateAdjacencies?.[key]?.doors
      }
    };
  }
  return result;
}

export function getNextLevelIdForWalkingTransition(
  currentLevel: string,
  direction: Direction,
  doorId?: string
): string | null {
  const adjacencies = getLevelAdjacencies()[currentLevel];
  if (!adjacencies) return null;
  if (doorId !== undefined) {
    if (adjacencies.doors?.[doorId])
      return adjacencies.doors[doorId][0] ?? null;
  }
  const directionDoors = adjacencies.sides?.[direction] ?? null;
  if (Array.isArray(directionDoors)) {
    return directionDoors.at(0) ?? null;
  }
  return directionDoors ?? null;
}

export function getNextLevelIdForDoorTransition(
  currentLevel: string,
  doorId?: string
) {
  const adjacencies = getLevelAdjacencies()[currentLevel];
  if (!adjacencies) return null;
  return adjacencies.doors?.[doorId ?? DefaultDoorId] ?? null;
}
