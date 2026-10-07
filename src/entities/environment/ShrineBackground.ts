import {
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Texture
} from "three";

import { EntityProps } from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import backgroundPng from "./sprites/big-shrine/shrine-background.png";
import lightsPng from "./sprites/big-shrine/shrine-lights.png";

export type ShrineBackgroundProps = EntityProps & {};

@addResourceLoader(
  new TextureResourceLoader("ShrineBackgroundTexture", backgroundPng)
)
@addResourceLoader(
  new TextureResourceLoader("ShrineBackgroundLightsTexture", lightsPng)
)
export class ShrineBackground extends CoreEntity {
  static type = "ShrineBackground";
  public type = ShrineBackground.type;

  public object3D = new Object3D();

  private backgroundMesh: Mesh;
  private lightsMesh: Mesh;
  private lightsMaterial: MeshBasicMaterial;
  private animating = false;
  private animationDuration = 0;
  private animationElapsed = 0;

  constructor(props: ShrineBackgroundProps) {
    super(props);

    const width = props.size?.width ?? 15;
    const height = props.size?.height ?? 10;

    const texture = getResource<Texture>(
      ShrineBackground,
      "ShrineBackgroundTexture"
    );
    this.backgroundMesh = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ map: texture, depthWrite: false })
    );
    this.backgroundMesh.layers.set(RenderLayers.default);
    this.object3D.add(this.backgroundMesh);

    // Lights overlay — drawn behind the player/walls but in front of the background.
    // Opacity ramps from 0→1 over the animation duration.
    const lightsTexture = getResource<Texture>(
      ShrineBackground,
      "ShrineBackgroundLightsTexture"
    );
    this.lightsMaterial = new MeshBasicMaterial({
      map: lightsTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.lightsMesh = new Mesh(
      new PlaneGeometry(width, height),
      this.lightsMaterial
    );
    this.lightsMesh.layers.set(RenderLayers.default);
    this.object3D.add(this.lightsMesh);

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
    this.object3D.position.z = 1;
  }

  startAnimation(durationMs: number) {
    this.animationDuration = durationMs;
    this.animationElapsed = 0;
    this.animating = true;
  }

  instantComplete() {
    this.animating = false;
    this.lightsMaterial.opacity = 1;
  }

  step(ms: number) {
    super.step(ms);
    if (this.animating) {
      this.animationElapsed += ms;
      if (this.animationElapsed >= this.animationDuration) {
        this.animationElapsed = this.animationDuration;
        this.animating = false;
      }
      this.lightsMaterial.opacity =
        this.animationElapsed / this.animationDuration;
    }
  }

  destroy(): void {
    super.destroy();
    this.backgroundMesh.geometry.dispose();
    (this.backgroundMesh.material as MeshBasicMaterial).dispose();
    this.lightsMesh.geometry.dispose();
    this.lightsMaterial.dispose();
  }
}
