/**
 * Data Availability Service
 * Determines the highest quality LiDAR/elevation data available for any location
 */

import type { BoundingBox } from './ElevationAPI';
import { ElevationAPI } from './ElevationAPI';
import { USGSLidarService } from './USGSLidarService';
import { ArchaeologicalDatabaseService } from './ArchaeologicalDatabaseService';

export interface DataSource {
  id: string;
  name: string;
  resolution: string;
  pointDensity: string;
  coverage: 'global' | 'regional' | 'local';
  quality: 'archaeological' | 'high' | 'medium' | 'low';
  priority: number; // Lower number = higher priority
  apiEndpoint?: string;
  checkAvailability: (bbox: BoundingBox) => Promise<boolean>;
  estimatePoints: (bbox: BoundingBox) => number;
}

export interface AvailabilityResult {
  bestSource: DataSource;
  allSources: Array<DataSource & { available: boolean }>;
  expectedQuality: 'archaeological' | 'high' | 'medium' | 'low';
  estimatedPoints: number;
  canRevealArchaeology: boolean;
}

export class DataAvailabilityService {
  
  /**
   * Data sources in order of preference (highest quality first)
   */
  private static readonly DATA_SOURCES: DataSource[] = [
    // Tier 1: Archaeological Quality (0.5-2m, 5-20+ points/m²)
    {
      id: 'opentopo_archaeological',
      name: 'OpenTopography Archaeological Collections',
      resolution: '0.5-2m',
      pointDensity: '5-20+ points/m²',
      coverage: 'local',
      quality: 'archaeological',
      priority: 1,
      checkAvailability: async (bbox) => {
        try {
          const sites = await ArchaeologicalDatabaseService.findSitesInRegion(bbox);
          return sites.length > 0 && sites.some(site => site.hasLidarData || site.significance === 'high');
        } catch (error) {
          console.warn('Archaeological database query failed:', error);
          return false;
        }
      },
      estimatePoints: (bbox) => {
        const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
        return Math.floor(area * 111320 * 111320 * 10); // ~10 points/m² average
      }
    },

    // Tier 2: USGS 3DEP High-Resolution (US only, 1-2m, 2-8 points/m²)
    {
      id: 'usgs_3dep_lidar',
      name: 'USGS 3DEP LiDAR',
      resolution: '1-2m',
      pointDensity: '2-8 points/m²',
      coverage: 'regional',
      quality: 'high',
      priority: 2,
      apiEndpoint: 'https://tnmaccess.nationalmap.gov/api/v1/products',
      checkAvailability: async (bbox) => {
        try {
          const availability = await USGSLidarService.checkLidarAvailability(bbox);
          return availability.hasPointClouds || availability.hasDEM;
        } catch (error) {
          console.warn('USGS availability check failed:', error);
          return false;
        }
      },
      estimatePoints: (bbox) => {
        return USGSLidarService.estimateUSGSPointDensity(bbox);
      }
    },

    // Tier 3: European National Programs (varies by country)
    {
      id: 'european_national',
      name: 'European National LiDAR',
      resolution: '0.5-2m',
      pointDensity: '2-10 points/m²', 
      coverage: 'regional',
      quality: 'high',
      priority: 3,
      checkAvailability: async (bbox) => {
        // Check if in Europe with good LiDAR coverage
        const europeanCountries = [
          { name: 'Netherlands', south: 50.7, north: 53.7, west: 3.2, east: 7.3 }, // AHN
          { name: 'UK', south: 49.8, north: 61.0, west: -8.7, east: 1.8 }, // Environment Agency
          { name: 'France', south: 41.3, north: 51.1, west: -5.1, east: 9.6 }, // IGN LiDAR HD
          { name: 'Denmark', south: 54.5, north: 57.8, west: 8.0, east: 15.2 }, // DHM
          { name: 'Switzerland', south: 45.8, north: 47.8, west: 5.9, east: 10.5 }, // swisstopo
        ];
        
        return europeanCountries.some(country =>
          bbox.south < country.north && bbox.north > country.south &&
          bbox.west < country.east && bbox.east > country.west
        );
      },
      estimatePoints: (bbox) => {
        const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
        return Math.floor(area * 111320 * 111320 * 5); // ~5 points/m² average
      }
    },

    // Tier 4: OpenTopography High-Res Collections (various locations)
    {
      id: 'opentopo_highres',
      name: 'OpenTopography High-Res Collections', 
      resolution: '1-5m',
      pointDensity: '1-5 points/m²',
      coverage: 'local',
      quality: 'medium',
      priority: 4,
      checkAvailability: async (bbox) => {
        // Deterministically check against known OpenTopography collections
        // via ElevationAPI.searchLidarCollections (no network; curated list).
        try {
          const collections = await ElevationAPI.searchLidarCollections(bbox);
          return collections.length > 0;
        } catch {
          return false;
        }
      },
      estimatePoints: (bbox) => {
        const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
        return Math.floor(area * 111320 * 111320 * 2); // ~2 points/m² average
      }
    },

    // Tier 5: Global DEMs (always available, low resolution)
    {
      id: 'global_dem',
      name: 'Global DEM (SRTM/ALOS)',
      resolution: '30-90m',
      pointDensity: '~0.0001 points/m²',
      coverage: 'global',
      quality: 'low',
      priority: 5,
      checkAvailability: async () => true, // Always available
      estimatePoints: (bbox) => {
        const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
        return Math.floor(area * 3600 * 3600); // SRTM 30m resolution
      }
    }
  ];

