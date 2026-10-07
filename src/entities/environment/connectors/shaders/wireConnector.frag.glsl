uniform vec3 color;
uniform float opacity;
uniform sampler2D map;

// Must match MAX_VISUAL_PULSES in WireConnector.ts.
#define MAX_PULSES 32
// Each in-flight pulse's two fronts (distance along the wire); all share a
// fixed width and carry their own fading intensity.
uniform vec2 highlightPulses[MAX_PULSES];
uniform float highlightIntensities[MAX_PULSES];
uniform int highlightCount;
uniform float highlightWidth;
// Whole-wire glow floor, used to flash an instant delivery across the wire.
uniform float highlightBase;

varying vec2 vUv;
varying float vDistance;

float pulseAt(float center) {
  float highlight = 1.5 - abs(vDistance - center) * 1.5 / highlightWidth;
  return 0.5 * floor(highlight * 2.0);
}

void main() {
  vec4 color = vec4(color, opacity) * texture2D(map, vUv);
  if (color.a <= 0.1) discard;

  float band = 0.0;
  if (highlightWidth > 0.0) {
    for (int i = 0; i < MAX_PULSES; i++) {
      if (i >= highlightCount) break;
      vec2 fronts = highlightPulses[i];
      float p = max(pulseAt(fronts.x), pulseAt(fronts.y));
      band = max(band, p * highlightIntensities[i]);
    }
  }
  float highlight = max(band, highlightBase);
  if (highlight > 0.0) color.rgb = color.rgb * (1.0 + highlight * 0.5) + vec3(1.0, 1.0, 1.0) * highlight * 0.25;

  gl_FragColor = color;
}
