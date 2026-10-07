import { SavedSpell } from "src/api/spells";

export type BuiltInScriptMetadata = Omit<SavedSpell, "code">;
