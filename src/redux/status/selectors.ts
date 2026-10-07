import { createSelector } from "@reduxjs/toolkit";

import { RootState } from "../rootState";

export const selectPortrait = (state: RootState) => state.status.portrait;
export const selectHealth = (state: RootState) => state.status.health;
export const selectMaxHealth = (state: RootState) => state.status.maxHealth;
export const selectMana = createSelector(
  [
    (state: RootState) => state.status.mana,
    (state: RootState) => state.status.manaSources
  ],
  (ambient, manaSources) => {
    let sum = 0;
    sum += ambient;
    for (const source of manaSources) sum += source.available;
    return sum;
  }
);
export const selectMaxMana = createSelector(
  [
    (state: RootState) => state.status.maxAmbientMana,
    (state: RootState) => state.status.manaSources
  ],
  (maxAmbient, manaSources) => {
    let sum = 0;
    sum += maxAmbient;
    for (const source of manaSources) sum += source.capacity;
    return sum;
  }
);
export const selectIsDead = (state: RootState) => state.status.dead;
export const selectManaRechargeRatePerSecond = createSelector(
  [
    (state: RootState) => state.status.manaAmbientRechargeRatePerSecond,
    (state: RootState) => state.status.manaSources
  ],
  (ambientManaRecharge, manaSources) => {
    let sum = 0;
    sum += ambientManaRecharge;
    for (const source of manaSources) sum += source.rechargeRate;
    return sum;
  }
);
export const selectCharacterCustomization = (state: RootState) =>
  state.status.customization;
export const selectPlayerRenderMode = (state: RootState) =>
  state.status.playerRenderMode;
export const selectCutsceneLocked = (state: RootState) =>
  state.status.cutsceneLocked;
export const selectCodingChallengeId = (state: RootState) =>
  state.status.currentCodingChallengeId;
export const selectLastElementalHitType = (state: RootState) =>
  state.status.lastElementalHitType;
export const selectPlayerName = (state: RootState) =>
  state.status.customization.name || "Protag";
export const selectManaSources = (state: RootState) => state.status.manaSources;
