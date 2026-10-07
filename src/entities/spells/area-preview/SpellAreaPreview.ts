import { Color, DoubleSide, Mesh, Object3D, ShaderMaterial } from "three";

import { BaseEntityType, EntityLevelAPI, EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { arr2 } from "src/engine/util/vecTypes";
import Line2DGeometry from "src/vendor/ThreeLine2D";

import sensorShaderFrag from "../sensor/sensorShaderFrag.glsl";
import sensorShaderVert from "../sensor/sensorShaderVert.glsl";

export type SpellAreaPreviewProps = EntityProps & {
  previewPolygon: arr2[];
  attachToEntityId?: string;
  color?: { r: number; g: number; b: number };
};

export class SpellAreaPreview extends CoreEntity implements BaseEntityType {
  static type = "SpellAreaPreview";
  public type = "SpellAreaPreview";
  public object3D = new Object3D();

  private polygon: arr2[];
  private attachToEntityId?: string;

  private mesh?: Mesh;
  private threeLineGeom?: Line2DGeometry;
  private material?: ShaderMaterial;
  private opacity = 0;
  private fadingAway = false;

  constructor(props: SpellAreaPreviewProps) {
    super(props);
    this.polygon = props.previewPolygon;
    this.attachToEntityId = props.attachToEntityId;
    if (props.color) {
      this._color = new Color(props.color.r, props.color.g, props.color.b);
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }

  private _color = new Color(0.5, 0.8, 1);

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this.buildMesh();
    this.setOpacity(0.75);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
  }

  step(ms: number) {
    super.step(ms);
    if (this.fadingAway) return;
    if (this.attachToEntityId) {
      const target = this.level?.getEntity(this.attachToEntityId);
      if (target) {
        this.position.copy(target.position);
      } else {
        this.attachToEntityId = undefined;
        this.fadeAway();
        return;
      }
    }
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }

  private buildMesh() {
    if (this.threeLineGeom) {
      this.threeLineGeom.update(this.polygon);
    } else {
      this.threeLineGeom = new Line2DGeometry(this.polygon, {
        closed: true,
        distances: true
      });
    }
    if (!this.material) {
      this.material = new ShaderMaterial({
        vertexShader: sensorShaderVert,
        fragmentShader: sensorShaderFrag,
        transparent: true,
        side: DoubleSide,
        uniforms: {
          thickness: { value: 0.05 },
          color: { value: this._color },
          opacity: { value: this.opacity },
          dashSteps: { value: 32 },
          dashSmooth: { value: 0.01 },
          dashDistance: { value: 0.25 }
        }
      });
    }
    if (!this.mesh) {
      this.mesh = new Mesh(this.threeLineGeom, this.material);
      this.object3D.add(this.mesh);
    }
  }

  setColor(r: number, g: number, b: number) {
    this._color.setRGB(r, g, b);
    if (this.material) {
      this.material.uniforms.color.value = this._color;
      this.material.uniformsNeedUpdate = true;
    }
  }

  setOpacity(opacity: number, duration = 500) {
    const initialOpacity = this.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration,
      invokeFunction: (t) => {
        this.opacity = initialOpacity * (1 - t) + opacity * t;
        if (this.material) {
          this.material.uniforms.opacity.value = this.opacity;
          this.material.uniformsNeedUpdate = true;
        }
      },
      invokeFunctionAtComplete: () => {
        this.opacity = opacity;
        if (this.material) {
          this.material.uniforms.opacity.value = this.opacity;
          this.material.uniformsNeedUpdate = true;
        }
      }
    });
  }

  fadeAway() {
    if (this.fadingAway) return;
    this.fadingAway = true;
    this.setOpacity(0);
    this.scheduler.add({
      id: "scheduledRemove",
      startIn: 500,
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });
  }

  destroy(): void {
    super.destroy();
    this.threeLineGeom?.dispose();
    this.material?.dispose();
  }
}
