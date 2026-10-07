import { EntityClassType } from "src/api/entity";
import { RegistryProvider } from "src/api/registry";
import { AreaTrigger } from "src/entities/environment/AreaTrigger";

import { JSLogo } from "./demo/JSLogo";
import { HelloWorld } from "./dev/HelloWorld";
import { NavigationTester } from "./dev/NavigationTester";
import { PhysicsDebugger } from "./dev/PhysicsDebugger";
import { WolfTest } from "./dev/WolfTest";
import { DeerBot } from "./enemies/DeerBot";
import { WolfBandit } from "./enemies/WolfBandit";
import { Echo } from "./enemies/bosses/echo/Echo";
import { EchoAnimationCycler } from "./enemies/bosses/echo/EchoAnimationCycler";
import { EchoControlTester } from "./enemies/bosses/echo/EchoControlTester";
import { GaianBoss } from "./enemies/bosses/gaian/GaianBoss";
import { Bat } from "./enemies/critters/Bat";
import { Bee } from "./enemies/critters/Bee";
import { BigSlime } from "./enemies/critters/BigSlime";
import { Brute } from "./enemies/critters/Brute";
import { EnemyRunner } from "./enemies/critters/EnemyRunner";
import { Gnull } from "./enemies/critters/Gnull";
import { Grub } from "./enemies/critters/Grub";
import { IntroDeer } from "./enemies/critters/IntroDeer";
import { Mimic } from "./enemies/critters/Mimic";
import { PlantShield } from "./enemies/critters/PlantShield/PlantShield";
import { Slime } from "./enemies/critters/Slime";
import { WalkerThatShoot } from "./enemies/critters/WalkerThatShoot";
import { WallCrawler } from "./enemies/critters/WallCrawler";
import { BeeQueen } from "./enemies/critters/bees/BeeQueen";
import { RapierBee } from "./enemies/critters/bees/RapierBee";
import { SpellingBee } from "./enemies/critters/bees/SpellingBee";
import { WorkerBee } from "./enemies/critters/bees/WorkerBee";
import { GryphonWarrior } from "./enemies/major/GryphonWarrior";
import { Drill } from "./enemies/robots/Drill";
import { Dummy, DummyFloat, DummySword } from "./enemies/robots/Dummy";
import { FlyingShooter } from "./enemies/robots/FlyingShooter";
import { ForestBot } from "./enemies/robots/ForestBot";
import { RobotSpider } from "./enemies/robots/RobotSpider";
import { UtilityBot } from "./enemies/robots/UtilityBot";
import { Turret } from "./enemies/robots/turret/Turret";
import { HiveSpawner, NestSpawner, Spawner } from "./enemies/spawners/Spawner";
import { AreaHitSwitch } from "./environment/AreaHitSwitch";
import { BGSmoke } from "./environment/BGSmoke";
import { BeanBotDock } from "./environment/BeanBotDock";
import { BouncyMushroom } from "./environment/BouncyMushroom";
import { BrokenDoor } from "./environment/BrokenDoor";
import { CameraZone } from "./environment/CameraZone";
import { CavesEndGate } from "./environment/CavesEndGate";
import { Chest } from "./environment/Chest";
import { Doorway } from "./environment/Doorway";
import { EmbeddedDoorway } from "./environment/EmbeddedDoorway";
import { EncryptedWallText } from "./environment/EncryptedWallText";
import { ExplodingBarrel } from "./environment/ExplodingBarrel";
import { ForestBackground } from "./environment/ForestBackground";
import { ForestBackground1 } from "./environment/ForestBackground1";
import { ForestBackground2 } from "./environment/ForestBackground2";
import { HintGlimmer } from "./environment/HintGlimmer";
import { ManaFountain } from "./environment/ManaFountain";
import { Marker } from "./environment/Marker";
import { MotionPath } from "./environment/MotionPath";
import { NebulaBackground } from "./environment/NebulaBackground";
import { OpeningSceneBed } from "./environment/OpeningSceneBed";
import { ReflectiveWater } from "./environment/ReflectiveWater";
import { ResizableTerrain } from "./environment/ResizableTerrain";
import { RoomTransition } from "./environment/RoomTransition";
import { SavePoint } from "./environment/SavePoint";
import { ShrineBackground } from "./environment/ShrineBackground";
import { ShrineBridge } from "./environment/ShrineBridge";
import { ShrineBridgeTiled } from "./environment/ShrineBridgeTiled";
import { ShrineDarkness } from "./environment/ShrineDarkness";
import { ShrineDoor } from "./environment/ShrineDoor";
import { ShrineEntranceBackground } from "./environment/ShrineEntranceBackground";
import { ShrineGodRay } from "./environment/ShrineGodRay";
import { ShrineSparkle } from "./environment/ShrineSparkle";
import { SolidColorBackground } from "./environment/SolidColorBackground";
import { SolidColorForeground } from "./environment/SolidColorForeground";
import { SpellText } from "./environment/SpellText";
import { Switch } from "./environment/Switch";
import { Text } from "./environment/Text";
import { TextPixelated } from "./environment/TextPixelated";
import { ToggleableTerrain } from "./environment/ToggleableTerrain";
import { VortexBackground } from "./environment/VortexBackground";
import { WoodPile } from "./environment/WoodPile";
import { AncientConsole } from "./environment/coding/AncientConsole";
import { ArrayResizableTerrain } from "./environment/coding/ArrayResizableTerrain";
import { ConsoleLogTerrain } from "./environment/coding/ConsoleLogTerrain";
import { HitSignal } from "./environment/connectors/HitSignal";
import { IOAddNode } from "./environment/connectors/IOAddNode";
import { IOAndGateNode } from "./environment/connectors/IOAndGateNode";
import { IOArithmeticNode } from "./environment/connectors/IOArithmeticNode";
import { IOCameraRequestNode } from "./environment/connectors/IOCameraRequestNode";
import { IOChangedNode } from "./environment/connectors/IOChangedNode";
import { IOClockNode } from "./environment/connectors/IOClockNode";
import { IOConstantNode } from "./environment/connectors/IOConstantNode";
import { IOConversationNode } from "./environment/connectors/IOConversationNode";
import { IOCounterNode } from "./environment/connectors/IOCounterNode";
import { IOCustomNode } from "./environment/connectors/IOCustomNode";
import { IOCutsceneNode } from "./environment/connectors/IOCutsceneNode";
import { IODataTypeNode } from "./environment/connectors/IODataTypeNode";
import { IODelayNode } from "./environment/connectors/IODelayNode";
import { IODisplayNode } from "./environment/connectors/IODisplayNode";
import { IODivideNode } from "./environment/connectors/IODivideNode";
import { IOEqualsNode } from "./environment/connectors/IOEqualsNode";
import { IOFilterNode } from "./environment/connectors/IOFilterNode";
import { IOGateNode } from "./environment/connectors/IOGateNode";
import { IOGlobalReceiverNode } from "./environment/connectors/IOGlobalReceiverNode";
import { IOGlobalTransmitterNode } from "./environment/connectors/IOGlobalTransmitterNode";
import { IOHoldNode } from "./environment/connectors/IOHoldNode";
import { IOIncrementNode } from "./environment/connectors/IOIncrementNode";
import { IOLinkNode } from "./environment/connectors/IOLinkNode";
import { IOModulusNode } from "./environment/connectors/IOModulusNode";
import { IOMultiplyNode } from "./environment/connectors/IOMultiplyNode";
import { IONegateNode } from "./environment/connectors/IONegateNode";
import { IOOperatorNode } from "./environment/connectors/IOOperatorNode";
import { IOOrGateNode } from "./environment/connectors/IOOrGateNode";
import { IOPlayerLockNode } from "./environment/connectors/IOPlayerLockNode";
import { IOReceiverNode } from "./environment/connectors/IOReceiverNode";
import { IOSetResetNode } from "./environment/connectors/IOSetResetNode";
import { IOSubtractNode } from "./environment/connectors/IOSubtractNode";
import { IOInput, IOOutput } from "./environment/connectors/IOTerminals";
import { IOToggleNode } from "./environment/connectors/IOToggleNode";
import { IOTransmitterNode } from "./environment/connectors/IOTransmitterNode";
import { SignalJunction } from "./environment/connectors/SignalJunction";
import { WireConnector } from "./environment/connectors/WireConnector";
import { TechDoor } from "./environment/doors/TechDoor";
import { FallingLeaf } from "./environment/hazards/FallingLeaf";
import { FallingTerrain } from "./environment/hazards/FallingTerrain";
import { Piston } from "./environment/hazards/Piston";
import { Spikes } from "./environment/hazards/Spikes";
import { SpellTurret } from "./environment/machines/SpellTurret";
import { AdanaProgressMeter } from "./environment/shrines/AdanaProgressMeter";
import { ShrineHelix } from "./environment/shrines/ShrineHelix";
import { ShrineHubTitleDisplay } from "./environment/shrines/ShrineHubTitleDisplay";
import { ShrineTerminal } from "./environment/shrines/ShrineTerminal";
import { SpiritDoor } from "./environment/shrines/SpiritDoor";
import { EchoDoorSpawner } from "./environment/spawners/EchoDoorSpawner";
import { IntroSeqTitleOverlay } from "./environment/special/cryo/IntroSeqTitleOverlay";
import { CrystalTorch } from "./environment/switches/CrystalTorch";
import { AdanaInitialDialog } from "./environment/virtual/AdanaInitialDialog";
import { FauxUnitTestProgress } from "./environment/virtual/FauxUnitTestProgress";
import { MakeItem } from "./environment/virtual/MakeItem";
import { ParenthesisBloom } from "./environment/virtual/ParenthesisBloom";
import { ProgressiveDrawLine } from "./environment/virtual/ProgressiveDrawLine";
import { Currency } from "./items/Currency";
import { DroppedSpell } from "./items/DroppedSpell";
import { Junk } from "./items/Junk";
import { PlayerPickup } from "./items/PlayerPickup";
import { Potion } from "./items/Potion";
import { Adana } from "./npcs/adana/Adana";
import { DogNPC } from "./npcs/all-characters/DogNPC";
import { BeanBot } from "./npcs/bean-bot/BeanBot";
import { VillageNPC } from "./npcs/village/VillageNPCs";
import { FireballExplosionStub } from "src/multiplayer/stubs/FireballExplosionStub";
import { FireballStub } from "src/multiplayer/stubs/FireballStub";
import { GenericProjectileStub } from "src/multiplayer/stubs/GenericProjectileStub";
import { HadoukenStub } from "src/multiplayer/stubs/HadoukenStub";
import { ManaSparkStub } from "src/multiplayer/stubs/ManaSparkStub";
import { PlayerStub } from "src/multiplayer/stubs/PlayerStub";

