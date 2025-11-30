/**
 * Terrain Tiles Service
 * Fetches high-resolution elevation data from various terrain tile sources
 * Supports AWS Terrain Tiles, Mapbox Terrain-RGB, and more
 */

import type { BoundingBox } from './ElevationAPI';
import type { PointCloudData, LiDARPoint } from '../types/lidar';
import { calculateBounds } from '../utils/spatial';
import { metersPerDegree } from '../utils/geo';

export interface TileSource {
  id: string;
  name: string;
  urlTemplate: string;
  maxZoom: number;
  tileSize: number;
  encoding: 'terrarium' | 'mapbox' | 'raw';
  attribution: string;
  requiresApiKey: boolean;
}

export const TILE_SOURCES: Record<string, TileSource> = {
  aws: {
    id: 'aws',
    name: 'AWS Terrain Tiles',
    urlTemplate: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    maxZoom: 15,
    tileSize: 256,
    encoding: 'terrarium',
    attribution: 'AWS Open Data',
    requiresApiKey: false
  },
  maptiler: {
    id: 'maptiler',
    name: 'MapTiler Terrain',
    urlTemplate: 'https://api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png?key={apiKey}',
    maxZoom: 12,
    tileSize: 256,
    encoding: 'mapbox',
    attribution: 'MapTiler',
    requiresApiKey: true
  },
  nextzen: {
    id: 'nextzen',
    name: 'Nextzen Terrain',
    urlTemplate: 'https://tile.nextzen.org/tilezen/terrain/v1/256/terrarium/{z}/{x}/{y}.png?api_key={apiKey}',
    maxZoom: 14,
    tileSize: 256,
    encoding: 'terrarium',
    attribution: 'Nextzen',
    requiresApiKey: true
  }
};

export class TerrainTilesService {

  /**
   * Calculate optimal zoom level for a bounding box
   */
  static calculateOptimalZoom(bbox: BoundingBox, targetResolutionMeters: number = 10): number {
    const latDiff = bbox.north - bbox.south;
    const lonDiff = bbox.east - bbox.west;
    const centerLat = (bbox.north + bbox.south) / 2;

    // Width in meters at the center latitude
    const widthMeters = lonDiff * metersPerDegree(centerLat).lon;
    const heightMeters = latDiff * metersPerDegree(centerLat).lat;
    const regionSize = Math.max(widthMeters, heightMeters);

    // At zoom level z, each pixel covers approximately:
    // groundResolution = 156543.03392 * cos(lat) / (2^z)
    // For 256px tiles, tile width in meters = 256 * groundResolution

    // We want enough pixels to match our target resolution
    const pixelsNeeded = regionSize / targetResolutionMeters;

    // Calculate zoom to get approximately the right number of pixels
    // Each zoom level doubles the resolution
    let zoom = Math.ceil(Math.log2(pixelsNeeded / 256));

    // Clamp to reasonable values
    return Math.max(8, Math.min(15, zoom));
  }

