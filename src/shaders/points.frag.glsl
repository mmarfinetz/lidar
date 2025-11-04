// Points Fragment Shader
// Renders colored points with smooth circular shape

varying vec3 vColor;
uniform float opacity;

void main() {
  // Create circular point shape (discard pixels outside circle)
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) {
    discard;
  }

  // Soft edge fade
  float alpha = smoothstep(0.5, 0.3, dist) * opacity;

  gl_FragColor = vec4(vColor, alpha);
}