import { Player } from "./player/Player";
import { PlayerCoalesce } from "./player/PlayerCoalesce";
import { PlayerShrineCoalesce } from "./player/PlayerShrineCoalesce";
import { Draggable } from "./runes/Draggable";
import { DropZone } from "./runes/DropZone";
import { Rune, RuneSocket, RuneValueRecipient } from "./runes/Rune";
import { RuneConnectionSplitter, RuneConnector } from "./runes/RuneConnector";
import { HitArea } from "./shared/HitArea";
import { SharedAssets } from "./shared/SharedAssets";
import { SpellAreaPreview } from "./spells/area-preview/SpellAreaPreview";
import { FireBlast } from "./spells/blasts/FireBlast";
import { FireballExplosion } from "./spells/blasts/FireballExplosion";
import { EarthBlock } from "./spells/earth/EarthBlockEntity";
import { GrappleLine } from "./spells/grapple/GrappleLine";
import { Ping } from "./spells/ping/Ping";
import { Fireball } from "./spells/projectiles/Fireball";
import { GenericProjectile } from "./spells/projectiles/GenericProjectile";
import { Hadouken } from "./spells/projectiles/Hadouken";
import { Sensor } from "./spells/sensor/Sensor";
import { ManaSpark } from "./spells/spark/ManaSpark";
import { ManaTransferBeam } from "./spells/spark/ManaTransferBeam";
import { MovingTerrain } from "./terrain/MovingTerrain";
import { WaterTerrain } from "./terrain/WaterTerrain";
import { AimHelper } from "./ui/AimHelper";
import { DrawHelper } from "./ui/DrawHelper";
import { KeyPromptArea } from "./ui/KeyPromptArea";
import { KeyboardKeyPrompt } from "./ui/KeyboardKeyPrompt";
import { OverlayConversation } from "./ui/OverlayConversation";
import { PopoverConversation } from "./ui/PopoverConversation";
import { SkillTreeConnection, SkillTreeNode } from "./ui/SkillTreeContent";

