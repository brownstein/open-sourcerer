import { replayEditorMapsIntoRegistry } from "src/components/level-editor/editorMaps";
import { levelsRegistry } from "src/levels/levels/allLevels";
import { allTilesets } from "src/levels/tilesets/allTilesets";

import { GenericHotLoader } from "../loader/HotLoader";
import { LevelDefinitionAPI, LevelLoaderContextAPI } from "./LevelLoaderAPI";

export class LevelLoaderContext implements LevelLoaderContextAPI {
  public readonly hotLoaders = {
    // There's some duplication with the registry concept here.
    // TODO(rbrownstein) consolidate.
    levels: new GenericHotLoader(
      levelsRegistry.all().reduce(
        (acc, levelDef) => ({
          ...acc,
          [levelDef.id]: levelDef
        }),
        {} as Record<string, LevelDefinitionAPI>
      )
    ),
    tileSets: new GenericHotLoader(allTilesets)
  };

  constructor() {
    // Restore editor maps persisted from previous sessions. Saving is now an
    // explicit operation in editorMaps.ts (not a side effect of registering),
    // so this just replays the durable store into the live registry.
    replayEditorMapsIntoRegistry(this.hotLoaders.levels);
  }
}

export const levelLoaderContext = new LevelLoaderContext();
