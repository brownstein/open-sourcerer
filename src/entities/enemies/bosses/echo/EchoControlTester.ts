import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D
} from "three";

import {
  BaseEntityType,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { ThreeSpine } from "src/engine/spine/ThreeSpine";

export type EchoControlTesterMode = "position" | "rotation";

export type EchoControlTesterProps = EntityProps & {
  parent: BaseEntityType;
  threeSpine: ThreeSpine;
  boneName: string;
  mode?: EchoControlTesterMode;
  color?: number;
  /** Visual and hit-test radius of the handle (default 0.15). */
  radius?: number;
  /** World-space offset from the bone position for visual placement. */
  visualOffset?: { x: number; y: number };
};

function createDiamondGeometry(radius: number): BufferGeometry {
  const verts = new Float32Array([
    0, radius, 0,
    radius, 0, 0,
    0, -radius, 0,
    -radius, 0, 0
  ]);
  const indices = new Uint16Array([0, 2, 1, 0, 3, 2]);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(verts, 3));
  geom.setIndex(new BufferAttribute(indices, 1));
  return geom;
}

/**
 * Dev tool: a draggable handle that tracks a Spine bone's world position.
 *
 * In "position" mode (default), dragging stores an x/y offset applied to
 * the bone's local position in the pre-world-transform hook.
 *
 * In "rotation" mode, dragging computes the angle from the bone center to
 * the cursor and stores the delta as a rotation offset in degrees.
 *
 * Uses direct document mouse events so dragging works even when the game
 * is paused (the render loop still updates cursorScenePosition).
 */
export class EchoControlTester extends CoreEntity {
  static type = "EchoControlTester";
  public type = "EchoControlTester";
  public object3D = new Object3D();

  private parent: BaseEntityType;
  private threeSpine: ThreeSpine;
  public boneName: string;
  public mode: EchoControlTesterMode;
  private visualOffset: { x: number; y: number };
  private radius: number;

  /** Bone-local position offset (position mode). */
  public boneOffsetX = 0;
  public boneOffsetY = 0;
  /** Bone rotation offset in degrees (rotation mode). */
  public boneRotationOffset = 0;
  /** When true, the handle is invisible and ignores interaction. */
  public hidden = false;

  private dragging = false;
  // Position mode drag state
  private dragStartBoneWorldX = 0;
  private dragStartBoneWorldY = 0;
  private dragStartCursorX = 0;
  private dragStartCursorY = 0;
  // Rotation mode drag state
  private dragStartAngle = 0;

  private boundMouseDown = (e: MouseEvent) => this._onMouseDown(e);
  private boundMouseUp = () => this._onMouseUp();
  private boundMouseMove = () => this._onMouseMove();

  private marker: Mesh;

