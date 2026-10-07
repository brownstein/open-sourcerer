import { Vector2 } from "three";

import {
  ControlEventTypes,
  ControlEvents,
  ControlsAPI
} from "src/api/controls";
import { BaseEntityType } from "src/api/entity";
import {
  DEFAULT_KEYBINDINGS,
  GameControlActions,
  KeyBinding,
  KeyBindingOverrides,
  resolveKeyBindings
} from "src/api/keybindings";
import { createTypedEventEmitter } from "src/api/util";
import { selectGamePaused } from "src/redux/gameState/selectors";
import { pauseGame, unpauseGame } from "src/redux/gameState/slice";
import {
  selectHotKeyCurrentRow,
  selectHotKeyRowCount
} from "src/redux/inventory/selectors";
import { setHotKeyCurrentRow } from "src/redux/inventory/slice";
import { selectKeyBindingOverrides } from "src/redux/settings/selectors";
import { AppStore } from "src/redux/store";

export { DEFAULT_KEYBINDINGS, GameControlActions };
export type { KeyBinding };

type KeyMap = Record<string, KeyBinding[]>;

function buildKeyMap(bindings: KeyBinding[]): KeyMap {
  const result: KeyMap = {};
  for (const binding of bindings) {
    for (const rawKey of binding.keys) {
      const key = rawKey.toLowerCase();
      if (result[key] === undefined) result[key] = [];
      result[key].push(binding);
    }
  }
  return result;
}

