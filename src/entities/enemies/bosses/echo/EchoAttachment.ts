import { RegionAttachment } from "@esotericsoftware/spine-core";
import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineLoop,
  Object3D,
  Vector2
} from "three";

import {
  BaseEntityType,
  EntityAlignment,
  EntityHitDetails,
  EntityLevelAPI,
  EntityProps
} from "src/api/entity";
import { enemyCollisionGroup } from "src/engine/constants/collisionGroups";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { ThreeSpine } from "src/engine/spine/ThreeSpine";
import { vector3To2 } from "src/engine/util/vecTypes";
import { convexHull2D } from "src/util/convexHull";

import polygons from "./attachmentPolygons";

/** Default spring stiffness for snappy animation tracking. */
const SPRING_STIFFNESS_DEFAULT = 1000;
/** Reduced spring stiffness after a hit for satisfying recoil. */
const SPRING_STIFFNESS_HIT = 10;
/** How long (ms) the stiffness stays reduced after a hit. */
const HIT_RECOIL_DURATION_MS = 400;
/** Linear damping to bleed off impulse energy over time. */
const LINEAR_DAMPING = 30;
/** Angular spring stiffness for the corrective torque pulling the RB toward ideal rotation. */
const ANGULAR_STIFFNESS = 200;
/** Angular damping to bleed off angular velocity. */
const ANGULAR_DAMPING = 30;

export type EchoAttachmentProps = EntityProps & {
  parent: BaseEntityType;
  threeSpine: ThreeSpine;
  /** Convex hull vertices as flat xy pairs in game-world units, centered around the centroid. */
  hullPoints: Float32Array;
  /** Initial centroid of the hull in game-world units (relative to skeleton root). */
  centroid: [number, number];
  /** Slot names whose animated positions drive the rigid body position each frame. */
  hullSlotNames: string[];
  /** Slot names to flash when this attachment is hit. */
  flashSlots: string[];
  /** If true, render the collider polygon as a debug overlay. */
  debugPolygons?: boolean;
  /** Color for the debug polygon lines. */
  debugColor?: number;
};

export class EchoAttachment extends CoreEntity {
  public alignment = EntityAlignment.Enemy;
  public object3D = new Object3D();

  private parent: BaseEntityType;
  private threeSpine: ThreeSpine;
  private hullPoints: Float32Array;
  private hullSlotNames: string[];
  private flashSlots: string[];
  private rigidBody?: RigidBody;
  private collider?: Collider;
  private debugPolygons: boolean;
  private debugColor: number;
  /** Hull centroid in skeleton-local scaled coords (before centering). */
  private hullCentroid: [number, number];
  /** Delta between hull centroid and rectangular centroid, computed at init. */
  public centroidDelta = new Vector2();
  /** Remaining recoil time (ms) — spring stiffness is reduced while > 0. */
  private recoilTimeRemaining = 0;
  // Whether to override knockback for relevant animations which jerk the
  // attachment around quickly.
  private overrideKnockback = false;

  constructor(props: EchoAttachmentProps) {
    super(props);
    this.parent = props.parent;
    this.threeSpine = props.threeSpine;
    this.hullPoints = props.hullPoints;
    this.hullCentroid = props.centroid;
    this.hullSlotNames = props.hullSlotNames;
    this.flashSlots = props.flashSlots;
    this.debugPolygons = props.debugPolygons ?? false;
    this.debugColor = props.debugColor ?? 0xff3333;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    this._createPhysics();
    if (this.debugPolygons) this._createDebugVisual();
  }

  destroy(): void {
    if (this.level) {
      if (this.collider) this.level.world.removeCollider(this.collider, false);
      if (this.rigidBody) this.level.world.removeRigidBody(this.rigidBody);
    }
    super.destroy();
    this.rigidBody = undefined;
    this.collider = undefined;
    this._disposeDebugLine();
  }

  step(ms: number) {
    super.step(ms);
  }

  hit(hitDetails: EntityHitDetails) {
    super.hit(hitDetails);

    // Soften the spring so the hit impulse produces visible recoil.
    this.recoilTimeRemaining = HIT_RECOIL_DURATION_MS;

    // Apply hit impulse to the rigid body for physics-driven knockback.
    if (this.rigidBody && hitDetails.hitImpulse) {
      this.rigidBody.applyImpulse(
        { x: hitDetails.hitImpulse.x, y: hitDetails.hitImpulse.y },
        true
      );
    }

    // Visual flash.
    this.scheduler.add({
      duration: 150,
      invokeFunction: (t) => {
        const intensity = Math.sin(t * Math.PI);
        for (const slotName of this.flashSlots) {
          this.threeSpine.setSlotShaderOverride(slotName, {
            fadeAmount: intensity * 0.5,
            fadeColor: 0xffffff,
            outlineAmount: intensity,
            outlineColor: 0xffffff
          });
        }
      }
    });
  }

