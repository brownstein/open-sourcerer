import { Loader } from "src/api/loader";
import skillNodePng from "src/components/ui/shared/skill-tree/skillnode.png";
import portraitPng from "src/components/viewport/overlays/hud/sprites/Hud_portrait.png";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import jsLogoPng from "src/entities/demo/sprites/js-128-sheet.png";
import gryphonWarriorPng from "src/entities/enemies/major/sprites/gryphon-warrior.png";
import batPng from "src/entities/enemies/sprites/bat/bat.png";
import beePng from "src/entities/enemies/sprites/bee/bee.png";
import deerBotPng from "src/entities/enemies/sprites/deer-bot/deer-bot.png";
import enemyRunnerPng from "src/entities/enemies/sprites/enemy-runner/runner_enemy.png";
import slimePng from "src/entities/enemies/sprites/slime/slime.png";
import spawnerGatePng from "src/entities/enemies/sprites/spawners/spawner_gate.png";
import spawnerHivePng from "src/entities/enemies/sprites/spawners/spawner_hive.png";
import spawnerNestPng from "src/entities/enemies/sprites/spawners/spawner_nest.png";
import shrineBackgroundPng from "src/entities/environment/sprites/big-shrine/shrine-background.png";
import shrineBridgePng from "src/entities/environment/sprites/big-shrine/shrine-bridge.png";
import shrineDarknessPng from "src/entities/environment/sprites/big-shrine/shrine-darkness.png";
import shrineLightsPng from "src/entities/environment/sprites/big-shrine/shrine-lights.png";
import forest1Png from "src/entities/environment/sprites/forest/forest-1.png";
import forestParallaxPng from "src/entities/environment/sprites/forest/forest-bg-parallax.png";
import forestPng from "src/entities/environment/sprites/forest/forest-processed.png";
import fallingLeafPng from "src/entities/environment/sprites/leaf-platform/leaf.png";
import manaFountainPng from "src/entities/environment/sprites/manalith/manalith-1.png";
import shrineDoorPng from "src/entities/environment/sprites/shrine-door/shrine-door.png";
import techDoorBottomBasePng from "src/entities/environment/sprites/tech-door/tech-door-bottom-base.png";
import techDoorBottomCapPng from "src/entities/environment/sprites/tech-door/tech-door-bottom-cap.png";
import techDoorTilePng from "src/entities/environment/sprites/tech-door/tech-door-tile.png";
import techDoorTopBasePng from "src/entities/environment/sprites/tech-door/tech-door-top-base.png";
import techDoorTopCapPng from "src/entities/environment/sprites/tech-door/tech-door-top-cap.png";
import trackPng from "src/entities/environment/sprites/track/track.png";
import vineThinPng from "src/entities/environment/sprites/vines/vine_thin.png";
import wires1Png from "src/entities/environment/sprites/wires/wires.png";
import adanaPng from "src/entities/npcs/adana/sprites/adana_v6.png";
import adanaBirdPng from "src/entities/npcs/adana/sprites/adana_v6_bird.png";
import blacksmithGoatPng from "src/entities/npcs/village/sprites/blacksmith-goat.png";
import runeTemplatePng from "src/entities/runes/sprites/rune-template.png";
import healthBarPng from "src/entities/shared/sprites/health-bar-container.png";
import fireBlastPng from "src/entities/spells/blasts/sprites/fire-blast.png";
import manaballPng from "src/entities/spells/spark/sprites/manaball.png";
import terrainCracksPng from "src/entities/terrain/textures/cracked_texture.png";
import waterPng from "src/entities/terrain/textures/water_texture.png";
import crosshairPng from "src/entities/ui/sprites/crosshair.png";
import keyboardKeysPng from "src/entities/ui/sprites/keyboard-keys.png";
import consumablesPng from "src/items/consumables/sprites/consumables.png";
import currencyPng from "src/items/currencies/currency.png";
import itemsPng from "src/items/equipment/sprites/items32.png";
import greenBoardPng from "src/items/quests/sprites/greenboard.png";
import miscItemsPng from "src/items/quests/sprites/miscItems.png";
import closedScrollPng from "src/items/spells/sprites/scroll-closed.png";
import openScrollPng from "src/items/spells/sprites/scroll-open.png";
import spellEmblemsPng from "src/items/spells/sprites/spell-emblems.png";
import shrineEntrancePng from "src/levels/tiled/maps/area1-intro/shrine-entrance.png";

