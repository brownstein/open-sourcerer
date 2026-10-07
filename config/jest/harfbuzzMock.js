"use strict";

// Jest stub for the ESM-only `harfbuzzjs` package. The real module
// (dist/index.mjs) ends with a top-level `await createHarfBuzz()` to init its
// WASM. Babel-jest transforms it to CommonJS, where top-level await is invalid,
// crashing any suite that transitively imports it ("ReferenceError: await is
// not defined"). Tests don't exercise real text shaping, so we stub the small
// API surface used by Loaders.ts and TextPixelated.ts.

class Blob {
  constructor() {}
  destroy() {}
}

class Face {
  constructor() {}
  destroy() {}
}

class Font {
  constructor() {}
  setScale() {}
  glyphToPath() {
    return "";
  }
  destroy() {}
}

class Buffer {
  constructor() {}
  addText() {}
  guessSegmentProperties() {}
  getGlyphInfosAndPositions() {
    return [];
  }
  destroy() {}
}

function shape() {}

module.exports = { Blob, Face, Font, Buffer, shape };
