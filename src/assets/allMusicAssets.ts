import { Loader } from "src/api/loader";
import { AudioResourceLoader } from "src/engine/loader/Loaders";

import battleThemeIIIMp3 from "./music/16. Battle Theme III (full).mp3";
import pixel12Mp3 from "./music/Pixel 12.mp3";
import caveFullOpus from "./music/cave_full_01.opus";

const allMusicAssets = {
  pixel12Music: new AudioResourceLoader("pixel12Music", pixel12Mp3),
  battleThemeIIIMusic: new AudioResourceLoader(
    "battleThemeIIIMusic",
    battleThemeIIIMp3
  ),
  caveMusic: new AudioResourceLoader("caveMusic", caveFullOpus)
} satisfies Record<string, Loader>;

export type MusicAssets = typeof allMusicAssets;

export default allMusicAssets;
