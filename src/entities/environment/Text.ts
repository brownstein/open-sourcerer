import loadBMFont, { BMFont } from "src/vendor/load-bmfont-browser";
import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  Texture,
  Vector3
} from "three";
import { Text as TroikaText, preloadFont } from "troika-three-text";

import { EntityProps } from "src/api/entity";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { addResourceLoader, getResource } from "src/engine/entity/decorators";
import {
  GenericLoader,
  TextureResourceLoader
} from "src/engine/loader/Loaders";
import { BMFontText } from "src/entities/environment/bmfont-text/BMFontText";
import compassTTF from "src/fonts/compass/compass-9-src.ttf";
import compassFnt from "src/fonts/compass/compass.fnt";
import compassPng from "src/fonts/compass/compass_0.png";
import fontFantasyFnt from "src/fonts/font-fantasy/font_fantasy_24.fnt";
import fontFantasyPng from "src/fonts/font-fantasy/font_fantasy_24_0.png";
import fontFantasyTTF from "src/fonts/font-fantasy/font_fantasy_m.ttf";
import geoTTF from "src/fonts/geo/geo-regular.ttf";
import highbirthTTF from "src/fonts/highbirth/highbirth.ttf";
import highbirthFnt from "src/fonts/highbirth/highbirth_9.fnt";
import highbirthPng from "src/fonts/highbirth/highbirth_9_0.png";
import mssn8Fnt from "src/fonts/mssn/madoka_8.fnt";
import mssn8Png from "src/fonts/mssn/madoka_8_0.png";
import trollTTF from "src/fonts/troll/troll-12-src.ttf";
import trollFnt from "src/fonts/troll/troll.fnt";
import trollPng from "src/fonts/troll/troll_0.png";

export type SupportedTroikaFont =
  | "Geo"
  | "Troll"
  | "Compass"
  | "Highbirth"
  | "FF";
export type SupportedBMFont = "Troll" | "Compass" | "Highbirth" | "FF" | "MSSN";

const troikaTTFs: Record<SupportedTroikaFont, string> = {
  Geo: geoTTF,
  Compass: compassTTF,
  Troll: trollTTF,
  Highbirth: highbirthTTF,
  FF: fontFantasyTTF
};

const isValidBMFont = (
  fontName: string | undefined
): fontName is SupportedBMFont => {
  switch (fontName) {
    case "Troll":
    case "Compass":
    case "Highbirth":
    case "FF":
    case "MSSN":
      return true;
    default:
      return false;
  }
};

const bmFontFnts: Record<SupportedBMFont, string> = {
  Troll: trollFnt,
  Compass: compassFnt,
  Highbirth: highbirthFnt,
  FF: fontFantasyFnt,
  MSSN: mssn8Fnt
};

const bmFontSizes: Record<SupportedBMFont, number> = {
  Troll: 16,
  Compass: 16,
  Highbirth: 8,
  FF: 24,
  MSSN: 8
};

const numbers = "1234567890";
const alphabet = "abcdefghijklmnopqrstuvwxyz";
const punctuation = "[](){}<>.,!@#$%^&*-_~'\"|";
const defaultCharacters = [
  ...numbers.split(""),
  ...alphabet.split(""),
  ...alphabet.toUpperCase().split(""),
  ...punctuation.split("")
];

export type TextProps = EntityProps & {
  text?: string;
  troika?: boolean;
  textFont?: string;
  textPixelSize?: number;
  textAlign?: "left" | "center" | "right";
  textWrap?: boolean;
  textColor?: string;
  dropShadow?: boolean;
  outline?: boolean;
  outlineColor?: string;
  additiveBlending?: boolean;
  /** Vertical gradient: top color (bright). */
  gradientColorTop?: string;
  /** Vertical gradient: bottom color. */
  gradientColorBottom?: string;
};

