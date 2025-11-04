/**
 * Elevation API Service
 * Fetches elevation data from public sources and converts to point clouds
 */

import type { PointCloudData, LiDARPoint } from '../types/lidar';
import { calculateBounds } from '../utils/spatial';
import { metersPerDegree } from '../utils/geo';

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface ElevationDataset {
  name: string;
  description: string;
  resolution: string; // e.g., "30m", "90m"
  coverage: string; // e.g., "Global", "USA"
}

export const DATASETS: Record<string, ElevationDataset> = {
  SRTMGL3: {
    name: 'SRTM GL3 (90m)',
    description: 'Global coverage, 90-meter resolution',
    resolution: '90m',
    coverage: 'Global (60°N - 56°S)',
  },
  SRTMGL1: {
    name: 'SRTM GL1 (30m)',
    description: 'Global coverage, 30-meter resolution',
    resolution: '30m',
    coverage: 'Global (60°N - 56°S)',
  },
  SRTMGL1_E: {
    name: 'SRTM GL1 Ellipsoidal (30m)',
    description: 'Global, 30m, ellipsoidal heights',
    resolution: '30m',
    coverage: 'Global (60°N - 56°S)',
  },
  AW3D30: {
    name: 'ALOS World 3D (30m)',
    description: 'Global coverage, 30-meter resolution',
    resolution: '30m',
    coverage: 'Global',
  },
  // High-resolution LiDAR datasets (when available)
  USGS_3DEP: {
    name: 'USGS 3DEP LiDAR (1-2m)',
    description: 'US high-resolution LiDAR where available',
    resolution: '1-2m',
    coverage: 'USA (selected areas)',
  },
  ARCHAEOLOGICAL: {
    name: 'Archaeological LiDAR Collections',
    description: 'Specialized archaeological surveys (Maya, etc.)',
    resolution: '0.5-2m',
    coverage: 'Selected sites worldwide',
  },
};

export class ElevationAPI {
  private static readonly OPENTOPO_BASE = 'https://portal.opentopography.org/API/globaldem';
  // private static readonly OPENTOPO_COLLECTIONS = 'https://portal.opentopography.org/API/collections';
  // Valid DEM types supported by OpenTopography Global DEM API
  private static readonly SUPPORTED_DEMTYPES = new Set([
    'SRTMGL3',
    'SRTMGL1',
    'SRTMGL1_E',
    'AW3D30',
  ]);

  // Some higher‑resolution identifiers used elsewhere in the app should NOT be
  // sent to the OpenTopography Global DEM endpoint. Map them to a reasonable
  // fallback so requests never 400.
  private static normalizeDataset(dataset: string): { demtype: string; downgraded: boolean } {
    if (this.SUPPORTED_DEMTYPES.has(dataset)) {
      return { demtype: dataset, downgraded: false };
    }

    // Downgrade anything unknown/high‑res to a global DEM that always exists
    // Prefer 30m for a better preview while avoiding API errors.
    return { demtype: 'SRTMGL1', downgraded: true };
  }

  /**
   * Fetch elevation data from OpenTopography Global DEM API
   */
  static async fetchElevationData(
    bbox: BoundingBox,
    dataset: string = 'SRTMGL1', // Default to 30m resolution for higher quality
    onProgress?: (progress: number, status: string) => void
  ): Promise<PointCloudData> {
    const apiKey = this.getApiKey();

    try {
      if (!apiKey) {
        throw new Error(
          'OpenTopography API key required. Please:\n' +
          '1. Register at portal.opentopography.org/newUser\n' +
          '2. Copy your API key from your OpenTopography account\n' +
          '3. Add VITE_OPENTOPO_API_KEY=your_key_here to your .env and restart'
        );
      }

      const { demtype, downgraded } = this.normalizeDataset(dataset);
      onProgress?.(10, downgraded
        ? 'High‑res not supported via API; using global 30m preview...'
        : 'Requesting elevation data...'
      );

      const params = new URLSearchParams({
        demtype,
        south: bbox.south.toString(),
        north: bbox.north.toString(),
        west: bbox.west.toString(),
        east: bbox.east.toString(),
        outputFormat: 'AAIGrid',
        API_Key: apiKey,
      });

      const url = `${this.OPENTOPO_BASE}?${params}`;
      console.log('Requesting OpenTopography API...');

      onProgress?.(20, 'Downloading data from OpenTopography...');

      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid API key. Please check your OpenTopography API key.');
        } else if (response.status === 429) {
          throw new Error('API rate limit exceeded. Try again in 24 hours or upgrade your plan.');
        } else {
          throw new Error(`OpenTopography API error: ${response.statusText} (${response.status})`);
        }
      }

      onProgress?.(50, 'Processing elevation data...');
      const text = await response.text();
      
      onProgress?.(70, 'Converting to point cloud...');
      const pointCloud = this.parseASCIIGrid(text, bbox);
      
