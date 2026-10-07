import { Box2, Color, Object3D, Texture, Vector2, Vector3 } from "three";

import { EntityLevelEvents, EntityProps, LevelAPI } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { ThreeAsepriteBackground } from "src/entities/environment/three-aseprite-background/ThreeAsepriteBackground";

import { LightRays } from "./LightRays";
import forestBgJson from "./sprites/forest/forest-bg-parallax.json";
import forestBgPng from "./sprites/forest/forest-bg-parallax.png";

@addResourceLoader(new TextureResourceLoader("ForestBG", forestBgPng))
export class ForestBackground2 extends CoreEntity {
  static type = "ForestBackground2";
  public type = "ForestBackground2";

  public object3D = new Object3D();
  private worldBoundaries?: Box2;
  private bg: ThreeAsepriteBackground;
  private rays: LightRays;

  constructor(props: EntityProps) {
    super(props);
    const texture = getResource(ForestBackground2, "ForestBG") as Texture;
    const parallaxMax = new Vector2(1, 0.5);
    const bg = new ThreeAsepriteBackground({
      texture,
      sourceJSON: forestBgJson,
      frameName: ({ layerName }) => `(${layerName}) 0`,
      scale: new Vector3(1, -1, 1).multiplyScalar(kInvPixelScale),
      minDepth: -30,
      maxDepth: -28,
      layerExtensions: {
        Tree_1_layer_1: {
          extendDown: true
        },
        Tree_2_layer_1: {
          extendDown: true
        },
        Tree_3_layer_1: {
          extendDown: true
        },
        Tree_1_layer_2: {
          extendDown: true
        },
        Tree_2_layer_2: {
          extendDown: true
        },
        Tree_3_layer_2: {
          extendDown: true
        },
        BG_layer3: {
          extendDown: true
        },
        BG_layer_4: {
          extendDown: true
        },
        BG_layer_5: {
          extendDown: true
        }
      },
      layerFadeColor: new Color(1, 0.9, 0.75),
      layerFadeAmounts: {},
      layerParallax: {
        Tree_1_layer_1: parallaxMax.clone().multiplyScalar(0.4),
        Tree_2_layer_1: parallaxMax.clone().multiplyScalar(0.5),
        Tree_3_layer_1: parallaxMax.clone().multiplyScalar(0.5),
        Tree_1_layer_2: parallaxMax.clone().multiplyScalar(0.6),
        Tree_2_layer_2: parallaxMax.clone().multiplyScalar(0.6),
        Tree_3_layer_2: parallaxMax.clone().multiplyScalar(0.6),
        BG_layer3: parallaxMax.clone().multiplyScalar(0.7),
        BG_layer_4: parallaxMax.clone().multiplyScalar(0.8),
        BG_layer_5: parallaxMax.clone().multiplyScalar(0.9)
      },
      layerOffsets: {
        Tree_1_layer_1: new Vector2(-5, 0),
        Tree_1_layer_3: new Vector2(-3, 0),
        Tree_2_layer_2: new Vector2(-4, 0)
      }
    });
    this.bg = bg;

    this.object3D.position.x = props.position.x;
    this.object3D.position.y = props.position.y;
    this.object3D.add(bg.object3D);

    this.rays = new LightRays(
      this.bg.depths.map((v) => v + 0.05),
      parallaxMax.clone().multiplyScalar(0.5),
      parallaxMax.clone().multiplyScalar(0.9)
    );
    this.object3D.add(this.rays.object3D);

    this.outOfSyncCameraUpdate = this.outOfSyncCameraUpdate.bind(this);
  }
  attachToLevel(level: LevelAPI): void {
    super.attachToLevel(level);
    this.rays.updateCenterAndWorldBoundaries(
      this.object3D.position,
      level.getWorldBoundaries()
    );
    this.updateToFitCamera(0);
    this.level?.on(
      EntityLevelEvents.OutOfSyncCameraUpdate,
      this.outOfSyncCameraUpdate
    );
  }
  detachFromLevel(level: LevelAPI) {
    this.level?.off(
      EntityLevelEvents.OutOfSyncCameraUpdate,
      this.outOfSyncCameraUpdate
    );
    super.detachFromLevel(level);
  }
  destroy() {
    super.destroy();
    this.rays.destroy();
    for (const segment of Object.values(this.bg.layerChildren)) {
      segment.geometry.dispose();
    }
    this.bg.material.dispose();
  }
  postStep(deltaMs: number): void {
    super.postStep(deltaMs);
    this.updateToFitCamera(deltaMs);
  }
  outOfSyncCameraUpdate() {
    this.updateToFitCamera(0);
  }
  updateToFitCamera(deltaMs: number) {
    let cameraSize: Vector2 | undefined;
    let cameraCenter: Vector2 | undefined;
    if (this.level?.cameraDirector) {
      const { center, size } = this.level.cameraDirector.getCurrentProperties();
      cameraCenter = center;
      cameraSize = size;
    } else {
      const levelBounds = this.level?.getWorldBoundaries();
      if (levelBounds) {
        cameraSize = new Vector2();
        cameraCenter = new Vector2();
        levelBounds.getSize(cameraSize);
        levelBounds.getCenter(cameraCenter);
      }
    }
    if (!cameraSize || !cameraCenter) return;
    const viewportBounds = new Box2();
    viewportBounds.expandByPoint(
      cameraSize.clone().multiplyScalar(0.5).add(cameraCenter)
    );
    viewportBounds.expandByPoint(
      cameraSize.clone().multiplyScalar(-0.5).add(cameraCenter)
    );
    viewportBounds.min.x -= this.position.x;
    viewportBounds.min.y -= this.position.y;
    viewportBounds.max.x -= this.position.x;
    viewportBounds.max.y -= this.position.y;
    this.bg.update(viewportBounds);
    this.rays.update(deltaMs, viewportBounds);
  }
}