@addResourceLoader(
  new GenericLoader("ttfFonts", async () => {
    await Promise.all(
      Object.values(troikaTTFs).map(
        (fontUrl) =>
          new Promise<void>((resolve) => {
            preloadFont(
              {
                font: fontUrl,
                characters: defaultCharacters
              },
              resolve
            );
          })
      )
    );
  })
)
@addResourceLoader(
  new GenericLoader<Record<string, BMFont>>("fnts", async () => {
    const fontsByName: Record<string, BMFont> = {};
    await Promise.all(
      Object.entries(bmFontFnts).map(
        ([fontName, fntVal]) =>
          new Promise((resolve, reject) => {
            loadBMFont(fntVal, (err, fnt) => {
              if (err) {
                reject(err);
              } else {
                fontsByName[fontName] = fnt;
                resolve(fnt);
              }
            });
          })
      )
    );
    return fontsByName;
  })
)
@addResourceLoader(new TextureResourceLoader("ffPngTexture", fontFantasyPng))
@addResourceLoader(
  new TextureResourceLoader("highbirthPngTexture", highbirthPng)
)
@addResourceLoader(new TextureResourceLoader("trollPngTexture", trollPng))
@addResourceLoader(new TextureResourceLoader("compassPngTexture", compassPng))
@addResourceLoader(new TextureResourceLoader("mssn8PngTexture", mssn8Png))
export class Text extends CoreEntity {
  static type = "Text";
  static matchAdditionalTypes = ["text"];
  public type = "text";
  public object3D = new Object3D();
  private troikaText?: TroikaText;
  private bmText?: BMFontText;
  constructor(props: TextProps) {
    super(props);
    const {
      text,
      textPixelSize = 12,
      textFont,
      troika,
      textColor,
      textAlign,
      textWrap,
      outline,
      outlineColor,
      opacity: opacityIn = 1,
      additiveBlending,
      gradientColorTop,
      gradientColorBottom
    } = props;

    // Sync position of Object3D.
    this.object3D.position.copy(this.position);

    const color =
      (textColor?.length ?? 0) >= 9
        ? new Color(`#${textColor?.slice(3)}`)
        : new Color(textColor);
    const opacity =
      (textColor?.length ?? 0) >= 9
        ? Number.parseInt(textColor?.slice(1, 3) ?? "ff", 16) / 255
        : opacityIn;

    if (troika) {
      this.troikaText = new TroikaText();
      let font = troikaTTFs["Troll"];
      if (textFont) {
        for (const key of Object.keys(troikaTTFs)) {
          if (textFont.toLowerCase().startsWith(key.toLowerCase())) {
            font = troikaTTFs[key as SupportedTroikaFont];
            break;
          }
        }
      }
      if (additiveBlending) {
        this.troikaText.material = new MeshBasicMaterial({
          blending: AdditiveBlending
        });
      }
      this.troikaText.font = font;
      this.troikaText.text = props.text ?? '""';
      this.troikaText.color = color;
      this.troikaText.fillOpacity = opacity;
      this.troikaText.outlineBlur = 0;
      this.troikaText.outlineColor = 0x000000;
      this.troikaText.outlineWidth = outline ? 1 : 0;
      this.troikaText.outlineOpacity = opacity;
      this.troikaText.fontSize = textPixelSize;
      this.troikaText.scale.multiplyScalar(kInvPixelScale);
      this.troikaText.layers.set(RenderLayers.text);
      this.troikaText.sync(() => {
        if (!this.troikaText) return;
        const tTextSizeHalf = new Vector3();
        this.troikaText.geometry.computeBoundingBox();
        this.troikaText.geometry.boundingBox?.getSize(tTextSizeHalf);
        tTextSizeHalf.multiplyScalar(0.5 * kInvPixelScale);
        this.troikaText.position.x -= tTextSizeHalf.x;
        this.troikaText.position.y += tTextSizeHalf.y;
      });
      this.object3D.add(this.troikaText);
      if (additiveBlending) {
        if (this.troikaText.material instanceof ShaderMaterial) {
          this.troikaText.material.blending = AdditiveBlending;
        }
      }
    } else {
      // BMFont variant - pixel font rendering.
      // TODO: support multiple fonts here.
      const font = isValidBMFont(textFont) ? textFont : "Troll";
      const fontResource = getResource<Record<string, BMFont>>(Text, "fnts")[
        font
      ];
      const fontBaseSize = bmFontSizes[font];
      const fontSize = props.textPixelSize || 12;
      let _widthSize: number | undefined;
      if (props.size) {
        _widthSize = props.size?.width * kPixelScale;
        _widthSize *= fontBaseSize / fontSize;
      }

      let texture: Texture | undefined;
      switch (font as SupportedBMFont) {
        case "Troll":
          texture = getResource<Texture>(Text, "trollPngTexture");
          break;
        case "Compass":
          texture = getResource<Texture>(Text, "compassPngTexture");
          break;
        case "Highbirth":
          texture = getResource<Texture>(Text, "highbirthPngTexture");
          break;
        case "FF":
          texture = getResource<Texture>(Text, "ffPngTexture");
          break;
        case "MSSN":
          texture = getResource<Texture>(Text, "mssn8PngTexture");
          break;
      }
      const bmFontText = new BMFontText({
        text: text ?? '""',
        font: fontResource,
        texture,
        fontSize: fontSize * kInvPixelScale,
        width: textWrap ? this.size.width : undefined,
        align: textAlign,
        color,
        opacity,
        outlinePx: outline ? 1 : 0,
        outlineColor: outlineColor
          ? new Color(outlineColor)
          : new Color(0, 0, 0),
        gradientColorTop: gradientColorTop
          ? new Color(gradientColorTop)
          : undefined,
        gradientColorBottom: gradientColorBottom
          ? new Color(gradientColorBottom)
          : undefined
      });
      const centerPoint = new Vector3();
      bmFontText?.mesh.geometry.boundingBox?.getCenter(centerPoint);
      bmFontText.mesh.position
        .sub(centerPoint)
        .multiplyScalar(kPixelScale)
        .round()
        .multiplyScalar(kInvPixelScale);
      this.object3D.add(bmFontText.mesh);
      this.bmText = bmFontText;
    }
  }
  step(ms: number) {
    super.step(ms);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);
  }
  recolor(color: Color) {
    if (this.troikaText) {
      this.troikaText.color = color;
    }
    if (this.bmText) {
      this.bmText.updateColor(color);
    }
  }
  update(text: string) {
    if (this.troikaText) this.troikaText.text = text;
    if (this.bmText) {
      this.bmText.update(text);
      const centerPoint = new Vector3();
      this.bmText?.mesh.geometry.boundingBox?.getCenter(centerPoint);
      this.bmText.mesh.position
        .multiplyScalar(0)
        .sub(centerPoint)
        .multiplyScalar(kPixelScale)
        .round()
        .multiplyScalar(kInvPixelScale);
    }
  }
  get opacity() {
    if (this.troikaText) {
      return this.troikaText.material.opacity;
    }
    if (this.bmText) {
      return this.bmText.material.opacity;
    }
    return 0;
  }
  set opacity(value: number) {
    if (this.troikaText) {
      this.troikaText.material.opacity = value;
    }
    if (this.bmText) {
      this.bmText.material.opacity = value;
    }
  }
  destroy() {
    super.destroy();
    if (this.troikaText) {
      this.troikaText.dispose();
      this.troikaText = undefined;
    }
    if (this.bmText) {
      this.bmText.mesh.geometry.dispose();
      this.bmText.material.dispose();
      this.bmText = undefined;
    }
  }
}
