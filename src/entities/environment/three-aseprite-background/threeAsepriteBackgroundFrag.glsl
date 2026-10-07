uniform sampler2D map;

varying vec2 vUv;
varying float vOpacity;
varying vec4 vFade;

void main() {
  vec4 color = texture2D(map, vUv);

  // Support opacity.
	color.a = color.a * vOpacity;

  // Support fading to a color.
	if (vFade.a > 0.0) {
		color.rgb = color.rgb * (1.0 - vFade.a) + vFade.rgb * vFade.a;
	}

  // Discard at low opacity.
	if (color.a < 0.01) discard;
	gl_FragColor = color;
}