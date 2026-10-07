import { useEffect, useState } from "react";

import {
  DEFAULT_KEYBINDINGS,
  GameControlActions,
  RESERVED_KEYS,
  keyDisplayName
} from "src/api/keybindings";
import { useAppDispatch, useAppSelector } from "src/redux/hooks";
import {
  selectKeyBindingOverrides,
  selectResolvedKeyBindings
} from "src/redux/settings/selectors";
import {
  clearKeyBindingOverride,
  setKeyBindingOverride
} from "src/redux/settings/slice";

// TODO: localize (along with the rest of the settings tab).
const REBINDABLE_ACTIONS: Array<{
  action: GameControlActions;
  label: string;
}> = [
  { action: GameControlActions.MoveLeft, label: "Move Left" },
  { action: GameControlActions.MoveRight, label: "Move Right" },
  { action: GameControlActions.MoveUp, label: "Move Up / Climb" },
  { action: GameControlActions.MoveDown, label: "Move Down / Drop" },
  { action: GameControlActions.Jump, label: "Jump" },
  { action: GameControlActions.Interact, label: "Interact" },
  { action: GameControlActions.Attack, label: "Attack" },
  { action: GameControlActions.SecondaryAttack, label: "Secondary Attack" },
  { action: GameControlActions.CycleHotKeyRow, label: "Cycle Hotbar Row" },
  { action: GameControlActions.Pause, label: "Pause" }
];

const kSlotCount = 2;

const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta"]);

function defaultKeysForAction(action: GameControlActions): string[] {
  const binding = DEFAULT_KEYBINDINGS.find(
    (candidate) =>
      candidate.action === action && candidate.hotKey === undefined
  );
  return (binding?.keys ?? []).map((key) => key.toLowerCase());
}

function keysMatchDefault(action: GameControlActions, keys: string[]) {
  const defaults = defaultKeysForAction(action);
  return (
    keys.length === defaults.length &&
    keys.every((key, index) => key === defaults[index])
  );
}

type CaptureTarget = { action: GameControlActions; slot: number };

export function KeyBindingsSection() {
  const dispatch = useAppDispatch();
  const overrides = useAppSelector(selectKeyBindingOverrides);
  const resolvedBindings = useAppSelector(selectResolvedKeyBindings);
  const [capture, setCapture] = useState<CaptureTarget | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);

  const keysForAction = (action: GameControlActions): string[] => {
    const binding = resolvedBindings.find(
      (candidate) =>
        candidate.action === action && candidate.hotKey === undefined
    );
    return (binding?.keys ?? []).map((key) => key.toLowerCase());
  };

  const applyKeys = (action: GameControlActions, keys: string[]) => {
    if (keysMatchDefault(action, keys)) {
      dispatch(clearKeyBindingOverride(action));
    } else {
      dispatch(setKeyBindingOverride({ action, keys }));
    }
  };

  useEffect(() => {
    if (!capture) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const key = event.key.toLowerCase();
      if (key === "escape") {
        setCapture(null);
        setCaptureNotice(null);
        return;
      }
      if (MODIFIER_KEYS.has(key)) return;
      if (RESERVED_KEYS.has(key)) {
        setCaptureNotice(`${keyDisplayName(key)} is reserved`);
        return;
      }
      // Unassign the key from any other action that currently uses it.
      for (const { action: otherAction } of REBINDABLE_ACTIONS) {
        if (otherAction === capture.action) continue;
        const otherKeys = keysForAction(otherAction);
        if (!otherKeys.includes(key)) continue;
        applyKeys(
          otherAction,
          otherKeys.filter((existing) => existing !== key)
        );
      }
      const keys = keysForAction(capture.action).filter(
        (existing) => existing !== key
      );
      if (capture.slot < keys.length) {
        keys[capture.slot] = key;
      } else {
        keys.push(key);
      }
      applyKeys(capture.action, keys);
      setCapture(null);
      setCaptureNotice(null);
    };
    // Capture phase so no other document-level listener sees the keystroke.
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  });

  const clearSlot = (action: GameControlActions, slot: number) => {
    const keys = keysForAction(action);
    if (slot >= keys.length) return;
    applyKeys(
      action,
      keys.filter((_, index) => index !== slot)
    );
  };

  return (
    <div className="key-bindings">
      <h3>Key Bindings</h3>
      {captureNotice !== null && (
        <div className="key-bindings-notice">{captureNotice}</div>
      )}
      {REBINDABLE_ACTIONS.map(({ action, label }) => {
        const keys = keysForAction(action);
        const isOverridden = overrides[action] !== undefined;
        return (
          <div className="key-binding-row" key={action}>
            <label>{label}</label>
            <div className="key-binding-slots">
              {Array.from({ length: kSlotCount }, (_, slot) => {
                const isCapturing =
                  capture?.action === action && capture?.slot === slot;
                const key = keys[slot];
                return (
                  <div className="key-binding-slot" key={slot}>
                    <button
                      className={`key-chip${isCapturing ? " capturing" : ""}${
                        key === undefined ? " unbound" : ""
                      }`}
                      title="Click, then press a key. Esc cancels."
                      onClick={() => {
                        setCaptureNotice(null);
                        setCapture(
                          isCapturing ? null : { action, slot }
                        );
                      }}
                    >
                      {isCapturing
                        ? "Press a key…"
                        : key !== undefined
                          ? keyDisplayName(key)
                          : "Unbound"}
                    </button>
                    {key !== undefined && !isCapturing && (
                      <button
                        className="key-chip-clear"
                        title="Clear this key"
                        onClick={() => clearSlot(action, slot)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                className={`key-binding-reset${
                  isOverridden ? "" : " hidden"
                }`}
                title="Reset to default"
                onClick={() => dispatch(clearKeyBindingOverride(action))}
              >
                ⟲
              </button>
            </div>
          </div>
        );
      })}
      <div className="key-binding-row static">
        <label>Hotbar Slots</label>
        <div className="key-binding-slots">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((key) => (
            <span className="key-chip static" key={key}>
              {key}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
