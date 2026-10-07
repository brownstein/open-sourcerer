// This file contains type definitions and utility functions for the Player2
// class so we can cut down on the length of the actual class definition.
import { ProtoSpriteSheetThree, ProtoSpriteThree } from "protosprite-three";
import { Color, Vector3 } from "three";

import {
  CharacterCustomization,
  ColorAndOpacity
} from "src/api/characterCustomization";
import { kInvPixelScale } from "src/engine/constants/scaling";

import * as spellTypes from "./sprites/wolf-spells";
import { sprite_animations, sprite_layers } from "./sprites/wolf-types";

export type PlayerAnimation = sprite_animations;
export type PlayerLayer = sprite_layers;
export type PlayerSprite = ProtoSpriteThree<PlayerLayer, PlayerAnimation>;
export type SpellsSprite = ProtoSpriteThree<
  spellTypes.sprite_layers,
  spellTypes.sprite_animations
>;

export const PlayerFullAnimations = new Set<PlayerAnimation>([
  "block",
  "death",
  "parry",
  "spell",
  "fast_spell",
  "swing",
  "swing_1",
  "swing_2"
]);

export enum PlayerAnimationEvents {
  AnimationComplete = "AnimationComplete"
}

export type PlayerAnimationEventTypes = {
  [PlayerAnimationEvents.AnimationComplete]: PlayerAnimation | null;
};

export enum PlayerLayerType {
  Upper,
  Lower,
  System
}

export const playerLayerTypes: Record<PlayerLayer, PlayerLayerType> = {
  smears: PlayerLayerType.Upper,
  r_arm: PlayerLayerType.Upper,
  l_arm: PlayerLayerType.Upper,
  r_foot: PlayerLayerType.Lower,
  r_leg: PlayerLayerType.Lower,
  l_foot: PlayerLayerType.Lower,
  l_leg: PlayerLayerType.Lower,
  shoes: PlayerLayerType.Lower,
  laces: PlayerLayerType.Lower,
  sword: PlayerLayerType.Upper,
  abs: PlayerLayerType.Upper,
  chest: PlayerLayerType.Upper,
  bottom_ear: PlayerLayerType.Upper,
  head: PlayerLayerType.Upper,
  hair: PlayerLayerType.Upper,
  top_ear: PlayerLayerType.Upper,
  eyes: PlayerLayerType.Upper,
  shirt: PlayerLayerType.Upper,
  effect_01: PlayerLayerType.Upper,
  effect_02: PlayerLayerType.Upper,
  engine: PlayerLayerType.System,
  align_hip: PlayerLayerType.System,
  tail: PlayerLayerType.Lower,
  bra: PlayerLayerType.Upper,
  align_chest: PlayerLayerType.System,
  sleve_l_shirt: PlayerLayerType.Upper,
  align_spell_ladder: PlayerLayerType.System,
  sleve_l_arm: PlayerLayerType.Upper,
  effects_02: PlayerLayerType.Upper,
  effects_01: PlayerLayerType.Upper,
  // Coloration layers for 2-tone fur.
  tail_c: PlayerLayerType.Lower,
  r_arm_c: PlayerLayerType.Upper,
  r_foot_c: PlayerLayerType.Lower,
  l_foot_c: PlayerLayerType.Lower,
  abs_c: PlayerLayerType.Upper,
  chest_c: PlayerLayerType.Upper,
  l_arm_c: PlayerLayerType.Upper,
  bottom_ear_c: PlayerLayerType.Upper,
  head_c: PlayerLayerType.Upper,
  top_ear_c: PlayerLayerType.Upper
};

