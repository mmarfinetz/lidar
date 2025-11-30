/**
 * Layer Manager
 * Manages dual-layer rendering (surface vegetation + underlying terrain)
 */

import * as THREE from 'three';
import type { PointCloudData, ColorGradient } from '../types/lidar';
import { PointClassification } from '../types/lidar';
import { filterByClassification, pointsToTypedArrays } from '../utils/spatial';
import { applyElevationColors, createGradientTexture, COLOR_GRADIENTS } from '../utils/colorMaps';
import { OptimizedTerrainMesh } from '../utils/terrainOptimization';

// Import shaders as strings
import terrainVertShader from '../shaders/terrain.vert.glsl?raw';
import terrainFragShader from '../shaders/terrain.frag.glsl?raw';
import pointsVertShader from '../shaders/points.vert.glsl?raw';
import pointsFragShader from '../shaders/points.frag.glsl?raw';

export interface Layer {
  name: string;
  mesh: THREE.Points | THREE.Mesh | OptimizedTerrainMesh;
  visible: boolean;
  opacity: number;
}

export class LayerManager {
  private scene: THREE.Scene;
  private layers: Map<string, Layer> = new Map();
  private gradientTexture: THREE.DataTexture;
  private currentGradient: ColorGradient;
  private sunDirection: THREE.Vector3 = new THREE.Vector3(0.5, 0.8, 0.6).normalize();
  private ambientStrength = 0.5;
  private diffuseStrength = 0.8;
  private slopeStrength = 0.2;
  private contourFrequency = 0.0; // lines per elevation range
  private contourStrength = 0.0;   // 0..1
  private camera: THREE.Camera | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.currentGradient = COLOR_GRADIENTS.elevation;
    this.gradientTexture = createGradientTexture(this.currentGradient);
  }

  /**
   * Set camera reference for LOD calculations
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Update LOD for all terrain meshes based on camera position
   */
  updateLOD(): void {
    if (!this.camera) return;

    this.layers.forEach(layer => {
      if (layer.mesh instanceof OptimizedTerrainMesh && this.camera) {
        layer.mesh.updateLOD(this.camera.position);
        // Update camera position in shaders for enhanced lighting
        if (layer.mesh.material instanceof THREE.ShaderMaterial && this.camera) {
          layer.mesh.material.uniforms.cameraPosition.value.copy(this.camera.position);
        }
      }
    });
  }

  /**
   * Create surface layer (vegetation)
   */
  createSurfaceLayer(data: PointCloudData): void {
    // For DEM-based scans (regular grid), there is no separate surface canopy.
    if (data.geo?.grid) {
      console.log('Surface layer skipped for DEM grid data');
      return;
    }
    // Filter for vegetation and first returns
    const vegetationClasses = [
      PointClassification.Unclassified,
      PointClassification.LowVegetation,
      PointClassification.MediumVegetation,
      PointClassification.HighVegetation,
    ];

    const surfacePoints = data.hasClassification
      ? filterByClassification(data.points, vegetationClasses)
      : data.points.filter(p => !p.classification || p.classification !== PointClassification.Ground);

    if (surfacePoints.length === 0) {
      // This is expected for DEM/terrain tile data which only has ground elevation
      console.log('Surface layer skipped: no vegetation/surface points in data');
      return;
    }

    const { positions, colors } = pointsToTypedArrays(surfacePoints);

    // Apply green tint to surface if no color data
    if (!data.hasColor) {
      // Deterministic green tint per point (no randomness) to keep tests stable
      const pseudo = (n: number) => {
        const s = Math.sin(n * 12.9898) * 43758.5453;
        return s - Math.floor(s);
      };
      for (let i = 0; i < colors.length / 3; i++) {
        const t = pseudo(i);
        colors[i * 3] = 0.2 + 0.3 * t;         // R: 0.2-0.5
        colors[i * 3 + 1] = 0.5 + 0.4 * (1 - t); // G: 0.5-0.9
        colors[i * 3 + 2] = 0.1 + 0.2 * (t * 0.5 + 0.25); // B: 0.125-0.225
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      vertexShader: pointsVertShader,
      fragmentShader: pointsFragShader,
      vertexColors: true,
      transparent: true,
      uniforms: {
        opacity: { value: 1.0 },
      },
    });

    const mesh = new THREE.Points(geometry, material);
    mesh.name = 'surface';

    // Remove old surface layer if exists
    this.removeLayer('surface');

    // Add to scene
    this.scene.add(mesh);
    this.layers.set('surface', {
      name: 'surface',
      mesh,
      visible: true,
      opacity: 1.0,
    });

    console.log(`Surface layer created: ${surfacePoints.length} points`);
  }

  /**
   * Create terrain layer (ground)
   */
  createTerrainLayer(data: PointCloudData): void {
    // If grid info present (DEM), render a continuous surface mesh like a hillshade
    if (data.geo?.grid && data.geo.heightGrid) {
      const { ncols, nrows, dxMeters, dyMeters, scale } = data.geo.grid;
      const heights = data.geo.heightGrid;
      const elevationBase = data.geo.elevationBase;

      const vertexCount = ncols * nrows;
      const positions = new Float32Array(vertexCount * 3);

      const dx = dxMeters * scale; // world units per column
      const dy = dyMeters * scale; // world units per row (north is +Y)

      const halfCols = (ncols - 1) / 2;
      const halfRows = (nrows - 1) / 2;

      // Build vertex positions centered at (0,0) in XY, elevation on Z
      for (let row = 0; row < nrows; row++) {
        for (let col = 0; col < ncols; col++) {
          const idx = row * ncols + col;
          const x = (col - halfCols) * dx;                   // east-west
          const y = ((nrows - 1 - row) - halfRows) * dy;     // north-south (row 0 is northmost)
          const h = heights[idx];
          const z = isNaN(h) ? 0 : (h - elevationBase) * scale; // up

          const v = idx * 3;
          positions[v] = x;
          positions[v + 1] = y;
          positions[v + 2] = z;
        }
      }

      // Build index buffer (skip cells with NaN heights)
      const indices: number[] = [];
      for (let row = 0; row < nrows - 1; row++) {
        for (let col = 0; col < ncols - 1; col++) {
          const i00 = row * ncols + col;
          const i01 = row * ncols + (col + 1);
          const i10 = (row + 1) * ncols + col;
          const i11 = (row + 1) * ncols + (col + 1);

          const h00 = heights[i00];
          const h01 = heights[i01];
          const h10 = heights[i10];
          const h11 = heights[i11];

          if (!isNaN(h00) && !isNaN(h10) && !isNaN(h11)) {
            indices.push(i00, i10, i11);
          }
          if (!isNaN(h00) && !isNaN(h11) && !isNaN(h01)) {
            indices.push(i00, i11, i01);
          }
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();

      const minZ = data.bounds.minZ;
      const maxZ = data.bounds.maxZ;
      const material = new THREE.ShaderMaterial({
        vertexShader: terrainVertShader,
        fragmentShader: terrainFragShader,
        transparent: true,
        uniforms: {
          minElevation: { value: minZ },
          maxElevation: { value: maxZ },
          colorRamp: { value: this.gradientTexture },
          opacity: { value: 1.0 },
          sunDir: { value: this.sunDirection },
          ambientStrength: { value: this.ambientStrength },
          diffuseStrength: { value: this.diffuseStrength },
          slopeStrength: { value: this.slopeStrength },
          contourFrequency: { value: this.contourFrequency },
          contourStrength: { value: this.contourStrength },
          // Enhanced quality uniforms
          detailScale: { value: 1.0 },
          roughness: { value: 0.1 }, // Subtle specular highlights
          cameraPosition: { value: new THREE.Vector3(0, 0, 0) },
        },
      });

      // Create optimized terrain mesh with LOD support
      const optimizedMesh = new OptimizedTerrainMesh(
        positions,
        indices,
        ncols,
        nrows,
        material
      );
      optimizedMesh.name = 'terrain_surface';
      optimizedMesh.userData.isTerrainMesh = true;
      optimizedMesh.castShadow = true;
      optimizedMesh.receiveShadow = true;

      // Remove old terrain layer if exists
      this.removeLayer('terrain');

      this.scene.add(optimizedMesh);
      this.layers.set('terrain', {
        name: 'terrain',
        mesh: optimizedMesh,
        visible: true,
        opacity: 1.0,
      });

      console.log(`Terrain surface created: ${vertexCount} vertices, ${indices.length / 3} triangles`);
      return;
    }

    // Fallback: render as colored point cloud when no grid metadata
    const groundClasses = [PointClassification.Ground];
    const terrainPoints = data.hasClassification
      ? filterByClassification(data.points, groundClasses)
      : data.points.filter(p => p.classification === PointClassification.Ground || p.returnNumber === p.numberOfReturns);
    const pointsToUse = terrainPoints.length > 0 ? terrainPoints : data.points;
    const { positions, colors } = pointsToTypedArrays(pointsToUse);
    const minZ = data.bounds.minZ;
    const maxZ = data.bounds.maxZ;
    applyElevationColors(positions, colors, minZ, maxZ, this.currentGradient, 2);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      vertexShader: terrainVertShader,
      fragmentShader: terrainFragShader,
      vertexColors: true,
      transparent: true,
      uniforms: {
        minElevation: { value: minZ },
        maxElevation: { value: maxZ },
        colorRamp: { value: this.gradientTexture },
        opacity: { value: 1.0 },
        sunDir: { value: this.sunDirection },
        ambientStrength: { value: this.ambientStrength },
        diffuseStrength: { value: this.diffuseStrength },
        slopeStrength: { value: this.slopeStrength },
        contourFrequency: { value: this.contourFrequency },
        contourStrength: { value: this.contourStrength },
      },
    });

    const mesh = new THREE.Points(geometry, material);
    mesh.name = 'terrain_points';
    this.removeLayer('terrain');
    this.scene.add(mesh);
    this.layers.set('terrain', {
      name: 'terrain',
      mesh,
      visible: true,
      opacity: 1.0,
    });
    console.log(`Terrain layer (points) created: ${pointsToUse.length} points`);
  }

  /**
   * Toggle layer visibility
   */
  setLayerVisibility(layerName: string, visible: boolean): void {
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.visible = visible;
      layer.mesh.visible = visible;
    }
  }

  /**
   * Set layer opacity
   */
  setLayerOpacity(layerName: string, opacity: number): void {
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.opacity = opacity;
      const material = layer.mesh.material as THREE.ShaderMaterial;
      material.uniforms.opacity.value = opacity;
    }
  }

  /**
   * Change color gradient for terrain layer
   */
  setColorGradient(gradient: ColorGradient): void {
    this.currentGradient = gradient;
    this.gradientTexture.dispose();
    this.gradientTexture = createGradientTexture(gradient);

    const terrainLayer = this.layers.get('terrain');
    if (terrainLayer) {
      const material = terrainLayer.mesh.material as THREE.ShaderMaterial;
      material.uniforms.colorRamp.value = this.gradientTexture;
      material.needsUpdate = true;
    }
  }

  /**
   * Set sun direction from azimuth/altitude (degrees)
   */
  setSun(azimuthDeg: number, altitudeDeg: number): void {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const alt = THREE.MathUtils.degToRad(altitudeDeg);
    const x = Math.sin(az) * Math.cos(alt);
    const y = Math.cos(az) * Math.cos(alt);
    const z = Math.sin(alt);
    this.sunDirection.set(x, y, z).normalize();
    const layer = this.layers.get('terrain');
    if (layer) {
      const m = layer.mesh.material as THREE.ShaderMaterial;
      m.uniforms.sunDir.value = this.sunDirection;
    }
  }

  /**
   * Adjust lighting strengths (0..1)
   */
  setLighting(ambient: number, diffuse: number, slope: number): void {
    this.ambientStrength = ambient;
    this.diffuseStrength = diffuse;
    this.slopeStrength = slope;
    const layer = this.layers.get('terrain');
    if (layer) {
      const m = layer.mesh.material as THREE.ShaderMaterial;
      m.uniforms.ambientStrength.value = ambient;
      m.uniforms.diffuseStrength.value = diffuse;
      m.uniforms.slopeStrength.value = slope;
    }
  }

  /**
   * Enable/adjust contour lines overlay
   */
  setContours(frequency: number, strength: number): void {
    this.contourFrequency = Math.max(0, frequency);
    this.contourStrength = THREE.MathUtils.clamp(strength, 0, 1);
    const layer = this.layers.get('terrain');
    if (layer) {
      const m = layer.mesh.material as THREE.ShaderMaterial;
      m.uniforms.contourFrequency.value = this.contourFrequency;
      m.uniforms.contourStrength.value = this.contourStrength;
    }
  }

  /**
   * Vertical exaggeration for terrain mesh (scales Z)
   */
  setVerticalExaggeration(exaggeration: number): void {
    const layer = this.layers.get('terrain');
    if (layer) {
      layer.mesh.scale.set(1, 1, Math.max(0.1, exaggeration));
    }
  }

  /**
   * Get layer by name
   */
  getLayer(name: string): Layer | undefined {
    return this.layers.get(name);
  }

  /**
   * Remove layer from scene
   */
  removeLayer(name: string): void {
    const layer = this.layers.get(name);
    if (layer) {
      this.scene.remove(layer.mesh);
      
      // Handle optimized terrain meshes
      if (layer.mesh instanceof OptimizedTerrainMesh) {
        layer.mesh.dispose();
      } else {
        layer.mesh.geometry.dispose();
        if (layer.mesh.material instanceof THREE.Material) {
          layer.mesh.material.dispose();
        }
      }
      
      this.layers.delete(name);
    }
  }

  /**
   * Clear all layers
   */
  clearAll(): void {
    for (const layer of this.layers.values()) {
      this.scene.remove(layer.mesh);
      
      // Handle optimized terrain meshes
      if (layer.mesh instanceof OptimizedTerrainMesh) {
        layer.mesh.dispose();
      } else {
        layer.mesh.geometry.dispose();
        if (layer.mesh.material instanceof THREE.Material) {
          layer.mesh.material.dispose();
        }
      }
    }
    this.layers.clear();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.clearAll();
    this.gradientTexture.dispose();
  }
}
