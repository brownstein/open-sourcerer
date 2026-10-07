import { Collider, RigidBody } from "@dimforge/rapier2d-compat";
import {
  Box2,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Vector2,
  Vector3
} from "three";
import { degToRad } from "three/src/math/MathUtils.js";

import {
  BaseEntityType,
  EntityBehavior,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { CollisionBehavior } from "src/api/physics";
import { terrainCollisionGroup } from "src/engine/constants/collisionGroups";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import * as TiledLevelAPI from "src/engine/level/tiled/api";
import { vector2To3 } from "src/engine/util/vecTypes";

import { CommonTerrainAPI } from "./commonTerrainApi";
import {
  ForegroundFadeGroup,
  ForegroundFadeMember
} from "./ForegroundFadeGroup";

export class BaseTerrainPhysicsBehavior implements EntityBehavior {
  public type = "BaseTerrain";
  public entity?: BaseTerrain;
  public terrainDef?: TiledLevelAPI.MapTerrain;
  public body?: RigidBody;
  public colliders?: Collider[];
  initWithTerrain(entity: BaseTerrain, terrain: TiledLevelAPI.MapTerrain) {
    this.entity = entity;
    this.terrainDef = terrain;
    this.syncPosition();
    return this;
  }
  attachToLevel(level: LevelAPI) {
    if (!this.entity || !this.terrainDef) return;
    const isDecal = this.terrainDef.tileType === TiledLevelAPI.TileType.decal;
    let isPlatform = false;
    switch (this.terrainDef.tileType) {
      case TiledLevelAPI.TileType.platform:
      case TiledLevelAPI.TileType.platformStairsLeft:
      case TiledLevelAPI.TileType.platformStairsRight:
        isPlatform = true;
        break;
      default:
        break;
    }
    if (isDecal) return;

    const isFilterable =
      isPlatform || this.entity.foreground || this.entity.npcBypass;

    const { ColliderDesc, RigidBodyDesc } = level.rapier;
    const rigidBodyDesc = RigidBodyDesc.fixed();
    this.body = level.world.createRigidBody(rigidBodyDesc);
    this.body.setTranslation(
      {
        x: this.entity.position.x,
        y: this.entity.position.y
      },
      true
    );

    this.colliders = [];
    for (const convex of this.terrainDef.convexComponentPolygons ?? []) {
      const convexArr = new Float32Array(convex.length * 2);
      for (let vi = 0; vi < convex.length; vi++) {
        const vtx = convex[vi];
        convexArr[vi * 2 + 0] = vtx.x;
        convexArr[vi * 2 + 1] = vtx.y;
      }
      const colliderDesc = ColliderDesc.convexHull(convexArr);
      if (colliderDesc === null) continue;
      colliderDesc.setCollisionGroups(terrainCollisionGroup);

      const collider = level.world.createCollider(colliderDesc, this.body);

      // Things need to collide with terrain, so enable this by default.
      collider.setActiveEvents(level.rapier.ActiveEvents.COLLISION_EVENTS);

      if (isFilterable) {
        collider.setActiveHooks(level.rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
      }
    }

    let bounceDir = new Vector2(0, 1);
    if (this.entity.bounceDir !== undefined) {
      bounceDir.x = Math.cos(degToRad(this.entity.bounceDir));
      bounceDir.y = Math.sin(degToRad(this.entity.bounceDir));
    }

    // When entities collide with platforms, they should pass through
    // if they are passing upwards and collide if they are passing
    // downwards.
    level.registerEntityPhysicsHooks({
      entityId: this.entity.id,
      rigidBodyHandle: this.body.handle,
      acceptCollisionByDefault: !isFilterable,
      beginCollision:
        isFilterable || this.entity.bounce
          ? (
              _thisEntity,
              otherEntity,
              normal,
              _thisCollHandle,
              otherCollHandle
            ) => {
              // TODO: find a better home for this logic.
              if (this.entity?.foreground) return CollisionBehavior.NoCollide;
              if (
                this.entity?.npcBypass &&
                otherEntity?.type === "VillageNPC"
              ) {
                return CollisionBehavior.NoCollide;
              }
              if (isPlatform && normal.y <= 0.1)
                return CollisionBehavior.NoCollide;

              if (this.entity?.bounce && normal.dot(bounceDir) > 0.5) {
                const otherColl = level.world.getCollider(otherCollHandle);
                const rb = otherColl?.parent();

                if (rb && !rb.isFixed()) {
                  rb.setLinvel(
                    {
                      x:
                        rb.linvel().x * Math.pow(bounceDir.y, 6) +
                        bounceDir.x * this.entity.bounce * 13,
                      y:
                        rb.linvel().y * Math.pow(bounceDir.x, 6) +
                        bounceDir.y * this.entity.bounce * 13
                    },
                    true
                  );
                }
              }

              return CollisionBehavior.Collide;
            }
          : undefined
    });
  }
  disable() {
    this.body?.setEnabled(false);
    if (this.colliders) {
      for (const collider of this.colliders) {
        collider.setEnabled(false);
      }
    }
  }
  enable() {
    this.body?.setEnabled(true);
    if (this.colliders) {
      for (const collider of this.colliders) {
        collider.setEnabled(true);
      }
    }
  }
  detachFromLevel(level: LevelAPI) {
    if (this.entity) level.removeEntityPhysicsHooks(this.entity.id);
    if (this.colliders) {
      for (const collider of this.colliders)
        level.world.removeCollider(collider, false);
    }
    if (this.body) level.world.removeRigidBody(this.body);
    this.colliders = [];
    this.body = undefined;
  }
  step() {
    this.syncPosition();
  }
  private syncPosition() {
    if (!this.entity) return;
    this.entity.object3D.position.set(
      this.entity.position.x,
      this.entity.position.y,
      this.entity.position.z
    );
  }
  // This is depricated. Use the PhysicsDebugger entity if you need to debug physics.
  buildDebugMesh() {
    const { entity, terrainDef } = this;
    if (!entity || !terrainDef) return;

    const geom = new BufferGeometry();
    let positionCount = 0;
    let triangleCount = 0;
    for (const convex of terrainDef.convexComponentPolygons) {
      positionCount += convex.length;
      triangleCount += convex.length - 2;
    }
    const indexArr = new Uint16Array(triangleCount * 3);
    const posArr = new Float32Array(positionCount * 3);
    let posIncr = 0;
    let indexIncr = 0;
    for (const convex of terrainDef.convexComponentPolygons) {
      const convexIndexStart = posIncr;
      for (let i = 0; i < convex.length; i++) {
        const vtx = convex[i];
        posArr[posIncr * 3 + 0] = vtx.x;
        posArr[posIncr * 3 + 1] = vtx.y;
        posIncr++;
      }
      for (let i = 2; i < convex.length; i++) {
        const index = convexIndexStart + i;
        indexArr[indexIncr * 3 - 0] = convexIndexStart;
        indexArr[indexIncr * 3 + 1] = index - 1;
        indexArr[indexIncr * 3 + 2] = index;
        indexIncr++;
      }
    }
    geom.setIndex(new BufferAttribute(indexArr, 1));
    geom.setAttribute("position", new BufferAttribute(posArr, 3));
    const mat = new MeshBasicMaterial({
      color: new Color(
        Math.floor(0xffffff * Math.random() * 0.5) + Math.floor(0xffffff * 0.5)
      ),
      side: DoubleSide,
      wireframe: true
    });
    const mesh = new Mesh(geom, mat);
    mesh.layers.set(RenderLayers.text);
    entity.object3D.add(mesh);
  }
}

const kInsetUVs = 0.001;

export class TerrainRenderBehavior implements EntityBehavior {
  type = "BaseTerrainTiles";
  public entity?: BaseEntityType;
  public decalTiles?: TiledLevelAPI.MapTile[];
  public object3D = new Object3D();
  public opacity = 1;
  protected geom: BufferGeometry[] = [];
  protected material: MeshBasicMaterial[] = [];
  init(entity?: BaseEntityType) {
    this.entity = entity;
    return this;
  }
  setTiles(decalTiles: TiledLevelAPI.MapTile[]) {
    this.decalTiles = decalTiles;
    return this;
  }
  buildTileMeshes(depthOffet: number = 0) {
    if (!this.entity || !this.decalTiles) return this;

    const tilesByTileSet = new Map<string, TiledLevelAPI.MapTile[]>();
    for (const tile of this.decalTiles) {
      const sheetName = tile.def.src.sheet.name;
      if (!tilesByTileSet.has(sheetName)) tilesByTileSet.set(sheetName, []);
      tilesByTileSet.get(sheetName)?.push(tile);
    }

    for (const sheetTiles of tilesByTileSet.values()) {
      const sheetInfo = sheetTiles[0].def.src.sheet;
      const quadCount = sheetTiles.length;

      const posDx = sheetInfo.tileSize.x / kPixelScale;
      const posDy = -sheetInfo.tileSize.y / kPixelScale;

      const geom = new BufferGeometry();
      const indexArr = new Uint16Array(quadCount * 6);
      const posArr = new Float32Array(quadCount * 12);
      const uvArr = new Float32Array(quadCount * 8);

      const uvDx = sheetInfo.tileSize.x;
      const uvDy = sheetInfo.tileSize.y;
      const invUvX = 1 / sheetInfo.textureSize.x;
      const invUvY = 1 / sheetInfo.textureSize.y;

      for (let ti = 0; ti < sheetTiles.length; ti++) {
        const tile = sheetTiles[ti];

        indexArr[ti * 6 + 0] = ti * 4 + 0;
        indexArr[ti * 6 + 1] = ti * 4 + 1;
        indexArr[ti * 6 + 2] = ti * 4 + 3;
        indexArr[ti * 6 + 3] = ti * 4 + 1;
        indexArr[ti * 6 + 4] = ti * 4 + 3;
        indexArr[ti * 6 + 5] = ti * 4 + 2;

        // apply flip transformations to the vertices
        const w = posDx;
        const h = Math.abs(posDy);

        const vTL = { x: 0, y: 0 };
        const vTR = { x: w, y: 0 };
        const vBR = { x: w, y: h };
        const vBL = { x: 0, y: h };

        let currentTileSize = { w: w, h: h };

        if (tile.flipOptions) {
          const shouldFlipDiagonal =
            tile.flipOptions[TiledLevelAPI.TileFlip.diagonal];
          const shouldFlipHorizontal =
            tile.flipOptions[TiledLevelAPI.TileFlip.horizontal];
          const shouldFlipVertical =
            tile.flipOptions[TiledLevelAPI.TileFlip.vertical];

          if (shouldFlipDiagonal) {
            const flipDiagonal = (vertex: { x: number; y: number }) => {
              [vertex.x, vertex.y] = [vertex.y, vertex.x];
            };

            flipDiagonal(vTL);
            flipDiagonal(vTR);
            flipDiagonal(vBL);
            flipDiagonal(vBR);

            [currentTileSize.w, currentTileSize.h] = [
              currentTileSize.h,
              currentTileSize.w
            ];
          }

          if (shouldFlipHorizontal) {
            const flipHorizontal = (vertex: { x: number }) => {
              vertex.x = currentTileSize.w - vertex.x;
            };

            flipHorizontal(vTL);
            flipHorizontal(vTR);
            flipHorizontal(vBL);
            flipHorizontal(vBR);
          }

          if (shouldFlipVertical) {
            const flipVertical = (vertex: { y: number }) => {
              vertex.y = currentTileSize.h - vertex.y;
            };

            flipVertical(vTL);
            flipVertical(vTR);
            flipVertical(vBL);
            flipVertical(vBR);
          }
        }

        posArr[ti * 12 + 0] = tile.pos.x + vTL.x;
        posArr[ti * 12 + 1] = tile.pos.y - vTL.y;
        posArr[ti * 12 + 3] = tile.pos.x + vTR.x;
        posArr[ti * 12 + 4] = tile.pos.y - vTR.y;
        posArr[ti * 12 + 6] = tile.pos.x + vBR.x;
        posArr[ti * 12 + 7] = tile.pos.y - vBR.y;
        posArr[ti * 12 + 9] = tile.pos.x + vBL.x;
        posArr[ti * 12 + 10] = tile.pos.y - vBL.y;

        uvArr[ti * 8 + 0] = (tile.def.srcPos.x + kInsetUVs) * invUvX;
        uvArr[ti * 8 + 1] = 1 - (tile.def.srcPos.y + kInsetUVs) * invUvY;
        uvArr[ti * 8 + 2] = (tile.def.srcPos.x + uvDx - kInsetUVs) * invUvX;
        uvArr[ti * 8 + 3] = 1 - (tile.def.srcPos.y + kInsetUVs) * invUvY;
        uvArr[ti * 8 + 4] = (tile.def.srcPos.x + uvDx - kInsetUVs) * invUvX;
        uvArr[ti * 8 + 5] = 1 - (tile.def.srcPos.y + uvDy - kInsetUVs) * invUvY;
        uvArr[ti * 8 + 6] = (tile.def.srcPos.x + kInsetUVs) * invUvX;
        uvArr[ti * 8 + 7] = 1 - (tile.def.srcPos.y + uvDy - kInsetUVs) * invUvY;
      }

      geom.setIndex(new BufferAttribute(indexArr, 1));
      geom.setAttribute("position", new BufferAttribute(posArr, 3));
      geom.setAttribute("uv", new BufferAttribute(uvArr, 2));

      const material = new MeshBasicMaterial({
        ...(sheetInfo.texture ? { map: sheetInfo.texture } : {}),
        transparent: true,
        side: DoubleSide,
        opacity: 1,
        alphaTest: 0.05
      });

      this.geom.push(geom);
      this.material.push(material);

      const mesh = new Mesh(geom, material);
      mesh.position.z = depthOffet;
      this.object3D.add(mesh);
    }

    return this;
  }
  apply() {
    this.entity?.object3D?.add(this.object3D);
    return this;
  }
  destroy() {
    for (const geom of this.geom) geom.dispose();
    for (const mat of this.material) mat.dispose();
    this.geom = [];
    this.material = [];
    this.object3D.clear();
  }
  setOpacity(opacity: number): this {
    if (this.opacity === opacity) return this;
    this.opacity = opacity;
    for (const mat of this.material) {
      mat.opacity = opacity;
    }

    return this;
  }
  setTint(tint: Color): this {
    for (const material of this.material) {
      material.color.copy(tint);
      material.needsUpdate = true;
    }

    return this;
  }
}

export type BaseTerrainProps = EntityProps & {
  terrain: TiledLevelAPI.MapTerrain;
  npcBypass?: boolean;
  foreground?: boolean;
  parallax?: Vector2;
  tint?: Color;
  bounce?: number;
  bounceDir?: number;
};

export class BaseTerrain
  extends CoreEntity
  implements BaseEntityType, CommonTerrainAPI, ForegroundFadeMember
{
  static type = "Terrain";
  public type = "Terrain";
  public _isTerrain = true;
  public behaviors = {
    terrain: new BaseTerrainPhysicsBehavior(),
    tiles: new TerrainRenderBehavior()
  };
  public object3D = new Object3D();
  public terrain: TiledLevelAPI.MapTerrain;
  public npcBypass?: boolean;
  public foreground?: boolean;
  public parallax?: Vector2;
  public bounce?: number;
  public bounceDir?: number;
  public initialPosition: Vector3;
  // The fade group this foreground terrain belongs to, lazily linked on the
  // first fadeForeground call (see buildForegroundFadeGroups).
  public foregroundFadeGroup?: ForegroundFadeGroup;
  constructor(props: BaseTerrainProps) {
    super(props);
    const { terrain } = props;
    this.terrain = terrain;
    const size = new Vector2();
    terrain.bbox.getSize(size);
    this.size = {
      width: size.x,
      height: size.y
    };
    this.initialPosition = this.position.clone();
    this.behaviors.terrain.initWithTerrain(this, terrain);
    this.behaviors.tiles
      .init(this)
      .setTiles(terrain.decalTiles)
      .buildTileMeshes()
      .apply();
    if (props.npcBypass) this.npcBypass = props.npcBypass;
    if (props.foreground) this.foreground = props.foreground;
    if (props.parallax) this.parallax = props.parallax;
    if (props.bounce) this.bounce = props.bounce;
    if (props.bounceDir !== undefined) this.bounceDir = props.bounceDir;
    if (props.opacity) this.behaviors.tiles.setOpacity(props.opacity);
    if (props.tint) this.behaviors.tiles.setTint(props.tint);
  }
  getVertVectors() {
    return this.terrain.polygon;
  }
  getRigidBody() {
    return this.behaviors.terrain.body;
  }
  step(ms: number) {
    super.step(ms);
    this.object3D.position.copy(this.position);
  }
  postStep(_deltaMs: number): void {
    if (this.parallax) this.doParallax();
  }
  private doParallax() {
    if (!this.level || !this.parallax) return;

    const cameraProperties = this.level.cameraDirector.getCurrentProperties();

    const cameraCenter = cameraProperties.center;
    if (!cameraCenter) return;
    const offset = new Vector2(1 - this.parallax.x, 1 - this.parallax.y);
    offset.multiply(cameraCenter);
    this.object3D.position.copy(this.position).add(vector2To3(offset));
  }
  // Public entry point called by the player when it passes behind / exits this
  // terrain. Routes through the fade group so that all spatially-linked
  // foreground terrain fades together via reference counting.
  fadeForeground(faded: boolean) {
    const group = this.getForegroundFadeGroup();
    if (group) group.setMemberFaded(this, faded);
    else this.applyForegroundFade(faded);
  }
  // Lazily resolve (and build, if needed) this terrain's fade group. Groups are
  // built once the first fade fires, by which point the level is fully loaded.
  private getForegroundFadeGroup(): ForegroundFadeGroup | undefined {
    if (this.foregroundFadeGroup) return this.foregroundFadeGroup;
    if (this.level) buildForegroundFadeGroups(this.level);
    return this.foregroundFadeGroup;
  }
  // Animate this single terrain's tiles toward the faded / unfaded opacity. The
  // fade group invokes this on every member so the whole structure fades as one.
  applyForegroundFade(faded: boolean) {
    const initialOpacity = this.behaviors.tiles.opacity;
    const finalOpacity = faded ? 0.25 : 1;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: 500,
      invokeFunction: (t) => {
        this.behaviors.tiles.setOpacity(
          initialOpacity * (1 - t) + finalOpacity * t
        );
      }
    });
  }
  fadeOut(ms: number = 500) {
    const startOpacity = this.behaviors.tiles.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        this.behaviors.tiles.setOpacity(startOpacity * (1 - t));
      },
      invokeFunctionAtComplete: () => {
        this.behaviors.tiles.setOpacity(0);
      }
    });
  }
  fadeIn(ms: number = 500) {
    const startOpacity = this.behaviors.tiles.opacity;
    this.scheduler.cancel("fade");
    this.scheduler.add({
      id: "fade",
      duration: ms,
      invokeFunction: (t) => {
        this.behaviors.tiles.setOpacity(startOpacity * (1 - t) + t);
      },
      invokeFunctionAtComplete: () => {
        this.behaviors.tiles.setOpacity(1);
      }
    });
  }
  disable() {
    this.object3D.visible = false;
    this.behaviors.terrain.disable();
  }
  enable() {
    this.object3D.visible = true;
    this.behaviors.terrain.enable();
  }
  destroy() {
    // Drop ourselves from the fade group so a teardown mid-fade releases any
    // reference we were holding and the rest of the group fades back in.
    this.foregroundFadeGroup?.remove(this);
    this.foregroundFadeGroup = undefined;
    super.destroy();
  }
}

