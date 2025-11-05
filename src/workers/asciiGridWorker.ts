/**
 * Web Worker for ASCII Grid Parsing
 * Parses large ASCII grid files in background thread to avoid blocking UI
 */

import type { LiDARPoint } from '../types/lidar';
import { metersPerDegree } from '../utils/geo';

export interface WorkerMessage {
  type: 'parse';
  data: {
    text: string;
    bbox: {
      south: number;
      north: number;
      west: number;
      east: number;
    };
  };
}

export interface WorkerResponse {
  type: 'progress' | 'complete' | 'error';
  data?: {
    points: LiDARPoint[];
    ncols: number;
    nrows: number;
    heightGrid: Float32Array;
    positionsMeters: Float32Array;
    elevationBase: number;
    cellsizeMeters: { lon: number; lat: number };
  };
  progress?: number;
  error?: string;
}

// Worker message handler
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'parse') {
    try {
      parseASCIIGrid(e.data.data.text, e.data.data.bbox);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      self.postMessage(response);
    }
  }
};

function parseASCIIGrid(
  text: string,
  bbox: { south: number; north: number; west: number; east: number }
): void {
  // Send progress update
  const sendProgress = (progress: number) => {
    const response: WorkerResponse = { type: 'progress', progress };
    self.postMessage(response);
  };

  sendProgress(10);

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

  sendProgress(20);

  const points: LiDARPoint[] = [];
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLon = (bbox.east + bbox.west) / 2;
  const mPerDeg = metersPerDegree(centerLat);
  const positionsMeters: number[] = [];
  const heightGrid = new Float32Array(nrows * ncols);

  // Parse elevation data with progress updates
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let row = 0; row < nrows; row++) {
    // Update progress every 10% of rows
    if (row % Math.ceil(nrows / 8) === 0) {
      const progress = 20 + (row / nrows) * 60; // 20% to 80%
      sendProgress(progress);
    }

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

      // Track min/max for normalization
      if (elevation < minZ) minZ = elevation;
      if (elevation > maxZ) maxZ = elevation;

      // Calculate geographic coordinates
      const lon = xllcorner + col * cellsize;
      const lat = yllcorner + (nrows - 1 - row) * cellsize;
      const z = elevation;

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
      positionsMeters.push(east, z, north);
    }
  }

  sendProgress(85);

  if (points.length === 0) {
    throw new Error('No valid elevation data found in the selected region');
  }

  // Shift positions to be relative to base elevation
  const elevationBase = minZ;
  for (let i = 1; i < positionsMeters.length; i += 3) {
    positionsMeters[i] = positionsMeters[i] - elevationBase;
  }

  sendProgress(95);

  // Send complete response
  const response: WorkerResponse = {
    type: 'complete',
    data: {
      points,
      ncols,
      nrows,
      heightGrid,
      positionsMeters: new Float32Array(positionsMeters),
      elevationBase,
      cellsizeMeters: {
        lon: cellsize * mPerDeg.lon,
        lat: cellsize * mPerDeg.lat,
      },
    },
  };

  self.postMessage(response);
  sendProgress(100);
}
