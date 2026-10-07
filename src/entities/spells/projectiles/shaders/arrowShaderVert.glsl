// Uniform variables are constant across a single draw call
uniform vec3 color;  // Base color
uniform float opacity;  // Base opacity

// Attributes are per-vertex inputs to the vertex shader
attribute vec3 vtxColor;  // Color attribute for the vertex
attribute float vtxOpacity;  // Opacity attribute for the vertex

// Varying variables are used to pass data from the vertex shader to the fragment shader
varying vec3 vColor;  // Color to be passed to the fragment shader
varying float vOpacity;  // Opacity to be passed to the fragment shader

void main() {
  // Compute the final color by multiplying the base color with the vertex color
  vColor = color * vtxColor;
  
  // Compute the final opacity by multiplying the base opacity with the vertex opacity
  vOpacity = opacity * vtxOpacity;
  
  // Compute the final position of the vertex by transforming it with the projection and model-view matrices
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
