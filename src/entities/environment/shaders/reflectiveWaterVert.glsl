uniform vec2 uvScale;
uniform vec2 uvOffset;

varying vec2 vUvOrig;
varying vec2 vUvMap;

void main() {
  vUvOrig = uv;
  vUvMap = uv * uvScale + uvOffset;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
