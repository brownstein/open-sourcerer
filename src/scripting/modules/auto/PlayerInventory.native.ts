import { ControlEvents } from "src/api/controls";
import { HotKeys } from "src/api/hotkeys";
import {
  selectConsumablesMap,
  selectCurrencies,
  selectEquippedWeapon,
  selectHasSword,
  selectHotKeyCurrentRow,
  selectHotKeyMap,
  selectQuestItemsMap
} from "src/redux/inventory/selectors";
import {
  assignHotKey,
  HotKeyAssignment,
  setHotKeyCurrentRow
} from "src/redux/inventory/slice";
import { SpellRuntimeModuleCtxAPI } from "src/scripting/runtime/SpellRuntimeAPI";

import { assertAutoBindableNativeModule } from "../autoAPI";

@assertAutoBindableNativeModule
export default class PlayerInventoryNative {
  private ctx: SpellRuntimeModuleCtxAPI;
  constructor(ctx: SpellRuntimeModuleCtxAPI) {
    this.ctx = ctx;
  }

  getEquippedWeapon() {
    const store = this.ctx.store;
    if (!store) return null;
    return selectEquippedWeapon(store.getState());
  }

  getHotKeyMap() {
    const store = this.ctx.store;
    if (!store) return {};
    return selectHotKeyMap(store.getState());
  }

  getHotKeyCurrentRow() {
    const store = this.ctx.store;
    if (!store) return 0;
    return selectHotKeyCurrentRow(store.getState());
  }

  getConsumables() {
    const store = this.ctx.store;
    if (!store) return {};
    return selectConsumablesMap(store.getState());
  }

  getQuestItems() {
    const store = this.ctx.store;
    if (!store) return {};
    return selectQuestItemsMap(store.getState());
  }

  hasSword() {
    const store = this.ctx.store;
    if (!store) return false;
    return selectHasSword(store.getState());
  }

  getCoins() {
    const store = this.ctx.store;
    if (!store) return 0;
    return selectCurrencies(store.getState());
  }

  setHotKeyCurrentRow(row: number) {
    const store = this.ctx.store;
    if (!store || row === undefined) return null;
    store.dispatch(setHotKeyCurrentRow(row));
    return null;
  }

  assignHotKey(hotKey: HotKeys, assignment: HotKeyAssignment | null) {
    const store = this.ctx.store;
    if (!store || !hotKey) return null;
    store.dispatch(assignHotKey({ hotKey, assignment: assignment ?? null }));
    return null;
  }

  activateHotKey(hotKey: HotKeys) {
    if (!hotKey) return null;
    this.ctx.level?.controls?.events.emit(ControlEvents.HotKey, hotKey);
    return null;
  }
}
