import { RegistryProvider } from "src/api/registry";
import { LevelDefinitionAPI } from "src/engine/level/LevelLoaderAPI";
import { Doxistest } from "src/levels/levels/dev/Doxistest";
import { GC1test } from "src/levels/levels/dev/GC1test";
import { Shrine_1 } from "src/levels/levels/dev/Shrine_1";

import { Customizer } from "./customize/Customizer";
import { Demo_1_1 } from "./demo/Demo_1_1";
import { DemoHallway } from "./demo/Demo_Hallway";
import { Mobile } from "./demo/Mobile";
import {
  ABPuzzleArray01,
  ABPuzzleDataType01,
  ABPuzzleIsEven,
  ABPuzzleModulus01,
  ABPuzzleOperator01
} from "./dev/ABPuzzles";
import { AlvinDev } from "./dev/AlvinDev";
import { BeeQueenPhase1 } from "./dev/BeeQueenPhase1";
import { BigSpellTester } from "./dev/BigSpellTester";
import { CombatZone } from "./dev/CombatZone";
import { DebugFallingLeaf } from "./dev/DebugFallingLeaf";
import { DebugInfiniteFallDeath } from "./dev/DebugInfiniteFallDeath";
import { DebugPlayground } from "./dev/DebugPlayground";
import { DoorsTest } from "./dev/DoorsTest";
import { DoorsTest2 } from "./dev/DoorsTest2";
import { DreTestingRoom } from "./dev/DreTestingRoom";
import { EarthWallTest } from "./dev/EarthWallTest";
import { EchoBossChamber } from "./dev/EchoBossChamber";
import { GeneratedTest } from "./dev/GeneratedTest";
import { GravitySpellQuiz } from "./dev/GravitySpellQuiz";
import { GreenScreen } from "./dev/GreenScreen";
import { IceLevel01 } from "./dev/IceLevel01";
import { LegoEarthLevel } from "./dev/LegoEarthLevel";
import { LegoPuzzle1 } from "./dev/LegoPuzzle1";
import { LegoTestRoom } from "./dev/LegoTestRoom";
import { LongIce } from "./dev/LongIce";
import { ManaDrawTest } from "./dev/ManaDrawTest";
import { MikesPlayground } from "./dev/MikesPlayground";
import { MushroomBounceTest } from "./dev/MushroomBounceTest";
import { OddlyShapedTerrain } from "./dev/OddlyShapedTerrain";
import { QueenArena1 } from "./dev/QueenArena1";
import {
  QueenArena2,
  QueenArena2FallingPlatform
} from "./dev/QueenArena2FallingPlatform";
import {
  QueenArena3,
  QueenArena3FallingSides
} from "./dev/QueenArena3FallingSides";
import {
  Fork,
  RBPuzzle02,
  RBPuzzle03,
  RBPuzzle04,
  RBUntitled01,
  RBUntitled02,
  RBUntitled03
} from "./dev/RBPuzzles";
import { ScalingChallengePuzzle } from "./dev/ScalingChallenge";
import { SignalPlatforms } from "./dev/SignalPlatforms";
import { SimpleTester } from "./dev/SimpleTester";
import { SkillTreeLevel } from "./dev/SkillTreeLevel";
import { SpellTesterLevel } from "./dev/SpellTester";
import { TwoPlatforms } from "./dev/TwoPlatforms";
import { Visualizer } from "./dev/Visualizer";
import { VolcDebugRoom } from "./dev/VolcDebugRoom";
import { VolcDemoLevel1 } from "./dev/VolcDemoLevel1";
import { OLD_Caves_0 } from "./game/OLD-act-1-caves/Caves_0";
import { OLD_Caves_01 } from "./game/OLD-act-1-caves/Caves_01";
import { OLD_Caves_02 } from "./game/OLD-act-1-caves/Caves_02";
import { OLD_Caves_03 } from "./game/OLD-act-1-caves/Caves_03";
import { OLD_Caves_04 } from "./game/OLD-act-1-caves/Caves_04";
import { OLD_Caves_05 } from "./game/OLD-act-1-caves/Caves_05";
import { OLD_Caves_06 } from "./game/OLD-act-1-caves/Caves_06";
import { Dream_0 } from "./game/act-0-dream/Dream_0";
import { Dream_0_327 } from "./game/act-0-dream/Dream_0_327";
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
import { Cryo_1 } from "./game/act-1-cryo/Cryo_1";
import { ShortDemo_0 } from "./game/short-demo/ShortDemo_0";
import { BigShrine_0 } from "./game/shrines/BigShrine_0A";
import { SparkNavShrine } from "./game/shrines/act-2-zone-2-serverfarm/Spark-Nav-Shrine";
import { Shrine01CaveEntrance } from "./game/shrines/entrances/Shrine_01_Caves_Entrance";
import { ShrineHall01 } from "./game/shrines/zone-0-caves/ShrineHall01";
import { Shrine01HelloWorld } from "./game/shrines/zone-0-caves/Shrine_01_Hello_World";
import { Shrine02Variables } from "./game/shrines/zone-0-caves/Shrine_02_Variables";
import { Shrine03Conditionals } from "./game/shrines/zone-0-caves/Shrine_03_Conditionals";
import { Shrine03Ping } from "./game/shrines/zone-0-caves/Shrine_03_Ping";
import { RBHallway1, RBHallway2 } from "./game/to-sort/RBHallways";

