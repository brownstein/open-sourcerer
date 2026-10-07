import { IUniform, Mesh, Object3D, PlaneGeometry, ShaderMaterial } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import fragmentShader from "./shaders/shrineSparkleFrag.glsl";
import vertexShader from "./shaders/shrineSparkleVert.glsl";

export class ShrineSparkle extends CoreEntity {
  static type = "ShrineSparkle";
  public type = ShrineSparkle.type;

  public object3D = new Object3D();

  private geom: PlaneGeometry;
  private material: ShaderMaterial & {
    uniforms: ShaderMaterial["uniforms"] & {
      phase: IUniform<number>;
    };
  };
  private mesh: Mesh;

  constructor(props: EntityProps) {
    super(props);
    this.geom = new PlaneGeometry(
      props.size?.width ?? 1,
      props.size?.height ?? 1
    );
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        phase: {
          value: 0
        }
      }
    }) as typeof this.material;
    this.mesh = new Mesh(this.geom, this.material);

    this.object3D.add(this.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    // Render in front of game entities
    this.object3D.position.z = 5;
  }
  step(ms: number) {
    super.step(ms);
    this.material.uniforms.phase.value += ms;
  }
  destroy() {
    super.destroy();
    this.geom.dispose();
    this.material.dispose();
  }
}
