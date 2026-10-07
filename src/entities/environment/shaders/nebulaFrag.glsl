uniform float phase;

varying vec2 vUv;

// Hash-based pseudo-random
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash1(float p) {
  return fract(sin(p * 127.1) * 43758.5453);
}

// Value noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal brownian motion
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  float t = phase * 0.001;
  vec2 uv = vUv;

  // Base gray gradient: darker at bottom, lighter toward top
  float skyGrad = 0.50 + 0.25 * uv.y;

  // Fog layers - increased scale for finer detail, animated drift
  float fog1 = fbm(vec2(uv.x * 8.0 + t * 0.08, uv.y * 3.0 + t * 0.015));
  float fog2 = fbm(vec2(uv.x * 14.0 - t * 0.06, uv.y * 5.0 + 0.5 + t * 0.01));
  float fog3 = fbm(vec2(uv.x * 20.0 + t * 0.10, uv.y * 2.0 - t * 0.02));
  float fog = fog1 * 0.5 + fog2 * 0.3 + fog3 * 0.2;

  // Push fog away from midpoint for more contrast (center around 0.5, scale by 1.5x)
  fog = 0.5 + (fog - 0.5) * 1.5;

  // Thick cloud bands at specific heights
  float cloud1 = exp(-pow((uv.y - 0.55) * 3.5, 2.0));
  float cloud2 = exp(-pow((uv.y - 0.42) * 4.0, 2.0));

  // Modulate cloud density with noise - animated drift
  float cloudNoise1 = fbm(vec2(uv.x * 6.0 + t * 0.10, 1.0 + t * 0.02));
  float cloudNoise2 = fbm(vec2(uv.x * 8.0 - t * 0.07, 2.0 - t * 0.015));
  float clouds = cloud1 * cloudNoise1 * 0.20 + cloud2 * cloudNoise2 * 0.15;

  // Building/tower silhouettes - tall rectangular shapes in the mist
  float structures = 0.0;

  // Generate several building silhouettes at fixed positions
  for (int i = 0; i < 7; i++) {
    float idx = float(i);
    float bx = hash1(idx * 7.3 + 1.0);
    float bw = 0.015 + hash1(idx * 3.1 + 5.0) * 0.025;
    float bTop = 0.55 + hash1(idx * 5.7 + 2.0) * 0.25;
    float bBot = 0.25 + hash1(idx * 2.3 + 8.0) * 0.10;
    float depth = 0.5 + hash1(idx * 4.1 + 3.0) * 0.5;

    float xDist = abs(uv.x - bx) / bw;
    float bShape = smoothstep(1.0, 0.5, xDist);

    float bVert = smoothstep(bBot - 0.02, bBot + 0.02, uv.y)
                * smoothstep(bTop + 0.02, bTop - 0.02, uv.y);

    structures += bShape * bVert * depth * 0.20;
  }

  // Fog partially obscures structures
  structures *= (0.5 + 0.5 * (1.0 - fog));

  // Combine - increased fog contribution (0.18 -> 0.27, 50% more)
  float base = skyGrad + fog * 0.27 + clouds - structures;

  // Cool gray with slight blue tint
  vec3 color;
  color.r = base - 0.02;
  color.g = base;
  color.b = base + 0.04;

  color = clamp(color, 0.0, 1.0);

  gl_FragColor = vec4(color, 1.0);
}