const levelsArr: LevelDefinitionAPI<any>[] = [
  // Act 1
  Dream_0_327,
  Dream_0,
  Cryo_0_409, // This is the old version. TODO remove this reference.
  Cryo_0_728,

  // Act 1 caves
  Caves_01,
  Caves_02,
  Caves_03,
  Caves_04,
  Caves_05,
  Caves_06,
  Caves_07,
  Caves_08,
  Caves_09_01,
  Caves_09_02,
  Caves_09_03,
  Caves_09_04,
  Caves_10,
  Caves_10a,
  Caves_11_01,
  Caves_11_02,
  Caves_12,
  Caves_12a,
  Caves_12b,
  Caves_12c,

  OLD_Caves_01,
  OLD_Caves_02,
  OLD_Caves_03,
  OLD_Caves_04,
  OLD_Caves_05,
  OLD_Caves_06,

  // Act 1 shrines.
  Shrine01CaveEntrance,
  ShrineHall01,
  Shrine01HelloWorld,
  Shrine02Variables,
  Shrine03Conditionals,
  Shrine03Ping,

  // New style puzzle wireframes
  RBPuzzle02,
  RBPuzzle03,
  RBPuzzle04,
  Fork,
  RBUntitled01,
  RBUntitled02,
  RBUntitled03,
  ABPuzzleModulus01,
  ABPuzzleDataType01,
  ABPuzzleOperator01,
  ABPuzzleArray01,
  ABPuzzleIsEven,

  // Switching away from these for Act 1.
  Cryo_1,
  OLD_Caves_0,
  // Shrines
  SparkNavShrine,
  BigShrine_0,
  // Dev
  BeeQueenPhase1,
  QueenArena1,
  QueenArena2FallingPlatform,
  QueenArena2,
  QueenArena3FallingSides,
  QueenArena3,
  DemoHallway,
  BigSpellTester,
  SimpleTester,
  Mobile,
  MikesPlayground,
  AlvinDev,
  GreenScreen,
  Shrine_1,
  CombatZone,
  Doxistest,
  VolcDebugRoom,
  VolcDemoLevel1,
  DebugInfiniteFallDeath,
  DebugFallingLeaf,
  GC1test,
  DebugPlayground,
  EchoBossChamber,
  GeneratedTest,
  IceLevel01,
  LongIce,
  EarthWallTest,
  ManaDrawTest,
  MushroomBounceTest,
  TwoPlatforms,
  OddlyShapedTerrain,
  DoorsTest,
  DoorsTest2,
  DreTestingRoom,
  Demo_1_1,
  LegoTestRoom,
  LegoPuzzle1,
  LegoEarthLevel,
  GravitySpellQuiz,
  SignalPlatforms,
  ScalingChallengePuzzle,
  SkillTreeLevel,
  // Short Demo
  ShortDemo_0,
  // Utilities
  Customizer,
  Visualizer,
  SpellTesterLevel,
  // Demo stuff
  RBHallway1,
  RBHallway2
];

export class LevelsRegistry implements RegistryProvider<LevelDefinitionAPI> {
  private data = new Map<string, LevelDefinitionAPI>();
  constructor(baseLevels: LevelDefinitionAPI[]) {
    for (const levelDef of baseLevels) this.add(levelDef.id, levelDef);
  }
  keys() {
    return [...this.data.keys()];
  }
  all() {
    return [...this.data.values()];
  }
  add(key: string, obj: LevelDefinitionAPI) {
    this.data.set(key, obj);
  }
  get(key: string) {
    return this.data.get(key) ?? null;
  }
}

export const levelsRegistry = new LevelsRegistry(levelsArr);
