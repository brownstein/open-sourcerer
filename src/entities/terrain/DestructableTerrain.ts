import {
  BufferAttribute,
  DoubleSide,
  Material,
  Object3D,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
  Vector3
} from "three";

import {
  BaseEntityType,
  DamageType,
  EntityAlignment,
  EntityLifecycleEvents,
  EntityProps
} from "src/api/entity";
import { createTypedEventEmitter } from "src/api/util";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import * as TiledLevelAPI from "src/engine/level/tiled/api";

import { AdvancedTerrainRenderBehavior } from "./behaviors/AdvancedRenderBehavior";
import { CrumbleGridBehavior } from "./behaviors/CrumbleGridBehavior";
import { TerrainPhysicsBehavior } from "./behaviors/PhysicsBehavior";
import { CommonTerrainAPI } from "./commonTerrainApi";
import crackedTerrainFrag from "./shaders/crackedTerrainFrag.glsl";
import crackedTerrainVert from "./shaders/crackedTerrainVert.glsl";

export enum DestructableTerrainEventTypes {
  Destruct = "Destruct",
  CrumbleProbeReceived = "CrumbleProbeReceived"
}

export type DestructableTerrainEvents = {
  [DestructableTerrainEventTypes.Destruct]: void;
  [DestructableTerrainEventTypes.CrumbleProbeReceived]: {
    worldPoint: Vector2;
    sourceEntityId: string;
    budget?: number;
  };
};

export type DestructableTerrainProps = EntityProps & {
  terrain: TiledLevelAPI.MapTerrain;
};

