/**
 * Terrain Optimization Utilities
 * Provides Level of Detail (LOD) and geometry optimization for better performance
 */

import * as THREE from 'three';

export interface LODLevel {
  distance: number;
  skipFactor: number; // Every Nth point (1 = all points, 2 = every other, etc.)
}

export const DEFAULT_LOD_LEVELS: LODLevel[] = [
  { distance: 20, skipFactor: 1 },    // Close: Full detail
  { distance: 40, skipFactor: 2 },    // Medium-close: Half detail
  { distance: 70, skipFactor: 4 },    // Medium: Quarter detail
  { distance: 120, skipFactor: 8 },   // Far: Eighth detail
  { distance: 200, skipFactor: 16 },  // Very far: 1/16th detail
  { distance: 350, skipFactor: 32 },  // Extremely far: 1/32nd detail
];

/**
 * Simplify terrain geometry based on distance from camera
 */
export function createLODGeometry(
  positions: Float32Array,
  indices: number[],
  ncols: number,
  nrows: number,
  skipFactor: number = 1
): { positions: Float32Array; indices: number[] } {
  if (skipFactor <= 1) {
    return { positions, indices };
  }

  // Create simplified vertex array
  const simplifiedPositions: number[] = [];
  const vertexMap = new Map<number, number>();
  let newVertexIndex = 0;

  // Sample vertices with skip factor
  for (let row = 0; row < nrows; row += skipFactor) {
    for (let col = 0; col < ncols; col += skipFactor) {
      const originalIndex = row * ncols + col;
      const baseIndex = originalIndex * 3;
      
      if (baseIndex + 2 < positions.length) {
        simplifiedPositions.push(
          positions[baseIndex],
          positions[baseIndex + 1],
          positions[baseIndex + 2]
        );
        vertexMap.set(originalIndex, newVertexIndex);
        newVertexIndex++;
      }
    }
  }

  // Create simplified indices
  const simplifiedIndices: number[] = [];
  const simplifiedCols = Math.ceil(ncols / skipFactor);
  const simplifiedRows = Math.ceil(nrows / skipFactor);

  for (let row = 0; row < simplifiedRows - 1; row++) {
    for (let col = 0; col < simplifiedCols - 1; col++) {
      const i00 = row * simplifiedCols + col;
      const i01 = row * simplifiedCols + (col + 1);
      const i10 = (row + 1) * simplifiedCols + col;
      const i11 = (row + 1) * simplifiedCols + (col + 1);

      // Add triangles if all vertices exist
      if (i00 < newVertexIndex && i10 < newVertexIndex && i11 < newVertexIndex) {
        simplifiedIndices.push(i00, i10, i11);
      }
      if (i00 < newVertexIndex && i11 < newVertexIndex && i01 < newVertexIndex) {
        simplifiedIndices.push(i00, i11, i01);
      }
    }
  }

  return {
    positions: new Float32Array(simplifiedPositions),
    indices: simplifiedIndices
  };
}

/**
 * Calculate appropriate LOD level based on camera distance
 */
export function calculateLODLevel(
  cameraPosition: THREE.Vector3,
  terrainCenter: THREE.Vector3,
  lodLevels: LODLevel[] = DEFAULT_LOD_LEVELS
): number {
  const distance = cameraPosition.distanceTo(terrainCenter);
  
  for (let i = 0; i < lodLevels.length; i++) {
    if (distance <= lodLevels[i].distance) {
      return lodLevels[i].skipFactor;
    }
  }
  
  // Return highest skip factor for very far distances
  return lodLevels[lodLevels.length - 1].skipFactor;
}

/**
 * Optimize BufferGeometry by removing degenerate triangles and optimizing indices
 */
