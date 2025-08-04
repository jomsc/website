export const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uFadeOut;
  varying vec2 vUv;
  
  // Random function
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  
  // Noise function
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  
  // Digital glitch effect
  vec3 digitalGlitch(vec2 uv, float time) {
    // Horizontal scan lines
    float scanLine = sin(uv.y * 800.0) * 0.04;
    
    // Random horizontal displacement
    float glitchStrength = noise(vec2(floor(uv.y * 100.0), floor(time * 10.0))) * 0.1;
    if (random(vec2(floor(uv.y * 50.0), floor(time * 5.0))) > 0.98) {
      glitchStrength *= 5.0;
    }
    
    vec2 glitchUv = uv;
    glitchUv.x += glitchStrength;
    
    // RGB separation
    float r = noise(glitchUv + vec2(0.1, 0.0) + time * 0.3);
    float g = noise(glitchUv + vec2(0.0, 0.1) + time * 0.5);
    float b = noise(glitchUv + vec2(-0.1, 0.0) + time * 0.7);
    
    // Add some color variations
    r *= mix(0.5, 1.5, noise(uv * 3.0 + time));
    g *= mix(0.3, 1.2, noise(uv * 4.0 + time * 1.3));
    b *= mix(0.7, 1.8, noise(uv * 2.0 + time * 0.8));
    
    // Matrix-style green tint
    vec3 color = vec3(r * 0.1, g * 0.8, b * 0.2);
    
    // Add scan line effect
    color += scanLine;
    
    // Random pixel corruption
    if (random(floor(uv * 200.0) + floor(time * 60.0)) > 0.995) {
      color = vec3(0.0, 1.0, 0.3);
    }
    
    return color;
  }
  
  // Loading bar effect
  vec3 loadingBar(vec2 uv, float time) {
    float barHeight = 0.02;
    float barY = 0.1;
    
    if (abs(uv.y - barY) < barHeight) {
      float progress = mod(time * 0.3, 1.0);
      float barIntensity = step(uv.x, progress) * 0.8;
      
      // Add some glitch to the loading bar
      barIntensity *= (1.0 + noise(vec2(uv.x * 20.0, time * 5.0)) * 0.3);
      
      return vec3(0.0, barIntensity, barIntensity * 0.5);
    }
    
    return vec3(0.0);
  }
  
  void main() {
    vec2 uv = vUv;
    vec3 color = vec3(0.0);
    
    // Main glitch effect
    color += digitalGlitch(uv, uTime);
    
    // Loading bar
    color += loadingBar(uv, uTime);
    
    // Add some overall intensity variation
    float intensity = 0.7 + 0.3 * sin(uTime * 2.0);
    color *= intensity;
    
    // Apply fade out
    color *= (1.0 - uFadeOut);
    
    gl_FragColor = vec4(color, 1.0 - uFadeOut);
  }
`;