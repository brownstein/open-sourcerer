import { Loader } from "src/api/loader";
import { ProtoSpriteLoader } from "src/engine/loader/Loaders";
import wolfPrs from "src/entities/dev/sprites/wolf.prs";
import turretPrs from "src/entities/enemies/robots/turret/sprites/turret.prs";
import spellingBeePrs from "src/entities/enemies/sprites/bee-mage/spelling_bee.prs";
import beeQueenPrs from "src/entities/enemies/sprites/bee-queen/bee-queen.prs";
import workerBeePrs from "src/entities/enemies/sprites/bee-worker/worker_bee.prs";
import brutePrs from "src/entities/enemies/sprites/brute/brute.prs";
import drillPrs from "src/entities/enemies/sprites/drill/drill.prs";
import dummyFloatPrs from "src/entities/enemies/sprites/dummy/dummy_float.prs";
import dummySwordPrs from "src/entities/enemies/sprites/dummy/dummy_sword.prs";
import forestBotPrs from "src/entities/enemies/sprites/forest-bot/forest-bot.prs";
import gnullPrs from "src/entities/enemies/sprites/gnull/gnull.prs";
import mimicPrs from "src/entities/enemies/sprites/mimic/mimic.prs";
import plantShieldPrs from "src/entities/enemies/sprites/plant-shield/shieldplant.prs";
import rapierBeePrs from "src/entities/enemies/sprites/rapier-bee/rapier-bee.prs";
import robotSpiderPrs from "src/entities/enemies/sprites/robot-spider/robot-spider.prs";
import utilityBotPrs from "src/entities/enemies/sprites/utility-bot/utility-bot.prs";
import walkerThatShootPrs from "src/entities/enemies/sprites/walker-that-shoot/walker-that-shoot.prs";
import wallCrawlerPrs from "src/entities/enemies/sprites/wall-crawler/wall-crawler.prs";
import shrineTerminalPrs from "src/entities/environment/shrines/sprites/control_panel.prs";
import spiritDoorPrs from "src/entities/environment/shrines/sprites/spirit-door.prs";
import barrelPrs from "src/entities/environment/sprites/barrel/explosive-barrel.prs";
import shrineHelixCapPrs from "src/entities/environment/sprites/big-shrine/shrine-drill-cap.prs";
import shrineHelixTopPrs from "src/entities/environment/sprites/big-shrine/shrine-drill-top.prs";
import shrineHelixPrs from "src/entities/environment/sprites/big-shrine/shrine-drill.prs";
import cavesEndGatePrs from "src/entities/environment/sprites/caves-end-gate/caves-end-gate.prs";
import chestPrs from "src/entities/environment/sprites/chest/chest.prs";
import ioNodePrs from "src/entities/environment/sprites/connectable/ionode.prs";
import crystalTorchPrs from "src/entities/environment/sprites/crystal-torch/crystal_torch.prs";
import dockingStationPrs from "src/entities/environment/sprites/docking-station/docking_station.prs";
import bigDoorFrontPrs from "src/entities/environment/sprites/doors/big-door-front/big-door-front.prs";
import smallDoorRightPrs from "src/entities/environment/sprites/doors/small-door-right/small-door-right.prs";
import mushroomPlatformPrs from "src/entities/environment/sprites/mushroom/mushroom_platform_top.prs";
import pistonSpikePrs from "src/entities/environment/sprites/pistons/piston-spike.prs";
import pistonThinPrs from "src/entities/environment/sprites/pistons/piston-thin.prs";
import pistonWidePrs from "src/entities/environment/sprites/pistons/piston-wide.prs";
import shrineEntranceBackgroundPrs from "src/entities/environment/sprites/shrine-background/shrine-entrance-background.prs";
import shrineBridgeTilePrs from "src/entities/environment/sprites/shrines/shrine-bridge-tile.prs";
import spellTurretPrs from "src/entities/environment/sprites/spell-turret/turret.prs";
import frontSwitchPrs from "src/entities/environment/sprites/switches/front-switch/front-switch.prs";
import sideDiagonalSwitchPrs from "src/entities/environment/sprites/switches/side-diagonal-switch/side-diagonal-switch.prs";
import sideSwitchPrs from "src/entities/environment/sprites/switches/side-switch/side-switch.prs";
import signalPrs from "src/entities/environment/sprites/wires/signal.prs";
import adanaPrs from "src/entities/npcs/adana/sprites/adana_v6.prs";
import adanaBirdPrs from "src/entities/npcs/adana/sprites/adana_v6_bird.prs";
import dogPrs from "src/entities/npcs/all-characters/sprites/all-characters.prs";
import beanBotPrs from "src/entities/npcs/bean-bot/sprites/bean-bot-2.prs";
import playerDustPrs from "src/entities/player/sprites/player-dust-effects.prs";
import wolfFemalePrs from "src/entities/player/sprites/wolf-female.prs";
import wolfMalePrs from "src/entities/player/sprites/wolf-male.prs";
import wolfSpellsPrs from "src/entities/player/sprites/wolf-spells.prs";
import explosionPrs from "src/entities/spells/blasts/sprites/explosion.prs";
import gemsPrs from "src/items/currencies/gems.prs";
import crystalsPrs from "src/items/equipment/sprites/crystals.prs";

