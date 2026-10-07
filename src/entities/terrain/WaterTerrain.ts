import { Object3D, Vector2, Vector3 } from "three";

import { BaseEntityType, EntityProps } from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import waterPng from "src/entities/terrain/textures/water_texture.png";

import { FluidPhysicsBehavior } from "./behaviors/FluidPhysicsBehavior";
import { FluidRenderingBehavior } from "./behaviors/FluidRenderingBehavior";

export type WaterTerrainProps = EntityProps & {
  terrain: TiledLevelAPI.MapTerrain;
  color?: ColorRepresentation;
};

@addResourceLoader(new TextureResourceLoader("waterTexture", waterPng))
export class WaterTerrain extends CoreEntity {
  static type = "WaterTerrain";
  public type = "WaterTerrain";
  public behaviors = {
    physics: new FluidPhysicsBehavior(),
    fluidRender: new FluidRenderingBehavior()
    // render: new AdvancedTerrainRenderBehavior()
  };
  public object3D = new Object3D();
  public terrain: TiledLevelAPI.MapTerrain;
  public initialPosition: Vector3;
  constructor(props: WaterTerrainProps) {
    super(props);
    this.terrain = props.terrain;
    this.initialPosition = this.position.clone();
    const size = new Vector2();
    this.terrain.bbox.getSize(size);
    this.size = {
      width: size.x,
      height: size.y
    };
    this.behaviors.fluidRender
      .init(this)
      .setPhysics(this.behaviors.physics)
      .setTerrain(this.terrain)
      .setTexture(getResource(WaterTerrain, "waterTexture"));

    if (props.color) this.behaviors.fluidRender.setColor(props.color);

    // this.behaviors.render
    //   .init(this)
    //   .setTerrain(props.terrain)
    //   .buildTileMeshes()
    //   .apply()
    //   .setOpacity(0.5);

    this.behaviors.physics.init(this).setTerrain(this.terrain);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
}

export function isWaterTerrain(entity: BaseEntityType): entity is WaterTerrain {
  return entity.type === "WaterTerrain";
}