      onProgress?.(100, 'Complete!');
      return pointCloud;
      
    } catch (error) {
      console.error('Error fetching elevation data:', error);
      throw error;
    }
  }

  /**
   * Get API key from environment variables
   */
  private static getApiKey(): string | null {
    return import.meta.env.VITE_OPENTOPO_API_KEY || null;
  }


  /**
   * Parse ASCII Grid format (.asc) to point cloud
   * Format:
   * ncols         500
   * nrows         400
   * xllcorner     -180.0
   * yllcorner     -90.0
   * cellsize      0.01
   * NODATA_value  -9999
   * elevation_values...
   */
  private static parseASCIIGrid(text: string, bbox: BoundingBox): PointCloudData {
    const lines = text.trim().split('\n');

    // Parse header
    const header: Record<string, number> = {};
    let dataStartLine = 0;

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      const parts = line.split(/\s+/);

      if (parts.length === 2) {
        const key = parts[0].toLowerCase();
        const value = parseFloat(parts[1]);
        header[key] = value;
        dataStartLine = i + 1;
      } else {
        break;
      }
    }

    const ncols = header.ncols || 0;
    const nrows = header.nrows || 0;
    const xllcorner = header.xllcorner || bbox.west;
    const yllcorner = header.yllcorner || bbox.south;
    const cellsize = header.cellsize || (bbox.east - bbox.west) / ncols;
    const nodata = header.nodata_value || -9999;

    console.log('ASCII Grid Header:', { ncols, nrows, xllcorner, yllcorner, cellsize, nodata });
    console.log('Expected grid size:', ncols * nrows, 'cells');

    const points: LiDARPoint[] = [];
    // Pre-allocate for optional geo positions (east, up, north) in meters relative to center
    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLon = (bbox.east + bbox.west) / 2;
    const mPerDeg = metersPerDegree(centerLat);
    const positionsMeters: number[] = [];
    // Height grid (absolute elevations) including NODATA as NaN
    const heightGrid = new Float32Array(nrows * ncols);

    // Parse elevation data
    for (let row = 0; row < nrows; row++) {
      const lineIndex = dataStartLine + row;
      if (lineIndex >= lines.length) break;

      const values = lines[lineIndex].trim().split(/\s+/).map(Number);

      for (let col = 0; col < Math.min(values.length, ncols); col++) {
        const elevation = values[col];
        const idx = row * ncols + col;
        if (elevation === nodata || isNaN(elevation)) {
          heightGrid[idx] = NaN;
          continue;
        }

        heightGrid[idx] = elevation;

        // Calculate geographic coordinates (degrees)
        const lon = xllcorner + col * cellsize; // lon
        const lat = yllcorner + (nrows - 1 - row) * cellsize; // lat (flip Y since grid is top-down)
        const z = elevation; // meters

        points.push({
          x: lon,
          y: lat,
          z,
          classification: 2, // Ground
          intensity: Math.abs(elevation) * 100,
        });

        // Build local ENU positions in meters relative to center
        const east = (lon - centerLon) * mPerDeg.lon;
        const north = (lat - centerLat) * mPerDeg.lat;
        // up is relative to min elevation, do z shift later when we know minZ
        positionsMeters.push(east, z, north);
      }
    }

    console.log('Points created from ASCII grid:', points.length);
    console.log('First 5 points (before normalization):', points.slice(0, 5));

    if (points.length === 0) {
      throw new Error('No valid elevation data found in the selected region');
    }

    // Calculate bounds before normalization (needed for the normalization process)
    const originalBounds = calculateBounds(points);
    console.log('Original bounds before normalization:', originalBounds);

    // Convert degrees to meters in XY and normalize with Z-up world (X=east, Y=north, Z=up)
    const rangeEastMeters = (bbox.east - bbox.west) * mPerDeg.lon;
    const rangeNorthMeters = (bbox.north - bbox.south) * mPerDeg.lat;
    const rangeUpMeters = originalBounds.maxZ - originalBounds.minZ;
    const maxRangeMeters = Math.max(rangeEastMeters, rangeNorthMeters, rangeUpMeters || 1);
    const scale = 10 / (maxRangeMeters || 1); // fit within ~10 units

    const elevationBase = originalBounds.minZ;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const east = (p.x - centerLon) * mPerDeg.lon;   // meters
      const north = (p.y - centerLat) * mPerDeg.lat;  // meters
      const up = (p.z - elevationBase);               // meters

      // Map to Z-up world: X=east, Y=north, Z=up
      p.x = east * scale;
      p.y = north * scale;
      p.z = up * scale;
    }

    // Recalculate bounds after normalization to get correct normalized coordinates
    const normalizedBounds = calculateBounds(points);
    console.log('Normalized bounds after normalization:', normalizedBounds);
    console.log('First 5 points (after normalization):', points.slice(0, 5));

    // Shift 'up' in positionsMeters to be relative to base elevation (minZ)
    for (let i = 1; i < positionsMeters.length; i += 3) {
      // positionsMeters layout remains [east, up, north]
      positionsMeters[i] = positionsMeters[i] - elevationBase;
    }

    return {
      points,
      bounds: normalizedBounds,
      count: points.length,
      hasColor: false,
      hasClassification: true,
      geo: {
        bbox,
        center: { lat: centerLat, lon: centerLon },
        metersPerDegree: mPerDeg,
        elevationBase,
        positionsMeters: new Float32Array(positionsMeters),
        grid: {
          ncols,
          nrows,
          dxMeters: (cellsize) * mPerDeg.lon,
          dyMeters: (cellsize) * mPerDeg.lat,
          scale,
        },
        heightGrid,
      },
    };
  }

  /**
   * Validate bounding box
   */
  static validateBBox(bbox: BoundingBox): { valid: boolean; error?: string } {
    if (bbox.north <= bbox.south) {
      return { valid: false, error: 'North must be greater than South' };
    }
    if (bbox.east <= bbox.west) {
      return { valid: false, error: 'East must be greater than West' };
    }
    if (bbox.north > 90 || bbox.south < -90) {
      return { valid: false, error: 'Latitude must be between -90 and 90' };
    }
    if (bbox.east > 180 || bbox.west < -180) {
      return { valid: false, error: 'Longitude must be between -180 and 180' };
    }

    // Check area (prevent too large requests)
    const latDiff = bbox.north - bbox.south;
    const lonDiff = bbox.east - bbox.west;
    const area = latDiff * lonDiff;

    if (area > 1) {
      // Max ~1 degree square (~111km x 111km at equator)
      return {
        valid: false,
        error: 'Selected area too large. Please select a smaller region (max ~100km x 100km)',
      };
    }

    if (area < 0.001) {
      // Min ~0.001 degree square (~100m x 100m)
      return {
        valid: false,
        error: 'Selected area too small. Please select a larger region',
      };
    }

    return { valid: true };
  }

  /**
   * Estimate point count for a bounding box
   */
  static estimatePoints(bbox: BoundingBox, dataset: string): number {
    const latDiff = bbox.north - bbox.south;
    const lonDiff = bbox.east - bbox.west;

    // Approximate points per degree based on dataset resolution
    const resolutionMap: Record<string, number> = {
      SRTMGL3: 1200, // 90m resolution ≈ 1200 points per degree
      SRTMGL1: 3600, // 30m resolution ≈ 3600 points per degree
      SRTMGL1_E: 3600,
      AW3D30: 3600,
      USGS_3DEP: 111120000, // 1m resolution ≈ very high density
      ARCHAEOLOGICAL: 111120000 * 4, // 0.5m resolution ≈ extremely high density
    };

    const pointsPerDegree = resolutionMap[dataset] || 1200;
    return Math.floor(latDiff * lonDiff * pointsPerDegree * pointsPerDegree);
  }

  /**
   * Search for high-resolution LiDAR collections in a bounding box
   * This searches OpenTopography's specialized datasets
   */
  static async searchLidarCollections(_bbox: BoundingBox): Promise<Array<{
    id: string;
    title: string;
    description: string;
    resolution: string;
    downloadUrl?: string;
    dataType: 'raster' | 'pointcloud';
  }>> {
    try {
      // TODO: Implement real OpenTopography API collection search
      // This should query the actual OpenTopography collections API
      const apiKey = this.getApiKey();
      if (!apiKey) {
        console.warn('API key required for LiDAR collections search');
        return [];
      }

      // For now, return empty array until real API integration
      console.warn('LiDAR collections search not yet implemented - would query OpenTopography collections API');
      return [];
    } catch (error) {
      console.warn('Error searching LiDAR collections:', error);
      return [];
    }
  }

  /**
   * Download and convert archaeological LiDAR data for the app
   */
  static async fetchArchaeologicalLidar(
    collectionId: string,
    onProgress?: (progress: number, status: string) => void
  ): Promise<PointCloudData> {
    onProgress?.(10, 'Fetching archaeological LiDAR data...');

    // Handle direct downloads from known collections
    const collections = await this.searchLidarCollections({ 
      south: -90, north: 90, west: -180, east: 180 
    });
    
    const collection = collections.find(c => c.id === collectionId);
    if (!collection || !collection.downloadUrl) {
      throw new Error(`Collection ${collectionId} not found or no download URL available`);
    }

    onProgress?.(30, 'Downloading high-resolution data...');

    try {
      // Download the data (this would need to be a proper download service)
      const response = await fetch(collection.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.statusText}`);
      }

      onProgress?.(70, 'Converting to point cloud...');

      // For now, we'll need to convert this via a backend service
      // In a full implementation, you'd either:
      // 1. Convert TIFF to ASCII grid server-side
      // 2. Use a WASM GDAL build to convert client-side  
      // 3. Provide pre-converted ASCII versions

      throw new Error(
        'Direct archaeological LiDAR download requires backend conversion service.\n' +
        'For now, manually download and convert:\n' +
        `1. Download: ${collection.downloadUrl}\n` +
        '2. Convert: gdal_translate -of AAIGrid input.tif output.asc\n' +
        '3. Upload the .asc file using File Upload in the app'
      );

    } catch (error) {
      console.error('Error fetching archaeological LiDAR:', error);
      throw error;
    }
  }

}
