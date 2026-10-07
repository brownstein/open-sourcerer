import { GameAssets } from "./allAssets";

/**
 * These are preloaded once in MainPreLoader, then never unloaded
 */
export const allPermanentAssets: (keyof GameAssets)[] = [
  "portraitTexture",
  "hupSound",
  "swipeSound",
  "chatter1Sound",
  "chatter2Sound",
  "chatter3Sound",
  "chatter4Sound",
  "chatter5Sound",
  "chatter6Sound",
  "fireSound",
  "fireExplosionSound",
  "terrainCracks"
];
