import { Color, DoubleSide, Object3D, Vector2, Vector3 } from "three";
import { Text as TroikaText, preloadFont } from "troika-three-text";

import {
  BaseEntityType,
  EntityLevelAPI,
  EntityProps,
  EntitySnapshot
} from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader } from "src/engine/entity/decorators";
import { GenericLoader } from "src/engine/loader/Loaders";
import geo from "src/fonts/geo/geo-regular.ttf";
import mssn from "src/fonts/mssn/mssn-madoka.ttf";

const numbers = "1234567890";
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const punctuation = "[](){}<>.,!@#$%^&*-_~'\"|";
const defaultCharacters = [
  ...numbers.split(""),
  ...alphabet.split(""),
  ...alphabet.toUpperCase().split(""),
  ...punctuation.split("")
];

export type EncryptedWallTextProps = EntityProps & {
  text?: string;
  fontSize?: number;
  decrypted?: boolean;
};

@addResourceLoader(
  new GenericLoader("ttfFonts", async () => {
    await Promise.all([
      new Promise<void>((resolve) =>
        preloadFont(
          {
            font: mssn,
            characters: defaultCharacters
          },
          resolve
        )
      ),
      new Promise<void>((resolve) =>
        preloadFont(
          {
            font: geo,
            characters: defaultCharacters
          },
          resolve
        )
      )
    ]);
  })
)
export class EncryptedWallText extends CoreEntity implements BaseEntityType {
  static type = "EncryptedWallText";
  public type = EncryptedWallText.type;
  public get canBindToVariable() {
    return true;
  }

  // "EncryptedWallText" is a bit long...
  public bindingPrefix = "runes";
  public extraSpellBindingData() {
    const { decrypted } = this;
    return {
      decrypted
    };
  }

  public object3D = new Object3D();

  private decrypted = false;
  private encryptedText = new TroikaText();
  private decryptedText = new TroikaText();

  constructor(props: EncryptedWallTextProps) {
    super(props);
    const { text = "...", fontSize, decrypted } = props;

    this.decrypted = decrypted ?? this.decrypted;

    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.encryptedText.font = mssn;
    this.encryptedText.text = text;
    this.encryptedText.color = new Color(0xffffff);
    this.encryptedText.fillOpacity = 1;
    this.encryptedText.material.opacity = decrypted ? 0 : 1;
    this.encryptedText.material.side = DoubleSide;
    this.encryptedText.outlineBlur = 0;
    this.encryptedText.fontSize = fontSize ?? 8;
    this.encryptedText.maxWidth = 256;
    this.encryptedText.scale.multiplyScalar(kInvPixelScale);
    this.encryptedText.layers.set(RenderLayers.default);

    this.object3D.add(this.encryptedText);
    this.encryptedText.sync(() => {
      const textSizeHalf = new Vector3();
      this.encryptedText.geometry.computeBoundingBox();
      this.encryptedText.geometry.boundingBox?.getSize(textSizeHalf);
      textSizeHalf.multiplyScalar(0.5 * this.encryptedText.scale.x);
      this.encryptedText.position.x -= textSizeHalf.x;
      this.encryptedText.position.y += textSizeHalf.y;
    });

    this.decryptedText.font = geo;
    this.decryptedText.text = text;
    this.decryptedText.color = new Color(0xffffff);
    this.decryptedText.fillOpacity = 1;
    this.decryptedText.material.opacity = decrypted ? 1 : 0;
    this.decryptedText.material.side = DoubleSide;
    this.decryptedText.outlineBlur = 0;
    this.decryptedText.fontSize = fontSize ?? 6;
    this.decryptedText.maxWidth = 256;
    this.decryptedText.scale.multiplyScalar(kInvPixelScale);
    this.decryptedText.layers.set(RenderLayers.default);

    this.object3D.add(this.decryptedText);
    this.decryptedText.sync(() => {
      const textSizeHalf = new Vector3();
      this.decryptedText.geometry.computeBoundingBox();
      this.decryptedText.geometry.boundingBox?.getSize(textSizeHalf);
      textSizeHalf.multiplyScalar(0.5 * this.decryptedText.scale.x);
      this.decryptedText.position.x -= textSizeHalf.x;
      this.decryptedText.position.y += textSizeHalf.y;
    });
  }

  attachToLevel(level: EntityLevelAPI): void {
    super.attachToLevel(level);
  }

  destroy(): void {
    super.destroy();
    this.encryptedText.dispose();
    this.decryptedText.dispose();
  }

  decrypt() {
    if (this.decrypted) return;
    this.decrypted = true;
    this.scheduler.add({
      id: "crossfade",
      duration: 500,
      invokeFunction: (t) => {
        this.encryptedText.material.opacity = 1 - t;
        this.decryptedText.material.opacity = t;
      }
    });
  }

  isDecrypted() {
    return this.decrypted === true;
  }

  getSnapshot() {
    return {
      ...super.getSnapshot(),
      decrypted: this.decrypted
    };
  }

  applySnapshot(snapshot: EntitySnapshot): void {
    super.applySnapshot(snapshot);
    if (snapshot.decrypted) {
      this.decrypted = true;
      this.encryptedText.material.opacity = 0;
      this.decryptedText.material.opacity = 1;
    }
  }
}
