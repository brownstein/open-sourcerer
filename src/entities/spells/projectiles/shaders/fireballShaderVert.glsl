uniform vec3 color;
uniform float opacity;

attribute vec3 vtxColor;
attribute float vtxOpacity;

varying vec3 vColor;
varying float vOpacity;

void main() {
  vColor = color * vtxColor;
  vOpacity = opacity * vtxOpacity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}