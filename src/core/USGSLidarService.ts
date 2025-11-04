/**
 * USGS LiDAR Service
 * Real integration with USGS National Map API for high-resolution LiDAR
 */

import type { BoundingBox } from './ElevationAPI';

export interface USGSProduct {
  title: string;
  sourceId: string;
  downloadURL: string;
  format: string;
  lastUpdate: string;
  resolution: string;
  size: number;
  bbox: BoundingBox;
}

export interface USGSLidarAvailability {
  hasPointClouds: boolean;
  hasDEM: boolean;
  products: USGSProduct[];
  totalSize: number;
  coverage: 'full' | 'partial' | 'none';
}

export class USGSLidarService {
  private static readonly USGS_API_BASE = 'https://tnmaccess.nationalmap.gov/api/v1/products';
  
  /**
   * Check if location is within US boundaries (approximate)
   */
  static isWithinUS(bbox: BoundingBox): boolean {
    // Continental US, Alaska, Hawaii, Puerto Rico bounds (approximate)
    const usBounds = [
      // Continental US
      { south: 24.5, north: 49.4, west: -125.0, east: -66.9 },
      // Alaska
      { south: 54.0, north: 71.4, west: -179.1, east: -129.9 },
      // Hawaii
      { south: 18.9, north: 22.2, west: -160.3, east: -154.8 },
      // Puerto Rico
      { south: 17.9, north: 18.5, west: -67.3, east: -65.2 }
    ];

    return usBounds.some(region =>
      bbox.south < region.north && bbox.north > region.south &&
      bbox.west < region.east && bbox.east > region.west
    );
  }

  /**
   * Query USGS National Map API for LiDAR data availability
   */
  static async checkLidarAvailability(bbox: BoundingBox): Promise<USGSLidarAvailability> {
    if (!this.isWithinUS(bbox)) {
      return {
        hasPointClouds: false,
        hasDEM: false,
        products: [],
        totalSize: 0,
        coverage: 'none'
      };
    }

    try {
      // Query for LiDAR point clouds (LAZ format)
      const pointCloudParams = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        prodFormats: 'LAZ',
        datasets: 'National Elevation Dataset (NED) 1/3 arc-second,National Elevation Dataset (NED) 1/9 arc-second',
        max: '50',
        outputFormat: 'JSON'
      });

