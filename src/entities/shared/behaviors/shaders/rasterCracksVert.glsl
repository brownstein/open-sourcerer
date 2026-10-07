attribute vec3 color;
attribute float alpha;
attribute vec2 crackUv;
attribute float crackAmount;

varying vec3 vColor;
varying float vAlpha;
varying vec2 vCrackUv;
varying float vCrackAmount;

void main() {
  vColor = color;
  vAlpha = alpha;
  vCrackUv = crackUv;
  vCrackAmount = crackAmount;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
