uniform float opacity;
attribute float vtxOpacity;
attribute vec4 vtxFade;

varying vec2 vUv;
varying float vOpacity;
varying vec4 vFade;

void main() {
  vUv = uv;
  
  vFade = vec4(0.0, 0.0, 0.0, 0.0);
	if (vtxFade.a > 0.0) vFade = vFade * ((vFade.a + vtxFade.a) - vtxFade.a) + vtxFade * vtxFade.a;

  vOpacity = vtxOpacity * opacity;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}