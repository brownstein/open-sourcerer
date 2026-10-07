import * as hb from "harfbuzzjs";
import getNormals from "polyline-normals";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer
} from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import { EntityLevelAPI, EntityProps } from "src/api/entity";
import { GameAssets } from "src/assets/allAssets";
import { RenderLayers } from "src/engine/constants/renderLayers";
import { kInvPixelScale, kPixelScale } from "src/engine/constants/scaling";
import { CoreEntity } from "src/engine/entity/CoreEntity";
import { getAsset, setAssetDependencies } from "src/engine/entity/decorators";
import { vector2ToArr2 } from "src/engine/util/vecTypes";
import {
  Sampler,
  SamplerBounds
} from "src/entities/shared/graphics/sampler/Sampler";

import fragmentShader from "./shaders/outlineFrag.glsl";
import vertexShader from "./shaders/outlineVert.glsl";

export type AvailableFont =
  | "directMessage"
  | "directMessageBold"
  | "mssn"
  | "fredoka"
  | "highbirth"
  | "kobold"
  | "roboto700";

export type TextAlign = "start" | "center" | "end";

export type TextOverflow = "visible" | "truncate";

// per-character transform around the glyph's centre: x/y in texels, rotation in
// radians, scale as a multiplier
export type CharacterTransform = {
  x?: number;
  y?: number;
  rotation?: number;
  scale?: number;
};

export type TextProps = {
  text?: string | string[];
  font?: AvailableFont;
  fontSize?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  // disable font ligatures so the glyph list stays 1:1 with the source
  ligatures?: boolean;
  horizontalAlign?: TextAlign;
  verticalAlign?: TextAlign;
  scale?: number;
  color?: string | string[];
  // on: spread the color list evenly across the characters. off: one color per
  // character, clamping to the last color when the list runs out
  distributeColorList?: boolean;
  opacity?: number;
  outline?: boolean;
  outlineWidth?: number;
  outlineColor?: string;
  outlineOpacity?: number;
  glow?: boolean;
  glowColor?: string;
  // glow reach in texels (scales with fontSize)
  glowRadius?: number;
  glowIntensity?: number;
  numCharsWidth?: number;
  /** Wrap lines to the entity's `size.width` using measured glyph advances. */
  shouldWrap?: boolean;
  /** When "truncate", lines overflowing `size` are cut and ellipsized. */
  overflow?: TextOverflow;
  /**
   * Step the font size down until the text fits within `size`, stopping at
   * `autoShrinkFontSizeMin`.
   */
  autoShrinkFontSize?: boolean;
  autoShrinkFontSizeMin?: number;
  autoShrinkFontSizeIncrement?: number;
};

export type TextPixelatedProps = EntityProps & TextProps;

function resolveFontAsset(fontName?: AvailableFont): keyof GameAssets {
  switch (fontName) {
    case "directMessage":
      return "directMessageBlob";
    case "directMessageBold":
      return "directMessageBoldBlob";
    case "mssn":
      return "mssnBlob";
    case "fredoka":
      return "fredokaBlob";
    case "highbirth":
      return "highbirthBlob";
    case "kobold":
      return "koboldBlob";
    case "roboto700":
      return "roboto700Blob";
    default:
      return "directMessageBlob";
  }
}

@setAssetDependencies<TextPixelatedProps>((props) =>
  props
    ? [resolveFontAsset(props.font)]
    : [
        "directMessageBlob",
        "directMessageBoldBlob",
        "mssnBlob",
        "fredokaBlob",
        "highbirthBlob",
        "koboldBlob",
        "roboto700Blob"
      ]
)
export class TextPixelated extends CoreEntity {
  static type = "TextPixelated";
  public type = TextPixelated.type;

  private static readonly NUM_CHARS_REFERENCE_GLYPH = "0";
  // caps the ribbon offset so a thick glow can't balloon at sharp path corners
  private static readonly MITER_LIMIT = 2;

  public object3D = new Object3D();

  private text: string | string[] = "< text >";

