// Terrain Fragment Shader
// Applies elevation-based color mapping with hillshade effect

varying float vElevation;
varying vec3 vNormal;
varying vec3 vPosition;

uniform float minElevation;
uniform float maxElevation;
uniform sampler2D colorRamp;
uniform float opacity;
// Shading controls
uniform vec3 sunDir;             // normalized sun direction
uniform float ambientStrength;   // 0..1
uniform float diffuseStrength;   // 0..1
uniform float slopeStrength;     // 0..1 (extra contrast on slopes)
uniform float contourFrequency;  // lines per elevation range (0 to disable)
uniform float contourStrength;   // 0..1

void main() {
  // Normalize elevation to 0-1 range
  float elevationRange = maxElevation - minElevation;
  float normalizedHeight = elevationRange > 0.0
    ? (vElevation - minElevation) / elevationRange
    : 0.5;

  // Clamp to valid range
  normalizedHeight = clamp(normalizedHeight, 0.0, 1.0);

  // Sample color from gradient texture
  vec3 baseColor = texture2D(colorRamp, vec2(normalizedHeight, 0.5)).rgb;

  // Lambertian lighting with configurable sun direction
  float lambert = max(dot(normalize(vNormal), normalize(sunDir)), 0.0);

  // Slope emphasis (steeper slopes get darker to enhance micro‑relief)
  float slope = 1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)));
  float slopeShade = mix(1.0, 0.6, clamp(slope * 1.5, 0.0, 1.0));

  // Multi-term shading
  float shade = ambientStrength + diffuseStrength * lambert;
  vec3 litColor = baseColor * shade * mix(1.0, slopeShade, slopeStrength);

  // Optional contour lines across the elevation range
  if (contourFrequency > 0.0 && contourStrength > 0.0) {
    float t = fract(normalizedHeight * contourFrequency);
    float w = fwidth(t) * 2.0 + 1e-4; // smooth width
    float line = smoothstep(0.0, w, t) * (1.0 - smoothstep(1.0 - w, 1.0, t));
    float lineMask = clamp(line * 10.0, 0.0, 1.0);
    // Darken color where lines occur
    litColor = mix(litColor, litColor * 0.4, lineMask * contourStrength);
  }

  gl_FragColor = vec4(litColor, opacity);
}
