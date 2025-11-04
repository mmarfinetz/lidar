/**
 * LiDAR Point Cloud Data Types
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface LiDARPoint extends Point3D {
  intensity?: number;
  classification?: number;
  returnNumber?: number;
  numberOfReturns?: number;
  r?: number;
  g?: number;
  b?: number;
}

export interface PointCloudData {
  points: LiDARPoint[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  count: number;
  hasColor: boolean;
  hasClassification: boolean;
  /**
   * Optional geospatial metadata to aid in map/imagery overlays
   */
  geo?: {
    /** Geographic bounding box used to request the dataset (degrees) */
    bbox: {
      south: number;
      north: number;
      west: number;
      east: number;
    };
    /** Center of the selection (degrees) */
    center: { lat: number; lon: number };
    /** Approximate meters per degree at the selection center */
    metersPerDegree: { lat: number; lon: number };
    /** Base elevation used for relative heights (meters) */
    elevationBase: number;
    /**
     * Positions in meters in a local ENU-like frame centered at `center`.
     * Layout: [east, up, north] mapped to Three.js as [x, y, z] = [east, up, north]
     */
    positionsMeters?: Float32Array;
    /** Regular grid metadata (present for DEM-based scans) */
    grid?: {
      ncols: number;
      nrows: number;
      /** grid spacing in meters (east-west and north-south) */
      dxMeters: number;
      dyMeters: number;
      /** normalization scale applied to convert meters to world units */
      scale: number;
    };
    /** Height values per grid node in meters (absolute), row-major of size nrows*ncols. NaN for NODATA. */
    heightGrid?: Float32Array;
  };
}

export interface LayerData {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
  bounds: PointCloudData['bounds'];
}

export const PointClassification = {
  Created: 0,
  Unclassified: 1,
  Ground: 2,
  LowVegetation: 3,
  MediumVegetation: 4,
  HighVegetation: 5,
  Building: 6,
  LowPoint: 7,
  Water: 9,
} as const;

export interface ColorGradient {
  name: string;
  colors: string[];
  positions: number[];
}

export interface LODLevel {
  positions: Float32Array;
  colors: Float32Array;
  count: number;
  minDistance: number;
  maxDistance: number;
}

export type FileFormat = 'xyz' | 'las' | 'laz';
