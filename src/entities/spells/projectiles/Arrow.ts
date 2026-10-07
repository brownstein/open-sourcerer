import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  Object3D,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  Vector2,
  Vector3
} from "three";

import {
  BaseEntityType,
  EntityBehavior,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { kWorldGravity } from "src/engine/level/Level";
import {
  ProjectilePhysicsBehavior,
  ProjectilePhysicsEvents
} from "src/entities/shared/behaviors/ProjectilePhysics";
import { isWaterTerrain } from "src/entities/terrain/WaterTerrain";

import arrowShaderFrag from "./shaders/arrowShaderFrag.glsl";
import arrowShaderVert from "./shaders/arrowShaderVert.glsl";
import arrowJson from "./sprites/arrow.json";
import arrowPng from "./sprites/arrow.png";

// Define the Arrow class which extends CoreEntity
export class Arrow extends CoreEntity {
  static type = "Arrow"; // Static property to identify the entity type
  public type = "Arrow"; // Instance property to identify the entity type
  public object3D = new Object3D(); // 3D representation of the arrow
  public behaviors = {
    projectilePhysics: new ProjectilePhysicsBehavior(), // Handles arrow physics
    trailRender: new TrailRenderingBehavior() // Handles the trail effect
  };
  public damage = 5; // Damage value for the arrow

  // TODO: replace with ThreeAseprite instance.
  private textureLoader = new TextureLoader(); // Texture loader for arrow sprite
  private sprite?: Sprite; // Arrow sprite
  private sourceEntity?: BaseEntityType;

  // Constructor to initialize the Arrow entity
  constructor(props: EntityProps) {
    super(props);

    // Initialize physics behavior and set initial velocity
    this.behaviors.projectilePhysics.init(this);
    this.behaviors.projectilePhysics.velocity.set(1, 0);

    // Event handler for collision with another entity
    this.behaviors.projectilePhysics.events.on(
      ProjectilePhysicsEvents.CollideWithEntity,
      ([entity, pos, normal]) => {
        if (isWaterTerrain(entity)) {
          return;
        }
        // Disable physics upon collision
        this.behaviors.projectilePhysics.enabled = false;
        // Update arrow position to the collision point
        this.position.x = pos.x;
        this.position.y = pos.y;
        this.object3D.position.x = pos.x;
        this.object3D.position.y = pos.y;

        // Schedule a task to gradually fade out the trail and remove the arrow
        this.scheduler.add({
          duration: 200, // Duration of the fade-out effect in milliseconds
          invokeFunction: (t) => {
            this.behaviors.trailRender.setOpacity(1 - t); // Decrease opacity over time
            if (this.sprite) {
              this.sprite.material.opacity = 1 - t;
              this.sprite.material.needsUpdate = true;
            }
          },
          invokeFunctionAtComplete: () => {
            this.level?.removeEntity(this.id); // Remove the arrow from the level
            this.destroy(); // Destroy the arrow entity
          }
        });

        // Apply damage to the entity hit by the arrow
        entity.hit?.({
          hittingEntity: this,
          sourceEntity: this.sourceEntity ?? this,
          hitImpulse: this.behaviors.projectilePhysics.velocity
            .clone()
            .normalize()
            .multiplyScalar(2), // Calculate hit impulse
          damage: this.damage // Apply damage
        });
      }
    );

    // Load and apply arrow texture
    this.textureLoader.load(arrowPng, (texture) => {
      const frame = arrowJson.frames["arrow (0)"].frame;
      const canvas = document.createElement("canvas");
      canvas.width = frame.w;
      canvas.height = frame.h;
      const context = canvas.getContext("2d");
      context?.drawImage(
        texture.image,
        frame.x,
        frame.y,
        frame.w,
        frame.h,
        0,
        0,
        frame.w,
        frame.h
      );
      const canvasTexture = new CanvasTexture(canvas);
      const spriteMaterial = new SpriteMaterial({ map: canvasTexture });
      this.sprite = new Sprite(spriteMaterial);
      this.sprite.scale.set(frame.w * 0.024, frame.h * 0.012, 1);
      this.object3D.add(this.sprite);
    });

    // Initialize trail rendering behavior
    this.behaviors.trailRender.init(this);

    // Set initial position of the arrow
    this.object3D.position.copy(this.position);
  }

  // Method to ignore a specific entity (e.g., the player who shot the arrow)
  ignoreEntity(entityId: string) {
    this.behaviors.projectilePhysics.ignoreEntityIds.add(entityId);
    return this;
  }

  // Method to set the source of the arrow.
  setSourceEntity(sourceEntity: BaseEntityType) {
    this.sourceEntity = sourceEntity;
    return this;
  }

  // Method to set the velocity of the arrow
  setVelocity(velocity: Vector2) {
    this.behaviors.projectilePhysics.velocity.copy(velocity);
    return this;
  }

  // Method to set the gravity effect on the arrow
  setGravity(gravityScale: number) {
    this.behaviors.projectilePhysics.gravity = {
      x: kWorldGravity.x * gravityScale,
      y: kWorldGravity.y * gravityScale
    };
  }

  // Dispose GPU resources owned by this entity
  destroy() {
    super.destroy();
    if (this.sprite) {
      this.sprite.material.map?.dispose();
      this.sprite.material.dispose();
      this.sprite = undefined;
    }
  }

  // Method to update the arrow's state each frame
  step(ms: number) {
    super.step(ms);

    // Rotate the sprite to match the arrow's direction
    if (this.sprite) {
      const angle = Math.atan2(
        this.behaviors.projectilePhysics.velocity.y,
        this.behaviors.projectilePhysics.velocity.x
      );
      this.sprite.material.rotation = angle;
    }
  }
}
// Define the TrailRenderingBehavior class to handle the arrow's trail effect
export class TrailRenderingBehavior implements EntityBehavior {
  public type = "TrailRendering"; // Behavior type identifier
  public colorInner = new Color(1, 1, 1); // Inner color of the trail
  public colorOuter = new Color(0.5, 0.5, 0.5); // Outer color of the trail
  public colorTrail = new Color(0.8, 0.5, 0.5); // Color of the trail fade
  public opacityInner = 0.9; // Inner opacity of the trail
  public opacityOuter = 0.1; // Outer opacity of the trail
  public mesh?: Mesh; // Mesh object for the trail
  public radius: number = 0.05; // Radius of the trail
  public object3D = new Object3D(); // 3D object for the trail
  public material?: ShaderMaterial; // Shader material for the trail
  private entity?: BaseEntityType; // Reference to the parent entity (arrow)
  private entityPositionDelta = new Vector3(); // Position delta for the entity
  private entityPositionPrevious = new Vector3(); // Previous position of the entity
  private trailPositions: [Vector3, number][] = []; // Positions for the trail segments
  private trailMaxLength = 50; // Maximum length of the trail
  private trailLengthMs = 500; // Duration of the trail in milliseconds
  private trailGeom?: BufferGeometry; // Geometry for the trail
  private trailVtxPos?: Float32Array; // Vertex positions for the trail
  private trailVtxColor?: Float32Array; // Vertex colors for the trail
  private trailVtxOpacity?: Float32Array; // Vertex opacities for the trail

  constructor() {
    this.step = this.step.bind(this); // Bind step method to ensure correct context
  }

  // Initialize method to set up the trail effect
  init(entity: BaseEntityType) {
    this.entity = entity;
    this.entity.events.on(EntityLifecycleEvents.Step, this.step); // Register step event
    this.entityPositionPrevious.copy(entity.position); // Copy initial position
    this.entity.object3D?.add(this.object3D); // Add trail object to the entity

    // Shader material for the trail
    this.material = new ShaderMaterial({
      fragmentShader: arrowShaderFrag, // Fragment shader for the trail
      vertexShader: arrowShaderVert, // Vertex shader for the trail
      transparent: true, // Enable transparency
      uniforms: {
        opacity: {
          value: 1
        },
        color: {
          value: new Color(1, 1, 1)
        }
      },
      side: DoubleSide // Render both sides of the trail geometry
    });

    // Create trail geometry and mesh
    this.trailGeom = new BufferGeometry();
    const trailVtxCount = 3 * this.trailMaxLength;
    const trailTriCount = 4 * this.trailMaxLength;
    const trailVtxIndex = new Uint16Array(trailTriCount * 3);
    const trailVtxPos = new Float32Array(trailVtxCount * 3);
    const trailVtxColor = new Float32Array(trailVtxCount * 3);
    const trailVtxOpacity = new Float32Array(trailVtxCount);

    for (let ti = 0; ti < this.trailMaxLength - 1; ti++) {
      trailVtxIndex[ti * 12 + 0] = ti * 3 + 0;
      trailVtxIndex[ti * 12 + 1] = ti * 3 + 3;
      trailVtxIndex[ti * 12 + 2] = ti * 3 + 1;

      trailVtxIndex[ti * 12 + 3] = ti * 3 + 1;
      trailVtxIndex[ti * 12 + 4] = ti * 3 + 3;
      trailVtxIndex[ti * 12 + 5] = ti * 3 + 4;

      trailVtxIndex[ti * 12 + 6] = ti * 3 + 1;
      trailVtxIndex[ti * 12 + 7] = ti * 3 + 4;
      trailVtxIndex[ti * 12 + 8] = ti * 3 + 2;

      trailVtxIndex[ti * 12 + 9] = ti * 3 + 2;
      trailVtxIndex[ti * 12 + 10] = ti * 3 + 4;
      trailVtxIndex[ti * 12 + 11] = ti * 3 + 5;
    }
    for (let ti = 0; ti < this.trailMaxLength; ti++) {
      this.colorOuter.toArray(trailVtxColor, ti * 9 + 0);
      this.colorInner.toArray(trailVtxColor, ti * 9 + 3);
      this.colorOuter.toArray(trailVtxColor, ti * 9 + 6);
    }
    this.trailVtxPos = trailVtxPos;
    this.trailVtxColor = trailVtxColor;
    this.trailVtxOpacity = trailVtxOpacity;
    this.trailGeom.setIndex(new BufferAttribute(trailVtxIndex, 1));
    this.trailGeom.setAttribute(
      "position",
      new BufferAttribute(trailVtxPos, 3)
    );
    this.trailGeom.setAttribute(
      "vtxColor",
      new BufferAttribute(trailVtxColor, 3)
    );
    this.trailGeom.setAttribute(
      "vtxOpacity",
      new BufferAttribute(trailVtxOpacity, 1)
    );
    const trailMesh = new Mesh(this.trailGeom, this.material);
    trailMesh.layers.set(RenderLayers.default);
    this.object3D.add(trailMesh);

    return this;
  }

  // Destroy method to clean up resources
  destroy() {
    this.trailGeom?.dispose();
    this.material?.dispose();
  }

  // Set opacity method to adjust trail opacity
  setOpacity(opacity: number) {
    if (!this.material) return;
    this.material.uniforms.opacity.value = opacity;
    this.material.uniformsNeedUpdate = true;
  }

  // Step method to update the trail each frame
  step(ms: number) {
    const {
      entity,
      entityPositionDelta,
      entityPositionPrevious,
      opacityInner,
      opacityOuter,
      colorInner,
      colorOuter,
      colorTrail,
      trailGeom,
      trailPositions,
      trailVtxColor,
      trailVtxOpacity,
      trailVtxPos,
      radius
    } = this;

    if (
      !entity ||
      !trailGeom ||
      !trailVtxColor ||
      !trailVtxOpacity ||
      !trailVtxPos
    )
      return;

    // Update position delta based on entity movement
    entityPositionDelta.copy(entity.position).sub(entityPositionPrevious);

    // Update previous position for next frame's delta calculation
    entityPositionPrevious.copy(entity.position);

    // Update trail positions with new deltas
    for (const trailNode of trailPositions) {
      trailNode[0].sub(entityPositionDelta);
      trailNode[1] += ms;
    }

    // Add a new segment to the trail
    trailPositions.unshift([new Vector3(), 0]);

    // Remove segments that are older than trailLengthMs
    while (
      trailPositions.length > 0 &&
      trailPositions[trailPositions.length - 1][1] > this.trailLengthMs
    ) {
      trailPositions.pop();
    }

    // Update trail segment ages
    for (let i = 0; i < trailPositions.length; i++) {
      trailPositions[i][1] += ms;
    }

    // Update vertex positions and opacities for the trail
    const colorI = new Color();
    const colorO = new Color();
    const tangent = new Vector3();
    const normal = new Vector3();
    const pt = new Vector3();

    for (let ti = 0; ti < trailPositions.length - 1; ti++) {
      const tIntensity = 1 - ti / trailPositions.length;
      tangent.copy(trailPositions[ti + 1][0]).sub(trailPositions[ti][0]);
      normal.set(-tangent.y, tangent.x, tangent.z).normalize();
      pt.copy(normal)
        .multiplyScalar(radius * tIntensity)
        .add(trailPositions[ti][0])
        .toArray(trailVtxPos, ti * 9 + 0);
      pt.copy(trailPositions[ti][0]).toArray(trailVtxPos, ti * 9 + 3);
      pt.copy(normal)
        .multiplyScalar(-radius * tIntensity)
        .add(trailPositions[ti][0])
        .toArray(trailVtxPos, ti * 9 + 6);

      colorI.copy(colorInner).lerp(colorTrail, 1 - tIntensity);
      colorO.copy(colorOuter).lerp(colorTrail, 1 - tIntensity);
      colorO.toArray(trailVtxColor, ti * 9 + 0);
      colorI.toArray(trailVtxColor, ti * 9 + 3);
      colorO.toArray(trailVtxColor, ti * 9 + 6);
      trailVtxOpacity[ti * 3 + 0] = tIntensity * opacityOuter;
      trailVtxOpacity[ti * 3 + 1] = tIntensity * opacityInner;
      trailVtxOpacity[ti * 3 + 2] = tIntensity * opacityOuter;
    }

    const lastPointInTrail = trailPositions.at(-1)?.[0];
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 0);
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 3);
    lastPointInTrail?.toArray(trailVtxPos, (trailPositions.length - 1) * 9 + 6);
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 0] = 0;
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 1] = 0;
    trailVtxOpacity[(trailPositions.length - 1) * 3 + 2] = 0;

    trailGeom.getAttribute("position").needsUpdate = true;
    trailGeom.getAttribute("vtxColor").needsUpdate = true;
    trailGeom.getAttribute("vtxOpacity").needsUpdate = true;

    trailGeom.computeBoundingSphere();
  }
}