      // Query for high-resolution DEMs
      const demParams = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        prodFormats: 'GeoTIFF',
        datasets: '3D Elevation Program (3DEP) - 1 meter DEM',
        max: '50',
        outputFormat: 'JSON'
      });

      console.log('🌍 Checking USGS LiDAR availability...');

      const [pointCloudResponse, demResponse] = await Promise.all([
        fetch(`${this.USGS_API_BASE}?${pointCloudParams}`),
        fetch(`${this.USGS_API_BASE}?${demParams}`)
      ]);

      const pointCloudData = pointCloudResponse.ok ? await pointCloudResponse.json() : { items: [] };
      const demData = demResponse.ok ? await demResponse.json() : { items: [] };

      const allProducts: USGSProduct[] = [];

      // Process point cloud results
      if (pointCloudData.items) {
        for (const item of pointCloudData.items) {
          allProducts.push({
            title: item.title || 'USGS LiDAR Point Cloud',
            sourceId: item.sourceId || 'unknown',
            downloadURL: item.downloadURL || '',
            format: 'LAZ',
            lastUpdate: item.lastUpdated || '',
            resolution: '1-2m',
            size: item.sizeInBytes || 0,
            bbox: this.parseBbox(item.bbox) || bbox
          });
        }
      }

      // Process DEM results
      if (demData.items) {
        for (const item of demData.items) {
          allProducts.push({
            title: item.title || 'USGS 1m DEM',
            sourceId: item.sourceId || 'unknown',
            downloadURL: item.downloadURL || '',
            format: 'GeoTIFF',
            lastUpdate: item.lastUpdated || '',
            resolution: '1m',
            size: item.sizeInBytes || 0,
            bbox: this.parseBbox(item.bbox) || bbox
          });
        }
      }

      const hasPointClouds = allProducts.some(p => p.format === 'LAZ');
      const hasDEM = allProducts.some(p => p.format === 'GeoTIFF');
      const totalSize = allProducts.reduce((sum, p) => sum + p.size, 0);

      // Determine coverage based on number of products found
      let coverage: 'full' | 'partial' | 'none' = 'none';
      if (allProducts.length > 0) {
        coverage = allProducts.length >= 5 ? 'full' : 'partial';
      }

      console.log(`📊 USGS LiDAR check complete: ${allProducts.length} products found`);

      return {
        hasPointClouds,
        hasDEM,
        products: allProducts.slice(0, 10), // Limit to first 10 products
        totalSize,
        coverage
      };

    } catch (error) {
      console.warn('Error checking USGS LiDAR availability:', error);
      return {
        hasPointClouds: false,
        hasDEM: false,
        products: [],
        totalSize: 0,
        coverage: 'none'
      };
    }
  }

  /**
   * Parse bounding box string from USGS API response
   */
  private static parseBbox(bboxString?: string): BoundingBox | null {
    if (!bboxString) return null;
    
    try {
      const coords = bboxString.split(',').map(Number);
      if (coords.length === 4) {
        return {
          west: coords[0],
          south: coords[1],
          east: coords[2],
          north: coords[3]
        };
      }
    } catch (error) {
      console.warn('Failed to parse bbox:', bboxString);
    }
    
    return null;
  }

  /**
   * Estimate point density for USGS 3DEP data
   * USGS Quality Level 2 (QL2) = 2 points/m² minimum
   * USGS Quality Level 1 (QL1) = 8 points/m² minimum
   * USGS Quality Level 0 (QL0) = 35+ points/m² minimum
   */
  static estimateUSGSPointDensity(bbox: BoundingBox): number {
    const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
    const areaM2 = area * 111320 * 111320; // Convert deg² to m² (approximate)
    
    // Assume average QL2 specification (2 points/m²)
    // Many areas have higher density
    return Math.floor(areaM2 * 2);
  }

  /**
   * Generate direct download instructions for USGS data
   */
  static generateDownloadInstructions(products: USGSProduct[]): string {
    if (products.length === 0) {
      return 'No USGS LiDAR data available for this region.';
    }

    const pointClouds = products.filter(p => p.format === 'LAZ');
    const dems = products.filter(p => p.format === 'GeoTIFF');

    let instructions = '🇺🇸 USGS High-Resolution Data Available!\n\n';

    if (pointClouds.length > 0) {
      instructions += `📊 LiDAR Point Clouds (${pointClouds.length} files):\n`;
      instructions += 'Format: LAZ (can be loaded directly in your app)\n';
      instructions += 'Resolution: 1-2m (2-8+ points/m²)\n\n';
      
      instructions += 'Download steps:\n';
      instructions += '1. Visit: https://apps.nationalmap.gov/downloader/\n';
      instructions += '2. Navigate to your selected region\n';
      instructions += '3. Click "Find Products"\n';
      instructions += '4. Select "Elevation Products (3DEP)" → "Lidar Point Cloud (LAZ)"\n';
      instructions += '5. Download and upload LAZ files to your app\n\n';
    }

    if (dems.length > 0) {
      instructions += `🗺️ High-Resolution DEMs (${dems.length} files):\n`;
      instructions += 'Format: GeoTIFF (needs conversion)\n';
      instructions += 'Resolution: 1m\n\n';
      
      instructions += 'Download & convert:\n';
      instructions += '1. Download GeoTIFF files from National Map\n';
      instructions += '2. Convert: gdal_translate -of AAIGrid input.tif output.asc\n';
      instructions += '3. Upload .asc file to your app\n\n';
    }

    instructions += '✨ This data can reveal archaeological features!';

    return instructions;
  }
}