// Slack (in world units, ~1 tile) added around each terrain's bounding box when
// testing adjacency, so sub-sections separated by a small gap still link.
const kForegroundFadeLinkPadding = 1;

// Link all foreground terrain in the level into ForegroundFadeGroups by spatial
// adjacency. Two foreground terrain entities are linked when their (padded)
// world-space bounding boxes intersect; connected components become one group.
// Idempotent in effect: terrain that already has a group keeps it, and this is
// only invoked once, lazily, on the first fade.
export function buildForegroundFadeGroups(level: LevelAPI) {
  const foregroundTerrain = level
    .getEntitiesForType(BaseTerrain)
    .filter((terrain) => terrain.foreground);

  // Precompute padded world-space bounding boxes. terrain.bbox is expressed in
  // the map's local space (centered on terrain.pos); shift it by the entity's
  // world offset so boxes from layers with different offsets compare correctly.
  const boxes = new Map<BaseTerrain, Box2>();
  const offset = new Vector2();
  for (const terrain of foregroundTerrain) {
    const box = terrain.terrain.bbox.clone();
    offset.set(
      terrain.position.x - terrain.terrain.pos.x,
      terrain.position.y - terrain.terrain.pos.y
    );
    box.translate(offset).expandByScalar(kForegroundFadeLinkPadding);
    boxes.set(terrain, box);
  }

  // Flood fill connected components over bbox intersection.
  const visited = new Set<BaseTerrain>();
  for (const seed of foregroundTerrain) {
    if (visited.has(seed)) continue;
    const group = new ForegroundFadeGroup();
    const stack: BaseTerrain[] = [seed];
    visited.add(seed);
    while (stack.length) {
      const current = stack.pop()!;
      group.add(current);
      current.foregroundFadeGroup = group;
      const currentBox = boxes.get(current)!;
      for (const other of foregroundTerrain) {
        if (visited.has(other)) continue;
        if (currentBox.intersectsBox(boxes.get(other)!)) {
          visited.add(other);
          stack.push(other);
        }
      }
    }
  }
}

export function isTerrain(entity: BaseEntityType): entity is BaseTerrain {
  return entity.type === BaseTerrain.type;
}

export function isBouncyTerrain(entity: BaseEntityType): entity is BaseTerrain {
  if (isTerrain(entity) && entity.bounce) return true;
  return false;
}

export function isPlatform(entity: CommonTerrainAPI) {
  switch (entity.terrain?.tileType) {
    case TiledLevelAPI.TileType.platform:
    case TiledLevelAPI.TileType.platformStairsLeft:
    case TiledLevelAPI.TileType.platformStairsRight:
      return true;
    default:
      return false;
  }
}
