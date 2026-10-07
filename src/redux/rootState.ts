import { matchReducer } from "src/multiplayer/match/matchSlice";

import { devReducer } from "./dev/slice";
import { docsNavReducer } from "./docsNav/slice";
import { gameStateReducer } from "./gameState/slice";
import { inventoryReducer } from "./inventory/slice";
import { progressionReducer } from "./progression/slice";
import { scriptEditorReducer } from "./scriptEditor/slice";
import { scriptLibraryReducer } from "./scriptLibrary/slice";
import { scriptRuntimeReducer } from "./scriptRuntime/slice";
import { settingsReducer } from "./settings/slice";
import { skillTreeReducer } from "./skillTree/slice";
import { statusReducer } from "./status/slice";
import { uiReducer } from "./ui/slice";

export type RootState = {
  gameState: ReturnType<typeof gameStateReducer>;
  inventory: ReturnType<typeof inventoryReducer>;
  progression: ReturnType<typeof progressionReducer>;
  scriptEditor: ReturnType<typeof scriptEditorReducer>;
  scriptLibrary: ReturnType<typeof scriptLibraryReducer>;
  scriptRuntime: ReturnType<typeof scriptRuntimeReducer>;
  settings: ReturnType<typeof settingsReducer>;
  status: ReturnType<typeof statusReducer>;
  ui: ReturnType<typeof uiReducer>;
  skillTree: ReturnType<typeof skillTreeReducer>;
  docsNav: ReturnType<typeof docsNavReducer>;
  dev: ReturnType<typeof devReducer>;
  multiplayerMatch: ReturnType<typeof matchReducer>;
};
