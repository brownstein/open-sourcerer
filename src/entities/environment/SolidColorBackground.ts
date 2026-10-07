import { Color, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry as PlaneBufferGeometry, Vector2 } from "three";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";

export class SolidColorBackground extends CoreEntity {
  static type = "SolidColorBackground";
  public type = "SolidColorBackground";

  public object3D = new Object3D();

  private geom?: PlaneBufferGeometry;
  private material?: MeshBasicMaterial;
  private bg?: Mesh;
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(props: EntityProps) {
    super(props);
  }
  attachToLevel(level: EntityLevelAPI): void {
    const levelCenter = new Vector2();
    const levelSize = new Vector2();
    level.getWorldBoundaries().getCenter(levelCenter);
    level.getWorldBoundaries().getSize(levelSize);

    this.position.x = levelCenter.x;
    this.position.y = levelCenter.y;
    this.position.z -= 20;
    this.object3D.position.copy(this.position);
    this.size = {
      width: levelSize.x,
      height: levelSize.y
    };

    this.geom = new PlaneBufferGeometry(this.size.width, this.size.height);
    this.material = new MeshBasicMaterial({
      color: new Color(0x112233),
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
