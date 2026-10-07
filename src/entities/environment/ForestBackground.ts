import { Box2, Color, Object3D, Texture, Vector2, Vector3 } from "three";

import { EntityLevelEvents, EntityProps, LevelAPI } from "src/api/entity";
import { kInvPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";
import { ThreeAsepriteBackground } from "src/entities/environment/three-aseprite-background/ThreeAsepriteBackground";

import { LightRays } from "./LightRays";
import forestBgJson from "./sprites/forest/forest-processed.json";
import forestBgPng from "./sprites/forest/forest-processed.png";

@addResourceLoader(new TextureResourceLoader("Forest", forestBgPng))
export class ForestBackground extends CoreEntity {
  static type = "ForestBackground";
  public type = "ForestBackground";

  public object3D = new Object3D();
  private worldBoundaries?: Box2;
  private bg: ThreeAsepriteBackground;
  private rays: LightRays;

  constructor(props: EntityProps) {
    super(props);
    const texture = getResource(ForestBackground, "Forest") as Texture;
    const parallaxMax = new Vector2(1, 0.5);
    const bg = new ThreeAsepriteBackground({
      texture,
      sourceJSON: forestBgJson,
      frameName: ({ layerName }) => `(${layerName})`,
      scale: new Vector3(1, -1, 1)
        .multiplyScalar(kInvPixelScale)
        .multiplyScalar(1 / 2),
      minDepth: -30,
      maxDepth: -28,
      layerExtensions: {
        "Grass/Ground": {
          extendDown: true
        },
        "Grass Ground BG": {
          extendDown: true
        },
        "Tree Front 01 Tile": {
          tileUp: true
        },
        "Tree Midground 01 Tile": {
          tileUp: true
        },
        "Tree Midground 02 Tile": {
          tileUp: true
        },
        "Tree Back 01 Tile": {
          tileUp: true
        },
        "Trees Distant 01 Tile": {
          tileUp: true
        },
        "Trees Distant 02 Tile": {
          tileUp: true
        },
        "Trees Distant 03 Tile": {
          tileUp: true
        }
      },
      layerFadeColor: new Color(1, 0.9, 0.75),
      // layerFadeColor: new Color(0, 0.4, 0.75),
      layerFadeAmounts: {
        Foreground_1: 0.5,
        "Grass Ground BG": 0.5,
        "Midground Trees S 01": 0.55,
        Midground_1: 0.55,
        Midground_2: 0.65,
        "Distant 01 Trees": 0.7,
        "Distant Bushes": 0.85,
        "Distant 02 Silo": 0.85,
        "Distant 03 Silo": 0.9
      },
      layerParallax: {
        Foreground_1: parallaxMax.clone().multiplyScalar(0.4),
        "Grass Ground BG": parallaxMax.clone().multiplyScalar(0.5),
        "Midground Trees S 01": parallaxMax.clone().multiplyScalar(0.5),
        Midground_1: parallaxMax.clone().multiplyScalar(0.6),
        Midground_2: parallaxMax.clone().multiplyScalar(0.6),
        "Distant 01 Trees": parallaxMax.clone().multiplyScalar(0.7),
        "Distant Bushes": parallaxMax.clone().multiplyScalar(0.7),
        "Distant 02 Silo": parallaxMax.clone().multiplyScalar(0.8),
        "Distant 03 Silo": parallaxMax.clone().multiplyScalar(0.9)
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
