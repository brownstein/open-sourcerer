attribute vec3 iPosition;
attribute float iSize;
attribute vec4 iColor;

varying vec3 vColor;
varying float vOpacity;
varying vec2 vLocalPos;

void main() {
  vColor = iColor.rgb;
  vOpacity = iColor.a;
  vLocalPos = position.xy;
  vec3 pos = position * iSize + iPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}