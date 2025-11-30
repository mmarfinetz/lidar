/**
 * High Resolution Fetcher
 * Orchestrates fetching high-resolution elevation data from multiple sources
 * Prioritizes sources based on DataAvailabilityService
 *
 * Supports:
 * - USGS 3DEP (1m resolution via EPQS, WCS, or direct download)
 * - AWS Terrain Tiles (5-15m for small areas)
 * - OpenTopography collections
 * - European national LiDAR programs
 */

import type { BoundingBox } from './ElevationAPI';
import type { PointCloudData } from '../types/lidar';
import { DataAvailabilityService } from './DataAvailabilityService';
import { USGSLidarService } from './USGSLidarService';
import { USGS3DEPService } from './USGS3DEPService';
import { GeoTIFFConverter } from '../utils/GeoTIFFConverter';
import { TerrainTilesService } from './TerrainTilesService';

export interface FetchResult {
  data: PointCloudData;
  source: {
    id: string;
    name: string;
    resolution: string;
  };
  fetchTime: number;
}

export class HighResolutionFetcher {

  /**
   * Attempt to fetch the highest resolution data available for a region
   * Returns null if no high-resolution data is available
   */
  static async fetchBestAvailable(
    bbox: BoundingBox,
    onProgress?: (progress: number, status: string) => void
  ): Promise<FetchResult | null> {

    try {
      onProgress?.(5, 'Analyzing data availability...');

      // Check what's available
      const availability = await DataAvailabilityService.checkAvailability(bbox);

      console.log('📊 Best available source:', availability.bestSource.name);
      console.log('📊 Quality:', availability.expectedQuality);

      // Try to fetch based on priority
      const source = availability.bestSource;

      switch (source.id) {
        case 'usgs_3dep_lidar':
          return await this.fetchUSGS3DEP(bbox, onProgress);

        case 'opentopo_archaeological':
          console.log('🏛️ Archaeological LiDAR detected but requires manual download');
          onProgress?.(100, 'Archaeological data requires manual download');
          return null;

        case 'european_national':
          console.log('🇪🇺 European national LiDAR detected but requires manual download');
          onProgress?.(100, 'European data requires manual download');
          return null;

        case 'opentopo_highres':
          console.log('📊 OpenTopography high-res collections require manual download');
          onProgress?.(100, 'High-res collections require manual download');
          return null;

        case 'aws_terrain_tiles':
          return await this.fetchAWSTerrainTiles(bbox, onProgress);

        case 'global_dem':
          // Fall back to standard global DEM
          console.log('🌍 Only global DEMs available, will use standard fetch');
          return null;

        default:
          return null;
      }

    } catch (error) {
      console.error('Error in HighResolutionFetcher:', error);
      onProgress?.(100, 'High-res fetch failed, falling back to standard DEM');
      return null;
    }
  }

  /**
   * Fetch USGS 3DEP data using the enhanced service
   * Automatically selects the best method (EPQS, WCS, or direct download)
   */
  private static async fetchUSGS3DEP(
    bbox: BoundingBox,
    onProgress?: (progress: number, status: string) => void
  ): Promise<FetchResult | null> {

    const startTime = Date.now();

    try {
      onProgress?.(5, 'Checking USGS 3DEP availability...');

      // First try the new USGS3DEPService which handles proxy and fallbacks
      const result = await USGS3DEPService.fetchElevation(
        bbox,
        {
          resolution: 10, // Default 10m, service will optimize based on area
          maxPoints: 500000
        },
        (progress, status) => {
          // Scale progress from 5-95%
          const scaledProgress = 5 + (progress / 100) * 90;
          onProgress?.(scaledProgress, status);
        }
      );

      if (result) {
        const fetchTime = Date.now() - startTime;

        console.log(`✅ Successfully fetched USGS 3DEP data via ${result.source.method} in ${(fetchTime / 1000).toFixed(1)}s`);
        console.log(`   Resolution: ${result.source.resolution}, Coverage: ${result.coverage.percentComplete.toFixed(1)}%`);

        onProgress?.(100, 'USGS 3DEP data loaded successfully');

        return {
          data: result.data,
          source: {
            id: 'usgs_3dep_lidar',
            name: result.source.name,
            resolution: result.source.resolution
          },
          fetchTime
        };
      }

      // Fall back to legacy method (direct GeoTIFF download)
      console.log('New USGS service returned null, trying legacy method...');
      onProgress?.(50, 'Trying legacy USGS fetch method...');

      const arrayBuffer = await USGSLidarService.fetch3DEPElevation(bbox, (progress, status) => {
        const scaledProgress = 50 + (progress / 100) * 30;
        onProgress?.(scaledProgress, status);
      });

      if (!arrayBuffer) {
        console.log('USGS fetch returned null, falling back');
        return null;
      }

      onProgress?.(80, 'Converting USGS GeoTIFF to point cloud...');

      // Convert GeoTIFF to point cloud
      const pointCloud = await GeoTIFFConverter.convertToPointCloud(
        arrayBuffer,
        bbox,
        (progress, status) => {
          const scaledProgress = 80 + (progress / 100) * 20;
          onProgress?.(scaledProgress, status);
        }
      );

      const fetchTime = Date.now() - startTime;

      console.log(`✅ Successfully fetched USGS 3DEP data (legacy) in ${(fetchTime / 1000).toFixed(1)}s`);

      return {
        data: pointCloud,
        source: {
          id: 'usgs_3dep_lidar',
          name: 'USGS 3DEP LiDAR',
          resolution: '1m'
        },
        fetchTime
      };

    } catch (error) {
      console.error('Error fetching USGS 3DEP:', error);
      onProgress?.(100, 'USGS fetch failed');
      return null;
    }
  }

