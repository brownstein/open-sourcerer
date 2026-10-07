import { spellIconDefs } from "src/components/ui/spells/spellIconDefs";

import {
  COLLAB_COLORS,
  CollabIdentity,
  MAX_IDENTITY_NAME_LENGTH
} from "./collabTypes";

const IDENTITY_STORAGE_KEY = "open_sourcerer_editor_identity";

export function loadStoredIdentity(): CollabIdentity {
  const fallback: CollabIdentity = {
    name: "",
    color: COLLAB_COLORS[0],
    iconKey: spellIconDefs[0].iconKey
  };
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<CollabIdentity>;
    return {
      name:
        typeof parsed.name === "string"
          ? parsed.name.slice(0, MAX_IDENTITY_NAME_LENGTH)
          : fallback.name,
      color: typeof parsed.color === "string" ? parsed.color : fallback.color,
      iconKey:
        typeof parsed.iconKey === "string" ? parsed.iconKey : fallback.iconKey
    };
  } catch {
    return fallback;
  }
}

export function storeIdentity(identity: CollabIdentity): void {
  try {
    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch {
    // Best-effort persistence; the session works without it.
  }
}
