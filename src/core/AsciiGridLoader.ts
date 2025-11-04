/**
 * ASCII Grid Loader (AAIGrid .asc)
 * Produces a DEM grid PointCloudData-compatible object that LayerManager can render as a surface.
 */

import type { PointCloudData, LiDARPoint } from '../types/lidar';
import { calculateBounds } from '../utils/spatial';
import { metersPerDegree } from '../utils/geo';

export async function loadAsciiGrid(file: File): Promise<PointCloudData> {
  const text = await file.text();
  const lines = text.trim().split('\n');

  // Parse header
  const header: Record<string, number> = {};
  let dataStartLine = 0;

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    const parts = line.split(/\s+/);
    if (parts.length === 2) {
      header[parts[0].toLowerCase()] = parseFloat(parts[1]);
      dataStartLine = i + 1;
    } else {
      break;
    }
  }

  const ncols = header['ncols'] || 0;
  const nrows = header['nrows'] || 0;
  const xllcorner = header['xllcorner'] ?? header['xllcenter'];
  const yllcorner = header['yllcorner'] ?? header['yllcenter'];
  const cellsize = header['cellsize'] || 0;
  const nodata = header['nodata_value'] ?? -9999;

  if (!ncols || !nrows || xllcorner === undefined || yllcorner === undefined || !cellsize) {
    throw new Error('Invalid ASCII Grid header');
  }

  const west = xllcorner;
  const south = yllcorner;
  const east = west + ncols * cellsize;
  const north = south + nrows * cellsize;

  const centerLat = (north + south) / 2;
  const centerLon = (east + west) / 2;
  const mPerDeg = metersPerDegree(centerLat);

  // Build points and height grid
  const points: LiDARPoint[] = [];
  const heightGrid = new Float32Array(nrows * ncols);
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < nrows; row++) {
    const lineIndex = dataStartLine + row;
    if (lineIndex >= lines.length) break;
    const values = lines[lineIndex].trim().split(/\s+/).map(Number);

    for (let col = 0; col < Math.min(values.length, ncols); col++) {
      const elevation = values[col];
      const idx = row * ncols + col;
      if (elevation === nodata || isNaN(elevation)) {
        heightGrid[idx] = Number.NaN;
        continue;
      }
      heightGrid[idx] = elevation;
      if (elevation < minZ) minZ = elevation;
      if (elevation > maxZ) maxZ = elevation;

      // Store geographic positions initially; we will normalize below for rendering
      const lon = west + col * cellsize;
      const lat = south + (nrows - 1 - row) * cellsize;
      points.push({ x: lon, y: lat, z: elevation, classification: 2 });
    }
  }

  if (points.length === 0) {
    throw new Error('No valid elevation samples in ASCII Grid');
  }

  // Normalize to Z-up world in meters
  const rangeEastMeters = (east - west) * mPerDeg.lon;
  const rangeNorthMeters = (north - south) * mPerDeg.lat;
  const rangeUpMeters = maxZ - minZ;
  const maxRangeMeters = Math.max(rangeEastMeters, rangeNorthMeters, rangeUpMeters || 1);
  const scale = 10 / (maxRangeMeters || 1);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const eastM = (p.x - centerLon) * mPerDeg.lon;
    const northM = (p.y - centerLat) * mPerDeg.lat;
    const upM = (p.z - minZ);
    p.x = eastM * scale;
    p.y = northM * scale;
    p.z = upM * scale;
  }

  const bounds = calculateBounds(points);

  return {
    points,
    bounds,
    count: points.length,
    hasColor: false,
    hasClassification: true,
    geo: {
      bbox: { south, north, west, east },
      center: { lat: centerLat, lon: centerLon },
      metersPerDegree: mPerDeg,
      elevationBase: minZ,
      positionsMeters: undefined,
      grid: {
        ncols,
        nrows,
        dxMeters: cellsize * mPerDeg.lon,
        dyMeters: cellsize * mPerDeg.lat,
        scale,
      },
      heightGrid,
    },
  };
}

