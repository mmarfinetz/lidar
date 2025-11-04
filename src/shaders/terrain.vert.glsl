// Terrain Vertex Shader
// Passes elevation data to fragment shader for color mapping

varying float vElevation;
varying vec3 vNormal;
varying vec3 vPosition;

uniform float minElevation;
uniform float maxElevation;

void main() {
  // Elevation stored on Z (Z-up world)
  vElevation = position.z;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // Point size based on distance (for point cloud rendering)
  gl_PointSize = 2.0 * (300.0 / -mvPosition.z);
}
