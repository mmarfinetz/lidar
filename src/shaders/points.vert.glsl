// Points Vertex Shader
// Simple shader for point cloud rendering

varying vec3 vColor;

void main() {
  vColor = color;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Adaptive point size based on camera distance
  gl_PointSize = 3.0 * (300.0 / -mvPosition.z);
}