export const allEntities: EntityClassType[] = [
  HelloWorld,
  PhysicsDebugger,
  NavigationTester,
  JSLogo,
  ForestBackground,
  SharedAssets,
  Player,
  PlayerCoalesce,
  PlayerShrineCoalesce,
  PlayerStub,
  FireballStub,
  GenericProjectileStub,
  HadoukenStub,
  FireballExplosionStub,
  ManaSparkStub,
  WolfBandit,
  UtilityBot,
  EnemyRunner,
  ForestBot,
  DroppedSpell,
  Text,
  RoomTransition,
  SavePoint,
  KeyboardKeyPrompt,
  KeyPromptArea,
  HintGlimmer,
  Potion,
  Currency,
  GaianBoss,
  ManaFountain,
  ManaSpark,
  AimHelper,
  Ping,
  WallCrawler,
  DeerBot,
  Bee,
  DropZone,
  Draggable,
  Doorway,
  OpeningSceneBed,
  VillageNPC,
  PopoverConversation,
  Junk,
  Rune,
  RuneSocket,
  RuneValueRecipient,
  RuneConnector,
  RuneConnectionSplitter,
  ShrineDoor,
  MovingTerrain,
  MotionPath,
  EmbeddedDoorway,
  SolidColorBackground,
  Marker,
  WoodPile,
  ForestBackground1,
  PlayerPickup,
  Slime,
  BigSlime,
  Adana,
  OverlayConversation,
  FireBlast,
  FireballExplosion,
  GryphonWarrior,
  Bat,
  ForestBackground2,
  IntroDeer,
  PlantShield,
  Brute,
  Mimic,
  Gnull,
  AreaTrigger,
  AreaHitSwitch,
  ShrineEntranceBackground,
  FlyingShooter,
  ConsoleLogTerrain,
  Spawner,
  HiveSpawner,
  NestSpawner,
  WalkerThatShoot,
  Hadouken,
  Drill,
  RobotSpider,
  WaterTerrain,
  Sensor,
  SpellAreaPreview,
  BGSmoke,
  FauxUnitTestProgress,
  ParenthesisBloom,
  ProgressiveDrawLine,
  MakeItem,
  Fireball,
  GenericProjectile,
  Dummy,
  AdanaInitialDialog,
  SolidColorForeground,
  BeanBot,
  BeanBotDock,
  WolfTest,
  DummyFloat,
  DummySword,
  Chest,
  ExplodingBarrel,
  BrokenDoor,
  TechDoor,
  CavesEndGate,
  Switch,
  EarthBlock,
  DrawHelper,
  FallingTerrain,
  Piston,
  Spikes,
  ShrineTerminal,
  ReflectiveWater,
  NebulaBackground,
  ShrineBackground,
  ShrineBridge,
  ShrineBridgeTiled,
  ShrineDarkness,
  ShrineGodRay,
  ShrineHelix,
  ShrineSparkle,
  VortexBackground,
  FallingLeaf,
  SpiritDoor,
  ShrineHubTitleDisplay,
  HitArea,
  BeeQueen,
  RapierBee,
  WorkerBee,
  Grub,
  CameraZone,
  Turret,
  Echo,
  ToggleableTerrain,
  ResizableTerrain,
  ArrayResizableTerrain,
  EchoAnimationCycler,
  EchoControlTester,
  ManaTransferBeam,
  DogNPC,
  GrappleLine,
  EncryptedWallText,
  IntroSeqTitleOverlay,
  CrystalTorch,
  AncientConsole,
  WireConnector,
  HitSignal,
  SignalJunction,
  IOInput,
  IOOutput,
  IOCustomNode,
  IOAndGateNode,
  IOChangedNode,
  IOConstantNode,
  IOCounterNode,
  IODataTypeNode,
  IODisplayNode,
  IOGateNode,
  IOHoldNode,
  IOIncrementNode,
  IOModulusNode,
  IONegateNode,
  IOOperatorNode,
  IOSetResetNode,
  IOToggleNode,
  IOTransmitterNode,
  IOReceiverNode,
  IOGlobalTransmitterNode,
  IOGlobalReceiverNode,
  IOAddNode,
  IOArithmeticNode,
  IOCameraRequestNode,
  IOClockNode,
  IODelayNode,
  IODivideNode,
  IOEqualsNode,
  IOFilterNode,
  IOLinkNode,
  IOCutsceneNode,
  IOPlayerLockNode,
  IOConversationNode,
  IOMultiplyNode,
  IOOrGateNode,
  IOSubtractNode,
  AdanaProgressMeter,
  BouncyMushroom,
  TextPixelated,
  SpellText,
  SpellingBee,
  EchoDoorSpawner,
  SpellTurret,
  SkillTreeNode,
  SkillTreeConnection
];

// Provide a registry for entity classes so that we can mutate the available classes at runtime.
class EntityClassRegistry implements RegistryProvider<EntityClassType> {
  private classesByKey = new Map<string, EntityClassType>();
  private classesByExtraTypes = new Map<string, EntityClassType>();
  constructor() {
    for (const entityClass of allEntities)
      this.add(entityClass.type, entityClass);
  }
  keys() {
    return [...this.classesByKey.keys(), ...this.classesByExtraTypes.keys()];
  }
  get(key: string) {
    return (
      this.classesByKey.get(key) ?? this.classesByExtraTypes.get(key) ?? null
    );
  }
  getAll() {
    return [...this.classesByKey.values()];
  }
  add(_key: string, clazz: EntityClassType) {
    this.classesByKey.set(clazz.type, clazz);
    if (clazz.matchAdditionalTypes) {
      for (const _key of clazz.matchAdditionalTypes) {
        this.classesByExtraTypes.set(clazz.type, clazz);
      }
    }
  }
}

export const entityClassRegistry = new EntityClassRegistry();
