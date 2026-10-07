uniform vec3 color;
uniform vec3 outlineColor;
uniform float opacity;
uniform sampler2D map;
uniform vec2 invTextureSize;
uniform float outlineSpread;
uniform bool useGradient;
uniform vec3 gradientColorTop;
uniform vec3 gradientColorBottom;

varying vec2 vUv;
varying float vGradientT;

void main() {
  vec3 textColor = useGradient
    ? mix(gradientColorBottom, gradientColorTop, vGradientT)
    : color;
  vec4 color = texture2D(map, vUv) * vec4(textColor, 1.0);

  // Do outline.
  if (outlineSpread > 0.0 && color.a < 1.0) {
    bool foundOutline = false;
    float osx = invTextureSize.x * outlineSpread;
    float osy = invTextureSize.y * outlineSpread;
    for (float dx = -osx; dx <= osx; dx += invTextureSize.x) {
      for (float dy = -osy; dy <= osy; dy += invTextureSize.y) {
        if (dx == 0.0 && dy == 0.0) continue;
        vec4 nearColor = texture2D(map, vUv + vec2(dx, dy));
        if (nearColor.a > color.a) {
          foundOutline = true;
          break;
        }
      }
      if (foundOutline) break;
    }
    if (foundOutline) {
      color.rgb = outlineColor;
      color.a = 1.0;
    }
  }

  color.a *= opacity;
  if (color.a < 0.01) discard;
  gl_FragColor = color;
}