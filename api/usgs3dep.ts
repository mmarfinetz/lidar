/**
 * USGS 3DEP API Proxy
 * Serverless function to proxy requests to USGS 3DEP services
 * Bypasses CORS restrictions for browser-based elevation data fetching
 *
 * Supports:
 * - Elevation Point Query Service (EPQS) for single points
 * - Grid-based elevation queries for small areas
 * - WCS (Web Coverage Service) for raster data
 * - Direct GeoTIFF tile proxying
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// USGS 3DEP Service Endpoints
const USGS_EPQS_API = 'https://epqs.nationalmap.gov/v1/json';
const USGS_WCS_BASE = 'https://elevation.nationalmap.gov/arcgis/services/3DEPElevation/ImageServer/WCSServer';
const USGS_TNM_API = 'https://tnmaccess.nationalmap.gov/api/v1/products';

// Rate limiting: max 100 requests per minute per IP
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100;
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

interface ElevationPoint {
  lat: number;
  lon: number;
  elevation: number | null;
}

/**
 * Query elevation for a single point using EPQS
 */
async function queryElevationPoint(lat: number, lon: number): Promise<number | null> {
  const params = new URLSearchParams({
    x: lon.toString(),
    y: lat.toString(),
    units: 'Meters',
    output: 'json'
  });

  const response = await fetch(`${USGS_EPQS_API}?${params}`);

  if (!response.ok) {
    throw new Error(`EPQS error: ${response.status}`);
  }

  const data = await response.json();

  // EPQS returns elevation in the value field
  const elevation = data?.value;
  if (elevation === undefined || elevation === -1000000) {
    return null; // No data available
  }

  return parseFloat(elevation);
}

/**
 * Query elevations for a grid of points
 * Creates a regular grid within the bounding box
 */
