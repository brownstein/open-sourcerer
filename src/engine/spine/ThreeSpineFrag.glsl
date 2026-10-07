uniform sampler2D map;

varying vec2 vUv;
varying vec3 vColor;
varying vec4 vFade;
varying float vOpacity;
varying vec4 vOutline;
varying vec2 vOutlineSpread;

void main() {
	vec4 color = texture2D(map, vUv);

	// Support material and vertex coloration.
	color.rgb = color.rgb * vColor;

	// Support fading to a color.
	if (vFade.a > 0.0) {
		color.rgb = color.rgb * (1.0 - vFade.a) + vFade.rgb * vFade.a;
	}
	
	// Do outline.
  if (vOutline.a > 0.0 && vOutlineSpread.x > 0.0 && color.a < 1.0) {
    bool foundOutline = false;
    float osx = vOutlineSpread.x;
    float osy = vOutlineSpread.y;
    for (float dx = -osx; dx <= osx; dx += osx) {
      for (float dy = -osy; dy <= osy; dy += osy) {
        if (dx == 0.0 && dy == 0.0) continue;
        vec4 nearColor = texture2D(map, vUv + vec2(dx, dy));
        if (nearColor.a > color.a) {
          foundOutline = true;
          break;
        }
      }
      if (foundOutline) break;
    }
    if (foundOutline) {
      color = vOutline;
    }
  }

	// Support opacity.
	color.a = color.a * vOpacity;

	// Discard at low opacity.
	if (color.a < 0.01) discard;
	gl_FragColor = color;
}