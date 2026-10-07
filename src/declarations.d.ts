declare module "poly-decomp" {
  type point = [number, number];
  type polygon = point[];
  type polygons = polygon[];

  function isSimple(p: polygon): boolean;
  function makeCCW(p: polygon): none;
  function quickDecomp(p: polygon): polygons;
  function removeCollinearPoints(p: polygon, e?: number): none;
  function removeDuplicatePoints(p: polygon, e?: number): none;

  export {
    isSimple,
    makeCCW,
    quickDecomp,
    removeCollinearPoints,
    removeDuplicatePoints
  };
}

declare module "polyline-normals" {
  function getNormals(path: number[][], closed?: boolean): [number[], number][];
  export default getNormals;
}

declare module "*.glsl" {
  const value: string;
  export default value;
}

declare module "*.md" {
  const value: string;
  export default value;
}

declare module "*.mp3" {
  const value: string;
  export default value;
}
declare module "*.ogg" {
  const value: string;
  export default value;
}
declare module "*.opus" {
  const value: string;
  export default value;
}
declare module "*.fnt" {
  const value: string;
  export default value;
}

declare module "*.ttf" {
  const value: string;
  export default value;
}

declare module "*.atlas" {
  const value: string;
  export default value;
}

declare module "*.skel" {
  const value: string;
  export default value;
}

declare module "*.raw" {
  const value: string;
  export default value;
}

declare module "*.mp3" {
  const value: string;
  export default value;
}

declare module "*.wav" {
  const value: string;
  export default value;
}

// Protosprite files.
declare module "*.prs" {
  const value: string;
  export default value;
}

// Protosprite geometry files.
declare module "*.prsg" {
  const value: string;
  export default value;
}

declare module "@babel/plugin-transform-arrow-functions";
declare module "@babel/plugin-transform-block-scoping";
declare module "@babel/plugin-transform-destructuring";
declare module "@babel/plugin-transform-classes";
declare module "@babel/plugin-transform-shorthand-properties";
declare module "@babel/plugin-transform-for-of";
declare module "babel-plugin-transform-async-to-promises";

declare module "polygon-offset" {
  class Offset {
    constructor();
    data(points: [number, number][], arcSegments?: number): Offset;
    arcSegments(n: number): Offset;
    margin(n: number): [number, number][][];
    padding(n: number): [number, number][][];
    offset(n: number): [number, number][][];
  }
  export default Offset;
}
declare module "polybooljs" {
  type v2 = [number, number];
  type pbPolygon = {
    regions: v2[][];
    inverted: boolean;
  };
  function union(r1: pbPolygon, r2: pbPolygon): pbPolygon;
  function intersect(r1: pbPolygon, r2: pbPolygon): pbPolygon;
  function difference(r1: pbPolygon, r2: pbPolygon): pbPolygon;
  function differenceRev(r1: pbPolygon, r2: pbPolygon): pbPolygon;
  function xor(r1: byPolygon, r2: pbPolygon): byPolygon;
  type pbSegments = unknown;
  function segments(r: pbPolygon): pbSegments;
  function polygon(s: pbSegments): pbPolygon;
  function combine(r1: pbSegments, r2: pbSegments): pbSegments;
  function selectUnion(r: pbSegments): pbSegments;
  function selectDifference(r: pbSegments): pbSegments;
}

declare module "parse-bmfont-ascii" {
  function parseASCII(data: string): any;
  export default parseASCII;
}

declare module "parse-bmfont-xml" {
  function parseXML(data: string): any;
  export default parseXML;
}

declare module "quad-indices" {
  function createIndices<T extends "uint16" | "array" | undefined>(arg: {
    count: number;
    type?: T;
    clockwise?: boolean;
    start?: number;
  }): T extends "uint16"
    ? Uint16Array
    : T extends "array"
      ? number[]
      : Uint16Array;
  export default createIndices;
}

declare module "layout-bmfont-text" {
  import type { BMFont } from "src/vendor/load-bmfont-browser";
  export type LayoutProps = {
    font: BMFont;
    text: string;
    width?: number;
    mode?: "pre" | "nowrap";
    align?: "left" | "center" | "right";
    letterSpacing?: number;
    lineHeight?: number;
    tabSize?: number;
    start?: number;
    end?: number;
  };
  export type Glyph = {
    index: number;
    data: BMFont["chars"][0];
    position: [number, number];
    line: number;
  };
  export type Layout = {
    update(opt: LayoutProps): void;
    glyphs: Glyph[];
    width: number;
    height: number;
    baseline: number;
    xHeight: number;
    descender: number;
    ascender: number;
    capHeight: nuumber;
    lineHeight: number;
  };
  function createLayout(opt: LayoutProps): Layout;
  export default createLayout;
}

declare module "three-bmfont-text" {
  import type { BufferGeometry } from "three";
  export type BMFontText = BufferGeometry & {
    update(text: string): void;
  };
  export function createTextGeometry(props: unknown): BMFontText;
  export default createTextGeometry;
}

declare module "simplepolygon" {
  import type { Feature, FeatureCollection, Polygon } from "geojson";
  function simplepolygon(input: Feature<Polygon>): FeatureCollection<Polygon>;
  export default simplepolygon;
}

declare module "troika-three-text" {
  import type { Three, Mesh } from "three";
  export class Text extends Mesh {
    constructor();
    text?: string;
    anchorX?: "left" | "center" | "right" | string | number;
    anchorY?: "top" | "middle" | "bottom" | string | number;
    clipRect?: [number, number, number, number];
    color?: THREE.Color | string | number;
    curveRadius: number;
    depthOffset: number;
    direction: "auto" | "ltr" | "rtl";
    fillOpacity: number;
    font?: string;
    fontSize?: number;
    fontStyle?: "normal" | "italic";
    fontWeight?: "normal" | "bold";
    glyphGeometryDetail: number;
    gpuAccelerateSDF: boolean;
    letterSpacing: number;
    lineHeight: "normal" | number;
    material: Three.Material;
    maxWidth?: number;
    outlineBlur: number | string;
    outlineColor?: Three.Color | string | number;
    outlineOffsetX: number | string;
    outlineOffsetY: number | string;
    outlineOpacity: number | string;
    outlineWidth: number | string;
    overflowWrap: "normal" | "break-word";
    sdfGlyphSize: number;
    strokeColor?: Three.Color | string | number;
    strokeOpacity?: number;
    strokeWidth: number | string;
    textAlign: "left" | "right" | "center" | "justify";
    textIndent: number;
    whiteSpace: "normal" | "nowrap";
    sync(callback?: () => void): void;
    dispose(): void;
  }
  export function preloadFont(
    arg: {
      font: string;
      characters: string | string[];
    },
    callback: () => void
  ): void;
  export { Text, preloadFont };
}

// Injected by the vite define block (see vite.config.ts).
declare const __BUILD_ID__: string;