export function optimizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  // Merge vertices that are very close (within epsilon)
  const epsilon = 1e-6;
  const positions = geometry.getAttribute('position').array as Float32Array;
  const indices = geometry.getIndex()?.array as Uint32Array;
  
  if (!indices) return geometry;

  // Remove degenerate triangles (triangles with area close to zero)
  const validIndices: number[] = [];
  
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    
    // Get triangle vertices
    const v0 = new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]);
    const v1 = new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]);
    const v2 = new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]);
    
    // Calculate triangle area using cross product
    const edge1 = v1.sub(v0);
    const edge2 = v2.sub(v0);
    const area = edge1.cross(edge2).length() * 0.5;
    
    // Only include triangles with significant area
    if (area > epsilon) {
      validIndices.push(indices[i], indices[i + 1], indices[i + 2]);
    }
  }
  
  // Create optimized geometry
  const optimizedGeometry = geometry.clone();
  optimizedGeometry.setIndex(validIndices);
  optimizedGeometry.computeVertexNormals();
  
  return optimizedGeometry;
}

/**
 * Create frustum culling helper to avoid rendering geometry outside camera view
 */
export function createFrustumCuller(camera: THREE.Camera): THREE.Frustum {
  const frustum = new THREE.Frustum();
  const projectionMatrix = camera.projectionMatrix.clone();
  const viewMatrix = camera.matrixWorldInverse.clone();
  const matrix = projectionMatrix.multiply(viewMatrix);
  frustum.setFromProjectionMatrix(matrix);
  return frustum;
}

/**
 * Check if a bounding box is within the camera frustum
 */
export function isInFrustum(frustum: THREE.Frustum, boundingBox: THREE.Box3): boolean {
  return frustum.intersectsBox(boundingBox);
}

/**
 * Dispose of geometry resources properly to avoid memory leaks
 */
export function disposeGeometry(geometry: THREE.BufferGeometry): void {
  // Just dispose the geometry - Three.js will handle the cleanup
  geometry.dispose();
}

/**
 * Create optimized terrain mesh with LOD support
 */
export class OptimizedTerrainMesh extends THREE.Mesh {
  private lodLevels: LODLevel[];
  private originalPositions: Float32Array;
  private originalIndices: number[];
  private ncols: number;
  private nrows: number;
  private terrainCenter: THREE.Vector3;
  private currentLOD: number = 1;
  
  constructor(
    originalPositions: Float32Array,
    originalIndices: number[],
    ncols: number,
    nrows: number,
    material: THREE.Material,
    lodLevels: LODLevel[] = DEFAULT_LOD_LEVELS
  ) {
    const geometry = new THREE.BufferGeometry();
    super(geometry, material);
    
    this.originalPositions = originalPositions;
    this.originalIndices = originalIndices;
    this.ncols = ncols;
    this.nrows = nrows;
    this.lodLevels = lodLevels;
    
    // Calculate terrain center for LOD calculations
    const positionsAttribute = new THREE.BufferAttribute(originalPositions, 3);
    const bbox = new THREE.Box3().setFromBufferAttribute(positionsAttribute);
    this.terrainCenter = bbox.getCenter(new THREE.Vector3());
    
    // Initialize with highest detail (use default position for initialization)
    this.updateLOD(new THREE.Vector3(0, 0, 0));
  }
  
  updateLOD(cameraPosition: THREE.Vector3): void {
    const newLOD = calculateLODLevel(cameraPosition, this.terrainCenter, this.lodLevels);
    
    if (newLOD !== this.currentLOD) {
      this.currentLOD = newLOD;
      const { positions, indices } = createLODGeometry(
        this.originalPositions,
        this.originalIndices,
        this.ncols,
        this.nrows,
        newLOD
      );
      
      // Update geometry
      this.geometry.dispose();
      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.geometry.setIndex(indices);
      this.geometry.computeVertexNormals();
      this.geometry = optimizeGeometry(this.geometry);
    }
  }
  
  getCurrentLOD(): number {
    return this.currentLOD;
  }
  
  dispose(): void {
    disposeGeometry(this.geometry);
    if (this.material instanceof THREE.Material) {
      this.material.dispose();
    }
  }
}
