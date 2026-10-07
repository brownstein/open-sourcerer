import { IUniform, Mesh, Object3D, PlaneGeometry, ShaderMaterial, Vector2 } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import fragmentShader from "./shaders/vortexFrag.glsl";
import vertexShader from "./shaders/vortexVert.glsl";

export class VortexBackground extends CoreEntity {
  static type = "VortexBackground";
  public type = VortexBackground.type;

  public object3D = new Object3D();

  private geom: PlaneGeometry;
  private material: ShaderMaterial & {
    uniforms: ShaderMaterial["uniforms"] & {
      uvScale: IUniform<Vector2>;
      uvOffset: IUniform<Vector2>;
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
      uniforms: {
        uvScale: {
          value: new Vector2(1, 1)
        },
        uvOffset: {
          value: new Vector2()
        },
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