const allSpriteAssets = {
  wolfMaleSprite: new ProtoSpriteLoader("wolfMaleSprite", wolfMalePrs),
  wolfFemaleSprite: new ProtoSpriteLoader("wolfFemaleSprite", wolfFemalePrs),
  playerDustSprite: new ProtoSpriteLoader("playerDustSprite", playerDustPrs),
  gnullSprite: new ProtoSpriteLoader("gnullSprite", gnullPrs),
  mimicSprite: new ProtoSpriteLoader("mimicSprite", mimicPrs),
  wallCrawlerSprite: new ProtoSpriteLoader("wallCrawlerSprite", wallCrawlerPrs),
  bruteSprite: new ProtoSpriteLoader("bruteSprite", brutePrs),
  plantShieldSprite: new ProtoSpriteLoader("plantShieldSprite", plantShieldPrs),
  drillSprite: new ProtoSpriteLoader("drillSprite", drillPrs),
  forestBotSprite: new ProtoSpriteLoader("forestBotSprite", forestBotPrs),
  utilityBotSprite: new ProtoSpriteLoader("utilityBotSprite", utilityBotPrs),
  dummySwordSprite: new ProtoSpriteLoader("dummySwordSprite", dummySwordPrs),
  dummyFloatSprite: new ProtoSpriteLoader("dummyFloatSprite", dummyFloatPrs),
  robotSpiderSprite: new ProtoSpriteLoader("robotSpiderSprite", robotSpiderPrs),
  turretSprite: new ProtoSpriteLoader("turretSprite", turretPrs),
  beeQueenSprite: new ProtoSpriteLoader("beeQueenSprite", beeQueenPrs),
  workerBeeSprite: new ProtoSpriteLoader("workerBeeSprite", workerBeePrs),
  rapierBeeSprite: new ProtoSpriteLoader("rapierBeeSprite", rapierBeePrs),
  beanBotSprite: new ProtoSpriteLoader("beanBotSprite", beanBotPrs),
  dogSprite: new ProtoSpriteLoader("dogSprite", dogPrs),
  chestSprite: new ProtoSpriteLoader("chestSprite", chestPrs),
  barrelSprite: new ProtoSpriteLoader("barrelSprite", barrelPrs),
  bigDoorFrontSprite: new ProtoSpriteLoader(
    "bigDoorFrontSprite",
    bigDoorFrontPrs
  ),
  smallDoorRightSprite: new ProtoSpriteLoader(
    "smallDoorRightSprite",
    smallDoorRightPrs
  ),
  frontSwitchSprite: new ProtoSpriteLoader("frontSwitchSprite", frontSwitchPrs),
  sideSwitchSprite: new ProtoSpriteLoader("sideSwitchSprite", sideSwitchPrs),
  sideDiagonalSwitchSprite: new ProtoSpriteLoader(
    "sideDiagonalSwitchSprite",
    sideDiagonalSwitchPrs
  ),
  cavesEndGateSprite: new ProtoSpriteLoader(
    "cavesEndGateSprite",
    cavesEndGatePrs
  ),
  shrineBridgeTileSprite: new ProtoSpriteLoader(
    "shrineBridgeTileSprite",
    shrineBridgeTilePrs
  ),
  shrineHelixSprite: new ProtoSpriteLoader("shrineHelixSprite", shrineHelixPrs),
  shrineHelixCapSprite: new ProtoSpriteLoader(
    "shrineHelixCapSprite",
    shrineHelixCapPrs
  ),
  shrineHelixTopSprite: new ProtoSpriteLoader(
    "shrineHelixTopSprite",
    shrineHelixTopPrs
  ),
  spiritDoorSprite: new ProtoSpriteLoader("spiritDoorSprite", spiritDoorPrs),
  shrineTerminalSprite: new ProtoSpriteLoader(
    "shrineTerminalSprite",
    shrineTerminalPrs
  ),
  shrineEntranceBackgroundSprite: new ProtoSpriteLoader(
    "shrineEntranceBackgroundSprite",
    shrineEntranceBackgroundPrs
  ),
  pistonWideSprite: new ProtoSpriteLoader("pistonWideSprite", pistonWidePrs),
  pistonThinSprite: new ProtoSpriteLoader("pistonThinSprite", pistonThinPrs),
  pistonSpikeSprite: new ProtoSpriteLoader("pistonSpikeSprite", pistonSpikePrs),
  explosionSprite: new ProtoSpriteLoader("explosionSprite", explosionPrs),
  wolfTestSprite: new ProtoSpriteLoader("wolfTestSprite", wolfPrs),
  crystalTorchSprite: new ProtoSpriteLoader("crystalTorch", crystalTorchPrs),
  walkerThatShootSprite: new ProtoSpriteLoader(
    "walkerThatShootSprite",
    walkerThatShootPrs
  ),
  gemsSprite: new ProtoSpriteLoader("gems", gemsPrs),
  dockingStation: new ProtoSpriteLoader("dockingStation", dockingStationPrs),
  adanaBirdSprite: new ProtoSpriteLoader("adanaBird", adanaBirdPrs),
  adanaSprite: new ProtoSpriteLoader("adana", adanaPrs),
  mushroomPlatform: new ProtoSpriteLoader(
    "mushroomPlatform",
    mushroomPlatformPrs
  ),
  spellingBeeSprite: new ProtoSpriteLoader("spellingBeeSprite", spellingBeePrs),
  ioNode: new ProtoSpriteLoader("ioNode", ioNodePrs),
  signal: new ProtoSpriteLoader("signal", signalPrs),
  spellTurret: new ProtoSpriteLoader("spellTurret", spellTurretPrs),
  crystals: new ProtoSpriteLoader("crystals", crystalsPrs),
  wolfSpells: new ProtoSpriteLoader("wolfSpells", wolfSpellsPrs)
} satisfies Record<string, Loader>;

export type SpriteAssets = typeof allSpriteAssets;

export default allSpriteAssets;
