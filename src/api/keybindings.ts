import { HotKeys, OrderedHotKeys } from "./hotkeys";

export enum GameControlActions {
  Pause = "Pause",
  MoveLeft = "MoveLeft",
  MoveRight = "MoveRight",
  MoveUp = "MoveUp",
  MoveDown = "MoveDown",
  Jump = "Jump",
  UseHotbar = "UseHotbar",
  Interact = "Interact",
  Attack = "Attack",
  SelectDialogAction = "SelectDialogAction",
  SaveCurrent = "SaveCurrent",
  CycleHotKeyRow = "CycleHotKeyRow",
  FrameAdvance = "FrameAdvance",
  SecondaryAttack = "SecondaryAttack"
}

export type KeyBinding = {
  keys: string[];
  ctrl?: boolean;
  preventDefault?: boolean;
  isGlobal?: boolean;
  action: GameControlActions;
  hotKey?: HotKeys;
};

export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  {
    keys: ["Escape"],
    action: GameControlActions.Pause
  },
  {
    keys: ["a", "ArrowLeft"],
    action: GameControlActions.MoveLeft
  },
  {
    keys: ["d", "ArrowRight"],
    action: GameControlActions.MoveRight
  },
  {
    keys: ["s", "ArrowDown"],
    action: GameControlActions.MoveDown,
    // El Chris added this, and it broke form inputs.
    // preventDefault: true
  },
  {
    keys: ["w", "ArrowUp"],
    action: GameControlActions.MoveUp,
    // preventDefault: true
  },
  {
    keys: [" "],
    action: GameControlActions.Jump,
    // preventDefault: true
  },
  {
    keys: ["e"],
    action: GameControlActions.Interact
  },
  {
    keys: ["q"],
    action: GameControlActions.CycleHotKeyRow
  },
  {
    keys: ["]"],
    action: GameControlActions.FrameAdvance
  },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((keyNumber, keyIndex) => ({
    keys: [`${keyNumber}`],
    action: GameControlActions.UseHotbar,
    hotKey: OrderedHotKeys[keyIndex]
  }))
  // {
  //   keys: ["s"],
  //   ctrl: true,
  //   preventDefault: true,
  //   isGlobal: true,
  //   action: GameControlActions.SaveCurrent
  // }
];

// User-remapped keys per action, stored in the settings slice. Only actions
// the user has changed appear here; everything else falls back to defaults.
export type KeyBindingOverrides = Partial<Record<GameControlActions, string[]>>;

// Keys that may never be reassigned: hotbar digits stay bound to their slots,
// "]" is the dev frame-advance key, and Escape cancels capture in the UI.
export const RESERVED_KEYS = new Set([
  "escape",
  "]",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0"
]);

export function resolveKeyBindings(
  overrides: KeyBindingOverrides
): KeyBinding[] {
  const resolved: KeyBinding[] = DEFAULT_KEYBINDINGS.map((binding) => {
    // Hotbar bindings are parameterized by slot and not user-remappable.
    if (binding.action === GameControlActions.UseHotbar) return binding;
    const keys = overrides[binding.action];
    if (keys === undefined) return binding;
    return { ...binding, keys };
  });
  // Overridden actions with no default binding (e.g. Attack) still need an
  // entry so the key map picks them up.
  const boundActions = new Set(resolved.map((binding) => binding.action));
  for (const [action, keys] of Object.entries(overrides) as Array<
    [GameControlActions, string[]]
  >) {
    if (boundActions.has(action) || !keys?.length) continue;
    resolved.push({ keys, action });
  }
  return resolved;
}

const KEY_DISPLAY_NAMES: Record<string, string> = {
  " ": "Space",
  arrowleft: "←",
  arrowright: "→",
  arrowup: "↑",
  arrowdown: "↓",
  escape: "Esc",
  enter: "Enter",
  tab: "Tab",
  shift: "Shift",
  backspace: "Backspace",
  delete: "Delete"
};

export function keyDisplayName(key: string): string {
  const normalized = key.toLowerCase();
  const named = KEY_DISPLAY_NAMES[normalized];
  if (named !== undefined) return named;
  if (normalized.length === 1) return normalized.toUpperCase();
  return key;
}