  /**
   * Replace the collider shape with a new convex hull and update the centroid.
   * Called by Echo after the transform animation to match the new skeleton pose.
   * Resets the RB rotation to 0 since the new hull encodes the current bone orientation.
   */
  updateHull(hullPoints: Float32Array, centroid: [number, number]) {
    this.hullPoints = hullPoints;
    this.hullCentroid = centroid;

    if (!this.level || !this.collider || !this.rigidBody) return;
    const { rapier } = this.level;

    const collDesc = rapier.ColliderDesc.convexHull(hullPoints);
    if (!collDesc) return;

    // Recompute centroid delta for the new hull shape
    const rectCentroid = this._computeAnimatedCentroid();
    this.centroidDelta.set(
      centroid[0] - rectCentroid.x,
      centroid[1] - rectCentroid.y
    );

    // Replace the collider shape in-place
    this.collider.setShape(collDesc.shape);

    // Reset RB rotation — new hull already encodes the current bone orientation
    this.rigidBody.setRotation(0, true);
    this.rigidBody.setAngvel(0, true);

    // Update debug visual if present
    this._updateDebugVisual();
  }

  /** Get the rigid body's current world-space position and rotation. */
  getRigidBodyState(): { x: number; y: number; rotation: number } | null {
    if (!this.rigidBody) return null;
    const pos = this.rigidBody.translation();
    return { x: pos.x, y: pos.y, rotation: this.rigidBody.rotation() };
  }

  /**
   * Apply corrective spring force and torque toward the given ideal position
   * and rotation, then update the debug visual to the actual RB state.
   * Called by Echo after it computes the correct pre-override ideal.
   */
  applyCorrectiveForce(idealX: number, idealY: number, idealRotation: number, dtMs: number) {
    if (!this.rigidBody) return;

    // If overriding knockback, just apply the specified position and rotation.
    if (this.overrideKnockback) {
      this.rigidBody.resetForces(true);
      this.rigidBody.setTranslation({
        x: idealX,
        y: idealY
      }, true);
      this.rigidBody.setRotation(idealRotation, true);
      this.object3D.position.set(idealX, idealY, this.object3D.position.z);
      this.object3D.rotation.z = idealRotation;
      return;
    }

    // Lerp stiffness from hit value back to default over the recoil duration.
    let stiffness: number;
    if (this.recoilTimeRemaining > 0) {
      const t = 1 - this.recoilTimeRemaining / HIT_RECOIL_DURATION_MS;
      stiffness = SPRING_STIFFNESS_HIT + (SPRING_STIFFNESS_DEFAULT - SPRING_STIFFNESS_HIT) * t;
      this.recoilTimeRemaining = Math.max(0, this.recoilTimeRemaining - dtMs);
    } else {
      stiffness = SPRING_STIFFNESS_DEFAULT;
    }

    const rbPos = this.rigidBody.translation();
    const dx = idealX - rbPos.x;
    const dy = idealY - rbPos.y;
    const mass = this.rigidBody.mass();
    this.rigidBody.resetForces(true);
    this.rigidBody.addForce(
      { x: dx * stiffness * mass, y: dy * stiffness * mass },
      true
    );

    // Angular correction: compute shortest-path angle delta
    let dAngle = idealRotation - this.rigidBody.rotation();
    // Normalize to [-PI, PI]
    while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
    while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
    this.rigidBody.resetTorques(true);
    this.rigidBody.addTorque(dAngle * ANGULAR_STIFFNESS * this.rigidBody.mass(), true);

    this.object3D.position.set(rbPos.x, rbPos.y, this.object3D.position.z);
    this.object3D.rotation.z = this.rigidBody.rotation();
  }