async function queryElevationGrid(
  west: number,
  south: number,
  east: number,
  north: number,
  resolution: number = 1 // meters
): Promise<{
  elevations: number[][];
  ncols: number;
  nrows: number;
  cellsize: number;
  nodata: number;
}> {
  // Calculate grid dimensions
  const latRange = north - south;
  const lonRange = east - west;

  // Convert resolution from meters to degrees (approximate)
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos((north + south) / 2 * Math.PI / 180);

  const cellSizeLat = resolution / metersPerDegreeLat;
  const cellSizeLon = resolution / metersPerDegreeLon;

  const nrows = Math.min(Math.ceil(latRange / cellSizeLat), 1000); // Max 1000 rows
  const ncols = Math.min(Math.ceil(lonRange / cellSizeLon), 1000); // Max 1000 cols

  // Limit total points for performance
  const maxPoints = 10000;
  const totalPoints = nrows * ncols;

  let step = 1;
  if (totalPoints > maxPoints) {
    step = Math.ceil(Math.sqrt(totalPoints / maxPoints));
  }

  const actualRows = Math.ceil(nrows / step);
  const actualCols = Math.ceil(ncols / step);

  console.log(`📊 Creating elevation grid: ${actualCols}x${actualRows} points (step=${step})`);

  // Query points in parallel batches
  const batchSize = 50; // Query 50 points at a time
  const elevations: number[][] = [];

  for (let row = 0; row < actualRows; row++) {
    const rowElevations: number[] = [];
    const lat = south + (row * step * cellSizeLat) + (cellSizeLat / 2);

    // Process columns in batches
    const colBatches: Promise<number | null>[] = [];

    for (let col = 0; col < actualCols; col++) {
      const lon = west + (col * step * cellSizeLon) + (cellSizeLon / 2);
      colBatches.push(queryElevationPoint(lat, lon));

      // Execute batch when full or at end
      if (colBatches.length >= batchSize || col === actualCols - 1) {
        const results = await Promise.all(colBatches);
        rowElevations.push(...results.map(e => e ?? -9999));
        colBatches.length = 0;

        // Small delay to avoid overwhelming the API
        if (col < actualCols - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }

    elevations.push(rowElevations);
  }

  return {
    elevations,
    ncols: actualCols,
    nrows: actualRows,
    cellsize: resolution * step,
    nodata: -9999
  };
}

/**
 * Fetch GeoTIFF data via WCS (Web Coverage Service)
 */
async function fetchWCSCoverage(
  west: number,
  south: number,
  east: number,
  north: number,
  width: number = 512,
  height: number = 512
): Promise<ArrayBuffer> {
  // Build WCS GetCoverage request
  const params = new URLSearchParams({
    SERVICE: 'WCS',
    VERSION: '1.1.1',
    REQUEST: 'GetCoverage',
    IDENTIFIER: '3DEPElevation',
    FORMAT: 'GeoTIFF',
    BOUNDINGBOX: `${south},${west},${north},${east},urn:ogc:def:crs:EPSG::4326`,
    WIDTH: width.toString(),
    HEIGHT: height.toString()
  });

  console.log(`🗺️ Fetching WCS coverage: ${width}x${height}`);

  const response = await fetch(`${USGS_WCS_BASE}?${params}`, {
    headers: {
      'Accept': 'image/tiff, application/octet-stream'
    }
  });

  if (!response.ok) {
    throw new Error(`WCS error: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Proxy a direct GeoTIFF download from USGS
 */
async function proxyGeoTIFFDownload(url: string): Promise<ArrayBuffer> {
  // Validate URL is from USGS domain
  const allowedDomains = [
    'prd-tnm.s3.amazonaws.com',
    'rockyweb.usgs.gov',
    'elevation.nationalmap.gov',
    'tnmaccess.nationalmap.gov'
  ];

  const urlObj = new URL(url);
  if (!allowedDomains.some(domain => urlObj.hostname.endsWith(domain))) {
    throw new Error('URL not from allowed USGS domain');
  }

  console.log(`📥 Proxying GeoTIFF from: ${urlObj.hostname}`);

  const response = await fetch(url, {
    headers: {
      'Accept': 'image/tiff, application/octet-stream',
      'User-Agent': 'LiDAR-Scan/1.0 (Archaeological Research Tool)'
    }
  });

  if (!response.ok) {
    throw new Error(`Download error: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Convert elevation grid to ASCII Grid format
 */
function gridToASCII(
  elevations: number[][],
  west: number,
  south: number,
  cellsize: number,
  nodata: number
): string {
  const nrows = elevations.length;
  const ncols = elevations[0]?.length || 0;

  let ascii = '';
  ascii += `ncols ${ncols}\n`;
  ascii += `nrows ${nrows}\n`;
  ascii += `xllcorner ${west}\n`;
  ascii += `yllcorner ${south}\n`;
  ascii += `cellsize ${cellsize / 111320}\n`; // Convert meters back to degrees
  ascii += `NODATA_value ${nodata}\n`;

  // Write data rows (from north to south)
  for (let row = nrows - 1; row >= 0; row--) {
    ascii += elevations[row].map(e => e.toFixed(2)).join(' ') + '\n';
  }

  return ascii;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limiting
  const clientIP = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  }

  try {
    const { action, bbox, resolution, url, lat, lon, width, height, format } = req.query;

    switch (action) {
      case 'point': {
        // Single point elevation query
        if (!lat || !lon) {
          return res.status(400).json({ error: 'Missing lat/lon parameters' });
        }

        const elevation = await queryElevationPoint(
          parseFloat(lat as string),
          parseFloat(lon as string)
        );

        return res.status(200).json({
          lat: parseFloat(lat as string),
          lon: parseFloat(lon as string),
          elevation,
          source: 'USGS 3DEP',
          resolution: '1m'
        });
      }

      case 'grid': {
        // Grid-based elevation query
        if (!bbox) {
          return res.status(400).json({ error: 'Missing bbox parameter (west,south,east,north)' });
        }

        const [west, south, east, north] = (bbox as string).split(',').map(parseFloat);

        // Validate bbox
        if ([west, south, east, north].some(isNaN)) {
          return res.status(400).json({ error: 'Invalid bbox format' });
        }

        // Limit area size (max ~25 km²)
        const areaKm2 = (north - south) * 111 * (east - west) * 111 * Math.cos((north + south) / 2 * Math.PI / 180);
        if (areaKm2 > 25) {
          return res.status(400).json({
            error: 'Area too large. Maximum area is 25 km² for grid queries.',
            areaKm2
          });
        }

        const res_meters = parseFloat(resolution as string) || 10; // Default 10m resolution
        const gridData = await queryElevationGrid(west, south, east, north, res_meters);

        if ((format as string) === 'ascii') {
          // Return ASCII Grid format
          const ascii = gridToASCII(gridData.elevations, west, south, gridData.cellsize, gridData.nodata);
          res.setHeader('Content-Type', 'text/plain');
          res.setHeader('Content-Disposition', 'attachment; filename="elevation.asc"');
          return res.status(200).send(ascii);
        }

        return res.status(200).json({
          ...gridData,
          bbox: { west, south, east, north },
          source: 'USGS 3DEP EPQS',
          actualResolution: `${gridData.cellsize}m`
        });
      }

      case 'wcs': {
        // WCS coverage request
        if (!bbox) {
          return res.status(400).json({ error: 'Missing bbox parameter' });
        }

        const [west, south, east, north] = (bbox as string).split(',').map(parseFloat);
        const w = parseInt(width as string) || 512;
        const h = parseInt(height as string) || 512;

        const tiffData = await fetchWCSCoverage(west, south, east, north, w, h);

        res.setHeader('Content-Type', 'image/tiff');
        res.setHeader('Content-Disposition', 'attachment; filename="elevation.tif"');
        return res.status(200).send(Buffer.from(tiffData));
      }

      case 'proxy': {
        // Proxy a direct GeoTIFF download
        if (!url) {
          return res.status(400).json({ error: 'Missing url parameter' });
        }

        const tiffData = await proxyGeoTIFFDownload(url as string);

        res.setHeader('Content-Type', 'image/tiff');
        res.setHeader('Content-Disposition', 'attachment; filename="elevation.tif"');
        return res.status(200).send(Buffer.from(tiffData));
      }

      case 'products': {
        // Query available USGS products (proxy to TNM API)
        if (!bbox) {
          return res.status(400).json({ error: 'Missing bbox parameter' });
        }

        const params = new URLSearchParams({
          bbox: bbox as string,
          prodFormats: 'GeoTIFF,LAZ',
          datasets: '3D Elevation Program (3DEP) - 1 meter DEM',
          max: '50',
          outputFormat: 'JSON'
        });

        const response = await fetch(`${USGS_TNM_API}?${params}`);

        if (!response.ok) {
          throw new Error(`TNM API error: ${response.status}`);
        }

        const data = await response.json();
        return res.status(200).json(data);
      }

      default:
        return res.status(400).json({
          error: 'Invalid action',
          validActions: ['point', 'grid', 'wcs', 'proxy', 'products'],
          usage: {
            point: '/api/usgs3dep?action=point&lat=40.0&lon=-105.0',
            grid: '/api/usgs3dep?action=grid&bbox=-105.1,40.0,-105.0,40.1&resolution=10',
            wcs: '/api/usgs3dep?action=wcs&bbox=-105.1,40.0,-105.0,40.1&width=512&height=512',
            proxy: '/api/usgs3dep?action=proxy&url=<usgs-geotiff-url>',
            products: '/api/usgs3dep?action=products&bbox=-105.1,40.0,-105.0,40.1'
          }
        });
    }

  } catch (error) {
    console.error('Error in USGS 3DEP proxy:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