  /**
   * Map data source IDs to actual API dataset IDs
   */
  static mapSourceToDataset(sourceId: string, bbox: BoundingBox): string {
    switch (sourceId) {
      case 'usgs_3dep_lidar':
        return 'USGS_3DEP';
      case 'opentopo_archaeological':
      case 'opentopo_highres':
        return 'ARCHAEOLOGICAL';
      case 'european_national':
        return 'SRTMGL1'; // Fallback to global DEM since European sources need manual download
      case 'global_dem':
      default:
        // Select best global DEM based on region
        if (bbox.south >= -56 && bbox.north <= 60) {
          return 'SRTMGL1'; // 30m SRTM for better quality
        }
        return 'AW3D30'; // ALOS for areas outside SRTM coverage
    }
  }

  /**
   * Check data availability for a bounding box
   * Returns the best available source and quality assessment
   */
  static async checkAvailability(bbox: BoundingBox): Promise<AvailabilityResult> {
    const sources = [...this.DATA_SOURCES].sort((a, b) => a.priority - b.priority);
    const availabilityResults: Array<DataSource & { available: boolean }> = [];

    let bestSource: DataSource | null = null;

    // Check each source in order of priority
    for (const source of sources) {
      try {
        const available = await source.checkAvailability(bbox);
        availabilityResults.push({ ...source, available });

        if (available && !bestSource) {
          bestSource = source;
        }
      } catch (error) {
        console.warn(`Failed to check availability for ${source.name}:`, error);
        availabilityResults.push({ ...source, available: false });
      }
    }

    // Fallback to global DEM if nothing else available
    if (!bestSource) {
      bestSource = sources.find(s => s.id === 'global_dem') || sources[sources.length - 1];
    }

    const estimatedPoints = bestSource.estimatePoints(bbox);
    const canRevealArchaeology = bestSource.quality === 'archaeological' || bestSource.quality === 'high';

    return {
      bestSource,
      allSources: availabilityResults,
      expectedQuality: bestSource.quality,
      estimatedPoints,
      canRevealArchaeology
    };
  }

  /**
   * Get a user-friendly description of what data quality means
   */
  static getQualityDescription(quality: 'archaeological' | 'high' | 'medium' | 'low'): {
    title: string;
    description: string;
    archaeologyCapable: boolean;
    color: string;
  } {
    switch (quality) {
      case 'archaeological':
        return {
          title: '🏛️ Archaeological Quality',
          description: 'Can reveal building foundations, walls, roads, and other structures beneath vegetation',
          archaeologyCapable: true,
          color: 'text-green-400'
        };
      case 'high':
        return {
          title: '🔍 High Resolution',
          description: 'Good detail for terrain analysis, may reveal large archaeological features',
          archaeologyCapable: true,
          color: 'text-blue-400'
        };
      case 'medium':
        return {
          title: '📊 Medium Resolution', 
          description: 'Suitable for general terrain analysis and large-scale features',
          archaeologyCapable: false,
          color: 'text-yellow-400'
        };
      case 'low':
        return {
          title: '🗺️ Basic Resolution',
          description: 'Regional topography only, not suitable for archaeological prospection',
          archaeologyCapable: false,
          color: 'text-gray-400'
        };
    }
  }

  /**
   * Estimate area coverage in different units
   */
  static calculateCoverage(bbox: BoundingBox): {
    degrees: { lat: number; lon: number };
    kilometers: { lat: number; lon: number };
    hectares: number;
  } {
    const latDeg = bbox.north - bbox.south;
    const lonDeg = bbox.east - bbox.west;
    
    // Rough conversion at middle latitude
    const midLat = (bbox.north + bbox.south) / 2;
    const latKm = latDeg * 111.32; // km per degree latitude
    const lonKm = lonDeg * 111.32 * Math.cos(midLat * Math.PI / 180); // km per degree longitude
    
    const hectares = (latKm * lonKm) * 100; // 1 km² = 100 hectares

    return {
      degrees: { lat: latDeg, lon: lonDeg },
      kilometers: { lat: latKm, lon: lonKm },
      hectares
    };
  }
}
