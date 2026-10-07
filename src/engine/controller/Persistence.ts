import { EntityLevelAPI, EntityLevelSnapshot } from "src/api/entity";
import { RootState } from "src/redux/rootState";
import { loadGame } from "src/redux/shared/actions";
import { AppStore } from "src/redux/store";

export const kLocalStorageKey = "open_sourcerer_save";

type PartialDeep<KT extends string & keyof T, T extends Record<KT, unknown>> = {
  [K in keyof T & KT]?: T[K] extends Record<string, unknown>
    ? {
        [SK in keyof T[K]]?: T[K][SK];
      }
    : T[K];
};

export type SaveFile = {
  reduxState?: PartialDeep<
    | "gameState"
    | "inventory"
    | "ui"
    | "status"
    | "scriptEditor"
    | "scriptLibrary"
    | "settings"
    | "progression"
    | "skillTree",
    RootState
  >;
  levelSnapshots?: Record<string, EntityLevelSnapshot>;
};

export class PersistenceController {
  private store: AppStore;
  private levelSnapshots: Record<string, EntityLevelSnapshot> = {};
  constructor(store: AppStore) {
    this.store = store;
  }
  save(currentLevel?: EntityLevelAPI) {
    const state = this.store.getState();
    const reduxSaveState: SaveFile["reduxState"] = {
      gameState: {
        levelId: state.gameState.levelId,
        activeAllies: state.gameState.activeAllies
      },
      inventory: {
        equippedWeapon: state.inventory.equippedWeapon,
        hotKeyMap: state.inventory.hotKeyMap,
        consumables: state.inventory.consumables,
        questItems: state.inventory.questItems,
        coins: state.inventory.coins,
        itemGrid: state.inventory.itemGrid,
        spellItems: state.inventory.spellItems
      },
      progression: state.progression,
      skillTree: state.skillTree,
      ui: {
        layout: state.ui.layout,
        layoutComponentState: state.ui.layoutComponentState,
        editorFontSize: state.ui.editorFontSize,
        enableElements: state.ui.enableElements
      },
      status: state.status,
      scriptEditor: state.scriptEditor,
      scriptLibrary: state.scriptLibrary,
      settings: state.settings
    };
    if (currentLevel) {
      const currentLevelSnapshot = currentLevel.getFullSnapshot();
      this.levelSnapshots[currentLevel.id] = currentLevelSnapshot;
    }
    const saveData: SaveFile = {
      reduxState: reduxSaveState,
      levelSnapshots: this.levelSnapshots
    };
    const saveDataStr = JSON.stringify(saveData);
    localStorage.setItem(kLocalStorageKey, saveDataStr);
  }
  checkLoadable() {
    const saveDataStr = localStorage.getItem(kLocalStorageKey);
    switch (saveDataStr) {
      case null:
      case "":
        return false;
      default:
        return true;
    }
  }
  load(applyToRedux = true, options?: { preserveLayout?: boolean }) {
    const saveDataStr = localStorage.getItem(kLocalStorageKey);
    if (!saveDataStr) return null;
    const saveData: SaveFile = JSON.parse(saveDataStr);
    if (saveData.levelSnapshots) {
      this.levelSnapshots = saveData.levelSnapshots;
    }
    if (applyToRedux && saveData.reduxState) {
      this.store.dispatch(loadGame(saveData.reduxState, options));
    }
  }
  setLevelSnapshot(levelId: string, snapshot: EntityLevelSnapshot) {
    this.levelSnapshots[levelId] = snapshot;
  }
  getLevelSnapshot(levelId: string): EntityLevelSnapshot | null {
    return this.levelSnapshots[levelId] ?? null;
  }
}
