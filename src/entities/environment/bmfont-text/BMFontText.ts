import createLayout, { Layout } from "layout-bmfont-text";
import { BMFont } from "src/vendor/load-bmfont-browser";
import createIndices from "quad-indices";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Texture,
  Vector2
} from "three";

import { RenderLayers } from "src/engine/constants/renderLayers";

import bmFontTextFrag from "./bmFontTextFrag.glsl";
import bmFontTextVert from "./bmFontTextVert.glsl";

export type BMFontTextProps = {
  texture: Texture;
  text: string;
  font: BMFont;
  fontSize?: number;
  width?: number;
  align?: "left" | "center" | "right";
  color?: Color;
  opacity?: number;
  outlineColor?: Color;
  outlinePx?: number;
  /** Vertical gradient: top color. */
  gradientColorTop?: Color;
  /** Vertical gradient: bottom color. */
  gradientColorBottom?: Color;
};

export class BMFontText {
  public mesh: Mesh;
  private font: BMFont;
  private fontSize = 1;
  private fontScale = 1;
  private align: "left" | "center" | "right" = "left";
  private textureSize: Vector2;
  private layout: Layout;
  private geom: BufferGeometry;
  private posArr: Float32Array;
  private uvArr: Float32Array;
  private indexArr: Uint16Array;
  public material: ShaderMaterial;

  private textPadPxRaw = 0;

  constructor(props: BMFontTextProps) {
    const {
      texture,
      text,
      font,
      fontSize,
      width,
      align,
      color,
      opacity = 1,
      outlineColor,
      outlinePx = 0,
      gradientColorTop,
      gradientColorBottom
    } = props;
    this.font = font;
    this.align = align ?? "left";
    if (fontSize !== undefined) {
      this.fontSize = fontSize;
      this.fontScale = fontSize / font.common.base;
    } else {
      this.fontSize = font.common.base;
    }
    this.textureSize = new Vector2(
      texture.image.naturalWidth,
      texture.image.naturalHeight
    );
    this.layout = createLayout({
      text,
      font,
      align,
      width: width !== undefined ? width / this.fontScale : undefined
    });
    this.textPadPxRaw = outlinePx;

    const geom = new BufferGeometry();
    this.posArr = new Float32Array(this.layout.glyphs.length * 12);
    this.uvArr = new Float32Array(this.layout.glyphs.length * 8);
    this.indexArr = createIndices({
      count: this.layout.glyphs.length,
      type: "uint16",
      clockwise: true
    }) as Uint16Array;
    this.updateArraysFromLayout();
    geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    geom.setAttribute("uv", new BufferAttribute(this.uvArr, 2));
    geom.setIndex(new BufferAttribute(this.indexArr, 1));
    geom.computeBoundingBox();
    this.geom = geom;

    const useGradient =
      !!gradientColorTop && !!gradientColorBottom;
    const bbox = geom.boundingBox!;

    this.material = new ShaderMaterial({
      vertexShader: bmFontTextVert,
      fragmentShader: bmFontTextFrag,
      uniforms: {
        color: {
          value: color ?? new Color(1, 1, 1)
        },
        opacity: {
          value: opacity
        },
        map: {
          value: texture
        },
        outlineSpread: {
          value: outlinePx
        },
        outlineColor: {
          value: outlineColor ?? new Color(0, 0, 0)
        },
        invTextureSize: {
          value: new Vector2(
            1 / texture.image.naturalWidth,
            1 / texture.image.naturalHeight
          )
        },
        useGradient: { value: useGradient },
        gradientColorTop: {
          value: gradientColorTop ?? new Color(1, 1, 1)
        },
        gradientColorBottom: {
          value: gradientColorBottom ?? new Color(1, 1, 1)
        },
        bboxMin: { value: bbox.min.clone() },
        bboxMax: { value: bbox.max.clone() }
      },
      side: DoubleSide,
      transparent: true
    });

    this.mesh = new Mesh(this.geom, this.material);
    this.mesh.layers.set(RenderLayers.default);
  }
  update(text: string) {
    this.layout = createLayout({
      text,
      font: this.font,
      width: 300
    });
    this.posArr = new Float32Array(this.layout.glyphs.length * 12);
    this.uvArr = new Float32Array(this.layout.glyphs.length * 8);
    this.indexArr = createIndices({
      count: this.layout.glyphs.length,
      type: "uint16",
      clockwise: true
    }) as Uint16Array;
    this.updateArraysFromLayout();
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.setAttribute("uv", new BufferAttribute(this.uvArr, 2));
    this.geom.setIndex(new BufferAttribute(this.indexArr, 1));
    this.geom.computeBoundingBox();
    const bbox = this.geom.boundingBox;
    if (bbox && this.material.uniforms.bboxMin && this.material.uniforms.bboxMax) {
      this.material.uniforms.bboxMin.value.copy(bbox.min);
      this.material.uniforms.bboxMax.value.copy(bbox.max);
      this.material.uniformsNeedUpdate = true;
    }
  }
  updateColor(color: Color) {
    this.material.uniforms.color.value.copy(color);
    this.material.uniformsNeedUpdate = true;
  }
  private updateArraysFromLayout() {
    const { layout, posArr, uvArr, textureSize, textPadPxRaw, fontScale } =
      this;
    const invSx = 1 / textureSize.x;
    const invSy = 1 / textureSize.y;
    const textPadU = textPadPxRaw * invSx;
    const textPadV = textPadPxRaw * invSy;
    let qi = 0;
    for (const glyph of layout.glyphs) {
      const {
        width,
        height,
        x: uRaw,
        y: vRaw,
        xoffset: xoRaw,
        yoffset: yoRaw
      } = glyph.data;
      const [xRaw, yRaw] = glyph.position;

      const x = xRaw + xoRaw;
      const y = -yRaw - yoRaw;

      let x0 = x - textPadPxRaw;
      let y0 = y - height - textPadPxRaw;
      let x1 = x + width + textPadPxRaw;
      let y1 = y + textPadPxRaw;

      x0 *= fontScale;
      y0 *= fontScale;
      x1 *= fontScale;
      y1 *= fontScale;

      const u0 = uRaw * invSx - textPadU;
      const v0 = 1 - vRaw * invSy + textPadV;
      const u1 = u0 + width * invSx + textPadU * 2;
      const v1 = v0 - height * invSy - textPadV * 2;

      posArr[qi * 12 + 0] = x0;
      posArr[qi * 12 + 1] = y0;
      posArr[qi * 12 + 3] = x0;
      posArr[qi * 12 + 4] = y1;
      posArr[qi * 12 + 6] = x1;
      posArr[qi * 12 + 7] = y1;
      posArr[qi * 12 + 9] = x1;
      posArr[qi * 12 + 10] = y0;

      uvArr[qi * 8 + 0] = u0;
      uvArr[qi * 8 + 1] = v1;
      uvArr[qi * 8 + 2] = u0;
      uvArr[qi * 8 + 3] = v0;
      uvArr[qi * 8 + 4] = u1;
      uvArr[qi * 8 + 5] = v0;
      uvArr[qi * 8 + 6] = u1;
      uvArr[qi * 8 + 7] = v1;
      qi++;
    }
  }
}
