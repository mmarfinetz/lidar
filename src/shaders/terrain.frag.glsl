// Enhanced Terrain Fragment Shader
// High-quality elevation-based color mapping with advanced hillshade effects

varying float vElevation;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vViewPosition;

uniform float minElevation;
uniform float maxElevation;
uniform sampler2D colorRamp;
uniform float opacity;

// Enhanced shading controls
uniform vec3 sunDir;             // normalized sun direction
uniform float ambientStrength;   // 0..1
uniform float diffuseStrength;   // 0..1
uniform float slopeStrength;     // 0..1 (extra contrast on slopes)
uniform float contourFrequency;  // lines per elevation range (0 to disable)
uniform float contourStrength;   // 0..1

// Advanced quality settings
uniform float detailScale;       // micro-detail enhancement
uniform float roughness;         // surface roughness for lighting
// cameraPosition is a built-in Three.js uniform, no need to declare

// Enhanced Blinn-Phong lighting model for better realism
vec3 calculateBlinnPhong(vec3 normal, vec3 lightDir, vec3 viewDir, vec3 baseColor, float roughnessValue) {
  vec3 halfwayDir = normalize(lightDir + viewDir);
  float spec = pow(max(dot(normal, halfwayDir), 0.0), (1.0 - roughnessValue) * 128.0);
  return baseColor * 0.1 + baseColor * spec * 0.3; // Subtle specular highlight
}

void main() {
  // Normalize elevation to 0-1 range with improved precision
  float elevationRange = maxElevation - minElevation;
  float normalizedHeight = elevationRange > 0.0
    ? (vElevation - minElevation) / elevationRange
    : 0.5;

  // Clamp to valid range
  normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);

  // Sample base color from gradient texture with enhanced sampling
  vec3 baseColor = texture2D(colorRamp, vec2(normalizedHeight, 0.5)).rgb;
  
  // Calculate enhanced surface normal (with micro-detail)
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(sunDir);
  vec3 viewDir = normalize(cameraPosition - vPosition);
  
  // Enhanced Lambertian diffuse lighting
  float NdotL = max(dot(normal, lightDir), 0.0);
  float diffuse = pow(NdotL, 0.8); // Slightly softer falloff for more realistic terrain

  // Advanced slope-based shading for enhanced micro-relief
  float slope = 1.0 - abs(dot(normal, vec3(0.0, 0.0, 1.0)));
  float slopeEnhancement = 1.0 + slope * slopeStrength * 0.5;
  float slopeShade = mix(1.0, 0.7, clamp(slope * 2.0, 0.0, 1.0));

  // Rim lighting for better depth perception
  float rimLight = 1.0 - max(dot(viewDir, normal), 0.0);
  rimLight = pow(rimLight, 3.0) * 0.2;

  // Multi-term enhanced shading
  float shade = ambientStrength + diffuseStrength * diffuse * slopeEnhancement;
  vec3 litColor = baseColor * shade * slopeShade;
  
  // Add subtle specular highlights for wet terrain effect
  if (roughness > 0.0) {
    vec3 specular = calculateBlinnPhong(normal, lightDir, viewDir, baseColor, roughness);
    litColor += specular * diffuseStrength;
  }
  
  // Add rim lighting
  litColor += baseColor * rimLight;

  // Enhanced contour lines with anti-aliasing
  if (contourFrequency > 0.0 && contourStrength > 0.0) {
    float contourT = fract(normalizedHeight * contourFrequency);
    float contourWidth = fwidth(contourT) * 3.0 + 1e-4; // Anti-aliased width
    float contourLine = smoothstep(0.0, contourWidth, contourT) * 
                       (1.0 - smoothstep(1.0 - contourWidth, 1.0, contourT));
    float contourMask = smoothstep(0.3, 0.7, contourLine);
    
    // More subtle contour effect
    litColor = mix(litColor, litColor * 0.6, contourMask * contourStrength);
  }
  
  // Distance-based detail falloff for performance
  float distanceFromCamera = length(vPosition - cameraPosition);
  float detailFalloff = 1.0 - clamp(distanceFromCamera / 100.0, 0.0, 0.8);
  litColor = mix(litColor * 0.95, litColor, detailFalloff);

  gl_FragColor = vec4(litColor, opacity);
}