// Creates sprites for a given base sprite with full customization applied.
export function customizePlayerSprite(
  sheets: {
    wolfMale: ProtoSpriteSheetThree;
    wolfFemale: ProtoSpriteSheetThree;
  },
  customization: CharacterCustomization
) {
  const sheet =
    customization.gender === "female" ? sheets.wolfFemale : sheets.wolfMale;
  const upperSprite = sheet.getSprite<PlayerLayer, PlayerAnimation>();
  upperSprite.center();
  upperSprite.gotoAnimation("idle");
  const lowerSprite = upperSprite.clone();

  upperSprite.hideLayers(
    ...Object.entries(playerLayerTypes)
      .filter(([_k, layerType]) => layerType !== PlayerLayerType.Upper)
      .map(([k]) => k as PlayerLayer)
  );
  lowerSprite.hideLayers(
    ...Object.entries(playerLayerTypes)
      .filter(([_k, layerType]) => layerType !== PlayerLayerType.Lower)
      .map(([k]) => k as PlayerLayer)
  );

  customizePlayerSpriteColors(upperSprite, lowerSprite, customization);

  // Force update sprite buffers.
  upperSprite.setLayerOpacity(1, [], true);
  lowerSprite.setLayerOpacity(1, [], true);

  // Apply standard sprite scale.
  upperSprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);
  lowerSprite.mesh.scale.set(kInvPixelScale, -kInvPixelScale, kInvPixelScale);

  // Apply offset logic.
  const spriteSize = new Vector3();
  upperSprite.mesh.geometry.boundingBox?.getSize(spriteSize);
  if (spriteSize.x % 2 === 0) {
    upperSprite.mesh.position.x -= 0.5 * kInvPixelScale;
    lowerSprite.mesh.position.x -= 0.5 * kInvPixelScale;
  }
  if (spriteSize.y % 2 === 0) {
    upperSprite.mesh.position.y -= 0.5 * kInvPixelScale;
    lowerSprite.mesh.position.y -= 0.5 * kInvPixelScale;
  }

  return {
    upperSprite,
    lowerSprite
  };
}

// Color assignment.
export function customizePlayerSpriteColors(
  upperSprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>,
  lowerSprite: ProtoSpriteThree<PlayerLayer, PlayerAnimation>,
  customization: CharacterCustomization,
  forceUpdate?: boolean
) {
  const colors = customization.colors;

  const applyColorToLayers = (
    colorOpt: ColorAndOpacity | undefined,
    multCoeff: number,
    fadeCoeff: number,
    update: boolean,
    ...layerNames: PlayerLayer[]
  ) => {
    if (colorOpt === undefined) return;
    const color = new Color(colorOpt.color);
    upperSprite.multiplyLayers(
      color,
      (colorOpt.opacity ?? 1) * multCoeff,
      layerNames,
      false
    );
    upperSprite.fadeLayers(
      color,
      (colorOpt.opacity ?? 1) * fadeCoeff,
      layerNames,
      update
    );
    lowerSprite.multiplyLayers(
      color,
      (colorOpt.opacity ?? 1) * multCoeff,
      layerNames,
      false
    );
    lowerSprite.fadeLayers(
      color,
      (colorOpt.opacity ?? 1) * fadeCoeff,
      layerNames,
      update
    );
  };

  applyColorToLayers(colors?.eyes, 0, 1, false, "eyes");
  applyColorToLayers(
    colors?.fur,
    0.66,
    0.33,
    false,
    "abs",
    "bottom_ear",
    "top_ear",
    "chest",
    "head",
    "l_arm",
    "l_foot",
    "r_arm",
    "r_foot",
    "tail"
  );
  applyColorToLayers(
    colors?.fur_2,
    0.5,
    0.25,
    false,
    "abs_c",
    "bottom_ear_c",
    "top_ear_c",
    "chest_c",
    "head_c",
    "l_arm_c",
    "l_foot_c",
    "r_arm_c",
    "r_foot_c",
    "tail_c"
  );
  applyColorToLayers(colors?.hair, 0.25, 0.5, false, "hair");
  applyColorToLayers(colors?.shirt, 0.8, 0.2, false, "shirt");
  applyColorToLayers(colors?.pants, 0.8, 0.2, false, "l_leg", "r_leg");

  if (forceUpdate) {
    // Force update sprite buffers.
    upperSprite.setLayerOpacity(1, [], true);
    lowerSprite.setLayerOpacity(1, [], true);
  }
}

export const playerAnimationPriority: Partial<Record<PlayerAnimation, number>> =
  {
    parry: 5,
    swing: 5,
    swing_1: 5,
    swing_2: 5,
    spell: 4,
    fast_spell: 4,
    put_sword_on_back: 3,
    sheath: 3,
    unsheath: 3,
    swim: 2,
    idle: 1,
    idle_sword_back: 1,
    idle_sword_front: 1,
    death: 6,
    climb: 6,
    chest: 6,
    jump: 2,
    run: 2,
    run_sword: 2
  };

export const kPlayerCastHoldStart = 6;
export const kPlayerCastHoldEnd = 9;
export const kPlayerCastFrame = 11;
export const kPlayerCastEndFrame = 18;

export const kParryWindowStart = 2;
export const kParryWindowEnd = 7;
