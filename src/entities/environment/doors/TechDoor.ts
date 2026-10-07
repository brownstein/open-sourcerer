import {
  Collider,
  ColliderDesc,
  RigidBody,
  RigidBodyDesc
} from "@dimforge/rapier2d-compat";
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  Texture
} from "three";
import { clamp } from "three/src/math/MathUtils.js";

import {
  BaseEntityType,
  EntityAlignment,
  EntityLevelAPI,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { SignalConnectionEvents } from "src/api/signal";
import { createTypedEventEmitter } from "src/api/util";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { SignalConnectionBehavior } from "src/entities/shared/behaviors/SignalConnectionBehavior";

import techDoorBottomBasePng from "../sprites/tech-door/tech-door-bottom-base.png";
import techDoorBottomCapPng from "../sprites/tech-door/tech-door-bottom-cap.png";
import techDoorTilePng from "../sprites/tech-door/tech-door-tile.png";
import techDoorTopBasePng from "../sprites/tech-door/tech-door-top-base.png";
import techDoorTopCapPng from "../sprites/tech-door/tech-door-top-cap.png";

type TechDoorAlignment = "center" | "top" | "bottom";

export type TechDoorProps = EntityProps & {
  align?: TechDoorAlignment;
  startClosed?: boolean;
  doorSpeed?: number;
  channel?: string;
  channelInverted?: boolean;
};

export enum TechDoorEvents {
  FullyOpened = "FullyOpened",
  FullyClosed = "FullyClosed"
}

type TechDoorEventTypes = {
  [TechDoorEvents.FullyOpened]: void;
  [TechDoorEvents.FullyClosed]: void;
};

@addResourceLoader(new TextureResourceLoader("techDoorTile", techDoorTilePng))
@addResourceLoader(
  new TextureResourceLoader("techDoorBottomBase", techDoorBottomBasePng)
)
@addResourceLoader(
  new TextureResourceLoader("techDoorTopBase", techDoorTopBasePng)
)
@addResourceLoader(
  new TextureResourceLoader("techDoorBottomCap", techDoorBottomCapPng)
)
@addResourceLoader(
  new TextureResourceLoader("techDoorTopCap", techDoorTopCapPng)
)
export class TechDoor extends CoreEntity implements BaseEntityType {
  static readonly type = "TechDoor";
  public readonly type = TechDoor.type;

  public alignment = EntityAlignment.TemporaryTerrain;

  public readonly isTerrain = true;

  public object3D = new Object3D();
  public doorEvents = createTypedEventEmitter<TechDoorEventTypes>();

  public behaviors = {
    signal: new SignalConnectionBehavior()
  };

  private readonly align: TechDoorAlignment;
  private readonly doorSpeed: number;

  private closeProgress: number;
  private shouldClose: boolean;
  private channel?: string;
  private channelInverted = false;

  private channelUnSub?: () => void;

  private readonly doorTextures = {
    // These have to be cloned because we mutate them - can't go mutating a shared
    // resource per entity!
    tile: getResource<Texture>(TechDoor, "techDoorTile").clone(),
    bottomBase: getResource<Texture>(TechDoor, "techDoorBottomBase").clone(),
    topBase: getResource<Texture>(TechDoor, "techDoorTopBase").clone(),
    bottomCap: getResource<Texture>(TechDoor, "techDoorBottomCap").clone(),
    topCap: getResource<Texture>(TechDoor, "techDoorTopCap").clone()
  };

  private readonly doorMeshes: {
    tile: Mesh<BufferGeometry, MeshBasicMaterial>;
    bottomBase: Mesh<PlaneGeometry, MeshBasicMaterial>;
    topBase: Mesh<PlaneGeometry, MeshBasicMaterial>;
    bottomCap: Mesh<PlaneGeometry, MeshBasicMaterial>;
    topCap: Mesh<PlaneGeometry, MeshBasicMaterial>;
  };

  private readonly entityWidthScaleFactor: number;

  private rigidBody?: RigidBody;
  private topDoorCollider?: Collider;
  private bottomDoorCollider?: Collider;

  constructor(props: TechDoorProps) {
    super(props);

    this.align = props.align ?? "center";
    this.doorSpeed = props.doorSpeed ?? 5;
    this.channel = props.channel ?? this.channel;
    this.channelInverted = props.channelInverted ?? this.channelInverted;

    if (this.align === "center") this.doorSpeed *= 2;

    const startClosed = props.startClosed ?? true;
    if (startClosed !== this.channelInverted) {
      this.closeProgress = 1;
      this.shouldClose = true;
    } else {
      this.closeProgress = 0;
      this.shouldClose = false;
    }

    this.object3D.scale.multiplyScalar(kInvPixelScale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.object3D.rotation.z = this.angle;

    this.doorTextures.tile.minFilter = NearestFilter;
    this.doorTextures.tile.magFilter = NearestFilter;
    this.doorTextures.bottomBase.minFilter = NearestFilter;
    this.doorTextures.bottomBase.magFilter = NearestFilter;
    this.doorTextures.topBase.minFilter = NearestFilter;
    this.doorTextures.topBase.magFilter = NearestFilter;
    this.doorTextures.topCap.minFilter = NearestFilter;
    this.doorTextures.topCap.magFilter = NearestFilter;
    this.doorTextures.bottomCap.minFilter = NearestFilter;
    this.doorTextures.bottomCap.magFilter = NearestFilter;

    this.doorTextures.tile.wrapT = RepeatWrapping;

    const entityPixelWidth = this.size.width * kPixelScale;
    this.entityWidthScaleFactor =
      entityPixelWidth / this.doorTextures.topBase.width;

    this.doorMeshes = {
      tile: new Mesh(
        new BufferGeometry(),
        new MeshBasicMaterial({
          map: this.doorTextures.tile,
          transparent: true
        })
      ),
      bottomBase: new Mesh(
        new PlaneGeometry(
          entityPixelWidth,
          this.doorTextures.bottomBase.height
        ),
        new MeshBasicMaterial({
          map: this.doorTextures.bottomBase,
          transparent: true
        })
      ),
      topBase: new Mesh(
        new PlaneGeometry(entityPixelWidth, this.doorTextures.topBase.height),
        new MeshBasicMaterial({
          map: this.doorTextures.topBase,
          transparent: true
        })
      ),
      bottomCap: new Mesh(
        new PlaneGeometry(
          this.doorTextures.bottomCap.width * this.entityWidthScaleFactor,
          this.doorTextures.bottomCap.height
        ),
        new MeshBasicMaterial({
          map: this.doorTextures.bottomCap,
          transparent: true
        })
      ),
      topCap: new Mesh(
        new PlaneGeometry(
          this.doorTextures.topCap.width * this.entityWidthScaleFactor,
          this.doorTextures.topCap.height
        ),
        new MeshBasicMaterial({
          map: this.doorTextures.topCap,
          transparent: true
        })
      )
    };

    const numDoorVertices = 8;
    const numDoorVertexData = numDoorVertices * 3;
    const numDoorUVData = numDoorVertices * 2;
    this.doorMeshes.tile.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(numDoorVertexData), 3)
    );
    this.doorMeshes.tile.geometry.setAttribute(
      "uv",
      new BufferAttribute(new Float32Array(numDoorUVData), 2)
    );

    this.doorMeshes.bottomBase.geometry.translate(
      0,
      this.doorTextures.bottomBase.height * 0.5,
      0
    );
    this.doorMeshes.bottomCap.geometry.translate(
      0,
      -this.doorTextures.bottomCap.height * 0.5,
      0
    );
    this.doorMeshes.topBase.geometry.translate(
      0,
      -this.doorTextures.topBase.height * 0.5,
      0
    );
    this.doorMeshes.topCap.geometry.translate(
      0,
      this.doorTextures.topCap.height * 0.5,
      0
    );

    this.doorMeshes.topCap.position.z = 0.1;
    this.doorMeshes.bottomBase.position.z = 0.2;
    this.doorMeshes.topBase.position.z = 0.2;
    this.doorMeshes.bottomCap.position.z = 0.3;

    const entityPixelHeight = this.size.height * kPixelScale;

    const alignmentYOffsetAmount = entityPixelHeight * 0.5;
    const bottomBaseYCoord = -alignmentYOffsetAmount;
    const topBaseYCoord = alignmentYOffsetAmount;

    this.doorMeshes.bottomBase.position.y = bottomBaseYCoord;
    this.doorMeshes.topBase.position.y = topBaseYCoord;

    this.object3D.add(this.doorMeshes.tile);

    if (this.align === "top" || this.align === "center") {
      this.object3D.add(this.doorMeshes.topBase);
      this.object3D.add(this.doorMeshes.topCap);
    }

    if (this.align === "bottom" || this.align === "center") {
      this.object3D.add(this.doorMeshes.bottomBase);
      this.object3D.add(this.doorMeshes.bottomCap);
    }

    this._updateDoor();

    this.behaviors.signal
      .setShape({
        type: "aabb",
        width: this.size.width,
        height: this.size.height,
        angle: this.angle
      })
      .init(this);
    this.behaviors.signal.events.on(
      SignalConnectionEvents.SignalReceived,
      ({ signal }) => {
        if (signal.value) this.open();
        else this.close();
      }
    );
  }

  open(): void {
    this.shouldClose = false;
  }

  close(): void {
    this.shouldClose = true;
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);

    if (this.channel) {
      this.channelUnSub = level.state.subValue(this.channel, (isOpen) => {
        this.shouldClose = !isOpen !== this.channelInverted;
      });
    }

    const { world } = level;

    const bodyDescription = RigidBodyDesc.fixed()
      .setTranslation(this.position.x, this.position.y)
      .setRotation(this.angle);

    this.rigidBody = world.createRigidBody(bodyDescription);
    level.updateEntityPhysicsHooks({
      entityId: this.id,
      rigidBodyHandle: this.rigidBody.handle
    });

    this._updateDoor();
  }

  step(deltaMs: number): void {
    super.step(deltaMs);

    const lastCloseProgress = this.closeProgress;

    const deltaSeconds = deltaMs / 1000;
    if (this.shouldClose) this.closeProgress += this.doorSpeed * deltaSeconds;
    else this.closeProgress -= this.doorSpeed * deltaSeconds;

    this.closeProgress = clamp(this.closeProgress, 0, 1);
    if (lastCloseProgress === this.closeProgress) return;

    if (this.closeProgress === 1)
      this.doorEvents.emit(TechDoorEvents.FullyClosed);
    if (this.closeProgress === 0)
      this.doorEvents.emit(TechDoorEvents.FullyOpened);

    this._updateDoor();
  }

  detachFromLevel(level: EntityLevelAPI): void {
    super.detachFromLevel(level);
    level.removeEntityPhysicsHooks(this.id);
    if (this.rigidBody) level.world.removeRigidBody(this.rigidBody);
    this.channelUnSub?.();
    this.channelUnSub = undefined;
  }

  destroy(): void {
    super.destroy();

    for (const mesh of Object.values(this.doorMeshes)) {
      mesh.material.map?.dispose();
      mesh.material.dispose();
      mesh.geometry.dispose();
    }
    this.doorTextures.bottomBase.dispose();
    this.doorTextures.bottomCap.dispose();
    this.doorTextures.topBase.dispose();
    this.doorTextures.topCap.dispose();
    this.doorTextures.tile.dispose();
  }

  private _updateDoor(): void {
    const doorTileWidth =
      this.doorTextures.tile.width * this.entityWidthScaleFactor;
    const halfTileWidth = doorTileWidth * 0.5;

    const entityPixelHeight = this.size.height * kPixelScale;
    const halfEntityHeight = entityPixelHeight * 0.5;

    let doorHeight = entityPixelHeight * this.closeProgress;
    if (this.align === "center") doorHeight *= 0.5;

    let bottomDoorTopYCoord = doorHeight - halfEntityHeight;
    let topDoorBottomYCoord = -bottomDoorTopYCoord;

    if (this.align === "bottom") topDoorBottomYCoord = halfEntityHeight;
    if (this.align === "top") bottomDoorTopYCoord = -halfEntityHeight;

    const doorTileGeometry = this.doorMeshes.tile.geometry;
    const positionBufferAttribute = doorTileGeometry.getAttribute("position");

    // prettier-ignore
    positionBufferAttribute.array.set([
      // bottom door BL, BR, TL, TR
      -halfTileWidth, -halfEntityHeight, 0,
      halfTileWidth, -halfEntityHeight, 0,
      -halfTileWidth, bottomDoorTopYCoord, 0,
      halfTileWidth, bottomDoorTopYCoord, 0,

      // top door TL, TR, BL, BR
      -halfTileWidth, halfEntityHeight, 0,
      halfTileWidth, halfEntityHeight, 0,
      -halfTileWidth, topDoorBottomYCoord, 0,
      halfTileWidth, topDoorBottomYCoord, 0
    ]);

    const uvBufferAttribute = doorTileGeometry.getAttribute("uv");

    // prettier-ignore
    uvBufferAttribute.array.set([
      // bottom quad BL, BR, TL, TR
      0, 0,
      1, 0,
      0, 1,
      1, 1,

      // top quad TL, TR, BL, BR
      0, 0,
      1, 0,
      0, 1,
      1, 1
    ]);

    // prettier-ignore
    doorTileGeometry.setIndex([
      // bottom quad
      0, 1, 2,
      1, 3, 2,

      // top quad
      6, 5, 4,
      6, 7, 5
    ]);

    const doorTileTextureHeight = this.doorTextures.tile.height;
    this.doorTextures.tile.repeat.y = doorHeight / doorTileTextureHeight;

    positionBufferAttribute.needsUpdate = true;
    uvBufferAttribute.needsUpdate = true;

    /*
     * UPDATE CAPS
     */

    let bottomCapTopYCoord = bottomDoorTopYCoord;
    let topCapBottomYCoord = topDoorBottomYCoord;

    bottomCapTopYCoord = Math.max(
      bottomCapTopYCoord,
      -halfEntityHeight + this.doorTextures.bottomBase.height
    );

    const OFFSET_TO_MATCH_WITH_BOTTOM_CAP = 5;
    topCapBottomYCoord = Math.min(
      topCapBottomYCoord,
      halfEntityHeight -
        this.doorTextures.topBase.height -
        OFFSET_TO_MATCH_WITH_BOTTOM_CAP
    );

    this.doorMeshes.bottomCap.position.y = bottomCapTopYCoord;
    this.doorMeshes.topCap.position.y = topCapBottomYCoord;

    /*
     * UPDATE COLLIDERS
     */

    if (!this.level) return;

    const { world } = this.level;

    if (this.topDoorCollider) {
      world.removeCollider(this.topDoorCollider, false);
      this.topDoorCollider = undefined;
    }
    if (this.bottomDoorCollider) {
      world.removeCollider(this.bottomDoorCollider, false);
      this.bottomDoorCollider = undefined;
    }

    if (this.closeProgress === 0) {
      if (this.rigidBody) {
        this.level.updateEntityPhysicsHooks({
          entityId: this.id,
          rigidBodyHandle: this.rigidBody.handle
        });
      }
      return;
    }

    const colliderHeight = doorHeight * kInvPixelScale;
    const topDoorColliderDesc = ColliderDesc.cuboid(
      halfTileWidth * kInvPixelScale,
      colliderHeight * 0.5
    )
      .setTranslation(0, this.size.height * 0.5 - colliderHeight * 0.5)
      .setCollisionGroups(terrainCollisionGroup);

    const bottomDoorColliderDesc = ColliderDesc.cuboid(
      halfTileWidth * kInvPixelScale,
      colliderHeight * 0.5
    )
      .setTranslation(0, -this.size.height * 0.5 + colliderHeight * 0.5)
      .setCollisionGroups(terrainCollisionGroup);

    if (this.align === "top" || this.align === "center")
      this.topDoorCollider = world.createCollider(
        topDoorColliderDesc,
        this.rigidBody
      );
    if (this.align === "bottom" || this.align === "center")
      this.bottomDoorCollider = world.createCollider(
        bottomDoorColliderDesc,
        this.rigidBody
      );

    if (this.rigidBody) {
      this.level.updateEntityPhysicsHooks({
        entityId: this.id,
        rigidBodyHandle: this.rigidBody.handle
      });
    }
  }

  public get canBindToVariable() {
    return true;
  }

  // This is still experimental.
  bindToVariable(variableName: string) {
    if (variableName !== this.boundToVariableName) {
      this.boundToVariableName = variableName;
      this.events.emit(EntityLifecycleEvents.BindToVariableName, variableName);
    }
  }

  extraSpellBindingData() {
    return {
      open: !this.shouldClose
    };
  }
}
