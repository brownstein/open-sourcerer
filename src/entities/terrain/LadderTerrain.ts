import { Object3D, Vector2, Vector3 } from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

import { AdvancedTerrainRenderBehavior } from "./behaviors/AdvancedRenderBehavior";
import { LadderPhysicsBehavior } from "./behaviors/LadderPhysicsBehavior";

export type LadderTerrainProps = EntityProps & {
  terrain: TiledLevelAPI.MapTerrain;
};

export class LadderTerrain extends CoreEntity {
  static type = "LadderTerrain";
  public type = LadderTerrain.type;
  public behaviors = {
    physics: new LadderPhysicsBehavior(),
    render: new AdvancedTerrainRenderBehavior()
  };
  public object3D = new Object3D();
  public terrain: TiledLevelAPI.MapTerrain;
  public initialPosition: Vector3;

  constructor(props: LadderTerrainProps) {
    super(props);
    this.terrain = props.terrain;
    this.initialPosition = this.position.clone();
    const size = new Vector2();
    this.terrain.bbox.getSize(size);
    this.size = {
      width: size.x,
      height: size.y
    };
    this.behaviors.render
      .init(this)
      .setTiles(this.terrain.decalTiles)
      .buildTileMeshes()
      .apply();
    this.behaviors.physics.init(this).setTerrain(this.terrain);
  }
  postStep(_deltaMs: number): void {
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
}

export function isLadderTerrain(
  entity: BaseEntityType
): entity is LadderTerrain {
  return entity.type === LadderTerrain.type;
}
