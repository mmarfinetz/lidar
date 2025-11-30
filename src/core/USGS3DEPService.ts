/**
 * USGS 3DEP Service
 * Client-side service for fetching high-resolution elevation data from USGS 3DEP
 *
 * Data sources:
 * - 3DEP Elevation Point Query Service (EPQS) for precise elevations
 * - Web Coverage Service (WCS) for GeoTIFF raster data
 * - National Map TNM API for product discovery
 *
 * Resolution: Up to 1 meter in covered areas (CONUS + territories)
 */

import type { BoundingBox } from './ElevationAPI';
import type { PointCloudData, LiDARPoint } from '../types/lidar';
import { GeoTIFFConverter } from '../utils/GeoTIFFConverter';
import { metersPerDegree } from '../utils/geo';

// API endpoint - uses serverless proxy in production, direct API for testing
const API_BASE = import.meta.env.VITE_USGS_PROXY_URL || '/api/usgs3dep';

// Fallback to direct USGS API (may have CORS issues)
const USGS_EPQS_DIRECT = 'https://epqs.nationalmap.gov/v1/json';

export interface USGS3DEPOptions {
  resolution?: number; // Target resolution in meters (default: 10)
  maxPoints?: number; // Maximum points to return (default: 100000)
  useProxy?: boolean; // Force use of proxy (default: auto-detect)
  format?: 'json' | 'ascii' | 'geotiff'; // Output format
  qualityLevel?: 'QL0' | 'QL1' | 'QL2'; // USGS quality level target
}

export interface USGS3DEPResult {
  data: PointCloudData;
  source: {
    name: string;
    resolution: string;
    method: 'epqs' | 'wcs' | 'proxy';
    qualityLevel?: string;
  };
  fetchTime: number;
  coverage: {
    percentComplete: number;
    noDataPoints: number;
  };
}

export interface USGS3DEPAvailability {
  available: boolean;
  coverage: 'full' | 'partial' | 'none';
  qualityLevel: 'QL0' | 'QL1' | 'QL2' | 'unknown';
  products: Array<{
    title: string;
    resolution: string;
    format: string;
    downloadUrl: string;
    size: number;
  }>;
  message: string;
}

export class USGS3DEPService {
  /**
   * Check if USGS 3DEP data is available for a bounding box
   */
  static async checkAvailability(bbox: BoundingBox): Promise<USGS3DEPAvailability> {
    // Quick check if location is in US coverage area
    if (!this.isInCoverageArea(bbox)) {
      return {
        available: false,
        coverage: 'none',
        qualityLevel: 'unknown',
        products: [],
        message: 'Location is outside USGS 3DEP coverage area (US only)'
      };
    }

    try {
      // Try to query products via proxy
      const response = await fetch(
        `${API_BASE}?action=products&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}`
      );

      if (!response.ok) {
        // Fall back to basic availability check
        return this.basicAvailabilityCheck(bbox);
      }

      const data = await response.json();
      const items = data.items || [];

      if (items.length === 0) {
        return {
          available: true, // EPQS is always available in CONUS
          coverage: 'partial',
          qualityLevel: 'QL2',
          products: [],
          message: 'USGS 3DEP EPQS available (1-10m resolution)'
        };
      }

      // Parse products
      const products = items.slice(0, 10).map((item: Record<string, unknown>) => ({
        title: item.title as string || 'USGS 3DEP',
        resolution: this.parseResolution(item.title as string),
        format: (item.format as string) || 'GeoTIFF',
        downloadUrl: item.downloadURL as string || '',
        size: (item.sizeInBytes as number) || 0
      }));

      // Determine quality level from available products
      const qualityLevel = this.determineQualityLevel(products);

      return {
        available: true,
        coverage: products.length >= 3 ? 'full' : 'partial',
        qualityLevel,
        products,
        message: `USGS 3DEP ${qualityLevel} data available (${products.length} tiles)`
      };

    } catch (error) {
      console.warn('USGS 3DEP availability check failed:', error);
      return this.basicAvailabilityCheck(bbox);
    }
  }

