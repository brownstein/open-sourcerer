import { Object3D, Scene, WebGLRenderer } from "three";
import { ThreeAseprite } from "three-aseprite";

import {
  EntityAlignment,
  EntityLevelAPI,
  EntityProps,
  LevelAPI
} from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import { ShrineGodRay } from "./ShrineGodRay";
import shrineBridgeJson from "./sprites/big-shrine/shrine-bridge.json";
import shrineBridgePng from "./sprites/big-shrine/shrine-bridge.png";

export type ShrineBridgeProps = EntityProps & {
  flip?: boolean;
  speed?: number;
};

@addResourceLoader(
  new TextureResourceLoader("ShrineBridgeTexture", shrineBridgePng)
)
export class ShrineBridge extends CoreEntity {
  static type = "ShrineBridge";
  public type = ShrineBridge.type;
  public alignment = EntityAlignment.TemporaryTerrain;

  public object3D = new Object3D();

  private sprite: ThreeAseprite;

  // White-colored clone of the sprite rendered as a bright contributor into the
  // god ray's compositeRT so the bridge glows instead of casting a dark silhouette.
  private godRaySprite: ThreeAseprite;
  private godRayScene: Scene;
  private godRay: ShrineGodRay | null = null;
  private boundContributor: (renderer: WebGLRenderer) => void;
  private isAnimating = false;

  private readonly speed: number;

  constructor(props: ShrineBridgeProps) {
    super(props);

    const flipX = props.flip ? -1 : 1;
    this.speed = props.speed ?? 1;

    this.sprite = new ThreeAseprite({
      texture: getResource(ShrineBridge, "ShrineBridgeTexture"),
      sourceJSON: shrineBridgeJson
    });
    this.sprite.holdLastAnimationFrame = true;
    this.sprite.mesh.frustumCulled = false;
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.sprite.mesh.scale.x *= flipX;
    this.sprite.mesh.layers.set(RenderLayers.default);

    this.object3D.add(this.sprite.mesh);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.position.z = 2;

    // Bright clone for the god ray contribution pass.
    this.godRaySprite = this.sprite.clone();
    this.godRaySprite.holdLastAnimationFrame = true;
    this.godRaySprite.mesh.frustumCulled = false;
    this.godRaySprite.setColor(0xffffff);
    this.godRaySprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.godRaySprite.mesh.scale.x *= flipX;
    this.godRayScene = new Scene();
    this.godRayScene.add(this.godRaySprite.mesh);

    this.boundContributor = (renderer: WebGLRenderer) => {
      if (!this.godRay) return;
      renderer.render(this.godRayScene, this.godRay.silhouetteCamera);
    };
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
    for (const entity of level.getEntities().values()) {
      if (entity.type === ShrineGodRay.type) {
        this.godRay = entity as ShrineGodRay;
        // Sync the god ray sprite to the bridge's world position (z=0 for silhouette camera).
        this.godRaySprite.mesh.position.set(
          this.object3D.position.x,
          this.object3D.position.y,
          0
        );
        this.godRay.addBrightContributor(this.boundContributor);
        break;
      }
    }
  }

  detachFromLevel(level: LevelAPI): void {
    super.detachFromLevel(level);

    if (this.godRay) {
      this.godRay.removeBrightContributor(this.boundContributor);
      this.godRay = null;
    }
  }

  startAnimation() {
    this.isAnimating = true;
  }

  stopAnimation() {
    this.isAnimating = false;
  }

  step(ms: number) {
    super.step(ms);

    if (this.isAnimating) {
      this.sprite.playingAnimationBackwards = false;
      this.godRaySprite.playingAnimationBackwards = false;
    } else {
      this.sprite.playingAnimationBackwards = true;
      this.godRaySprite.playingAnimationBackwards = true;
    }

    this.sprite.animate(ms * this.speed);
    this.godRaySprite.animate(ms * this.speed);
  }

  destroy() {
    super.destroy();
    this.sprite.dispose();
    this.godRaySprite.dispose();
  }
}