@setAssetDependencies(() => ["terrainCracks"])
export class DestructableTerrain
  extends CoreEntity
  implements CommonTerrainAPI
{
  static type = "DestructableTerrain";
  public type = "DestructableTerrain";
  public _isTerrain = true;
  public alignment = EntityAlignment.Environment;
  public behaviors = {
    physics: new TerrainPhysicsBehavior(),
    render: new AdvancedTerrainRenderBehavior<ShaderMaterial>(),
    crumble: new CrumbleGridBehavior()
  };
  public destructEvents = createTypedEventEmitter<DestructableTerrainEvents>();
  public object3D = new Object3D();
  public terrain: TiledLevelAPI.MapTerrain;
  public initialPosition: Vector3;
  public crumbled = false;
  private terrainCracksTexture = getAsset("terrainCracks").clone();
  private fadingOut = false;

  constructor(props: DestructableTerrainProps) {
    super(props);
    this.terrain = props.terrain;
    const size = new Vector2();
    this.terrain.bbox.getSize(size);
    this.size = {
      width: size.x,
      height: size.y
    };
    this.initialPosition = this.position.clone();

    let isFilterable = false;
    switch (this.terrain.tileType) {
      case TiledLevelAPI.TileType.platform:
      case TiledLevelAPI.TileType.platformStairsLeft:
      case TiledLevelAPI.TileType.platformStairsRight:
        isFilterable = true;
        break;
      default:
        break;
    }

    this.behaviors.physics
      .init(this)
      .setTerrain(this.terrain)
      .setFilterable(isFilterable);

    this.terrainCracksTexture.wrapS = RepeatWrapping;
    this.terrainCracksTexture.wrapT = RepeatWrapping;
    this.behaviors.render
      .init(this)
      .setTiles(this.terrain.decalTiles)
      .setConstructMaterial(
        (texture) =>
          new ShaderMaterial({
            fragmentShader: crackedTerrainFrag,
            vertexShader: crackedTerrainVert,
            side: DoubleSide,
            alphaTest: 0.1,
            transparent: true,
            uniforms: {
              map: {
                value: texture
              },
              cracks: {
                value: this.terrainCracksTexture
              }
            }
          })
      )
      .buildTileMeshes()
      .apply();

    // This is a kludge.
    // Probably needs its own behavior instead of this.
    for (const sheet of this.behaviors.render.getSheets()) {
      const uv2Arr = new Float32Array(sheet.tiles.length * 8);
      let ti = 0;
      for (const tile of sheet.tiles) {
        const x = tile.pos.x;
        const y = tile.pos.y;
        const u0 = x;
        const v0 = y;
        const uvi = ti * 8;
        uv2Arr[uvi + 0] = u0 + 0;
        uv2Arr[uvi + 1] = v0 + 0;
        uv2Arr[uvi + 2] = u0 + 0.5;
        uv2Arr[uvi + 3] = v0 + 0;
        uv2Arr[uvi + 4] = u0 + 0.5;
        uv2Arr[uvi + 5] = v0 - 0.5;
        uv2Arr[uvi + 6] = u0 + 0;
        uv2Arr[uvi + 7] = v0 - 0.5;
        ti++;
      }
      sheet.geom.setAttribute("uv2", new BufferAttribute(uv2Arr, 2));
    }

    this.behaviors.crumble
      .initWithTerrainEntity(this)
      .setTerrain(this.terrain)
      .setFilterable(isFilterable)
      .setOnFullyCrumbled(() => this.beginFinalFade());

    // Handle incoming propagation events from a neighboring terrain.
    this.destructEvents.on(
      DestructableTerrainEventTypes.CrumbleProbeReceived,
      ({ worldPoint, budget }) => {
        if (this.fadingOut) return;
        const local = new Vector2(
          worldPoint.x - this.position.x,
          worldPoint.y - this.position.y
        );
        this.crumbled = true;
        this.behaviors.crumble.startCrumble(local, budget);
      }
    );

    // Route hits to a crumble. An explosive hit carrying a circular HitShape
    // obliterates every cell inside the circle and then keeps spreading; any
    // other hit seeds a localized crumble at the attacker's contact point.
    this.events.on(EntityLifecycleEvents.Hit, (hit) => {
      if (this.fadingOut) return;
      this.crumbled = true;

      const expansionBudget = Math.max(1, Math.round(hit.damage / 3));

      if (
        hit.damageType === DamageType.Explosion &&
        hit.hitShape?.type === "circle"
      ) {
        this.behaviors.crumble.explodeCircle(
          hit.hitShape.center,
          hit.hitShape.radius,
          expansionBudget
        );
        return;
      }

      const src = hit.hittingEntity ?? hit.sourceEntity;
      let local: Vector2 | undefined;
      if (src?.position) {
        local = new Vector2(
          src.position.x - this.position.x,
          src.position.y - this.position.y
        );
      }
      this.behaviors.crumble.startCrumble(local, expansionBudget);
    });
  }

  destroy() {
    super.destroy();
    this.terrainCracksTexture.dispose();
  }

  getVertVectors() {
    return this.terrain.polygon;
  }
  getRigidBody() {
    return this.behaviors.physics.body;
  }
  disable() {
    this.object3D.visible = false;
    this.behaviors.physics.disable();
  }
  step(ms: number) {
    super.step(ms);
    this.behaviors.crumble.step(ms);
    if (this.fadingOut) {
      // Older crumble path also rotates tiles. Sub-fragment animation is
      // driven inside CrumbleGridBehavior.step().
      this.behaviors.render.updateAllTilesWithVelocity(ms);
    }
  }
  postStep(_deltaMs: number): void {
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }

  // Helpers exposed to CrumbleGridBehavior.
  hideOriginalTileMesh() {
    // The cracked-terrain shader doesn't read material.opacity, so
    // setOpacity(0) wouldn't actually hide it. Toggle visibility on the
    // render behavior's object3D — sub-fragment mesh under our own
    // object3D continues to draw.
    this.behaviors.render.object3D.visible = false;
    // Also drop the old colliders so future disable() is a no-op (the
    // CrumbleGrid behavior now owns the body's colliders).
    if (this.behaviors.physics.colliders) {
      this.behaviors.physics.colliders.length = 0;
    }
  }

  getMaterialsBySheet(): Map<string, Material> {
    const byName = new Map<string, Material>();
    for (const sheet of this.behaviors.render.getSheets()) {
      byName.set(sheet.info.name, sheet.material);
    }
    return byName;
  }

  receiveCrumbleProbe(
    worldPoint: Vector2,
    sourceEntityId: string,
    budget?: number
  ) {
    this.destructEvents.emit(
      DestructableTerrainEventTypes.CrumbleProbeReceived,
      { worldPoint, sourceEntityId, budget }
    );
  }

  // Public crumble API
  // - crumble(): backward-compat — destroys the entire terrain.
  // - crumbleAt(localPoint, budget?): seeds a flood-fill at localPoint whose
  //   per-block expansion budget bounds how far removal spreads (propagating
  //   into any neighboring terrain it reaches). Omit budget for unbounded
  //   removal.
  crumble() {
    if (this.fadingOut) return;
    this.crumbled = true;
    this.behaviors.crumble.crumbleAll();
  }
  crumbleAt(localPoint: Vector2, budget?: number) {
    if (this.fadingOut) return;
    this.crumbled = true;
    this.behaviors.crumble.startCrumble(localPoint, budget);
  }

  private beginFinalFade() {
    if (this.fadingOut) return;
    this.fadingOut = true;
    this.behaviors.physics.disable();
    this.destructEvents.emit(DestructableTerrainEventTypes.Destruct);
    this.scheduler.add({
      id: "destructableFadeOut",
      duration: 500,
      invokeFunctionAtComplete: () => {
        this.level?.removeEntity(this.id);
        this.destroy();
      }
    });
  }

  disappear(duration = 1000) {
    this.scheduler.add({
      duration,
      invokeFunction: (t) => this.behaviors.render.setOpacity(1 - t),
      invokeFunctionAtComplete: () => {
        this.behaviors.render.setOpacity(0);
        this.behaviors.physics.disable();
      }
    });
  }
  appear(duration = 1000) {
    this.behaviors.physics.enable();
    this.scheduler.add({
      duration,
      invokeFunction: (t) => this.behaviors.render.setOpacity(t),
      invokeFunctionAtComplete: () => {
        this.behaviors.render.setOpacity(1);
        this.behaviors.physics.enable();
      }
    });
  }
}

export function isDestructableTerrain(
  entity: BaseEntityType
): entity is DestructableTerrain {
  return entity.type === DestructableTerrain.type;
}
