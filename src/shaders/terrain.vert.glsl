// Enhanced Terrain Vertex Shader
// Optimized for high-quality terrain rendering with advanced lighting

varying float vElevation;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

uniform float minElevation;
uniform float maxElevation;

void main() {
  // Elevation stored on Z (Z-up world)
  vElevation = position.z;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  
  // Calculate view space position for enhanced lighting calculations
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = mvPosition.xyz;
  
  gl_Position = projectionMatrix * mvPosition;

  // Point size based on distance (for point cloud rendering) with better scaling
  gl_PointSize = max(1.0, 2.0 * (300.0 / -mvPosition.z));
}
