import { Object3D } from "three";
import { ThreeAseprite } from "three-aseprite";

import { EntityProps } from "src/api/entity";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import { TextureResourceLoader } from "src/engine/loader/Loaders";

import keyboardKeysJson from "./sprites/keyboard-keys.json";
import keyboardKeysPng from "./sprites/keyboard-keys.png";

export type KeyboardKeyPromptProps = EntityProps & {
  key?: "e" | "space" | "s";
};

@addResourceLoader(
  new TextureResourceLoader("keyboardTexture", keyboardKeysPng)
)
export class KeyboardKeyPrompt extends CoreEntity {
  static type = "KeyboardKeyPrompt";
  public type = "KeyboardKeyPrompt";
  public persist = false;
  public object3D = new Object3D();
  private alreadyPressed = false;
  private sprite: ThreeAseprite;
  constructor(props: KeyboardKeyPromptProps) {
    super(props);
    this.sprite = new ThreeAseprite({
      texture: getResource(KeyboardKeyPrompt, "keyboardTexture"),
      sourceJSON: keyboardKeysJson
    });
    this.sprite.mesh.scale.multiplyScalar(kInvPixelScale);
    this.object3D.add(this.sprite.mesh);
    this.object3D.position.copy(this.position);
    this.scheduler.add({
      id: "pressToggle",
      duration: 1000,
      recurring: true,
      invokeFunction: (t) => {
        this.sprite.mesh.position.y =
          Math.round(Math.sin(t * Math.PI * 2) * 0.1 * kPixelScale) *
          kInvPixelScale;
        const tagFrameNo = t > 0.5 ? 1 : 0;
        if (this.sprite.getCurrentTagFrame() === tagFrameNo) return;
        this.sprite.gotoTagFrame(tagFrameNo);
      }
    });
    switch (props.key) {
      case "e":
        this.sprite.gotoTag("E");
        break;
      case "space":
        this.sprite.gotoTag("SpaceBar");
        break;
      case "s":
        this.sprite.gotoTag("S");
        break;
      default:
        break;
    }
  }
  destroy() {
    super.destroy();
    this.sprite.dispose();
  }

  fadeIn(duration: number = 500): void {
    this.scheduler.cancel("fadeOut");
    this.scheduler.cancel("fadeIn");

    if (duration <= 0) {
      this.sprite.setOpacity(1);
      return;
    }

    this.scheduler.add({
      id: "fadeIn",
      duration,
      invokeFunction: (t) => {
        this.sprite.setOpacity(t);
      }
    });
  }

  fadeOut(duration: number = 500): void {
    this.scheduler.cancel("fadeIn");
    this.scheduler.cancel("fadeOut");

    if (duration <= 0) {
      this.sprite.setOpacity(0);
      return;
    }

    this.scheduler.add({
      id: "fadeOut",
      duration,
      invokeFunction: (t) => {
        this.sprite.setOpacity(1 - t);
      }
    });
  }

  markPressed() {
    this.alreadyPressed = true;
    this.scheduler.cancel("pressToggle");
    this.sprite.gotoTagFrame(1);

    this.fadeOut();
  }
}
