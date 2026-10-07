import {
  BufferAttribute,
  BufferGeometry,
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

import { EchoAnimation } from "./dataTypes";

const ANIMATIONS = Object.values(EchoAnimation);

function createTriangleGeometry(size: number): BufferGeometry {
  const h = size * 0.866;
  const verts = new Float32Array([
    0, h * 0.667, 0,
    -size * 0.5, -h * 0.333, 0,
    size * 0.5, -h * 0.333, 0
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(verts, 3));
  geom.setIndex(new BufferAttribute(indices, 1));
  return geom;
}

export type EchoAnimationCyclerProps = EntityProps & {
  parent: BaseEntityType;
  threeSpine: ThreeSpine;
  /** World-space offset from the parent position. */
  offset: { x: number; y: number };
  color?: number;
};

/**
 * Dev tool: a clickable handle placed at the Echo's top-right that cycles
 * through the primary Spine animations on each click.
 */
export class EchoAnimationCycler extends CoreEntity {
  static type = "EchoAnimationCycler";
  public type = "EchoAnimationCycler";
  public object3D = new Object3D();

  private parent: BaseEntityType;
  private threeSpine: ThreeSpine;
  private offset: { x: number; y: number };
  private animIndex = 0;

  private marker: Mesh<BufferGeometry, MeshBasicMaterial>;

  private boundMouseDown = (e: MouseEvent) => this._onMouseDown(e);

  constructor(props: EchoAnimationCyclerProps) {
    super(props);
    this.parent = props.parent;
    this.threeSpine = props.threeSpine;
    this.offset = props.offset;

    const color = props.color ?? 0xffcc00;
    const material = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      depthTest: false
    });

    this.marker = new Mesh(createTriangleGeometry(0.15), material);
    this.marker.position.z = 50;
    this.object3D.add(this.marker);

    this.object3D.position.copy(this.position);
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    document.addEventListener("mousedown", this.boundMouseDown);
  }

  detachFromLevel(level: EntityLevelAPI): void {
    document.removeEventListener("mousedown", this.boundMouseDown);
    super.detachFromLevel(level);
  }

  destroy(): void {
    document.removeEventListener("mousedown", this.boundMouseDown);
    super.destroy();
    this.marker.geometry.dispose();
    this.marker.material.dispose();
  }

  step(_ms: number) {
    super.step(_ms);
    this.position.set(
      this.parent.position.x + this.offset.x,
      this.parent.position.y + this.offset.y,
      0
    );
    this.object3D.position.copy(this.position);
  }

  private _getCursorWorldPos(): { x: number; y: number } | null {
    const cursor = this.level?.controls?.cursorScenePosition;
    if (!cursor) return null;
    return { x: cursor.x, y: cursor.y };
  }

  private _onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const cursor = this._getCursorWorldPos();
    if (!cursor) return;
    const dx = cursor.x - this.position.x;
    const dy = cursor.y - this.position.y;
    if (Math.sqrt(dx * dx + dy * dy) > 0.4) return;

    this.animIndex = (this.animIndex + 1) % ANIMATIONS.length;
    const animName = ANIMATIONS[this.animIndex];
    const entry = this.threeSpine.animationState.setAnimation(0, animName);
    entry.loop = true;
    console.log(`[EchoAnimationCycler] → ${animName}`);
  }
}
