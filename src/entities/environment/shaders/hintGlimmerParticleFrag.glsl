varying vec3 vColor;
varying float vOpacity;
varying vec2 vLocalPos;

void main() {
  float dist = length(vLocalPos) * 2.0;
  float core = smoothstep(1.0, 0.0, dist);
  float alpha = vOpacity * core * core;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor, alpha);
  #include <tonemapping_fragment>
}