  constructor(props: EchoControlTesterProps) {
    super(props);
    this.parent = props.parent;
    this.threeSpine = props.threeSpine;
    this.boneName = props.boneName;
    this.mode = props.mode ?? "position";
    this.visualOffset = props.visualOffset ?? { x: 0, y: 0 };

    this.radius = props.radius ?? 0.15;

    const color = props.color ?? 0xff0000;
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthTest: false
    });

    if (this.mode === "rotation") {
      this.marker = new Mesh(createDiamondGeometry(this.radius), material);
    } else {
      this.marker = new Mesh(new CircleGeometry(this.radius, 16), material);
    }
    this.marker.position.z = 50;
    this.object3D.add(this.marker);

    this.object3D.position.copy(this.position);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    document.addEventListener("mousedown", this.boundMouseDown);
    document.addEventListener("mouseup", this.boundMouseUp);
    document.addEventListener("mousemove", this.boundMouseMove);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    document.removeEventListener("mousedown", this.boundMouseDown);
    document.removeEventListener("mouseup", this.boundMouseUp);
    document.removeEventListener("mousemove", this.boundMouseMove);
    super.detachFromLevel(level);
  }

  destroy(): void {
    document.removeEventListener("mousedown", this.boundMouseDown);
    document.removeEventListener("mouseup", this.boundMouseUp);
    document.removeEventListener("mousemove", this.boundMouseMove);
    super.destroy();
    this.marker.geometry.dispose();
    (this.marker.material as MeshBasicMaterial).dispose();
  }

  step(_ms: number) {
    super.step(_ms);
    this.object3D.visible = !this.hidden;
    if (this.hidden) {
      if (this.dragging) this.dragging = false;
      return;
    }
    if (!this.dragging) {
      this._trackBone();
    }
    this.object3D.position.copy(this.position);
  }

  private _getBoneWorldPos(): { x: number; y: number } | null {
    const bone = this.threeSpine.skeleton.findBone(this.boneName);
    if (!bone) return null;
    const meshScale = this.threeSpine.mesh.scale.x;
    return {
      x: bone.worldX * meshScale + this.parent.position.x,
      y: bone.worldY * meshScale + this.parent.position.y
    };
  }

  private _trackBone() {
    const boneWorld = this._getBoneWorldPos();
    if (!boneWorld) return;
    this.position.set(
      boneWorld.x + this.visualOffset.x,
      boneWorld.y + this.visualOffset.y,
      0
    );
  }

  private _getCursorWorldPos(): { x: number; y: number } | null {
    const cursor = this.level?.controls?.cursorScenePosition;
    if (!cursor) return null;
    return { x: cursor.x, y: cursor.y };
  }

  private _onMouseDown(e: MouseEvent) {
    if (e.button !== 0 || this.hidden) return;
    const cursor = this._getCursorWorldPos();
    if (!cursor) return;
    const dx = cursor.x - this.position.x;
    const dy = cursor.y - this.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > this.radius) return;

    this.dragging = true;

    if (this.mode === "rotation") {
      const boneWorld = this._getBoneWorldPos();
      if (boneWorld) {
        this.dragStartAngle = Math.atan2(
          cursor.y - boneWorld.y,
          cursor.x - boneWorld.x
        );
      }
    } else {
      this.dragStartCursorX = cursor.x;
      this.dragStartCursorY = cursor.y;
      const boneWorld = this._getBoneWorldPos();
      if (boneWorld) {
        this.dragStartBoneWorldX = boneWorld.x;
        this.dragStartBoneWorldY = boneWorld.y;
      }
    }
  }

  private _onMouseUp() {
    this.dragging = false;
  }

  private _onMouseMove() {
    if (!this.dragging) return;
    if (this.mode === "rotation") {
      this._updateRotationDrag();
    } else {
      this._updatePositionDrag();
    }
  }

  private _updatePositionDrag() {
    const cursor = this._getCursorWorldPos();
    if (!cursor) return;

    const meshScale = this.threeSpine.mesh.scale.x;
    const worldDeltaX = cursor.x - this.dragStartCursorX;
    const worldDeltaY = cursor.y - this.dragStartCursorY;

    const spineDeltaX = worldDeltaX / meshScale;
    const spineDeltaY = worldDeltaY / meshScale;

    const bone = this.threeSpine.skeleton.findBone(this.boneName);
    if (!bone) return;
    const parentBone = bone.parent;
    if (parentBone) {
      const det = parentBone.a * parentBone.d - parentBone.b * parentBone.c;
      if (Math.abs(det) > 0.0001) {
        this.boneOffsetX = (parentBone.d * spineDeltaX - parentBone.b * spineDeltaY) / det;
        this.boneOffsetY = (-parentBone.c * spineDeltaX + parentBone.a * spineDeltaY) / det;
      }
    } else {
      this.boneOffsetX = spineDeltaX;
      this.boneOffsetY = spineDeltaY;
    }

    this.position.set(
      this.dragStartBoneWorldX + worldDeltaX,
      this.dragStartBoneWorldY + worldDeltaY,
      0
    );
    this.object3D.position.copy(this.position);
  }

  private _updateRotationDrag() {
    const cursor = this._getCursorWorldPos();
    if (!cursor) return;
    const boneWorld = this._getBoneWorldPos();
    if (!boneWorld) return;

    const currentAngle = Math.atan2(
      cursor.y - boneWorld.y,
      cursor.x - boneWorld.x
    );
    const deltaRad = currentAngle - this.dragStartAngle;
    this.boneRotationOffset = (deltaRad * 180) / Math.PI;

    // Keep the rotation tester orbiting at its visual offset distance from the bone
    const offsetDist = Math.sqrt(
      this.visualOffset.x * this.visualOffset.x +
      this.visualOffset.y * this.visualOffset.y
    );
    const baseAngle = Math.atan2(this.visualOffset.y, this.visualOffset.x);
    const orbitAngle = baseAngle + deltaRad;
    this.position.set(
      boneWorld.x + Math.cos(orbitAngle) * offsetDist,
      boneWorld.y + Math.sin(orbitAngle) * offsetDist,
      0
    );
    this.object3D.position.copy(this.position);
  }
}
