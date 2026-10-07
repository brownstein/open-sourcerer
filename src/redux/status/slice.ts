import { PayloadAction, createSlice } from "@reduxjs/toolkit";

import {
  CharacterCustomization,
  PlayerRenderMode
} from "src/api/characterCustomization";
import { ElementalType } from "src/api/entity";
import { PortraitType } from "src/components/viewport/overlays/hud/Portrait";

import { loadGame, setCodingChallenge } from "../shared/actions";

export type ManaSource = {
  id: string;
  capacity: number;
  rechargeRate: number;
  available: number;
};

export type Portrait = {
  variant: PortraitType;
};

export type StatusSliceType = {
  health: number;
  maxHealth: number;
  mana: number;
  manaAmbientRechargeRatePerSecond: number;
  maxAmbientMana: number;
  manaSources: ManaSource[];
  customization: CharacterCustomization;
  /** Overrides the player sprite's fade — see PlayerRenderMode. */
  playerRenderMode: PlayerRenderMode;
  dead: boolean;
  portrait: {
    variant: PortraitType;
  };
  cutsceneLocked: boolean;
  currentCodingChallengeId?: string;
  lastElementalHitType?: ElementalType | null;
};

const statusSlice = createSlice({
  name: "status",
  initialState: {
    health: 50,
    maxHealth: 50,
    mana: 100,
    manaAmbientRechargeRatePerSecond: 5,
    maxAmbientMana: 100,
    manaSources: [],
    customization: {
      colors: {
        eyes: {
          color: "#44aaff"
        },
        fur: {
          color: "#ffffff",
          opacity: 0.5
        },
        fur_2: {
          color: "#ffffff",
          opacity: 0.5
        },
        shirt: {
          color: "#eeddaa"
        },
        pants: {
          color: "#66dd77"
        },
        hair: {
          color: "#666666"
        }
      }
    },
    playerRenderMode: PlayerRenderMode.Normal,
    dead: false,
    cutsceneLocked: false,
    portrait: {
      variant: PortraitType.Healthy
    }
  } satisfies StatusSliceType as StatusSliceType,
  reducers: {
    incrementHealth(state, action: PayloadAction<number>) {
      if (action.payload < 0) state.portrait.variant = PortraitType.Injured;
      state.health = Math.max(
        0,
        Math.min(state.maxHealth, state.health + action.payload)
      );
      if (state.health <= 0) state.dead = true;
    },
    incrementMana(state, action: PayloadAction<number>) {
      let currentManaPool = state.mana;
      let maxManaPool = state.maxAmbientMana;
      for (const source of state.manaSources) {
        currentManaPool += source.available;
        maxManaPool += source.capacity;
      }
      let delta = Math.min(maxManaPool - currentManaPool, action.payload);
      if (-delta > currentManaPool) delta = -currentManaPool;
      const newManaSources = [];
      for (const sourceRaw of state.manaSources) {
        const source = { ...sourceRaw };
        newManaSources.push(source);
        if (delta === 0) continue;
        if (delta > 0) {
          const subDelta = Math.min(source.capacity - source.available, delta);
          source.available += subDelta;
          delta -= subDelta;
          continue;
        }
        const subDelta = Math.min(source.available, -delta);
        source.available -= subDelta;
        delta += subDelta;
      }
      state.manaSources = newManaSources;
      state.mana = Math.max(0, state.mana + delta);
      if (state.mana > state.maxAmbientMana) state.mana = state.maxAmbientMana;
      if (action.payload < 0) {
        console.log("TAKE Mana", action.payload, delta, state.mana, JSON.stringify(state.manaSources));
      }
    },
    setMaxAmbientMana(state, action: PayloadAction<number>) {
      state.maxAmbientMana = action.payload;
      state.mana = action.payload;
    },
    directSetHealthAndMana(state, action: PayloadAction<[number, number]>) {
      state.health = Math.max(0, Math.min(state.maxHealth, action.payload[0]));
      state.mana = Math.max(
        0,
        Math.min(state.maxAmbientMana, action.payload[1])
      );
      if (action.payload[0] < 0) state.portrait.variant = PortraitType.Injured;
      if (state.health <= 0) state.dead = true;
    },
    setAmbientManaRechargeRatePerSecond(state, action: PayloadAction<number>) {
      state.manaAmbientRechargeRatePerSecond = action.payload;
    },
    setPortraitHealthy(state) {
      state.portrait.variant = PortraitType.Healthy;
    },
    setPortraitInjured(state) {
      state.portrait.variant = PortraitType.Injured;
    },
    setCutsceneLocked(state, action: PayloadAction<boolean>) {
      state.cutsceneLocked = action.payload;
    },
    setLastElementalHitType(
      state,
      action: PayloadAction<ElementalType | null>
    ) {
      state.lastElementalHitType = action.payload;
    },
    setCharacterCustomization(
      state,
      action: PayloadAction<Partial<CharacterCustomization>>
    ) {
      state.customization = {
        ...state.customization,
        ...action.payload
      };
    },
    setPlayerRenderMode(state, action: PayloadAction<PlayerRenderMode>) {
      state.playerRenderMode = action.payload;
    },
    /** Reset health/mana and clear dead flag for editor test level retry */
    resetForEditorRetry(state) {
      state.health = state.maxHealth;
      state.mana = state.maxAmbientMana;
      state.dead = false;
      state.portrait.variant = PortraitType.Healthy;
    },
    setManaSources(state, action: PayloadAction<ManaSource[]>) {
      state.manaSources = action.payload;
    }
  },
  extraReducers: (builder) => {
    // Reset current status on load.
    builder.addCase(loadGame, (state, action) => {
      const typedPayload = action.payload.reduxStateData as Partial<{
        status: StatusSliceType;
      }>;
      state.maxHealth = typedPayload.status?.maxHealth ?? state.maxHealth;
      state.health = state.maxHealth;
      state.mana = typedPayload.status?.maxAmbientMana ?? state.maxAmbientMana;
      state.manaAmbientRechargeRatePerSecond =
        typedPayload.status?.manaAmbientRechargeRatePerSecond ??
        state.manaAmbientRechargeRatePerSecond;
      state.manaSources = typedPayload.status?.manaSources ?? [];
      state.dead = false;
      state.cutsceneLocked = false;
      state.portrait.variant =
        state.health < state.maxHealth
          ? PortraitType.Injured
          : PortraitType.Healthy;
      state.customization = {
        ...typedPayload.status?.customization
      };
      // Saves made before the cryo-room customizer restore as a silhouette;
      // saves from before this flag existed restore as a normal character.
      state.playerRenderMode =
        typedPayload.status?.playerRenderMode ?? PlayerRenderMode.Normal;
    });
    builder.addCase(setCodingChallenge, (state, action) => {
      state.currentCodingChallengeId =
        action.payload.codingChallengeId ?? undefined;
    });
  }
});

export const {
  incrementHealth,
  incrementMana,
  setMaxAmbientMana,
  directSetHealthAndMana,
  setPortraitHealthy,
  setPortraitInjured,
  setLastElementalHitType,
  setCutsceneLocked,
  setCharacterCustomization,
  setPlayerRenderMode,
  resetForEditorRetry,
  setManaSources
} = statusSlice.actions;

export const statusReducer = statusSlice.reducer;
