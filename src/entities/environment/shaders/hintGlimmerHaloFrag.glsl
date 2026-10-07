uniform float uAlphaScale;

varying vec3 vColor;
varying float vOpacity;
varying vec2 vLocalPos;

void main() {
  float dist = length(vLocalPos) * 2.0;
  float falloff = smoothstep(1.0, 0.0, dist);
  falloff *= falloff * falloff;
  float alpha = vOpacity * uAlphaScale * falloff;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
}
