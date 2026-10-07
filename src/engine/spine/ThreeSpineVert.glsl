uniform float opacity;
uniform vec3 color;
uniform vec4 fade;
uniform vec2 outlineSpread;

attribute vec3 vtxColor;
attribute vec4 vtxFade;
attribute vec4 vtxOutline;
attribute float vtxOpacity;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vFade;
varying float vOpacity;
varying vec4 vOutline;
varying vec2 vOutlineSpread;

void main() {
	vUv = uv;
	vColor = color * vtxColor;
  vOpacity = opacity * vtxOpacity;

  // Support fading.
	vFade = vec4(0.0, 0.0, 0.0, 0.0);
	if (fade.a > 0.0) vFade = fade;
	if (vtxFade.a > 0.0) vFade = vFade * ((vFade.a + vtxFade.a) - vtxFade.a) + vec4(vtxFade.rgb * vtxFade.a, vtxFade.a);

  // Support layer-specific outlines.
  vOutline = vtxOutline;
	vOutlineSpread = outlineSpread;

	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}