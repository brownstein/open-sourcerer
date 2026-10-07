import { Color, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry as PlaneBufferGeometry, Vector2 } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { ColorRepresentation } from "src/api/util";
import { CoreEntity } from "src/engine/entity/CoreEntity";

export type SolidColorForegroundProps = EntityProps & {
  color: ColorRepresentation;
};

export class SolidColorForeground extends CoreEntity {
  static type = "SolidColorForeground";
  public type = "SolidColorForeground";

  public object3D = new Object3D();

  private color?: Color;
  private geom?: PlaneBufferGeometry;
  private material?: MeshBasicMaterial;
  private bg?: Mesh;

  constructor(props: SolidColorForegroundProps) {
    super(props);
    this.color = new Color();
    if (props.color) {
      if (typeof props.color === "string" && props.color.length > 7) {
        this.color = new Color(`#${props.color.slice(3)}`);
      } else {
        this.color = new Color(props.color);
      }
    }
  }
  attachToLevel(level: EntityLevelAPI): void {
    const levelCenter = new Vector2();
    const levelSize = new Vector2();
    level.getWorldBoundaries().getCenter(levelCenter);
    level.getWorldBoundaries().getSize(levelSize);

    this.position.x = levelCenter.x;
    this.position.y = levelCenter.y;
    this.position.z = 20;
    this.object3D.position.copy(this.position);
    this.size = {
      width: levelSize.x,
      height: levelSize.y
    };

    this.geom = new PlaneBufferGeometry(this.size.width, this.size.height);
    this.material = new MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 1,
      side: DoubleSide
    });
    this.bg = new Mesh(this.geom, this.material);
    this.object3D.add(this.bg);
  }
  destroy(): void {
    super.destroy();
    this.geom?.dispose();
    this.material?.dispose();
  }
  fadeIn(ms: number = 500) {
    const startOpacity = this.material?.opacity ?? 0;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        if (!this.material) return;
        this.material.opacity = startOpacity * (1 - t) + t;
      },
      invokeFunctionAtComplete: () => {
        if (!this.material) return;
        this.material.opacity = 1;
      }
    });
  }
  fadeOut(ms: number = 500) {
    const startOpacity = this.material?.opacity ?? 0;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        if (!this.material) return;
        this.material.opacity = startOpacity * (1 - t);
      },
      invokeFunctionAtComplete: () => {
        if (!this.material) return;
        this.material.opacity = 0;
      }
    });
  }
}
