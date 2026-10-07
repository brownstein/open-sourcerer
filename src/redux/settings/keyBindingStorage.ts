import { GameControlActions, KeyBindingOverrides } from "src/api/keybindings";

// Key bindings persist in their own localStorage entry, separate from the
// save file, so rebinds stick immediately (including from the title screen)
// and are machine-local rather than per-save.
export const kKeyBindingsStorageKey = "open_sourcerer_keybindings";

export function loadKeyBindingOverrides(): KeyBindingOverrides {
  try {
    const raw = localStorage.getItem(kKeyBindingsStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const overrides: KeyBindingOverrides = {};
    for (const [action, keys] of Object.entries(parsed)) {
      if (!(action in GameControlActions)) continue;
      if (!Array.isArray(keys)) continue;
      overrides[action as GameControlActions] = keys.filter(
        (key): key is string => typeof key === "string"
      );
    }
    return overrides;
  } catch {
    return {};
  }
}

export function saveKeyBindingOverrides(overrides: KeyBindingOverrides) {
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(kKeyBindingsStorageKey);
    } else {
      localStorage.setItem(kKeyBindingsStorageKey, JSON.stringify(overrides));
    }
  } catch {
    // Storage may be unavailable (private browsing, quota); bindings still
    // apply for the current session.
  }
}