  /**
   * Convert latitude/longitude to tile coordinates
   */
  static latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y };
  }

  /**
   * Convert tile coordinates to bounding box
   */
  static tileToBBox(x: number, y: number, zoom: number): BoundingBox {
    const n = Math.pow(2, zoom);
    const west = x / n * 360 - 180;
    const east = (x + 1) / n * 360 - 180;
    const north = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const south = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
    return { south, north, west, east };
  }

  /**
   * Get all tiles needed to cover a bounding box at a specific zoom
   */
  static getTilesForBBox(bbox: BoundingBox, zoom: number): Array<{ x: number; y: number; z: number }> {
    const topLeft = this.latLonToTile(bbox.north, bbox.west, zoom);
    const bottomRight = this.latLonToTile(bbox.south, bbox.east, zoom);

    const tiles: Array<{ x: number; y: number; z: number }> = [];

    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        tiles.push({ x, y, z: zoom });
      }
    }

    return tiles;
  }

  /**
   * Decode Terrarium encoding (AWS Terrain Tiles)
   * elevation = (R * 256 + G + B / 256) - 32768
   */
  static decodeTerrarium(r: number, g: number, b: number): number {
    return (r * 256 + g + b / 256) - 32768;
  }

  /**
   * Decode Mapbox Terrain-RGB encoding
   * elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
   */
  static decodeMapbox(r: number, g: number, b: number): number {
    return -10000 + (r * 256 * 256 + g * 256 + b) * 0.1;
  }

  /**
   * Fetch and decode a single terrain tile
   */
  static async fetchTile(
    source: TileSource,
    x: number,
    y: number,
    z: number,
    apiKey?: string
  ): Promise<ImageData | null> {
    try {
      let url = source.urlTemplate
        .replace('{z}', z.toString())
        .replace('{x}', x.toString())
        .replace('{y}', y.toString());

      if (source.requiresApiKey && apiKey) {
        url = url.replace('{apiKey}', apiKey);
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to fetch tile ${z}/${x}/${y}: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      // Draw to canvas to get pixel data
      const canvas = new OffscreenCanvas(source.tileSize, source.tileSize);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(imageBitmap, 0, 0);
      return ctx.getImageData(0, 0, source.tileSize, source.tileSize);

    } catch (error) {
      console.warn(`Error fetching tile ${z}/${x}/${y}:`, error);
      return null;
    }
  }

  /**
   * Fetch high-resolution terrain data for a bounding box
   */
  static async fetchTerrainData(
    bbox: BoundingBox,
    sourceId: string = 'aws',
    onProgress?: (progress: number, status: string) => void
  ): Promise<PointCloudData | null> {
    const source = TILE_SOURCES[sourceId];
    if (!source) {
      console.error(`Unknown terrain source: ${sourceId}`);
      return null;
    }

    // Get API key if needed
    let apiKey: string | undefined;
    if (source.requiresApiKey) {
      apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
      if (!apiKey) {
        console.warn(`API key required for ${source.name}`);
        return null;
      }
    }

    onProgress?.(5, `Calculating optimal resolution...`);

    // Calculate optimal zoom for small areas (target ~5m resolution for detailed analysis)
    const zoom = this.calculateOptimalZoom(bbox, 5);
    const tiles = this.getTilesForBBox(bbox, zoom);

    console.log(`Fetching ${tiles.length} tiles at zoom ${zoom} from ${source.name}`);
    onProgress?.(10, `Fetching ${tiles.length} terrain tiles at zoom ${zoom}...`);

    // Limit tiles for performance (max 16 tiles = 4x4 grid)
    if (tiles.length > 16) {
      console.warn(`Too many tiles (${tiles.length}), reducing zoom level`);
      return this.fetchTerrainData(bbox, sourceId, onProgress);
    }

    // Fetch all tiles in parallel
    const tilePromises = tiles.map(async (tile, index) => {
      const imageData = await this.fetchTile(source, tile.x, tile.y, tile.z, apiKey);
      onProgress?.(10 + (index / tiles.length) * 60, `Fetching tile ${index + 1}/${tiles.length}...`);
      return { tile, imageData };
    });

    const tileResults = await Promise.all(tilePromises);

    onProgress?.(70, 'Processing elevation data...');

    // Collect all points from all tiles
    const points: LiDARPoint[] = [];
    const positionsMeters: number[] = [];

    const centerLat = (bbox.north + bbox.south) / 2;
    const centerLon = (bbox.east + bbox.west) / 2;
    const mPerDeg = metersPerDegree(centerLat);

    // Track min/max elevation for normalization
    let minElevation = Infinity;
    let maxElevation = -Infinity;

    for (const { tile, imageData } of tileResults) {
      if (!imageData) continue;

      const tileBBox = this.tileToBBox(tile.x, tile.y, tile.z);
      const latStep = (tileBBox.north - tileBBox.south) / source.tileSize;
      const lonStep = (tileBBox.east - tileBBox.west) / source.tileSize;

      // Sample every Nth pixel for performance (adjust based on zoom)
      const sampleRate = zoom >= 14 ? 2 : 1;

      for (let py = 0; py < source.tileSize; py += sampleRate) {
        for (let px = 0; px < source.tileSize; px += sampleRate) {
          const idx = (py * source.tileSize + px) * 4;
          const r = imageData.data[idx];
          const g = imageData.data[idx + 1];
          const b = imageData.data[idx + 2];

          // Decode elevation based on encoding type
          let elevation: number;
          if (source.encoding === 'terrarium') {
            elevation = this.decodeTerrarium(r, g, b);
          } else if (source.encoding === 'mapbox') {
            elevation = this.decodeMapbox(r, g, b);
          } else {
            elevation = r; // Raw grayscale
          }

          // Skip invalid elevations
          if (elevation < -500 || elevation > 9000 || isNaN(elevation)) continue;

          // Calculate geographic coordinates
          const lon = tileBBox.west + px * lonStep;
          const lat = tileBBox.north - py * latStep;

          // Only include points within the requested bbox
          if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) continue;

          minElevation = Math.min(minElevation, elevation);
          maxElevation = Math.max(maxElevation, elevation);

          points.push({
            x: lon,
            y: lat,
            z: elevation,
            classification: 2, // Ground
            intensity: Math.abs(elevation) * 10
          });

          // Store meter positions
          const east = (lon - centerLon) * mPerDeg.lon;
          const north = (lat - centerLat) * mPerDeg.lat;
          positionsMeters.push(east, elevation, north);
        }
      }
    }

    if (points.length === 0) {
      console.warn('No valid elevation data found');
      return null;
    }

    onProgress?.(85, `Processing ${points.length.toLocaleString()} points...`);

    // Normalize coordinates to unit space
    const rangeEastMeters = (bbox.east - bbox.west) * mPerDeg.lon;
    const rangeNorthMeters = (bbox.north - bbox.south) * mPerDeg.lat;
    const rangeUpMeters = maxElevation - minElevation;
    const maxRangeMeters = Math.max(rangeEastMeters, rangeNorthMeters, rangeUpMeters || 1);
    const scale = 10 / (maxRangeMeters || 1);

    const elevationBase = minElevation;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const east = (p.x - centerLon) * mPerDeg.lon;
      const north = (p.y - centerLat) * mPerDeg.lat;
      const up = p.z - elevationBase;

      p.x = east * scale;
      p.y = north * scale;
      p.z = up * scale;
    }

    // Update meter positions for normalized elevations
    for (let i = 1; i < positionsMeters.length; i += 3) {
      positionsMeters[i] = positionsMeters[i] - elevationBase;
    }

    const normalizedBounds = calculateBounds(points);

    onProgress?.(100, `Loaded ${points.length.toLocaleString()} points from ${source.name}`);

    console.log(`✅ Loaded ${points.length} points from ${source.name} at zoom ${zoom}`);

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
        positionsMeters: new Float32Array(positionsMeters)
      }
    };
  }

  /**
   * Check if terrain tiles are available for a region
   */
  static async checkAvailability(_bbox: BoundingBox, sourceId: string = 'aws'): Promise<boolean> {
    const source = TILE_SOURCES[sourceId];
    if (!source) return false;

    // AWS tiles are always available globally
    if (sourceId === 'aws') return true;

    // Check if API key is available for sources that need it
    if (source.requiresApiKey) {
      const apiKey = import.meta.env.VITE_MAPTILER_API_KEY;
      return !!apiKey;
    }

    return true;
  }

  /**
   * Get resolution information for a zoom level
   */
  static getResolutionAtZoom(zoom: number, lat: number): number {
    // Ground resolution in meters per pixel
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  }

  /**
   * Estimate resolution for a bounding box
   */
  static estimateResolution(bbox: BoundingBox): {
    zoomLevel: number;
    resolution: string;
    metersPerPixel: number;
  } {
    const zoom = this.calculateOptimalZoom(bbox, 5);
    const centerLat = (bbox.north + bbox.south) / 2;
    const metersPerPixel = this.getResolutionAtZoom(zoom, centerLat);

    let resolution: string;
    if (metersPerPixel <= 5) {
      resolution = `~${Math.round(metersPerPixel)}m (high detail)`;
    } else if (metersPerPixel <= 15) {
      resolution = `~${Math.round(metersPerPixel)}m (medium detail)`;
    } else {
      resolution = `~${Math.round(metersPerPixel)}m`;
    }

    return { zoomLevel: zoom, resolution, metersPerPixel };
  }
}
