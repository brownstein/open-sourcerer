import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import { makeCCW, quickDecomp, removeCollinearPoints } from "poly-decomp";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector2
} from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { arr2, sizeToVector2, vector2ToArr2 } from "src/engine/util/vecTypes";

export class RigidSquareBehavior implements EntityBehavior {
  type = "RigidSquare";
  public size: Vector2;
  public body?: RigidBody;
  public collider?: Collider;
  private entity?: BaseEntityType;
  constructor(size: Vector2) {
    this.size = size;
  }
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step.bind(this));
    this.size = entity.initialProps.size
      ? sizeToVector2(entity.initialProps.size)
      : this.size;
  }
  attachToLevel(level: LevelAPI) {
    if (!this.entity) return;
    const { ColliderDesc, RigidBodyDesc } = level.rapier;
    const rigidBodyDesc = RigidBodyDesc.dynamic();
    this.body = level.world.createRigidBody(rigidBodyDesc);
    const colliderDesc = ColliderDesc.cuboid(
      this.size.x * 0.5,
      this.size.y * 0.5
    );
    this.body.setTranslation(this.entity?.position ?? { x: 0, y: 0 }, true);
    this.body.setRotation(this.entity?.initialProps.angle ?? 0, true);
    this.collider = level.world.createCollider(colliderDesc, this.body);
    this.syncEntityPosition();
  }
  detachFromLevel(level: LevelAPI) {
    if (this.collider) level.world.removeCollider(this.collider, false);
    if (this.body) level.world.removeRigidBody(this.body);
  }
  step() {
    if (!this.body) return;
    this.syncEntityPosition();
  }
  protected syncEntityPosition() {
    const entity = this.entity;
    const pos = this.body?.translation();
    const rot = this.body?.rotation() ?? 0;
    if (!pos || !entity?.object3D) return;
    entity.object3D.position.x =
      kInvPixelScale * Math.round(pos.x * kPixelScale);
    entity.object3D.position.y =
      kInvPixelScale * Math.round(pos.y * kPixelScale);
    entity.object3D.rotation.z = rot;
  }
}

export class HelloWorld extends CoreEntity {
  static type = "HelloWorld";
  public type = "HelloWorld";
  public object3D = new Object3D();

  behaviors = {
    rigidSquaire: new RigidSquareBehavior(new Vector2(1, 1))
  };

  private disposalCallbacks: (() => void)[] = [];

  constructor(props: EntityProps) {
    super(props);
    this.object3D.position.copy(this.position);
    this.object3D.rotation.z = this.angle;
    if (this.size.width && this.size.height) {
      this.behaviors.rigidSquaire.init(this);
      const geom = new BoxGeometry(
        this.behaviors.rigidSquaire.size.x,
        this.behaviors.rigidSquaire.size.y,
        0.1
      );
      const material = new MeshBasicMaterial({
        color: Math.floor(0x888888 * Math.random()) + 0x777777,
        // map: getResource(HelloWorld, "HelloWorldTexture"),
        transparent: true
      });
      this.disposalCallbacks.push(() => {
        geom.dispose();
        material.dispose();
      });
      this.object3D.add(new Mesh(geom, material));
    }
    if (props.polygon) {
      // TODO: standardize this.
      const geom = new BufferGeometry();
      const polyArr = props.polygon.map(vector2ToArr2);
      makeCCW(polyArr);
      const decomposedArr: arr2[][] = quickDecomp(polyArr);
      for (const polyArr of decomposedArr) removeCollinearPoints(polyArr);
      const posArr = new Float32Array(
        decomposedArr.reduce((acc, arr) => acc + arr.length * 3, 0)
      );
      const indexArr = new Uint16Array(
        decomposedArr.reduce((acc, arr) => acc + (arr.length - 2) * 3, 0)
      );
      let pIndex = 0;
      let iIndex = 0;
      for (const polyArr of decomposedArr) {
        for (let i = 0; i < 2; i++) {
          posArr[(pIndex + i) * 3 + 0] = polyArr[i][0];
          posArr[(pIndex + i) * 3 + 1] = polyArr[i][1];
        }
        for (let i = 2; i < polyArr.length; i++) {
          posArr[(pIndex + i) * 3 + 0] = polyArr[i][0];
          posArr[(pIndex + i) * 3 + 1] = polyArr[i][1];
          const ii = i - 2;
          indexArr[(iIndex + ii) * 3 + 0] = pIndex;
          indexArr[(iIndex + ii) * 3 + 1] = pIndex + i - 1;
          indexArr[(iIndex + ii) * 3 + 2] = pIndex + i;
        }
        pIndex += polyArr.length;
        iIndex += polyArr.length - 2;
      }
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
      geom.setIndex(new BufferAttribute(indexArr, 1));
      const material = new MeshBasicMaterial({
        color: Math.floor(0x888888 * Math.random()) + 0x777777,
        side: DoubleSide
      });
      this.disposalCallbacks.push(() => {
        geom.dispose();
        material.dispose();
      });
      this.object3D.add(new Mesh(geom, material));
    }
    if (props.polyline) {
      const geom = new BufferGeometry();
      const posArr = new Float32Array((props.polyline.length - 1) * 6);
      let pIndex = 0;
      for (let i = 1; i < props.polyline.length; i++) {
        posArr[pIndex * 3 + 0] = props.polyline[i - 1].x;
        posArr[pIndex * 3 + 1] = props.polyline[i - 1].y;
        posArr[pIndex * 3 + 3] = props.polyline[i].x;
        posArr[pIndex * 3 + 4] = props.polyline[i].y;
        pIndex += 2;
      }
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
      const material = new LineBasicMaterial({
        color: Math.floor(0x888888 * Math.random()) + 0x777777
      });
      this.disposalCallbacks.push(() => {
        geom.dispose();
        material.dispose();
      });
      this.object3D.add(new Line(geom, material));
    }
  }
  destroy(): void {
    super.destroy();
    for (const cb of this.disposalCallbacks) cb();
    this.disposalCallbacks = [];
  }
}