  /**
   * Fetch elevation data for a bounding box
   */
  static async fetchElevation(
    bbox: BoundingBox,
    options: USGS3DEPOptions = {},
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    const startTime = Date.now();

    const {
      resolution = 10,
      maxPoints = 100000,
      useProxy = true
    } = options;

    // Validate bbox is in coverage area
    if (!this.isInCoverageArea(bbox)) {
      console.log('Location outside USGS 3DEP coverage');
      return null;
    }

    // Calculate area and determine best method
    const area = this.calculateAreaKm2(bbox);
    const method = this.selectFetchMethod(area, resolution);

    console.log(`🇺🇸 USGS 3DEP: ${method} method, ${area.toFixed(2)} km², ${resolution}m target`);

    try {
      let result: USGS3DEPResult | null = null;

      switch (method) {
        case 'epqs':
          result = await this.fetchViaEPQS(bbox, resolution, maxPoints, useProxy, onProgress);
          break;

        case 'wcs':
          result = await this.fetchViaWCS(bbox, resolution, maxPoints, onProgress);
          break;

        case 'direct':
          result = await this.fetchViaDirect(bbox, onProgress);
          break;
      }

      if (result) {
        result.fetchTime = Date.now() - startTime;
        console.log(`✅ USGS 3DEP fetched in ${(result.fetchTime / 1000).toFixed(1)}s`);
      }

      return result;

    } catch (error) {
      console.error('USGS 3DEP fetch error:', error);
      onProgress?.(100, 'USGS 3DEP fetch failed');
      return null;
    }
  }

  /**
   * Fetch using Elevation Point Query Service (grid sampling)
   */
  private static async fetchViaEPQS(
    bbox: BoundingBox,
    resolution: number,
    maxPoints: number,
    useProxy: boolean,
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    onProgress?.(5, 'Calculating grid dimensions...');

    // Calculate grid dimensions
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);
    const widthM = (bbox.east - bbox.west) * mpd.lon;
    const heightM = (bbox.north - bbox.south) * mpd.lat;

    let ncols = Math.ceil(widthM / resolution);
    let nrows = Math.ceil(heightM / resolution);

    // Limit to maxPoints
    const totalPoints = ncols * nrows;
    if (totalPoints > maxPoints) {
      const scale = Math.sqrt(maxPoints / totalPoints);
      ncols = Math.floor(ncols * scale);
      nrows = Math.floor(nrows * scale);
    }

    const actualResX = widthM / ncols;
    const actualResY = heightM / nrows;

    console.log(`📊 EPQS grid: ${ncols}x${nrows} = ${ncols * nrows} points`);
    onProgress?.(10, `Querying ${ncols * nrows} elevation points...`);

    if (useProxy) {
      // Use serverless proxy for batch query
      return this.fetchViaProxyGrid(bbox, Math.max(actualResX, actualResY), onProgress);
    }