  private _createPhysics() {
    if (!this.level) return;
    const { rapier, world } = this.level;

    // Compute the delta between the hull centroid (from traced polygon data)
    // and the rectangular centroid (average of slot corner positions). The hull
    // shape is centered around 0, so the rigid body must be placed at the hull
    // centroid — but each frame we track the rectangular centroid. The delta
    // corrects for the offset between the two.
    const rectCentroid = this._computeAnimatedCentroid();
    this.centroidDelta.set(
      this.hullCentroid[0] - rectCentroid.x,
      this.hullCentroid[1] - rectCentroid.y
    );

    const parentPos = vector3To2(this.parent.position);
    const ix = rectCentroid.x + this.centroidDelta.x + parentPos.x;
    const iy = rectCentroid.y + this.centroidDelta.y + parentPos.y;

    const rbDesc = new rapier.RigidBodyDesc(
      rapier.RigidBodyType.Dynamic
    ).setTranslation(ix, iy);
    rbDesc.setGravityScale(0);
    rbDesc.setLinearDamping(LINEAR_DAMPING);
    rbDesc.setAngularDamping(ANGULAR_DAMPING);

    this.rigidBody = world.createRigidBody(rbDesc);

    const collDesc = rapier.ColliderDesc.convexHull(this.hullPoints);
    if (!collDesc) return;
    collDesc.setCollisionGroups(enemyCollisionGroup);
    collDesc.setDensity(1);
    this.collider = world.createCollider(collDesc, this.rigidBody);

    this.level.registerEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.rigidBody.handle,
      colliderHandles: [this.collider.handle]
    });
  }

  private _computeAnimatedCentroid(): Vector2 {
    const { skeleton } = this.threeSpine;
    const meshScale = this.threeSpine.mesh.scale.x;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const slotName of this.hullSlotNames) {
      const slot = skeleton.findSlot(slotName);
      if (!slot) continue;
      const attachment = slot.getAttachment();
      if (!attachment || !(attachment instanceof RegionAttachment)) continue;

      const verts = new Float32Array(8);
      attachment.computeWorldVertices(slot, verts, 0, 2);

      for (let i = 0; i < 8; i += 2) {
        sumX += verts[i];
        sumY += verts[i + 1];
        count++;
      }
    }

    if (count === 0) return new Vector2();
    return new Vector2((sumX / count) * meshScale, (sumY / count) * meshScale);
  }

  private debugLine?: LineLoop;

  private _createDebugVisual() {
    this._buildDebugLine();
  }

  private _updateDebugVisual() {
    if (!this.debugPolygons) return;
    this._disposeDebugLine();
    this._buildDebugLine();
  }

  private _disposeDebugLine() {
    if (!this.debugLine) return;
    this.object3D.remove(this.debugLine);
    this.debugLine.geometry.dispose();
    (this.debugLine.material as LineBasicMaterial).dispose();
    this.debugLine = undefined;
  }

  private _buildDebugLine() {
    if (this.hullPoints.length < 4) return;

    const numVerts = this.hullPoints.length / 2;
    const positions = new Float32Array(numVerts * 3);
    for (let v = 0; v < numVerts; v++) {
      positions[v * 3] = this.hullPoints[v * 2];
      positions[v * 3 + 1] = this.hullPoints[v * 2 + 1];
      positions[v * 3 + 2] = 30;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new LineBasicMaterial({
      color: this.debugColor,
      depthTest: true
    });
    this.debugLine = new LineLoop(geometry, material);
    this.object3D.add(this.debugLine);
  }

  /**
   * Collects world-space vertices from the given slots' region attachments,
   * centers them around their centroid, and returns them as a flat Float32Array
   * suitable for Rapier's convexHull() along with the centroid offset.
   *
   * When traced polygon data exists for an attachment, those outline points are
   * mapped to world space via the slot's 4 world-space corners and added to the
   * point set. Otherwise the 4 rectangular corners are used as a fallback.
   * All points from all slots are combined and convexHull() produces the final shape.
   */
  static extractHullFromSlots(
    threeSpine: ThreeSpine,
    slotNames: string[]
  ): { points: Float32Array; centroid: [number, number] } | null {
    const { skeleton } = threeSpine;
    const meshScale = threeSpine.mesh.scale.x;
    const points: number[] = [];

    for (const slotName of slotNames) {
      const slot = skeleton.findSlot(slotName);
      if (!slot) continue;
      const attachment = slot.getAttachment();
      if (!attachment || !(attachment instanceof RegionAttachment)) continue;

      // computeWorldVertices: indices 0-1=BL, 2-3=TL, 4-5=TR, 6-7=BR
      const verts = new Float32Array(8);
      attachment.computeWorldVertices(slot, verts, 0, 2);

      const polyData = polygons[attachment.name];
      if (polyData && polyData.points.length >= 3) {
        // Map traced polygon points to world space via bilinear interpolation
        const tlx = verts[2], tly = verts[3];
        const trx = verts[4], try_ = verts[5];
        const blx = verts[0], bly = verts[1];
        const brx = verts[6], bry = verts[7];

        for (const [px, py] of polyData.points) {
          const u = px / polyData.width;
          const v = py / polyData.height;
          points.push(
            (tlx * (1 - u) * (1 - v) + trx * u * (1 - v) +
             blx * (1 - u) * v + brx * u * v) * meshScale,
            (tly * (1 - u) * (1 - v) + try_ * u * (1 - v) +
             bly * (1 - u) * v + bry * u * v) * meshScale
          );
        }
      } else {
        // Fallback: use the 4 rectangular corners
        for (let i = 0; i < 8; i += 2) {
          points.push(verts[i] * meshScale, verts[i + 1] * meshScale);
        }
      }
    }

    if (points.length < 6) return null; // Need at least 3 vertices.

    // Compute convex hull (Andrew's monotone chain) so points are ordered
    const hull = convexHull2D(points);
    if (hull.length < 6) return null;

    // Compute centroid and center the hull around it
    const n = hull.length / 2;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < hull.length; i += 2) {
      cx += hull[i];
      cy += hull[i + 1];
    }
    cx /= n;
    cy /= n;

    for (let i = 0; i < hull.length; i += 2) {
      hull[i] -= cx;
      hull[i + 1] -= cy;
    }

    return { points: new Float32Array(hull), centroid: [cx, cy] };
  }
  setKnockbackEnabled(enabled: boolean) {
    this.overrideKnockback = !enabled;
  }
}
