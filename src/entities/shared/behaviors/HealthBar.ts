import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector3
} from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents
} from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { getResource } from "src/engine/entity/decorators";

import { SharedAssets } from "../SharedAssets";
import healthBarJson from "../sprites/health-bar-container.json";

export class HealthBarBehavior implements EntityBehavior {
  public readonly type = "HealthBar";
  public object3D = new Object3D();
  private containerSprite?: ThreeAseprite;
  private entity?: BaseEntityType;
  private geom?: BufferGeometry;
  private vtxPos?: Float32Array;
  private material?: MeshBasicMaterial;
  private barMesh?: Mesh;

  private readonly originalOffset = new Vector3();
  private readonly newOffset = new Vector3();

  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.object3D?.add(this.object3D);

    // Compensate for parent object3D scaling so the health bar remains
    // visible even if the entity scales its object3D (e.g. by kInvPixelScale)
    const ps = this.entity.object3D?.scale;
    const invX = ps ? 1 / ps.x : 1;
    const invY = ps ? 1 / ps.y : 1;
    const invZ = ps ? 1 / ps.z : 1;

    this.object3D.position.y = (this.entity.size.height * 0.5 + 0.5) * invY;
    this.object3D.scale.set(0.6 * invX, 0.6 * invY, 0.6 * invZ);

    this.containerSprite = new ThreeAseprite({
      texture: getResource(SharedAssets, "health-bar-texture"),
      sourceJSON: healthBarJson,
      frameName: ({ layerName, frame }) => `(${layerName}) ${frame}`,
      offset: { x: -2, y: 0.5 }
    });
    this.containerSprite.setLayerOpacities(
      {
        "Iron Bar": 1
      },
      0
    );
    this.containerSprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.containerSprite.mesh);

    this.geom = new BufferGeometry();
    const vtxIndex = new Uint16Array(6);
    const vtxPos = new Float32Array(12);
    vtxIndex[0] = 0;
    vtxIndex[1] = 1;
    vtxIndex[2] = 2;
    vtxIndex[3] = 2;
    vtxIndex[4] = 1;
    vtxIndex[5] = 3;
    this.vtxPos = vtxPos;
    this.geom.setIndex(new BufferAttribute(vtxIndex, 1));
    this.geom.setAttribute("position", new BufferAttribute(vtxPos, 3));

    this.material = new MeshBasicMaterial({
      color: new Color(0xcc0000),
      opacity: 1,
      transparent: true,
      side: DoubleSide
    });

    this.barMesh = new Mesh(this.geom, this.material);
    this.barMesh.position.z = 0.1;
    this.object3D.add(this.barMesh);

    this.setHealth(1);
    this.setOpacity(1);

    this.entity.events.on(EntityLifecycleEvents.Step, (deltaMs) =>
      this.step(deltaMs)
    );

    this.originalOffset.copy(this.object3D.position);
  }
  step(_deltaMs: number): void {
    if (!this.entity || !this.entity.object3D) return;

    // keep healthbar static over the entity regardless of parent rotation
    this.object3D.quaternion.copy(this.entity.object3D.quaternion).invert();

    this.newOffset
      .copy(this.originalOffset)
      .applyQuaternion(this.object3D.quaternion);

    this.object3D.position.copy(this.newOffset);
  }
  destroy() {
    this.containerSprite?.dispose();
    this.geom?.dispose();
    this.material?.dispose();
  }
  setOpacity(opacity: number) {
    const { containerSprite, material } = this;
    if (!containerSprite || !material) return;
    containerSprite.setOpacity(opacity * 0.5);
    material.opacity = opacity;
    if (opacity === 0) {
      containerSprite.mesh.visible = false;
      if (this.barMesh) this.barMesh.visible = false;
    } else {
      containerSprite.mesh.visible = true;
      if (this.barMesh) this.barMesh.visible = true;
    }
  }
  getOpacity() {
    return this.material?.opacity ?? 0;
  }
  setHealth(healthRatio: number) {
    const { geom, vtxPos } = this;
    if (!geom || !vtxPos) return;
    const barWidthPx = 37;
    const barHeightPx = 3;
    const barOffsetX = -barWidthPx * kInvPixelScale * 0.5;
    const barSpreadX = barWidthPx * kInvPixelScale * healthRatio;
    const barSpreadY = barHeightPx * kInvPixelScale;
    vtxPos[0] = barOffsetX - barSpreadY;
    vtxPos[1] = barSpreadY * -0.5;
    vtxPos[3] = barOffsetX;
    vtxPos[4] = barSpreadY * 0.5;
    vtxPos[6] = barOffsetX + barSpreadX - barSpreadY;
    vtxPos[7] = barSpreadY * -0.5;
    vtxPos[9] = barOffsetX + barSpreadX;
    vtxPos[10] = barSpreadY * 0.5;
    geom.getAttribute("position").needsUpdate = true;
  }
}
