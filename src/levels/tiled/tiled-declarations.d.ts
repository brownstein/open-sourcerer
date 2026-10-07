declare module "*.tmj" {
  const value: import("../engine/level/tiled/tiledJson").ITiledLevelJSON;
  export default value;
}

declare module "*.tsj" {
  const value: import("../engine/level/tiled/tiledJson").ITiledTileSetJSON;
  export default value;
}
