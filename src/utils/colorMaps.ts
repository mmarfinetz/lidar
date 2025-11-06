import type { ColorGradient } from '../types/lidar';
import * as THREE from 'three';

/**
 * Predefined color gradients for elevation heat mapping
 */
export const COLOR_GRADIENTS: Record<string, ColorGradient> = {
  coolWarm: {
    name: 'Cool to Warm',
    colors: ['#0000ff', '#00ffff', '#00ff00', '#ffff00', '#ff0000'],
    positions: [0, 0.25, 0.5, 0.75, 1],
  },
  viridis: {
    name: 'Viridis',
    colors: ['#440154', '#31688e', '#35b779', '#fde724'],
    positions: [0, 0.33, 0.66, 1],
  },
  terrain: {
    name: 'Terrain',
    colors: ['#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#fefefe', '#fddbc7', '#f4a582', '#d6604d', '#b2182b'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  plasma: {
    name: 'Plasma',
    colors: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
    positions: [0, 0.25, 0.5, 0.75, 1],
  },
  elevation: {
    name: 'Elevation',
    colors: ['#1a4ba6', '#2d7bb6', '#6fb6d9', '#a3d6e8', '#e7f5b3', '#ffc973', '#f77f4d', '#d35147', '#8b2121'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  atlas: {
    name: 'Atlas',
    colors: ['#09386d', '#1a6fad', '#4fa6c5', '#a3d5dd', '#f1f1e6', '#e8d4a2', '#d3a961', '#b87333', '#8b4513'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  turbo: {
    name: 'Turbo',
    colors: ['#30123b', '#4777ef', '#1ac7c2', '#28ed8a', '#a0fb15', '#fec832', '#fa5427', '#c42503', '#7a0403'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  archaeological: {
    name: 'Archaeological',
    colors: ['#4a5a3a', '#6b7c5d', '#8b9d7c', '#c4b896', '#d9cdb3', '#e8d5ba', '#c9a66b', '#a0714e', '#6b4423'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  bathymetric: {
    name: 'Bathymetric',
    colors: ['#050a30', '#0e3b70', '#1a6db0', '#57a0c8', '#9fd3e6', '#ddf0f5', '#b8e6af', '#7fc97f', '#4d804d'],
    positions: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
  },
  grayscale: {
    name: 'Grayscale',
    colors: ['#1a1a1a', '#404040', '#666666', '#8c8c8c', '#b3b3b3', '#d9d9d9', '#f0f0f0'],
    positions: [0, 0.167, 0.333, 0.5, 0.667, 0.833, 1],
  },
};

/**
 * Generate a color from a gradient based on normalized value (0-1)
 */
export function getColorFromGradient(
  value: number,
  gradient: ColorGradient = COLOR_GRADIENTS.coolWarm
): THREE.Color {
  // Clamp value between 0 and 1
  const t = Math.max(0, Math.min(1, value));

  // Find the two colors to interpolate between
  let lowerIdx = 0;
  let upperIdx = 1;

  for (let i = 0; i < gradient.positions.length - 1; i++) {
    if (t >= gradient.positions[i] && t <= gradient.positions[i + 1]) {
      lowerIdx = i;
      upperIdx = i + 1;
      break;
    }
  }

  const lowerPos = gradient.positions[lowerIdx];
  const upperPos = gradient.positions[upperIdx];
  const localT = (t - lowerPos) / (upperPos - lowerPos);

  const lowerColor = new THREE.Color(gradient.colors[lowerIdx]);
  const upperColor = new THREE.Color(gradient.colors[upperIdx]);

  return lowerColor.lerp(upperColor, localT);
}

/**
 * Create a Data Texture for use in shaders
 */
export function createGradientTexture(gradient: ColorGradient, width: number = 256): THREE.DataTexture {
  const size = width;
  const data = new Uint8Array(size * 4); // RGBA

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const color = getColorFromGradient(t, gradient);

    const stride = i * 4;
    data[stride] = Math.floor(color.r * 255);
    data[stride + 1] = Math.floor(color.g * 255);
    data[stride + 2] = Math.floor(color.b * 255);
    data[stride + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return texture;
}

/**
 * Apply color to points array based on elevation
 */
export function applyElevationColors(
  points: Float32Array,
  colors: Float32Array,
  minElevation: number,
  maxElevation: number,
  gradient: ColorGradient = COLOR_GRADIENTS.coolWarm,
  elevationAxis: 0 | 1 | 2 = 2 // 0:X, 1:Y, 2:Z (default Z-up)
): void {
  const count = points.length / 3;
  const range = maxElevation - minElevation || 1;

  for (let i = 0; i < count; i++) {
    const elev = points[i * 3 + elevationAxis];
    const normalized = (elev - minElevation) / range;
    const color = getColorFromGradient(normalized, gradient);

    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
}
