import type { PointCloudData, LiDARPoint } from '../types/lidar';
import * as THREE from 'three';

/**
 * Calculate bounding box from points
 */
export function calculateBounds(points: LiDARPoint[]): PointCloudData['bounds'] {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Center and normalize point cloud to fit in a unit cube
 */
export function normalizePoints(points: LiDARPoint[], bounds: PointCloudData['bounds']): void {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = bounds.minZ;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeY = bounds.maxY - bounds.minY;
  const rangeZ = bounds.maxZ - bounds.minZ;
  const maxRange = Math.max(rangeX, rangeY, rangeZ) || 1;

  const scale = 10 / maxRange; // Scale to fit in a 10-unit space

  for (const point of points) {
    point.x = (point.x - centerX) * scale;
    point.y = (point.y - centerY) * scale;
    point.z = (point.z - centerZ) * scale;
  }
}

/**
 * Convert LiDAR points to Float32Arrays for Three.js
 */
export function pointsToTypedArrays(points: LiDARPoint[]): {
  positions: Float32Array;
  colors: Float32Array;
  hasColor: boolean;
} {
  const count = points.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  let hasColor = false;

  for (let i = 0; i < count; i++) {
    const point = points[i];

    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;

    if (point.r !== undefined && point.g !== undefined && point.b !== undefined) {
      colors[i * 3] = point.r / 255;
      colors[i * 3 + 1] = point.g / 255;
      colors[i * 3 + 2] = point.b / 255;
      hasColor = true;
    } else {
      // Default color (white)
      colors[i * 3] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }
  }

  return { positions, colors, hasColor };
}

/**
 * Filter points by classification
 */
export function filterByClassification(
  points: LiDARPoint[],
  classifications: number[]
): LiDARPoint[] {
  return points.filter(p => {
    if (p.classification === undefined) return true;
    return classifications.includes(p.classification);
  });
}

/**
 * Calculate optimal camera position based on bounds
 */
export function calculateCameraPosition(bounds: PointCloudData['bounds']): THREE.Vector3 {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const rangeX = bounds.maxX - bounds.minX;
  const rangeY = bounds.maxY - bounds.minY;
  const rangeZ = bounds.maxZ - bounds.minZ;
  const maxRange = Math.max(rangeX, rangeY, rangeZ);

  // Position camera at 45-degree angle, distance based on model size
  const distance = maxRange * 1.5;

  return new THREE.Vector3(
    centerX + distance * 0.7,
    centerY + distance * 0.7,
    centerZ + distance * 0.7
  );
}

/**
 * Decimate points for LOD (Level of Detail)
 * Keeps every Nth point based on skip factor
 */
export function decimatePoints(
  positions: Float32Array,
  colors: Float32Array,
  skipFactor: number
): { positions: Float32Array; colors: Float32Array; count: number } {
  if (skipFactor <= 1) {
    return { positions, colors, count: positions.length / 3 };
  }

  const originalCount = positions.length / 3;
  const newCount = Math.ceil(originalCount / skipFactor);
  const newPositions = new Float32Array(newCount * 3);
  const newColors = new Float32Array(newCount * 3);

  let newIdx = 0;
  for (let i = 0; i < originalCount; i += skipFactor) {
    newPositions[newIdx * 3] = positions[i * 3];
    newPositions[newIdx * 3 + 1] = positions[i * 3 + 1];
    newPositions[newIdx * 3 + 2] = positions[i * 3 + 2];

    newColors[newIdx * 3] = colors[i * 3];
    newColors[newIdx * 3 + 1] = colors[i * 3 + 1];
    newColors[newIdx * 3 + 2] = colors[i * 3 + 2];

    newIdx++;
  }

  return { positions: newPositions, colors: newColors, count: newCount };
}