export class GameControls implements ControlsAPI<BaseEntityType> {
  public events = createTypedEventEmitter<ControlEventTypes>();
  public cursorActive?: boolean = true;
  public cursorScreenPosition?: Vector2;
  public cursorScenePosition?: Vector2;
  public cursorEntity?: BaseEntityType;
  private store?: AppStore;
  private storeUnsubscribe?: () => void;
  private lastBindingOverrides?: KeyBindingOverrides;
  private keyMap = buildKeyMap(DEFAULT_KEYBINDINGS);
  private rootElement?: HTMLDivElement;
  private anyFieldFocused = false;
  private windowFocused = true;
  private gameControlKeyDown = new Set<string>();
  private gameControlBindingActive = new Set<GameControlActions>();
  private gameControlRegions = new Set<string>();
  private cursorInRegionId?: string = "viewport";
  constructor() {
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onWindowFocused = this._onWindowFocused.bind(this);
    this._onWindowBlur = this._onWindowBlur.bind(this);
    this._onFocusIn = this._onFocusIn.bind(this);
    this._onFocusOut = this._onFocusOut.bind(this);
    // Default to viewport selected on game load so the controls work immediately.
    this.setCurrentCursorRegion("viewport");
  }
  mountStore(store: AppStore) {
    this.store = store;
    const applyBindingOverrides = () => {
      const overrides = selectKeyBindingOverrides(store.getState());
      if (overrides === this.lastBindingOverrides) return;
      this.lastBindingOverrides = overrides;
      this.setKeyBindings(resolveKeyBindings(overrides));
    };
    applyBindingOverrides();
    this.storeUnsubscribe = store.subscribe(applyBindingOverrides);
  }
  unmountStore() {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = undefined;
    this.store = undefined;
  }
  setKeyBindings(bindings: KeyBinding[]) {
    // Release held keys first — under the new map their keyup events may no
    // longer resolve to the same actions, which would leave movement stuck on.
    this._cancelActiveKeys();
    this.keyMap = buildKeyMap(bindings);
  }
  mountDom(rootElement: HTMLDivElement) {
    this.rootElement = rootElement;
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onWindowBlur);
    window.addEventListener("focus", this._onWindowFocused);
    rootElement.addEventListener("focusin", this._onFocusIn);
    rootElement.addEventListener("focusout", this._onFocusOut);
  }
  unmountDom() {
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    window.removeEventListener("blur", this._onWindowBlur);
    window.removeEventListener("focus", this._onWindowFocused);
    this.rootElement?.removeEventListener("focusin", this._onFocusIn);
    this.rootElement?.removeEventListener("focusout", this._onFocusOut);
    this.rootElement = undefined;
  }
  setGameControlRegions(regionIds: string[]) {
    this.gameControlRegions = new Set(regionIds);
  }
  setCurrentCursorRegion(regionId: string) {
    if (this.cursorInRegionId === regionId) return;
    this.cursorInRegionId = regionId;
    if (this.gameControlRegions.has(regionId)) {
      this.cursorActive = true;
    } else {
      this.cursorActive = false;
      this._cancelActiveKeys();
    }
    this.events.emit(ControlEvents.SetActiveContext, [
      regionId,
      this.cursorActive
    ]);
  }
  unsetCurrentCursorRegion(regionId: string) {
    if (this.cursorInRegionId === regionId) this.cursorInRegionId = undefined;
    if (this.gameControlRegions.has(regionId)) {
      this.cursorActive = false;
      this._cancelActiveKeys();
    } else {
      this.cursorActive = true;
    }
  }
  setCursorScreenPosition(position: Vector2) {
    this.cursorScreenPosition = position;
  }
  setCursorScenePosition(position: Vector2) {
    this.cursorScenePosition = position;
  }
  setCursorEntity(entity?: BaseEntityType) {
    this.cursorEntity = entity;
  }
  private _onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    this._pressGlobalKey(key, event);
    if (
      this.anyFieldFocused ||
      !this.windowFocused ||
      !this.gameControlRegions.has(this.cursorInRegionId ?? "")
    )
      return;
    this._pressActiveKey(key, event);
  }
  private _onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (
      this.anyFieldFocused ||
      !this.windowFocused ||
      !this.gameControlRegions.has(this.cursorInRegionId ?? "")
    )
      return;
    this._unpressActiveKey(key);
  }
  private _onWindowFocused() {
    this.windowFocused = true;
  }
  private _onWindowBlur() {
    this.windowFocused = false;
    this._cancelActiveKeys();
  }
  private _onFocusIn(event: FocusEvent) {
    const target = event.target as HTMLElement;
    const isTextInput =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      !!target.closest("[contenteditable]");
    if (!isTextInput) return;
    this.anyFieldFocused = true;
    this._cancelActiveKeys();
  }
  private _onFocusOut() {
    this.anyFieldFocused = false;
  }
  private _cancelActiveKeys() {
    for (const key of this.gameControlKeyDown) this._unpressActiveKey(key);
  }
  private _getKeyBindings(key: string) {
    if (!this.keyMap[key]) return null;
    return this.keyMap[key];
  }
  // TODO: finish this method to capture attempted save events.
  private _pressGlobalKey(key: string, e: KeyboardEvent) {
    const bindings = this._getKeyBindings(key);
    if (bindings === null) return;
    for (const binding of bindings) {
      if (!!binding.ctrl !== (e.ctrlKey || e.metaKey)) continue;
      if (binding.preventDefault && binding.isGlobal) {
        e.preventDefault();
        e.stopPropagation();
      }
      // TODO: save current script to hotbar when
      // this is invoked for ctrl+s
    }
  }
  private _pressActiveKey(key: string, e: KeyboardEvent) {
    if (this.gameControlKeyDown.has(key)) return;
    this.gameControlKeyDown.add(key);
    const bindings = this._getKeyBindings(key);
    if (bindings === null) return;
    const currentlyPaused = this.store
      ? selectGamePaused(this.store.getState())
      : false;
    for (const binding of bindings) {
      if (binding.preventDefault) e.preventDefault();
    }
    for (const binding of bindings) {
      if (!!binding.ctrl !== e.ctrlKey) return;
      this.gameControlBindingActive.add(binding.action);
      if (binding.action === GameControlActions.Pause) {
        if (currentlyPaused) {
          this.events.emit(ControlEvents.UnPause);
          this.store?.dispatch(unpauseGame());
        } else {
          this.events.emit(ControlEvents.Pause);
          this.store?.dispatch(pauseGame());
        }
        return;
      }
      if (binding.action === GameControlActions.FrameAdvance) {
        if (currentlyPaused) {
          this.events.emit(ControlEvents.FrameAdvance);
        }
        return;
      }
      if (currentlyPaused) continue;
      switch (binding.action) {
        case GameControlActions.MoveRight:
        case GameControlActions.MoveLeft: {
          let horizontalMotionDelta = 0;
          if (this.gameControlBindingActive.has(GameControlActions.MoveLeft))
            horizontalMotionDelta--;
          if (this.gameControlBindingActive.has(GameControlActions.MoveRight))
            horizontalMotionDelta++;
          this.events.emit(
            ControlEvents.MoveHorizontally,
            horizontalMotionDelta
          );
          return;
        }
        case GameControlActions.MoveUp: {
          this.events.emit(ControlEvents.MoveVertically, 1);
          return;
        }
        case GameControlActions.MoveDown: {
          this.events.emit(ControlEvents.MoveVertically, -1);
          this.events.emit(ControlEvents.FallThrough);
          return;
        }
        case GameControlActions.Attack: {
          this.events.emit(ControlEvents.Attack);
          return;
        }
        case GameControlActions.Interact: {
          this.events.emit(ControlEvents.Interact);
          return;
        }
        case GameControlActions.Jump: {
          this.events.emit(ControlEvents.JumpStart);
          return;
        }
        case GameControlActions.CycleHotKeyRow: {
          if (this.store) {
            const state = this.store.getState();
            const rowCount = selectHotKeyRowCount(state);
            // Nothing to cycle through until extra rows are unlocked.
            if (rowCount <= 1) return;
            const currentRow = selectHotKeyCurrentRow(state);
            this.store.dispatch(
              setHotKeyCurrentRow((currentRow + 1) % rowCount)
            );
          }
          this.events.emit(ControlEvents.CycleHotKeyRow);
          return;
        }
        case GameControlActions.SecondaryAttack: {
          this.events.emit(ControlEvents.SecondaryAttack);
          return;
        }
        case GameControlActions.UseHotbar: {
          if (binding.hotKey === undefined) continue;
          this.events.emit(ControlEvents.HotKey, binding.hotKey);
          return;
        }
      }
    }
  }
  private _unpressActiveKey(key: string) {
    if (!this.gameControlKeyDown.has(key)) return;
    this.gameControlKeyDown.delete(key);
    const bindings = this._getKeyBindings(key);
    if (bindings === null) return;
    const currentlyPaused = this.store
      ? selectGamePaused(this.store.getState())
      : false;
    for (const binding of bindings) {
      this.gameControlBindingActive.delete(binding.action);
      switch (binding.action) {
        case GameControlActions.MoveRight:
        case GameControlActions.MoveLeft: {
          let horizontalMotionDelta = 0;
          if (!currentlyPaused) {
            if (this.gameControlBindingActive.has(GameControlActions.MoveLeft))
              horizontalMotionDelta--;
            if (this.gameControlBindingActive.has(GameControlActions.MoveRight))
              horizontalMotionDelta++;
          }
          this.events.emit(
            ControlEvents.MoveHorizontally,
            horizontalMotionDelta
          );
          if (horizontalMotionDelta === 0) this.events.emit(ControlEvents.Stop);
          return;
        }
        case GameControlActions.Jump: {
          this.events.emit(ControlEvents.JumpRelease);
          return;
        }
        case GameControlActions.MoveUp: {
          this.events.emit(ControlEvents.MoveVertically, 0);
          return;
        }
        case GameControlActions.MoveDown: {
          this.events.emit(ControlEvents.FallThroughEnd);
          this.events.emit(ControlEvents.MoveVertically, 0);
          return;
        }
      }
    }
  }
  getCurrentHorizontalMotion(): number {
    let horizontalMotionDelta = 0;
    if (this.gameControlBindingActive.has(GameControlActions.MoveLeft))
      horizontalMotionDelta--;
    if (this.gameControlBindingActive.has(GameControlActions.MoveRight))
      horizontalMotionDelta++;
    return horizontalMotionDelta;
  }
}