  /**
   * Fetch AWS Terrain Tiles data for small areas
   */
  private static async fetchAWSTerrainTiles(
    bbox: BoundingBox,
    onProgress?: (progress: number, status: string) => void
  ): Promise<FetchResult | null> {
    const startTime = Date.now();

    try {
      onProgress?.(10, 'Fetching AWS Terrain Tiles...');

      const resInfo = TerrainTilesService.estimateResolution(bbox);
      console.log(`📊 AWS Terrain Tiles: zoom ${resInfo.zoomLevel}, ${resInfo.resolution}`);

      const pointCloud = await TerrainTilesService.fetchTerrainData(
        bbox,
        'aws',
        (progress, status) => {
          const scaledProgress = 10 + (progress / 100) * 90;
          onProgress?.(scaledProgress, status);
        }
      );

      if (!pointCloud) {
        console.log('AWS Terrain Tiles fetch returned null');
        return null;
      }

      const fetchTime = Date.now() - startTime;

      console.log(`✅ Successfully fetched AWS Terrain Tiles in ${(fetchTime / 1000).toFixed(1)}s`);

      return {
        data: pointCloud,
        source: {
          id: 'aws_terrain_tiles',
          name: 'AWS Terrain Tiles',
          resolution: resInfo.resolution
        },
        fetchTime
      };

    } catch (error) {
      console.error('Error fetching AWS Terrain Tiles:', error);
      onProgress?.(100, 'AWS fetch failed');
      return null;
    }
  }

  /**
   * Get user-friendly message about why high-res data isn't available
   */
  static async getAvailabilityMessage(bbox: BoundingBox): Promise<string> {
    const availability = await DataAvailabilityService.checkAvailability(bbox);

    const source = availability.bestSource;

    switch (source.id) {
      case 'global_dem':
        return '🌍 Using global 30m DEM - No high-resolution data available for this region';

      case 'usgs_3dep_lidar':
        return '🇺🇸 USGS 3DEP data available (1m resolution) - Attempting automatic fetch...';

      case 'opentopo_archaeological':
        return '🏛️ Archaeological LiDAR available (0.5-2m) - Manual download required';

      case 'european_national':
        return '🇪🇺 European national LiDAR available (0.5-2m) - Manual download required';

      case 'opentopo_highres':
        return '📊 OpenTopography high-res available (1-5m) - Manual download required';

      case 'aws_terrain_tiles':
        return '🗺️ AWS Terrain Tiles available (5-15m) - Automatic high-res fetch for small areas';

      default:
        return `📊 ${source.name} (${source.resolution}) detected`;
    }
  }

  /**
   * Check if a region has automatically fetchable high-res data
   */
  static async hasAutoFetchableData(bbox: BoundingBox): Promise<boolean> {
    const availability = await DataAvailabilityService.checkAvailability(bbox);

    // USGS 3DEP and AWS Terrain Tiles can be auto-fetched
    return availability.bestSource.id === 'usgs_3dep_lidar' ||
           availability.bestSource.id === 'aws_terrain_tiles';
  }
}
