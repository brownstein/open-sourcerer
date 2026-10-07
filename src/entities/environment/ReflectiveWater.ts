import { Box2, Camera, IUniform, Mesh, NearestFilter, Object3D, OrthographicCamera, PlaneGeometry, ShaderMaterial, Texture, Vector2, WebGLRenderTarget } from "three";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";

import fragmentShader from "./shaders/reflectiveWaterFrag.glsl";
import vertexShader from "./shaders/reflectiveWaterVert.glsl";

export type ReflectiveWaterProps = EntityProps & {};

export function isOrthographicCamera(
  camera: Camera
): camera is OrthographicCamera {
  if ((camera as OrthographicCamera).isOrthographicCamera) return true;
  return false;
}

export class ReflectiveWater extends CoreEntity {
  static type = "ReflectiveWater";
  public type = ReflectiveWater.type;

  public object3D = new Object3D();

  private renderTarget: WebGLRenderTarget;
  private geom: PlaneGeometry;
  private material: ShaderMaterial & {
    uniforms: ShaderMaterial["uniforms"] & {
      map: IUniform<Texture>;
      uvScale: IUniform<Vector2>;
      uvOffset: IUniform<Vector2>;
      phase: IUniform<number>;
    };
  };
  private mesh: Mesh;

  constructor(props: ReflectiveWaterProps) {
    super(props);
    this.renderTarget = new WebGLRenderTarget(32, 32);
    this.renderTarget.texture.magFilter = NearestFilter;
    this.renderTarget.texture.minFilter = NearestFilter;
    this.geom = new PlaneGeometry(
      props.size?.width ?? 1,
      props.size?.height ?? 1
    );
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        map: {
          value: this.renderTarget.texture
        },
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
    this.mesh.onBeforeRender = (renderer, scene, camera) => {
      if (!isOrthographicCamera(camera)) return;
      const prevRenderTarget = renderer.getRenderTarget();
      const renderTargetSize = new Vector2();
      if (!prevRenderTarget) {
        renderer.getSize(renderTargetSize);
      } else {
        renderTargetSize.x = prevRenderTarget.width;
        renderTargetSize.y = prevRenderTarget.height;
      }

      const objBBox = new Box2(
        new Vector2(
          this.object3D.position.x - this.size.width * 0.5,
          this.object3D.position.y - this.size.height * 0.5
        ),
        new Vector2(
          this.object3D.position.x + this.size.width * 0.5,
          this.object3D.position.y + this.size.height * 0.5
        )
      );
      const sampleBBox = new Box2().copy(objBBox);
      const renderBBox = new Box2(
        new Vector2(
          camera.position.x + camera.left,
          camera.position.y + camera.bottom
        ),
        new Vector2(
          camera.position.x + camera.right,
          camera.position.y + camera.top
        )
      );

      sampleBBox.min.y += this.size.height;
      sampleBBox.max.y += this.size.height;

      const visibleRenderBox = objBBox.clone().intersect(renderBBox);
      const visibleSamplingBox = visibleRenderBox.clone();
      const vbMinY = sampleBBox.min.y - (visibleRenderBox.max.y - objBBox.max.y);
      const vbMaxY = sampleBBox.max.y - (visibleRenderBox.min.y - objBBox.min.y);
      visibleSamplingBox.min.y = vbMinY;
      visibleSamplingBox.max.y = vbMaxY;

      const renderBoxSize = new Vector2();
      const objBoxSize = new Vector2();
      const sampleBoxSize = new Vector2();
      const visibleSamplingBoxSize = new Vector2();
      const visibleRenderBoxSize = new Vector2();
      const renderBoxCenter = new Vector2();
      const objBoxCenter = new Vector2();
      const sampleBoxCenter = new Vector2();
      const visibleSamplingBoxCenter = new Vector2();
      const visibleRenderBoxCenter = new Vector2();
      renderBBox.getSize(renderBoxSize);
      renderBBox.getCenter(renderBoxCenter);
      objBBox.getSize(objBoxSize);
      objBBox.getCenter(objBoxCenter);
      sampleBBox.getSize(sampleBoxSize);
      sampleBBox.getCenter(sampleBoxCenter);
      visibleSamplingBox.getSize(visibleSamplingBoxSize);
      visibleSamplingBox.getCenter(visibleSamplingBoxCenter);
      visibleRenderBox.getSize(visibleRenderBoxSize);
      visibleRenderBox.getCenter(visibleRenderBoxCenter);

      if (visibleSamplingBoxSize.x <= 0 || visibleSamplingBoxSize.y <= 0)
        return;

      const renderCamera = new OrthographicCamera(
        -visibleSamplingBoxSize.x * 0.5,
        visibleSamplingBoxSize.x * 0.5,
        visibleSamplingBoxSize.y * 0.5,
        -visibleSamplingBoxSize.y * 0.5,
        0.1,
        128
      );
      renderCamera.position.x = visibleSamplingBoxCenter.x;
      renderCamera.position.y = visibleSamplingBoxCenter.y;
      renderCamera.position.z = 64;
      renderCamera.updateProjectionMatrix();

      this.material.uniforms.uvScale.value.x =
        sampleBoxSize.x / visibleSamplingBoxSize.x;
      this.material.uniforms.uvScale.value.y =
        -sampleBoxSize.y / visibleSamplingBoxSize.y;
      this.material.uniforms.uvOffset.value.x =
        -(visibleSamplingBox.min.x - sampleBBox.min.x) / visibleSamplingBoxSize.x;
      this.material.uniforms.uvOffset.value.y =
        1 - (visibleSamplingBox.max.y - sampleBBox.max.y) / visibleSamplingBoxSize.y;

      const newRenderTargetSize = new Vector2(
        (visibleSamplingBoxSize.x * renderTargetSize.x) / renderBoxSize.x,
        (visibleSamplingBoxSize.y * renderTargetSize.y) / renderBoxSize.y
      );
      newRenderTargetSize.ceil();

      // Ensure there's something to render.
      if (newRenderTargetSize.x <= 0 || newRenderTargetSize.y <= 0) return;

      // Update texture size.
      this.renderTarget.setSize(newRenderTargetSize.x, newRenderTargetSize.y);

      // Render to texture.
      this.object3D.visible = false;
      this.mesh.visible = false;
      renderer.setRenderTarget(this.renderTarget);
      renderer.render(scene, renderCamera);
      renderer.setRenderTarget(prevRenderTarget);
      this.object3D.visible = true;
      this.mesh.visible = true;
      this.material.uniformsNeedUpdate = true;
    };

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
    this.object3D.remove(this.mesh);
    this.geom.dispose();
    this.material.dispose();
    this.renderTarget.dispose();
  }
}