  private fontName: AvailableFont = "directMessage";
  private fontSize = 8;
  private fontBlob: hb.Blob;
  private horizontalSpacing = 0;
  private verticalSpacing = 0;
  private ligatures = true;
  private noLigatureFeatures?: hb.Feature[];
  private horizontalAlign: TextAlign = "center";
  private verticalAlign: TextAlign = "center";
  private scale = 1;
  private colorList: Color[] = [new Color(1, 1, 1)];
  private distributeColorList = true;
  private opacity = 1;
  private outline = false;
  private outlineWidth = 1;
  private outlineColor = new Color(0, 0, 0);
  private outlineOpacity = 1;
  private glow = false;
  private glowColor = new Color(1, 1, 1);
  private glowRadius = 4;
  private glowIntensity = 1;
  private numCharsWidth?: number;
  // when set, the text is rendered as a ribbon following this path
  private polyline?: Vector2[];
  private shouldWrap = false;
  private overflow: TextOverflow = "visible";
  private autoShrinkFontSize = false;
  private autoShrinkFontSizeMin = 6;
  private autoShrinkFontSizeIncrement = 2;

  private sampler?: Sampler;
  private glyphGeometries: ShapeGeometry[] = [];
  // one entry per glyph, in order, so setColors / setCharacterTransform can act
  // on a glyph without re-shaping
  private glyphMaterials: MeshBasicMaterial[] = [];
  private glyphContainers: Object3D[] = [];
  private glyphBasePositions: Vector3[] = [];
  private glyphColorTotal = 0;
  private geom = new BufferGeometry();
  private indexArr?: Uint16Array;
  private posArr?: Float32Array;
  private uvArr?: Float32Array;
  private vtxIndexArr?: Float32Array;
  private material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    alphaTest: 0.1,
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
    uniforms: {
      invSheetSize: {
        value: new Vector2(1, 1)
      },
      scenePixelSize: {
        value: new Vector2(1, 1)
      },
      map: {
        value: null
      },
      multiplyColor: {
        value: new Color(1, 1, 1)
      },
      opacity: {
        value: 1
      },
      outline: {
        value: new Vector4(1, 0, 0, 1)
      },
      outlineThickness: {
        value: 1
      },
      // rgb = color, w = intensity (0 disables)
      glow: {
        value: new Vector4(1, 1, 1, 0)
      },
      glowRadius: {
        value: 4
      },
      // 1 = path ribbon, 0 = flat quad
      pathMode: {
        value: 0
      }
    }
  });
  private renderTarget?: WebGLRenderTarget;
  private mesh = new Mesh(this.geom, this.material);

  private textDirty = true;
  private renderer?: WebGLRenderer;

  constructor(props: TextPixelatedProps) {
    super(props);

    this.text = props.text ?? this.text;
    this.fontName = props.font ?? this.fontName;
    this.fontSize = props.fontSize ?? this.fontSize;
    this.fontBlob = getAsset(resolveFontAsset(this.fontName));
    this.horizontalSpacing = props.horizontalSpacing ?? this.horizontalSpacing;
    this.verticalSpacing = props.verticalSpacing ?? this.verticalSpacing;
    this.ligatures = props.ligatures ?? this.ligatures;
    this.horizontalAlign = props.horizontalAlign ?? this.horizontalAlign;
    this.verticalAlign = props.verticalAlign ?? this.verticalAlign;
    this.scale = props.scale ?? this.scale;
    this.colorList = this._resolveColorList(props.color) ?? this.colorList;
    this.distributeColorList =
      props.distributeColorList ?? this.distributeColorList;
    this.opacity = props.opacity ?? this.opacity;
    this.outline = props.outline ?? this.outline;
    this.outlineWidth = props.outlineWidth ?? this.outlineWidth;
    this.outlineColor = props.outlineColor
      ? new Color(props.outlineColor)
      : this.outlineColor;
    this.outlineOpacity = props.outlineOpacity ?? this.outlineOpacity;
    this.glow = props.glow ?? this.glow;
    this.glowColor = props.glowColor
      ? new Color(props.glowColor)
      : this.glowColor;
    this.glowRadius = props.glowRadius ?? this.glowRadius;
    this.glowIntensity = props.glowIntensity ?? this.glowIntensity;
    this.numCharsWidth = props.numCharsWidth ?? this.numCharsWidth;
    this.shouldWrap = props.shouldWrap ?? this.shouldWrap;
    this.overflow = props.overflow ?? this.overflow;
    this.autoShrinkFontSize =
      props.autoShrinkFontSize ?? this.autoShrinkFontSize;
    this.autoShrinkFontSizeMin =
      props.autoShrinkFontSizeMin ?? this.autoShrinkFontSizeMin;
    this.autoShrinkFontSizeIncrement =
      props.autoShrinkFontSizeIncrement ?? this.autoShrinkFontSizeIncrement;
    this.polyline = props.polyline ?? this.polyline;

    this.object3D.rotation.z = props.angle ?? 0;
    this.object3D.scale.multiplyScalar(this.scale);
    this.object3D.position
      .copy(this.position)
      .multiplyScalar(kPixelScale)
      .round()
      .multiplyScalar(kInvPixelScale);

    this.object3D.add(this.mesh);
    this.mesh.layers.set(RenderLayers.default);

    this.mesh.onBeforeRender = (renderer) => {
      if (renderer !== this.renderer) this.textDirty = true;
      this.renderer = renderer;
      if (!this.textDirty) return;
      this.textDirty = false;
      if (!this.sampler) return;
      this.renderTarget = this.sampler.sample(renderer);
      this.material.uniforms.map.value = this.renderTarget.texture;
      this.material.uniformsNeedUpdate = true;
    };

    this.setText(this.text);
  }
  destroy(): void {
    super.destroy();
    this.geom.dispose();
    this.material.dispose();
    this.disposeGlyphResources();
    this.sampler?.destroy();
  }
  private disposeGlyphResources(): void {
    for (const geometry of this.glyphGeometries) geometry.dispose();
    for (const material of this.glyphMaterials) material.dispose();
    this.glyphGeometries = [];
    this.glyphMaterials = [];
    this.glyphContainers = [];
    this.glyphBasePositions = [];
  }
  attachToLevel(level: EntityLevelAPI) {
    super.attachToLevel(level);
    this._generateText();
  }
  // total arc length of the polyline in scene units
  private _polylineLengthScene(): number {
    const points = this.polyline;
    if (!points || points.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += points[i].distanceTo(points[i - 1]);
    }
    return length;
  }
  /**
   * Computes the rendered line set and font size for the configured layout
   * behavior: wraps lines to the entity's `size.width` using measured glyph
   * advances, steps the font size down to `autoShrinkFontSizeMin` until the
   * text fits when auto-shrink is on, and cuts overflowing lines with an
   * ellipsis when overflow is "truncate".
   */
  private layoutText(
    font: hb.Font,
    buff: hb.Buffer,
    baseLines: string[]
  ): { lines: string[]; fontSize: number } {
    const hasPolyline = !!this.polyline && this.polyline.length >= 2;
    if (!this.size.width && this.numCharsWidth === undefined && !hasPolyline) {
      return { lines: baseLines, fontSize: this.fontSize };
    }
    // width budget is the smallest constraint that applies; numCharsWidth is
    // folded in per font size below
    const sizeWidthPx = this.size.width
      ? (this.size.width / this.scale) * kPixelScale
      : Infinity;
    // polyline points are local (pre-scale) units, so no /scale unlike size.width
    const pathWidthPx = hasPolyline
      ? this._polylineLengthScene() * kPixelScale
      : Infinity;
    const fixedMaxWidthPx = Math.min(sizeWidthPx, pathWidthPx);
    const maxHeightPx = this.size.height
      ? (this.size.height / this.scale) * kPixelScale
      : Infinity;

    const minFontSize = Math.min(this.autoShrinkFontSizeMin, this.fontSize);
    let fontSize = this.fontSize;
    for (;;) {
      const maxWidthPx =
        this.numCharsWidth !== undefined
          ? Math.min(
              fixedMaxWidthPx,
              this.numCharsWidth *
                this.referenceCharWidthPx(font, buff, fontSize)
            )
          : fixedMaxWidthPx;
      const { lines, fits } = this.layoutAtFontSize(
        font,
        buff,
        baseLines,
        fontSize,
        maxWidthPx,
        maxHeightPx
      );
      if (fits || !this.autoShrinkFontSize || fontSize <= minFontSize) {
        return { lines, fontSize };
      }
      fontSize -= this.autoShrinkFontSizeIncrement;
    }
  }

  private referenceCharWidthPx(
    font: hb.Font,
    buff: hb.Buffer,
    fontSize: number
  ): number {
    font.setScale(fontSize, fontSize);
    buff.clearContents();
    buff.addText(TextPixelated.NUM_CHARS_REFERENCE_GLYPH);
    buff.guessSegmentProperties();
    hb.shape(font, buff, this._shapeFeatures());
    let width = 0;
    for (const glyph of buff.getGlyphInfosAndPositions()) {
      width += Math.round(glyph.xAdvance ?? 0) + this.horizontalSpacing;
    }
    return width;
  }

  private layoutAtFontSize(
    font: hb.Font,
    buff: hb.Buffer,
    baseLines: string[],
    fontSize: number,
    maxWidthPx: number,
    maxHeightPx: number
  ): { lines: string[]; fits: boolean } {
    font.setScale(fontSize, fontSize);

    const widthCache = new Map<string, number>();
    const charWidth = (char: string): number => {
      let width = widthCache.get(char);
      if (width === undefined) {
        buff.clearContents();
        buff.addText(char);
        buff.guessSegmentProperties();
        hb.shape(font, buff, this._shapeFeatures());
        width = 0;
        for (const glyph of buff.getGlyphInfosAndPositions()) {
          width += Math.round(glyph.xAdvance ?? 0) + this.horizontalSpacing;
        }
        widthCache.set(char, width);
      }
      return width;
    };
    const lineWidth = (line: string): number => {
      let width = 0;
      for (const char of line) width += charWidth(char);
      return width;
    };

    // greedy word wrap, breaking long unbroken tokens at the character level
    const wrapLine = (line: string): string[] => {
      const wrapped: string[] = [];
      let current = "";
      let currentWidth = 0;
      let breakIndex = -1;
      for (const char of line) {
        const width = charWidth(char);
        if (current.length > 0 && currentWidth + width > maxWidthPx) {
          if (char === " ") {
            wrapped.push(current);
            current = "";
            currentWidth = 0;
            breakIndex = -1;
            continue;
          }
          if (breakIndex >= 0) {
            wrapped.push(current.slice(0, breakIndex));
            current = current.slice(breakIndex + 1);
            currentWidth = lineWidth(current);
            breakIndex = -1;
          } else {
            wrapped.push(current);
            current = "";
            currentWidth = 0;
          }
        }
        current += char;
        currentWidth += width;
        if (char === " ") breakIndex = current.length - 1;
      }
      if (current.length > 0 || wrapped.length === 0) wrapped.push(current);
      return wrapped;
    };

    const ellipsize = (line: string): string => {
      const ellipsisWidth = lineWidth("...");
      let trimmed = line;
      while (
        trimmed.length > 0 &&
        lineWidth(trimmed) + ellipsisWidth > maxWidthPx
      ) {
        trimmed = trimmed.slice(0, -1);
      }
      return `${trimmed}...`;
    };

    let lines = this.shouldWrap
      ? baseLines.flatMap((line) => wrapLine(line))
      : [...baseLines];

    const lineHeight = fontSize + 2 + this.verticalSpacing;
    const fits =
      lines.length === baseLines.length &&
      lines.every((line) => lineWidth(line) <= maxWidthPx) &&
      lines.length * lineHeight <= maxHeightPx;

    if (this.overflow === "truncate") {
      const maxLines = Math.max(1, Math.floor(maxHeightPx / lineHeight));
      const cut = lines.length > maxLines;
      if (cut) lines = lines.slice(0, maxLines);
      lines = lines.map((line, i) =>
        lineWidth(line) > maxWidthPx || (cut && i === lines.length - 1)
          ? ellipsize(line)
          : line
      );
    }

    return { lines, fits };
  }

  public maxCharacters(): [number, number] {
    const maxWidthPx = (this.size.width / this.scale) * kPixelScale;
    const maxHeightPx = this.size.height
      ? (this.size.height / this.scale) * kPixelScale
      : Infinity;

    const minFontSize = Math.min(this.autoShrinkFontSizeMin, this.fontSize);
    return [
      Math.floor(maxWidthPx / (minFontSize + 1 + this.horizontalSpacing)),
      Math.floor(maxHeightPx / (minFontSize + 1 + this.verticalSpacing))
    ];
  }

  // features passed to every shape call; with ligatures off the glyph list
  // stays aligned 1:1 with the source characters
  private _shapeFeatures(): hb.Feature[] | undefined {
    if (this.ligatures) return undefined;
    if (!this.noLigatureFeatures) {
      this.noLigatureFeatures = ["liga", "clig", "rlig", "dlig"]
        .map((tag) => hb.Feature.fromString(`${tag}=0`))
        .filter((feature): feature is hb.Feature => feature !== undefined);
    }
    return this.noLigatureFeatures;
  }

  private _resolveColorList(color?: string | string[]): Color[] | undefined {
    if (color === undefined) return undefined;
    const list = Array.isArray(color) ? color : [color];
    return list.length > 0 ? list.map((c) => new Color(c)) : undefined;
  }

  // color for the glyph at `index` of `total`, per the distributeColorList mode
  private _glyphColor(index: number, total: number): Color {
    const list = this.colorList;
    if (this.distributeColorList) {
      const spread = Math.floor((index * list.length) / Math.max(total, 1));
      return list[Math.min(spread, list.length - 1)];
    }
    return list[Math.min(index, list.length - 1)];
  }

  private _generateText() {
    const face = new hb.Face(this.fontBlob);
    const font = new hb.Font(face);
    const buff = new hb.Buffer();

    let fontSize = this.fontSize;
    let textArr = Array.isArray(this.text) ? this.text : [this.text];
    if (
      this.shouldWrap ||
      this.autoShrinkFontSize ||
      this.overflow === "truncate"
    ) {
      ({ lines: textArr, fontSize } = this.layoutText(font, buff, textArr));
    }
    font.setScale(fontSize, fontSize);

    this.disposeGlyphResources();

    const fullTextObj = new Object3D();
    let offsetY = 0;

    this.glyphColorTotal = textArr.reduce(
      (sum, line) => sum + [...line].length,
      0
    );
    let glyphIndex = 0;

    for (const text of textArr) {
      buff.clearContents();
      buff.addText(text);
      buff.guessSegmentProperties();
      hb.shape(font, buff, this._shapeFeatures());

      const out = buff.getGlyphInfosAndPositions();
      const svgl = new SVGLoader();
      const textObj = new Object3D();
      var cursor = new Vector2();
      for (const glyph of out) {
        const path = font.glyphToPath(glyph.codepoint);
        const pathAsSvg = `<svg><path d="${path}" fill="#ffffff"></path></svg>`;
        const parsed = svgl.parse(pathAsSvg);
        const shapes: Shape[] = [];
        for (const parsedPath of parsed.paths) {
          shapes.push(...SVGLoader.createShapes(parsedPath));
        }
        const textGeom = new ShapeGeometry(shapes, 4);
        this.glyphGeometries.push(textGeom);
        const glyphMat = new MeshBasicMaterial({
          color: this._glyphColor(glyphIndex++, this.glyphColorTotal),
          transparent: false,
          side: DoubleSide
        });
        this.glyphMaterials.push(glyphMat);

        // glyph centre, so the container pivots there for rotation/scale
        textGeom.computeBoundingBox();
        const center = new Vector3();
        const bbox = textGeom.boundingBox;
        if (bbox && isFinite(bbox.min.x)) bbox.getCenter(center);

        // each glyph lives in its own container positioned at the glyph centre,
        // so setCharacterTransform can move/rotate/scale it about that centre
        const textMesh = new Mesh(textGeom, glyphMat);
        textMesh.position.set(-center.x, -center.y, 0);
        const container = new Object3D();
        container.position.set(
          (glyph.xOffset ?? 0) + cursor.x + center.x,
          (glyph.yOffset ?? 0) + cursor.y + center.y,
          0
        );
        container.add(textMesh);
        textObj.add(container);
        this.glyphContainers.push(container);
        this.glyphBasePositions.push(container.position.clone());

        cursor.x += Math.round(glyph.xAdvance ?? 0) + this.horizontalSpacing;
        cursor.y += Math.round(glyph.yAdvance ?? 0);
      }

      const textMeshBounds = new Box3();
      const textMeshSize = new Vector3();
      textObj.scale.multiplyScalar(kInvPixelScale);
      textMeshBounds.expandByObject(textObj);
      textMeshBounds.getCenter(textObj.position);
      textMeshBounds.getSize(textMeshSize);
      textObj.position
        .multiplyScalar(-1)
        .multiplyScalar(kPixelScale)
        .round()
        .multiplyScalar(kInvPixelScale);

      textObj.position.y += offsetY;
      offsetY -= textMeshSize.y + (2 + this.verticalSpacing) * kInvPixelScale;

      fullTextObj.add(textObj);
    }

    if (!this.sampler) {
      this.sampler = new Sampler();
    } else {
      this.sampler.clear();
    }
    this.sampler.add(fullTextObj);
    // margin for whichever effect reaches furthest, so the shader's neighbour
    // search never clamps onto the glyph
    this.sampler.setPadding(
      Math.max(this.outlineWidth, this.glow ? this.glowRadius : 0)
    );

    this.textDirty = true;

    const bounds = this.sampler.getSamplerBounds();

    const usePath = !!this.polyline && this.polyline.length >= 2;
    if (usePath) {
      this._applyRibbonGeometry(bounds);
    } else {
      this._applyQuadGeometry(bounds.sceneSize);
    }
    this.material.uniforms.pathMode.value = usePath ? 1 : 0;

    this.material.uniforms.opacity.value = this.opacity;
    this.material.uniforms.outlineThickness.value = this.outlineWidth;
    this.material.uniforms.outline.value.set(
      this.outlineColor.r,
      this.outlineColor.g,
      this.outlineColor.b,
      this.outline ? this.outlineOpacity : 0
    );
    this._applyGlowUniforms();
    this.material.uniforms.invSheetSize.value.set(
      1 / bounds.textureSize.x,
      1 / bounds.textureSize.y
    );
    this.material.uniforms.scenePixelSize.value.set(
      kInvPixelScale,
      kInvPixelScale
    );
    this.material.uniformsNeedUpdate = true;
  }

  // flat quad mapping the full padded texture (the default layout)
  private _applyQuadGeometry(sceneSize: Vector3) {
    if (!this.indexArr) {
      this.indexArr = new Uint16Array(6);
      this.indexArr[0] = 0;
      this.indexArr[1] = 2;
      this.indexArr[2] = 1;
      this.indexArr[3] = 1;
      this.indexArr[4] = 3;
      this.indexArr[5] = 2;
      this.geom.setIndex(new BufferAttribute(this.indexArr, 1));
    }

    if (!this.posArr) {
      this.posArr = new Float32Array(12);
      this.posArr.fill(0);
    }

    const pos = new Vector3();
    const size = sceneSize.clone().multiplyScalar(0.5);
    pos.set(-1, 1, 0).multiply(size).toArray(this.posArr, 0);
    pos.set(1, 1, 0).multiply(size).toArray(this.posArr, 3);
    pos.set(-1, -1, 0).multiply(size).toArray(this.posArr, 6);
    pos.set(1, -1, 0).multiply(size).toArray(this.posArr, 9);
    this.geom.setAttribute("position", new BufferAttribute(this.posArr, 3));
    this.geom.computeBoundingSphere();

    if (!this.uvArr) {
      this.uvArr = new Float32Array(8);
      this.uvArr[0] = 0;
      this.uvArr[1] = 1;
      this.uvArr[2] = 1;
      this.uvArr[3] = 1;
      this.uvArr[4] = 0;
      this.uvArr[5] = 0;
      this.uvArr[6] = 1;
      this.uvArr[7] = 0;
      this.geom.setAttribute("uv", new BufferAttribute(this.uvArr, 2));
    }
    if (!this.vtxIndexArr) {
      this.vtxIndexArr = new Float32Array(4);
      this.vtxIndexArr[0] = 0;
      this.vtxIndexArr[1] = 1;
      this.vtxIndexArr[2] = 2;
      this.vtxIndexArr[3] = 3;
      const vtxIndexAttr = new BufferAttribute(this.vtxIndexArr, 1);
      this.geom.setAttribute("vtxIndex", vtxIndexAttr);
    }
  }

  // lays the baked text along the polyline at its natural size: the texture
  // width maps to arc length and its height to the ribbon thickness. shorter
  // text ends early; longer text overflows past the path end. outline and glow
  // ride along since they live in the sampled texture, not this geometry.
  private _applyRibbonGeometry(bounds: SamplerBounds) {
    const sceneSize = bounds.sceneSize;
    const points = this.polyline ?? [];
    const pointCount = points.length;

    const pathArr = points.map(vector2ToArr2);
    const normalsAndMiters = getNormals(pathArr, false);

    // per-vertex offset direction (unit normal * clamped miter) and cumulative
    // arc length to each vertex
    const offsets: Vector2[] = [];
    const cumulative: number[] = new Array(pointCount).fill(0);
    for (let i = 0; i < pointCount; i++) {
      const [n, miter] = normalsAndMiters[i];
      const clampedMiter = Math.min(miter, TextPixelated.MITER_LIMIT);
      offsets.push(new Vector2(n[0], n[1]).multiplyScalar(clampedMiter));
      if (i > 0) {
        cumulative[i] = cumulative[i - 1] + points[i].distanceTo(points[i - 1]);
      }
    }
    const totalLength = cumulative[pointCount - 1];

    const textWidth = sceneSize.x;
    const halfThickness = sceneSize.y / 2;

    // exact bake margin, so the glyph content anchors at the path start
    // regardless of glow and the margins bleed past the ends via extrapolation
    const margin = (sceneSize.x - bounds.contentSize.x) / 2;
    const sStart = -margin;
    const sEnd = textWidth - margin;

    // sample at the start edge, the interior vertices, and the end edge
    const sampleLengths: number[] = [sStart];
    for (let i = 1; i < pointCount - 1; i++) {
      if (cumulative[i] > sStart && cumulative[i] < sEnd) {
        sampleLengths.push(cumulative[i]);
      }
    }
    sampleLengths.push(sEnd);

    const sampleCount = sampleLengths.length;
    const posArr = new Float32Array(sampleCount * 2 * 3);
    const uvArr = new Float32Array(sampleCount * 2 * 2);
    const vtxIndexArr = new Float32Array(sampleCount * 2);
    const indexArr = new Uint16Array((sampleCount - 1) * 6);

    const firstDir = this._segmentDir(points[0], points[1]);
    const lastDir = this._segmentDir(
      points[pointCount - 2],
      points[pointCount - 1]
    );

    const point = new Vector2();
    const offset = new Vector2();
    for (let s = 0; s < sampleCount; s++) {
      const dist = sampleLengths[s];
      this._samplePath(
        points,
        offsets,
        cumulative,
        totalLength,
        firstDir,
        lastDir,
        dist,
        point,
        offset
      );
      offset.multiplyScalar(halfThickness);
      const u = textWidth > 0 ? (dist + margin) / textWidth : 0;

      // +offset = top edge (v=1), -offset = bottom edge (v=0)
      const top = s * 2;
      const bottom = top + 1;
      posArr[top * 3 + 0] = point.x + offset.x;
      posArr[top * 3 + 1] = point.y + offset.y;
      posArr[bottom * 3 + 0] = point.x - offset.x;
      posArr[bottom * 3 + 1] = point.y - offset.y;

      uvArr[top * 2 + 0] = u;
      uvArr[top * 2 + 1] = 1;
      uvArr[bottom * 2 + 0] = u;
      uvArr[bottom * 2 + 1] = 0;
    }

    for (let seg = 0; seg < sampleCount - 1; seg++) {
      // two triangles bridging this sample's edge to the next
      const a = seg * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const o = seg * 6;
      indexArr[o + 0] = a;
      indexArr[o + 1] = c;
      indexArr[o + 2] = b;
      indexArr[o + 3] = b;
      indexArr[o + 4] = c;
      indexArr[o + 5] = d;
    }

    this.posArr = posArr;
    this.uvArr = uvArr;
    this.vtxIndexArr = vtxIndexArr;
    this.indexArr = indexArr;
    this.geom.setAttribute("position", new BufferAttribute(posArr, 3));
    this.geom.setAttribute("uv", new BufferAttribute(uvArr, 2));
    this.geom.setAttribute("vtxIndex", new BufferAttribute(vtxIndexArr, 1));
    this.geom.setIndex(new BufferAttribute(indexArr, 1));
    this.geom.computeBoundingSphere();
  }

  // unit direction of a segment, falling back to +x for a degenerate one
  private _segmentDir(from: Vector2, to: Vector2): Vector2 {
    const dir = new Vector2().copy(to).sub(from);
    return dir.lengthSq() === 0 ? dir.set(1, 0) : dir.normalize();
  }

  // resolves a point and its offset at arc length dist, extrapolating straight
  // past either end so overflow and the glow margins don't bunch up
  private _samplePath(
    points: Vector2[],
    offsets: Vector2[],
    cumulative: number[],
    totalLength: number,
    firstDir: Vector2,
    lastDir: Vector2,
    dist: number,
    outPoint: Vector2,
    outOffset: Vector2
  ) {
    const lastIndex = points.length - 1;
    if (dist <= 0) {
      // dist <= 0 steps backward from the start
      outPoint.copy(points[0]).addScaledVector(firstDir, dist);
      outOffset.copy(offsets[0]);
      return;
    }
    if (dist >= totalLength) {
      outPoint
        .copy(points[lastIndex])
        .addScaledVector(lastDir, dist - totalLength);
      outOffset.copy(offsets[lastIndex]);
      return;
    }
    let seg = 0;
    while (seg < lastIndex - 1 && cumulative[seg + 1] <= dist) seg++;
    const segLength = cumulative[seg + 1] - cumulative[seg];
    const t = segLength > 0 ? (dist - cumulative[seg]) / segLength : 0;
    outPoint.lerpVectors(points[seg], points[seg + 1], t);
    outOffset.lerpVectors(offsets[seg], offsets[seg + 1], t);
  }
  setText(text: string | string[], update = true) {
    this.text = text;
    if (update) this._generateText();
    return this;
  }
  setOpacity(opacity: number) {
    this.opacity = opacity;
    this.material.uniforms.opacity.value = opacity;
    this.material.uniformsNeedUpdate = true;
    return this;
  }
  setCharacterTransform(index: number, transform: CharacterTransform) {
    const container = this.glyphContainers[index];
    const base = this.glyphBasePositions[index];
    if (!container || !base) return this;
    container.position.set(
      base.x + (transform.x ?? 0),
      base.y + (transform.y ?? 0),
      base.z
    );
    container.rotation.z = transform.rotation ?? 0;
    const scale = transform.scale ?? 1;
    container.scale.set(scale, scale, 1);
    this.textDirty = true;
    return this;
  }

  clearCharacterTransforms() {
    for (let i = 0; i < this.glyphContainers.length; i++) {
      this.glyphContainers[i].position.copy(this.glyphBasePositions[i]);
      this.glyphContainers[i].rotation.z = 0;
      this.glyphContainers[i].scale.set(1, 1, 1);
    }
    this.textDirty = true;
    return this;
  }

  characterCount() {
    return this.glyphContainers.length;
  }

  setColors(color: string | string[], distribute?: boolean) {
    this.colorList = this._resolveColorList(color) ?? this.colorList;
    if (distribute !== undefined) this.distributeColorList = distribute;
    for (let i = 0; i < this.glyphMaterials.length; i++) {
      this.glyphMaterials[i].color.copy(
        this._glyphColor(i, this.glyphColorTotal)
      );
    }
    this.textDirty = true;
    return this;
  }
  update(props: Partial<TextProps>) {
    this.text = props.text ?? this.text;
    this.fontName = props.font ?? this.fontName;
    this.fontSize = props.fontSize ?? this.fontSize;
    this.fontBlob = getAsset(resolveFontAsset(this.fontName));
    this.horizontalSpacing = props.horizontalSpacing ?? this.horizontalSpacing;
    this.verticalSpacing = props.verticalSpacing ?? this.verticalSpacing;
    this.ligatures = props.ligatures ?? this.ligatures;
    this.horizontalAlign = props.horizontalAlign ?? this.horizontalAlign;
    this.verticalAlign = props.verticalAlign ?? this.verticalAlign;
    this.scale = props.scale ?? this.scale;
    this.colorList = this._resolveColorList(props.color) ?? this.colorList;
    this.distributeColorList =
      props.distributeColorList ?? this.distributeColorList;
    this.opacity = props.opacity ?? this.opacity;
    this.outline = props.outline ?? this.outline;
    this.outlineWidth = props.outlineWidth ?? this.outlineWidth;
    this.outlineColor = props.outlineColor
      ? new Color(props.outlineColor)
      : this.outlineColor;
    this.outlineOpacity = props.outlineOpacity ?? this.outlineOpacity;
    this.glow = props.glow ?? this.glow;
    this.glowColor = props.glowColor
      ? new Color(props.glowColor)
      : this.glowColor;
    this.glowRadius = props.glowRadius ?? this.glowRadius;
    this.glowIntensity = props.glowIntensity ?? this.glowIntensity;
    this.numCharsWidth = props.numCharsWidth ?? this.numCharsWidth;
    this.shouldWrap = props.shouldWrap ?? this.shouldWrap;
    this.overflow = props.overflow ?? this.overflow;
    this.autoShrinkFontSize =
      props.autoShrinkFontSize ?? this.autoShrinkFontSize;
    this.autoShrinkFontSizeMin =
      props.autoShrinkFontSizeMin ?? this.autoShrinkFontSizeMin;
    this._generateText();
    return this;
  }

  private _applyGlowUniforms() {
    this.material.uniforms.glow.value.set(
      this.glowColor.r,
      this.glowColor.g,
      this.glowColor.b,
      this.glow ? this.glowIntensity : 0
    );
    this.material.uniforms.glowRadius.value = this.glowRadius;
    this.material.uniformsNeedUpdate = true;
  }

  setGlowIntensity(intensity: number) {
    this.glowIntensity = intensity;
    this._applyGlowUniforms();
    return this;
  }

  setGlowColor(color: string) {
    this.glowColor = new Color(color);
    this._applyGlowUniforms();
    return this;
  }
}
