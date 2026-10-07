// The varying variables are passed from the vertex shader to the fragment shader
varying vec3 vColor;  // Color of the vertex
varying float vOpacity;  // Opacity of the vertex

void main() {
  // Set the fragment color using the interpolated color and opacity
  gl_FragColor = vec4(vColor, vOpacity);
  
  // Discard fragments that are almost completely transparent
  if (gl_FragColor.a < 0.05) discard;
  
  // Apply tone mapping to the fragment color
  #include <tonemapping_fragment>
}
