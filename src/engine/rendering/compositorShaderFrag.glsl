uniform sampler2D map;
#ifdef HAS_DEPTH_MAP
  uniform sampler2D depthMap;
#endif
#ifdef HAS_MIN_DEPTH
  uniform float minDepthVal;
#endif
#ifdef HAS_MAX_DEPTH
  uniform float maxDepthVal;
#endif

uniform float opacity;
varying vec2 vUv;

uniform vec2 sampleRes;

uniform float distort;
uniform float letterboxing;

void main() {
  vec2 uv = vUv;
  if (sampleRes.x > 0.0 && sampleRes.y > 0.0) {
    uv.x -= mod(uv.x, sampleRes.x) + sampleRes.x * 0.5;
    uv.y -= mod(uv.y, sampleRes.y) + sampleRes.y * 0.5;
  }
  if (abs(distort) > 0.0) {
    int yStep = int(round(uv.y / sampleRes.y) / 2.0) % 8;
    switch (yStep) {
      case 0:
      case 4:
        break;
      case 1:
      case 3:
        uv.x += sampleRes.x * 4.0 * distort;
        uv.y += sampleRes.y;
        break;
      case 2:
        uv.x -= sampleRes.x * 2.0 * distort;
        break;
      case 5:
        uv.x -= sampleRes.x * distort;
        uv.y -= sampleRes.y;
      case 6:
        uv.x -= sampleRes.x * 2.0 * distort;
      case 7:
        uv.x -= sampleRes.x * 3.0 * distort;
    }
  }

  gl_FragColor = texture2D(map, uv);
  gl_FragColor.a = gl_FragColor.a * opacity;

  float lowerLetterboxUVY = 0.1 * letterboxing;
  float upperLetterboxUVY = 1.0 - 0.1 * letterboxing;
  if (uv.y < lowerLetterboxUVY || uv.y > upperLetterboxUVY)
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);

  if (gl_FragColor.a < 0.01) discard;
  #ifdef HAS_DEPTH_MAP
    float depth = texture2D(depthMap, vUv).r;
    #ifdef HAS_MIN_DEPTH
      if (depth < minDepthVal) discard;
    #endif
    #ifdef HAS_MAX_DEPTH
      if (depth > maxDepthVal) discard;      
    #endif
  #endif
}
