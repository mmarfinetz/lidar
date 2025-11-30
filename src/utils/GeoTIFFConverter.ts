/**
 * GeoTIFF Converter
 * Converts GeoTIFF elevation data to point cloud format
 */

import { fromArrayBuffer } from 'geotiff';
import type { PointCloudData, LiDARPoint } from '../types/lidar';
import type { BoundingBox } from '../core/ElevationAPI';
import { calculateBounds } from './spatial';
import { metersPerDegree } from './geo';

export class GeoTIFFConverter {

  /**
   * Convert GeoTIFF data to point cloud
   */
  static async convertToPointCloud(
    arrayBuffer: ArrayBuffer,
    _bbox: BoundingBox,
    onProgress?: (progress: number, status: string) => void
  ): Promise<PointCloudData> {
    try {
      onProgress?.(10, 'Parsing GeoTIFF data...');

      const tiff = await fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();

      onProgress?.(30, 'Reading elevation values...');

      // Get image metadata
      const width = image.getWidth();
      const height = image.getHeight();
      const bbox_tiff = image.getBoundingBox();
      const [west, south, east, north] = bbox_tiff;

      // Use the actual bounding box from the GeoTIFF
      const actualBbox: BoundingBox = {
        west,
        south,
        east,
        north
      };

      // Read raster data
      const rasters = await image.readRasters();
      const elevationData = rasters[0] as Float32Array | Int16Array | Uint16Array;

      onProgress?.(50, 'Converting to point cloud...');

      // Get no-data value
      const noDataValue = image.getGDALNoData();

      // Calculate cell size
      const cellsizeLon = (east - west) / width;
      const cellsizeLat = (north - south) / height;

      // Convert to point cloud
      const points: LiDARPoint[] = [];
      const centerLat = (south + north) / 2;
      const centerLon = (west + east) / 2;
      const mPerDeg = metersPerDegree(centerLat);

      let minElev = Infinity;
      let maxElev = -Infinity;

      // Sample the data (for very large datasets, we may want to downsample)
      const maxPoints = 5000000; // 5 million points max
      const totalPixels = width * height;
      const skipFactor = Math.max(1, Math.floor(Math.sqrt(totalPixels / maxPoints)));

      onProgress?.(60, `Processing ${Math.floor(totalPixels / (skipFactor * skipFactor)).toLocaleString()} points...`);

      for (let row = 0; row < height; row += skipFactor) {
        for (let col = 0; col < width; col += skipFactor) {
          const idx = row * width + col;
          const elevation = elevationData[idx];

          // Skip no-data values
          if (noDataValue !== null && elevation === noDataValue) {
            continue;
          }

          if (elevation === -9999 || elevation === -32768 || isNaN(elevation)) {
            continue;
          }

          // Calculate geographic coordinates
          // In GeoTIFF, row 0 is typically at the top (north), so we need to flip
          const lon = west + col * cellsizeLon;
          const lat = north - row * cellsizeLat; // Flip vertically

          minElev = Math.min(minElev, elevation);
          maxElev = Math.max(maxElev, elevation);

          points.push({
            x: lon,
            y: lat,
            z: elevation,
            intensity: 128,
            classification: 2,
            r: 150,
            g: 140,
            b: 120,
          });
        }
      }

      if (points.length === 0) {
        throw new Error('No valid elevation data found in GeoTIFF');
      }

      onProgress?.(80, 'Calculating bounds and positions...');

      // Calculate bounds
      const normalizedBounds = calculateBounds(points);

      // Calculate elevationBase (minimum elevation)
      const elevationBase = minElev;

      // Pre-calculate positions in meters for Three.js
      const positionsMeters: number[] = [];

      for (const point of points) {
        const dLon = point.x - centerLon;
        const dLat = point.y - centerLat;

        const east_m = dLon * mPerDeg.lon;
        const north_m = dLat * mPerDeg.lat;
        const up_m = point.z;

        positionsMeters.push(east_m, up_m, north_m);
      }

      // Normalize elevations relative to base
      for (let i = 1; i < positionsMeters.length; i += 3) {
        positionsMeters[i] = positionsMeters[i] - elevationBase;
      }

      onProgress?.(90, 'Finalizing point cloud...');

      // Create height grid for terrain mesh
      const gridWidth = Math.min(width, 512);
      const gridHeight = Math.min(height, 512);
      const heightGrid = new Float32Array(gridWidth * gridHeight);

      const gridSkipX = Math.max(1, Math.floor(width / gridWidth));
      const gridSkipY = Math.max(1, Math.floor(height / gridHeight));

      for (let gy = 0; gy < gridHeight; gy++) {
        for (let gx = 0; gx < gridWidth; gx++) {
          const sourceRow = Math.min(gy * gridSkipY, height - 1);
          const sourceCol = Math.min(gx * gridSkipX, width - 1);
          const idx = sourceRow * width + sourceCol;
          const elevation = elevationData[idx];

          if (noDataValue !== null && elevation === noDataValue) {
            heightGrid[gy * gridWidth + gx] = 0;
          } else if (elevation === -9999 || elevation === -32768 || isNaN(elevation)) {
            heightGrid[gy * gridWidth + gx] = 0;
          } else {
            heightGrid[gy * gridWidth + gx] = elevation - elevationBase;
          }
        }
      }

      onProgress?.(100, 'Complete!');

      return {
        points,
        bounds: normalizedBounds,
        count: points.length,
        hasColor: false,
        hasClassification: true,
        geo: {
          bbox: actualBbox,
          center: { lat: centerLat, lon: centerLon },
          metersPerDegree: mPerDeg,
          elevationBase,
          positionsMeters: new Float32Array(positionsMeters),
          grid: {
            ncols: gridWidth,
            nrows: gridHeight,
            dxMeters: (cellsizeLon * gridSkipX) * mPerDeg.lon,
            dyMeters: (cellsizeLat * gridSkipY) * mPerDeg.lat,
            scale: 1.0,
          },
          heightGrid,
        },
      };

    } catch (error) {
      console.error('Error converting GeoTIFF:', error);
      throw new Error(`Failed to convert GeoTIFF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect if a file is a GeoTIFF
   */
  static async isGeoTIFF(arrayBuffer: ArrayBuffer): Promise<boolean> {
    try {
      const tiff = await fromArrayBuffer(arrayBuffer);
      await tiff.getImage();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get GeoTIFF metadata
   */
  static async getMetadata(arrayBuffer: ArrayBuffer): Promise<{
    width: number;
    height: number;
    bbox: BoundingBox;
    resolution: {
      x: number;
      y: number;
    };
    sampleFormat?: string;
    bitsPerSample?: number;
  }> {
    const tiff = await fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const [west, south, east, north] = image.getBoundingBox();

    const bbox: BoundingBox = { west, south, east, north };
    const resolution = {
      x: (east - west) / width,
      y: (north - south) / height
    };

    return {
      width,
      height,
      bbox,
      resolution,
      sampleFormat: image.getSampleFormat()?.toString(),
      bitsPerSample: image.getBitsPerSample()?.[0]
    };
  }
}
