uniform float opacity;
uniform vec3 bboxMin;
uniform vec3 bboxMax;
varying vec2 vUv;
varying float vGradientT;

void main() {
  vUv = uv;
  float range = bboxMax.y - bboxMin.y;
  vGradientT = range > 0.001 ? (position.y - bboxMin.y) / range : 0.5;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}