    // Direct EPQS queries (slower, may have rate limits)
    return this.fetchViaDirectEPQS(bbox, ncols, nrows, actualResX, actualResY, onProgress);
  }

  /**
   * Fetch via proxy grid endpoint
   */
  private static async fetchViaProxyGrid(
    bbox: BoundingBox,
    resolution: number,
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    const url = `${API_BASE}?action=grid&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}&resolution=${resolution}`;

    onProgress?.(20, 'Fetching elevation grid via proxy...');

    const response = await fetch(url);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Proxy error: ${response.status}`);
    }

    onProgress?.(70, 'Processing elevation data...');

    const data = await response.json();
    const { elevations, ncols, nrows, cellsize, nodata } = data;

    // Convert to point cloud
    const points: LiDARPoint[] = [];
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);

    let noDataCount = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let row = 0; row < nrows; row++) {
      for (let col = 0; col < ncols; col++) {
        const elevation = elevations[row]?.[col];

        if (elevation === nodata || elevation === undefined) {
          noDataCount++;
          continue;
        }

        // Calculate position in meters from center
        const lat = bbox.south + (row + 0.5) * (cellsize / 111320);
        const lon = bbox.west + (col + 0.5) * (cellsize / (111320 * Math.cos(lat * Math.PI / 180)));

        const centerLat = (bbox.north + bbox.south) / 2;
        const centerLon = (bbox.east + bbox.west) / 2;

        const x = (lon - centerLon) * mpd.lon;
        const y = (lat - centerLat) * mpd.lat;
        const z = elevation;

        points.push({
          x, y, z,
          intensity: 0,
          classification: 2 // Ground
        });

        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
    }

    onProgress?.(90, 'Building point cloud...');

    // Build point cloud data
    const pointCloud = this.buildPointCloud(points, bbox, minZ, maxZ, ncols, nrows, cellsize);

    onProgress?.(100, 'Complete');

    return {
      data: pointCloud,
      source: {
        name: 'USGS 3DEP EPQS',
        resolution: `${cellsize.toFixed(1)}m`,
        method: 'epqs'
      },
      fetchTime: 0,
      coverage: {
        percentComplete: ((ncols * nrows - noDataCount) / (ncols * nrows)) * 100,
        noDataPoints: noDataCount
      }
    };
  }

  /**
   * Fetch via direct EPQS calls (browser-based, slower)
   */
  private static async fetchViaDirectEPQS(
    bbox: BoundingBox,
    ncols: number,
    nrows: number,
    resX: number,
    resY: number,
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    const points: LiDARPoint[] = [];
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);
    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLon = (bbox.east + bbox.west) / 2;

    let noDataCount = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let completed = 0;
    const total = ncols * nrows;

    // Batch requests (50 at a time with delays)
    const batchSize = 50;
    const coordinates: Array<{ lat: number; lon: number; row: number; col: number }> = [];

    for (let row = 0; row < nrows; row++) {
      for (let col = 0; col < ncols; col++) {
        const lat = bbox.south + (row + 0.5) * (bbox.north - bbox.south) / nrows;
        const lon = bbox.west + (col + 0.5) * (bbox.east - bbox.west) / ncols;
        coordinates.push({ lat, lon, row, col });
      }
    }

    for (let i = 0; i < coordinates.length; i += batchSize) {
      const batch = coordinates.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async ({ lat, lon }) => {
          try {
            const response = await fetch(
              `${USGS_EPQS_DIRECT}?x=${lon}&y=${lat}&units=Meters&output=json`
            );
            if (!response.ok) return null;
            const data = await response.json();
            return data?.value !== -1000000 ? parseFloat(data.value) : null;
          } catch {
            return null;
          }
        })
      );

      // Process results
      results.forEach((elevation, idx) => {
        const { lat, lon } = batch[idx];

        if (elevation === null) {
          noDataCount++;
          return;
        }

        const x = (lon - centerLon) * mpd.lon;
        const y = (lat - centerLat) * mpd.lat;
        const z = elevation;

        points.push({
          x, y, z,
          intensity: 0,
          classification: 2
        });

        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      });

      completed += batch.length;
      const progress = 10 + (completed / total) * 80;
      onProgress?.(progress, `Queried ${completed}/${total} points...`);

      // Rate limit delay
      if (i + batchSize < coordinates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    onProgress?.(90, 'Building point cloud...');

    const cellsize = Math.max(resX, resY);
    const pointCloud = this.buildPointCloud(points, bbox, minZ, maxZ, ncols, nrows, cellsize);

    onProgress?.(100, 'Complete');

    return {
      data: pointCloud,
      source: {
        name: 'USGS 3DEP EPQS (Direct)',
        resolution: `${cellsize.toFixed(1)}m`,
        method: 'epqs'
      },
      fetchTime: 0,
      coverage: {
        percentComplete: ((total - noDataCount) / total) * 100,
        noDataPoints: noDataCount
      }
    };
  }

  /**
   * Fetch via WCS (Web Coverage Service)
   */
  private static async fetchViaWCS(
    bbox: BoundingBox,
    resolution: number,
    maxPoints: number,
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    onProgress?.(10, 'Requesting WCS coverage...');

    // Calculate dimensions based on resolution
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);
    const widthM = (bbox.east - bbox.west) * mpd.lon;
    const heightM = (bbox.north - bbox.south) * mpd.lat;

    let width = Math.ceil(widthM / resolution);
    let height = Math.ceil(heightM / resolution);

    // Limit to reasonable size
    const maxDim = Math.sqrt(maxPoints);
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    // Cap at WCS limits
    width = Math.min(width, 4096);
    height = Math.min(height, 4096);

    const url = `${API_BASE}?action=wcs&bbox=${bbox.west},${bbox.south},${bbox.east},${bbox.north}&width=${width}&height=${height}`;

    onProgress?.(20, `Fetching ${width}x${height} GeoTIFF via WCS...`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`WCS request failed: ${response.status}`);
    }

    onProgress?.(60, 'Converting GeoTIFF to point cloud...');

    const arrayBuffer = await response.arrayBuffer();

    // Use GeoTIFF converter
    const pointCloud = await GeoTIFFConverter.convertToPointCloud(
      arrayBuffer,
      bbox,
      (progress, status) => {
        onProgress?.(60 + progress * 0.4, status);
      }
    );

    return {
      data: pointCloud,
      source: {
        name: 'USGS 3DEP WCS',
        resolution: `${(widthM / width).toFixed(1)}m`,
        method: 'wcs'
      },
      fetchTime: 0,
      coverage: {
        percentComplete: 100,
        noDataPoints: 0
      }
    };
  }

  /**
   * Fetch via direct TNM product download (proxied)
   */
  private static async fetchViaDirect(
    bbox: BoundingBox,
    onProgress?: (progress: number, status: string) => void
  ): Promise<USGS3DEPResult | null> {
    onProgress?.(10, 'Searching for USGS products...');

    // First, find available products
    const availability = await this.checkAvailability(bbox);

    if (!availability.available || availability.products.length === 0) {
      return null;
    }

    // Find best GeoTIFF product
    const geotiffProduct = availability.products.find(p =>
      p.format.toLowerCase().includes('geotiff') || p.format.toLowerCase().includes('tiff')
    );

    if (!geotiffProduct || !geotiffProduct.downloadUrl) {
      console.log('No directly downloadable GeoTIFF found');
      return null;
    }

    onProgress?.(20, 'Downloading USGS GeoTIFF...');

    // Proxy the download
    const proxyUrl = `${API_BASE}?action=proxy&url=${encodeURIComponent(geotiffProduct.downloadUrl)}`;
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    onProgress?.(60, 'Converting GeoTIFF...');

    const arrayBuffer = await response.arrayBuffer();

    const pointCloud = await GeoTIFFConverter.convertToPointCloud(
      arrayBuffer,
      bbox,
      (progress, status) => {
        onProgress?.(60 + progress * 0.4, status);
      }
    );

    return {
      data: pointCloud,
      source: {
        name: 'USGS 3DEP Product',
        resolution: geotiffProduct.resolution,
        method: 'proxy',
        qualityLevel: availability.qualityLevel
      },
      fetchTime: 0,
      coverage: {
        percentComplete: 100,
        noDataPoints: 0
      }
    };
  }

  /**
   * Build PointCloudData from points array
   */
  private static buildPointCloud(
    points: LiDARPoint[],
    bbox: BoundingBox,
    minZ: number,
    maxZ: number,
    ncols: number,
    nrows: number,
    cellsize: number
  ): PointCloudData {
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);
    const widthM = (bbox.east - bbox.west) * mpd.lon;
    const heightM = (bbox.north - bbox.south) * mpd.lat;

    // Calculate bounds
    const halfWidth = widthM / 2;
    const halfHeight = heightM / 2;

    // Build height grid
    const heightGrid = new Float32Array(ncols * nrows);
    heightGrid.fill(-9999);

    for (const point of points) {
      // Convert back to grid indices
      const col = Math.floor((point.x + halfWidth) / cellsize);
      const row = Math.floor((point.y + halfHeight) / cellsize);

      if (col >= 0 && col < ncols && row >= 0 && row < nrows) {
        heightGrid[row * ncols + col] = point.z;
      }
    }

    // Create position arrays
    const positionsMeters = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      positionsMeters[i * 3] = points[i].x;
      positionsMeters[i * 3 + 1] = points[i].z - minZ; // Relative elevation
      positionsMeters[i * 3 + 2] = points[i].y;
    }

    return {
      points,
      bounds: {
        minX: -halfWidth,
        maxX: halfWidth,
        minY: -halfHeight,
        maxY: halfHeight,
        minZ: 0,
        maxZ: maxZ - minZ
      },
      count: points.length,
      hasColor: false,
      hasClassification: true,
      geo: {
        bbox,
        center: {
          lat: (bbox.north + bbox.south) / 2,
          lon: (bbox.east + bbox.west) / 2
        },
        metersPerDegree: mpd,
        elevationBase: minZ,
        positionsMeters,
        grid: {
          ncols,
          nrows,
          dxMeters: cellsize,
          dyMeters: cellsize,
          scale: 1
        },
        heightGrid
      }
    };
  }

  // ============ Helper Methods ============

  /**
   * Check if bbox is in USGS coverage area
   */
  static isInCoverageArea(bbox: BoundingBox): boolean {
    const regions = [
      // Continental US
      { south: 24.5, north: 49.4, west: -125.0, east: -66.9 },
      // Alaska
      { south: 54.0, north: 71.4, west: -179.9, east: -129.9 },
      // Hawaii
      { south: 18.9, north: 22.2, west: -160.3, east: -154.8 },
      // Puerto Rico & USVI
      { south: 17.5, north: 18.6, west: -68.0, east: -64.5 },
      // Guam
      { south: 13.2, north: 13.7, west: 144.6, east: 145.0 },
      // American Samoa
      { south: -14.4, north: -14.2, west: -170.9, east: -169.4 }
    ];

    return regions.some(region =>
      bbox.south < region.north && bbox.north > region.south &&
      bbox.west < region.east && bbox.east > region.west
    );
  }

  /**
   * Calculate area in km²
   */
  private static calculateAreaKm2(bbox: BoundingBox): number {
    const mpd = metersPerDegree((bbox.north + bbox.south) / 2);
    const widthM = (bbox.east - bbox.west) * mpd.lon;
    const heightM = (bbox.north - bbox.south) * mpd.lat;
    return (widthM * heightM) / 1_000_000;
  }

  /**
   * Select best fetch method based on area and resolution
   */
  private static selectFetchMethod(areaKm2: number, resolution: number): 'epqs' | 'wcs' | 'direct' {
    // For small areas with high resolution, use EPQS
    if (areaKm2 < 1 && resolution <= 10) {
      return 'epqs';
    }

    // For medium areas, try WCS
    if (areaKm2 < 25) {
      return 'wcs';
    }

    // For larger areas, try direct product download
    return 'direct';
  }

  /**
   * Basic availability check without API call
   */
  private static basicAvailabilityCheck(bbox: BoundingBox): USGS3DEPAvailability {
    if (this.isInCoverageArea(bbox)) {
      return {
        available: true,
        coverage: 'partial',
        qualityLevel: 'QL2',
        products: [],
        message: 'USGS 3DEP likely available (EPQS fallback)'
      };
    }

    return {
      available: false,
      coverage: 'none',
      qualityLevel: 'unknown',
      products: [],
      message: 'Outside USGS 3DEP coverage area'
    };
  }

  /**
   * Parse resolution from product title
   */
  private static parseResolution(title: string): string {
    if (!title) return 'unknown';

    if (title.includes('1 meter') || title.includes('1m')) return '1m';
    if (title.includes('1/3') || title.includes('10 meter')) return '10m';
    if (title.includes('1/9') || title.includes('3 meter')) return '3m';
    if (title.includes('1 arc-second')) return '30m';

    return 'varies';
  }

  /**
   * Determine quality level from available products
   */
  private static determineQualityLevel(
    products: Array<{ resolution: string }>
  ): 'QL0' | 'QL1' | 'QL2' {
    // QL0 = highest quality (0.5m), QL1 = 1m, QL2 = 2m (minimum standard)
    const has1m = products.some(p => p.resolution === '1m');
    const has3m = products.some(p => p.resolution === '3m');

    if (has1m) return 'QL1';
    if (has3m) return 'QL2';
    return 'QL2'; // Default to minimum standard
  }
}