const allTextureAssets = {
  slimeTexture: new TextureResourceLoader("slimeTexture", slimePng),
  healthBarTexture: new TextureResourceLoader("healthBarTexture", healthBarPng),
  batTexture: new TextureResourceLoader("batTexture", batPng),
  beeTexture: new TextureResourceLoader("beeTexture", beePng),
  deerBotTexture: new TextureResourceLoader("deerBotTexture", deerBotPng),
  enemyRunnerTexture: new TextureResourceLoader(
    "enemyRunnerTexture",
    enemyRunnerPng
  ),
  gryphonWarriorTexture: new TextureResourceLoader(
    "gryphonWarriorTexture",
    gryphonWarriorPng
  ),
  spawnerGateTexture: new TextureResourceLoader(
    "spawnerGateTexture",
    spawnerGatePng
  ),
  spawnerNestTexture: new TextureResourceLoader(
    "spawnerNestTexture",
    spawnerNestPng
  ),
  spawnerHiveTexture: new TextureResourceLoader(
    "spawnerHiveTexture",
    spawnerHivePng
  ),
  adanaTexture: new TextureResourceLoader("adanaTexture", adanaPng),
  adanaBirdTexture: new TextureResourceLoader("adanaBirdTexture", adanaBirdPng),
  blacksmithGoatTexture: new TextureResourceLoader(
    "blacksmithGoatTexture",
    blacksmithGoatPng
  ),
  manaFountainTexture: new TextureResourceLoader(
    "manaFountainTexture",
    manaFountainPng
  ),
  shrineDoorTexture: new TextureResourceLoader(
    "shrineDoorTexture",
    shrineDoorPng
  ),
  forestTexture: new TextureResourceLoader("forestTexture", forestPng),
  forest1Texture: new TextureResourceLoader("forest1Texture", forest1Png),
  forestParallaxTexture: new TextureResourceLoader(
    "forestParallaxTexture",
    forestParallaxPng
  ),
  shrineBackgroundTexture: new TextureResourceLoader(
    "shrineBackgroundTexture",
    shrineBackgroundPng
  ),
  shrineLightsTexture: new TextureResourceLoader(
    "shrineLightsTexture",
    shrineLightsPng
  ),
  shrineDarknessTexture: new TextureResourceLoader(
    "shrineDarknessTexture",
    shrineDarknessPng
  ),
  shrineBridgeTexture: new TextureResourceLoader(
    "shrineBridgeTexture",
    shrineBridgePng
  ),
  shrineEntranceTexture: new TextureResourceLoader(
    "shrineEntranceTexture",
    shrineEntrancePng
  ),
  fallingLeafTexture: new TextureResourceLoader(
    "fallingLeafTexture",
    fallingLeafPng
  ),
  techDoorTileTexture: new TextureResourceLoader(
    "techDoorTileTexture",
    techDoorTilePng
  ),
  techDoorBottomBaseTexture: new TextureResourceLoader(
    "techDoorBottomBaseTexture",
    techDoorBottomBasePng
  ),
  techDoorTopBaseTexture: new TextureResourceLoader(
    "techDoorTopBaseTexture",
    techDoorTopBasePng
  ),
  techDoorBottomCapTexture: new TextureResourceLoader(
    "techDoorBottomCapTexture",
    techDoorBottomCapPng
  ),
  techDoorTopCapTexture: new TextureResourceLoader(
    "techDoorTopCapTexture",
    techDoorTopCapPng
  ),
  waterTexture: new TextureResourceLoader("waterTexture", waterPng),
  manaballTexture: new TextureResourceLoader("manaballTexture", manaballPng),
  fireBlastTexture: new TextureResourceLoader("fireBlastTexture", fireBlastPng),
  runeTemplateTexture: new TextureResourceLoader(
    "runeTemplateTexture",
    runeTemplatePng
  ),
  keyboardKeysTexture: new TextureResourceLoader(
    "keyboardKeysTexture",
    keyboardKeysPng
  ),
  crosshairTexture: new TextureResourceLoader("crosshairTexture", crosshairPng),
  consumablesTexture: new TextureResourceLoader(
    "consumablesTexture",
    consumablesPng
  ),
  currencyTexture: new TextureResourceLoader("currencyTexture", currencyPng),
  itemsTexture: new TextureResourceLoader("itemsTexture", itemsPng),
  openScrollTexture: new TextureResourceLoader(
    "openScrollTexture",
    openScrollPng
  ),
  closedScrollTexture: new TextureResourceLoader(
    "closedScrollTexture",
    closedScrollPng
  ),
  spellEmblemsTexture: new TextureResourceLoader(
    "spellEmblemsTexture",
    spellEmblemsPng
  ),
  miscItemsTexture: new TextureResourceLoader("miscItemsTexture", miscItemsPng),
  greenBoardTexture: new TextureResourceLoader(
    "greenBoardTexture",
    greenBoardPng
  ),
  portraitTexture: new TextureResourceLoader("portraitTexture", portraitPng),
  skillNodeTexture: new TextureResourceLoader("skillNodeTexture", skillNodePng),
  jsLogoTexture: new TextureResourceLoader("jsLogoTexture", jsLogoPng),
  terrainCracks: new TextureResourceLoader("terrainCracks", terrainCracksPng),
  vineThin: new TextureResourceLoader("vineThin", vineThinPng),
  wires1: new TextureResourceLoader("wires1", wires1Png),
  motionPathTrack: new TextureResourceLoader("motionPathTrack", trackPng)
} satisfies Record<string, Loader>;

export type TextureAssets = typeof allTextureAssets;

export default allTextureAssets;
