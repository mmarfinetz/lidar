/**
 * Archaeological Database Service
 * Provides dynamic access to archaeological site data from multiple public databases
 */

import type { BoundingBox } from './ElevationAPI';

export interface ArchaeologicalSite {
  id: string;
  name: string;
  description: string;
  period?: string;
  culture?: string;
  significance: 'high' | 'medium' | 'low';
  coordinates: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
  hasLidarData: boolean;
  lidarDatasets?: Array<{
    id: string;
    resolution: string;
    source: string;
    downloadUrl?: string;
  }>;
  references?: Array<{
    title: string;
    url?: string;
    type: 'publication' | 'database' | 'website';
  }>;
  source: {
    database: string;
    url?: string;
    lastUpdated: string;
  };
}

export interface DatabaseSource {
  name: string;
  priority: number;
  enabled: boolean;
  queryFunction: (bbox: BoundingBox) => Promise<ArchaeologicalSite[]>;
  rateLimit?: {
    requestsPerMinute: number;
    lastRequestTime: number;
    requestCount: number;
  };
}

export class ArchaeologicalDatabaseService {
  private static cache: Map<string, { data: ArchaeologicalSite[]; timestamp: number }> = new Map();
  private static readonly CACHE_TTL = parseInt(import.meta.env.VITE_ARCHAEOLOGICAL_CACHE_TTL || '86400000'); // 24 hours default
  private static readonly REQUEST_TIMEOUT = 5000; // 5 seconds

  private static databases: DatabaseSource[] = [
    {
      name: 'Open Context',
      priority: 1,
      enabled: true,
      queryFunction: this.queryOpenContext.bind(this),
      rateLimit: {
        requestsPerMinute: parseInt(import.meta.env.VITE_OPENCONTEXT_RATE_LIMIT || '60'),
        lastRequestTime: 0,
        requestCount: 0
      }
    },
    {
      name: 'ARIADNE Portal',
      priority: 2,
      enabled: true,
      queryFunction: this.queryAriadne.bind(this),
    },
    {
      name: 'Curated Database',
      priority: 999, // Fallback
      enabled: true,
      queryFunction: this.queryCuratedDatabase.bind(this),
    }
  ];

  /**
   * Find archaeological sites within a bounding box
   */
  static async findSitesInRegion(bbox: BoundingBox): Promise<ArchaeologicalSite[]> {
    const cacheKey = `${bbox.south},${bbox.north},${bbox.west},${bbox.east}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log('Archaeological data retrieved from cache');
      return cached.data;
    }

    const allSites: ArchaeologicalSite[] = [];
    const enabledDatabases = this.databases
      .filter(db => db.enabled)
      .sort((a, b) => a.priority - b.priority);

    // Query databases in priority order
    for (const database of enabledDatabases) {
      try {
        // Check rate limiting
        if (database.rateLimit && !this.checkRateLimit(database)) {
          console.warn(`Rate limit exceeded for ${database.name}, skipping...`);
          continue;
        }

        console.log(`Querying ${database.name} for archaeological sites...`);
        const sites = await Promise.race([
          database.queryFunction(bbox),
          new Promise<ArchaeologicalSite[]>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), this.REQUEST_TIMEOUT)
          )
        ]);

        allSites.push(...sites);
        
        // Update rate limiting
        if (database.rateLimit) {
          this.updateRateLimit(database);
        }

        console.log(`Found ${sites.length} sites from ${database.name}`);
      } catch (error) {
        console.warn(`Failed to query ${database.name}:`, error);
        // Continue with other databases
      }
    }

    // Remove duplicates based on coordinates (within 0.001 degree tolerance)
    const uniqueSites = this.removeDuplicateSites(allSites);
    
    // Cache results
    this.cache.set(cacheKey, { data: uniqueSites, timestamp: Date.now() });
    
    console.log(`Total unique archaeological sites found: ${uniqueSites.length}`);
    return uniqueSites;
  }

  /**
   * Get sites with confirmed high-resolution LiDAR data
   */
  static async findSitesWithLidarData(bbox: BoundingBox): Promise<ArchaeologicalSite[]> {
    const allSites = await this.findSitesInRegion(bbox);
    return allSites.filter(site => site.hasLidarData && site.lidarDatasets && site.lidarDatasets.length > 0);
  }

  /**
   * Query Open Context database
   */
  private static async queryOpenContext(bbox: BoundingBox): Promise<ArchaeologicalSite[]> {
    try {
      // Use our API proxy to avoid browser CORS issues in production.
      // In dev, Vite proxies `/api/opencontext` to Open Context directly.
      const baseUrl = '/api/opencontext';
      const params = new URLSearchParams({
        bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
        type: 'subjects',
        proj: 'oc-api:default-subjects',
        format: 'json',
        rows: '100'
      });

      const response = await fetch(`${baseUrl}?${params}`);
      if (!response.ok) {
        throw new Error(`Open Context API error: ${response.status}`);
      }

      const text = await response.text();
      
      // Check if response is actually JSON
      if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) {
        console.warn('Open Context returned HTML instead of JSON, possibly an error page');
        return [];
      }

      const data = JSON.parse(text);
      return this.parseOpenContextResponse(data);
    } catch (error) {
      console.warn('Open Context query failed:', error);
      return [];
    }
  }

  /**
   * Query ARIADNE Portal
   */
  private static async queryAriadne(bbox: BoundingBox): Promise<ArchaeologicalSite[]> {
    try {
      // ARIADNE Portal spatial search (if available)
      // Note: This may require different endpoint or authentication
      // const polygon = `POLYGON((${bbox.west} ${bbox.south}, ${bbox.east} ${bbox.south}, ${bbox.east} ${bbox.north}, ${bbox.west} ${bbox.north}, ${bbox.west} ${bbox.south}))`;
      
      // Placeholder for ARIADNE API - actual endpoint may vary
      // When API is confirmed, implement search with spatial polygon query

      // For now, return empty array until we can confirm the API endpoint
      console.log('ARIADNE Portal integration pending API confirmation for bbox:', bbox);
      return [];
    } catch (error) {
      console.warn('ARIADNE query failed:', error);
      return [];
    }
  }

  /**
   * Query curated database (fallback)
   */
  private static async queryCuratedDatabase(bbox: BoundingBox): Promise<ArchaeologicalSite[]> {
    // Curated high-priority archaeological sites with confirmed LiDAR data
    const curatedSites: ArchaeologicalSite[] = [
      {
        id: 'mayapan-mexico',
        name: 'Mayapán',
        description: 'Major Maya archaeological site in the Yucatán Peninsula, served as a political and cultural capital during the Postclassic period (1200-1440 CE). The site contains over 4,000 structures within its defensive wall.',
        period: 'Postclassic Maya (1200-1440 CE)',
        culture: 'Maya',
        significance: 'high',
        coordinates: { south: 20.620, north: 20.650, west: -89.470, east: -89.440 },
        hasLidarData: true,
        lidarDatasets: [{
          id: 'OTSDEM.032016.32616.1',
          resolution: '0.5m',
          source: 'OpenTopography',
          downloadUrl: 'https://cloud.sdsc.edu/v1/AUTH_opentopography/Raster/OTSDEM.032016.32616.1/OTSDEM.032016.32616.1_BE.tif'
        }],
        references: [{
          title: 'Mayapán: The Last Maya Capital',
          type: 'publication',
          url: 'https://www.cambridge.org/core/books/mayapan/94E9F5F8B9A3C8F7E6D2A1B5C4E3F2A1'
        }],
        source: {
          database: 'Curated Database',
          lastUpdated: new Date().toISOString()
        }
      },
      {
        id: 'usumacinta-mexico',
        name: 'Middle Usumacinta Maya Region',
        description: 'Archaeological region along the Usumacinta River containing numerous Classic Maya sites. This area reveals complex settlement patterns and inter-site relationships through extensive LiDAR mapping.',
        period: 'Classic Maya (250-900 CE)',
        culture: 'Maya',
        significance: 'high',
        coordinates: { south: 16.800, north: 17.200, west: -91.200, east: -90.800 },
        hasLidarData: true,
        lidarDatasets: [{
          id: 'OTSDEM.042022.32615.1',
          resolution: '1m',
          source: 'OpenTopography',
          downloadUrl: 'https://portal.opentopography.org/raster?opentopoID=OTSDEM.042022.32615.1'
        }],
        references: [{
          title: 'LiDAR Survey of the Middle Usumacinta River Region',
          type: 'publication'
        }],
        source: {
          database: 'Curated Database',
          lastUpdated: new Date().toISOString()
        }
      },
      {
        id: 'angkor-cambodia',
        name: 'Angkor Archaeological Park',
        description: 'Vast temple complex and ancient city, capital of the Khmer Empire from 9th to 15th centuries. Contains the famous Angkor Wat and hundreds of other temples spread across 400 square kilometers.',
        period: 'Angkor Period (802-1432 CE)',
        culture: 'Khmer',
        significance: 'high',
        coordinates: { south: 13.350, north: 13.500, west: 103.800, east: 104.000 },
        hasLidarData: true,
        lidarDatasets: [{
          id: 'angkor-lidar-2015',
          resolution: '1m',
          source: 'Khmer Archaeology LiDAR Consortium'
        }],
        references: [{
          title: 'Angkor Wat: History and Conservation',
          type: 'publication'
        }],
        source: {
          database: 'Curated Database',
          lastUpdated: new Date().toISOString()
        }
      }
    ];

    // Filter sites that intersect with the bounding box
    return curatedSites.filter(site => 
      bbox.south < site.coordinates.north && 
      bbox.north > site.coordinates.south &&
      bbox.west < site.coordinates.east && 
      bbox.east > site.coordinates.west
    );
  }

  /**
   * Parse Open Context API response
   */
  private static parseOpenContextResponse(data: any): ArchaeologicalSite[] {
    const sites: ArchaeologicalSite[] = [];
    
    if (data.features && Array.isArray(data.features)) {
      for (const feature of data.features) {
        try {
          const props = feature.properties || {};
          const geom = feature.geometry;
          
          if (geom && geom.coordinates) {
            const site: ArchaeologicalSite = {
              id: props.id || `oc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: props.label || props.title || 'Archaeological Site',
              description: props.snippet || props.description || 'Archaeological site from Open Context database',
              period: props.temporal || undefined,
              culture: props.context || undefined,
              significance: this.determineSiteSignificance(props),
              coordinates: this.extractCoordinates(geom),
              hasLidarData: false, // Open Context typically doesn't have LiDAR info
              references: [{
                title: `Open Context: ${props.label || 'Archaeological Record'}`,
                url: props.href,
                type: 'database'
              }],
              source: {
                database: 'Open Context',
                url: props.href,
                lastUpdated: new Date().toISOString()
              }
            };
            
            sites.push(site);
          }
        } catch (error) {
          console.warn('Error parsing Open Context feature:', error);
        }
      }
    }
    
    return sites;
  }

  /**
   * Extract coordinates from geometry
   */
  private static extractCoordinates(geometry: any): ArchaeologicalSite['coordinates'] {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const buffer = 0.01; // ~1km buffer around point
      return {
        south: lat - buffer,
        north: lat + buffer,
        west: lon - buffer,
        east: lon + buffer
      };
    } else if (geometry.type === 'Polygon' && geometry.coordinates[0]) {
      const coords = geometry.coordinates[0];
      const lons = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);
      return {
        south: Math.min(...lats),
        north: Math.max(...lats),
        west: Math.min(...lons),
        east: Math.max(...lons)
      };
    }
    
    // Fallback
    return { south: 0, north: 0, west: 0, east: 0 };
  }

  /**
   * Determine site significance based on properties
   */
  private static determineSiteSignificance(props: any): 'high' | 'medium' | 'low' {
    const title = (props.label || props.title || '').toLowerCase();
    const description = (props.snippet || props.description || '').toLowerCase();
    
    if (title.includes('world heritage') || title.includes('unesco') || 
        description.includes('world heritage') || description.includes('unesco')) {
      return 'high';
    }
    
    if (title.includes('major') || title.includes('capital') || title.includes('complex') ||
        description.includes('major') || description.includes('capital')) {
      return 'high';
    }
    
    if (title.includes('site') || title.includes('archaeological')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Remove duplicate sites based on proximity
   */
  private static removeDuplicateSites(sites: ArchaeologicalSite[]): ArchaeologicalSite[] {
    const unique: ArchaeologicalSite[] = [];
    const tolerance = 0.001; // ~100m tolerance
    
    for (const site of sites) {
      const isDuplicate = unique.some(existing => {
        const centerLat1 = (site.coordinates.north + site.coordinates.south) / 2;
        const centerLon1 = (site.coordinates.east + site.coordinates.west) / 2;
        const centerLat2 = (existing.coordinates.north + existing.coordinates.south) / 2;
        const centerLon2 = (existing.coordinates.east + existing.coordinates.west) / 2;
        
        return Math.abs(centerLat1 - centerLat2) < tolerance && 
               Math.abs(centerLon1 - centerLon2) < tolerance;
      });
      
      if (!isDuplicate) {
        unique.push(site);
      }
    }
    
    return unique;
  }

  /**
   * Check rate limiting for database
   */
  private static checkRateLimit(database: DatabaseSource): boolean {
    if (!database.rateLimit) return true;
    
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    // Reset counter if more than a minute has passed
    if (database.rateLimit.lastRequestTime < minuteAgo) {
      database.rateLimit.requestCount = 0;
    }
    
    return database.rateLimit.requestCount < database.rateLimit.requestsPerMinute;
  }

  /**
   * Update rate limiting counters
   */
  private static updateRateLimit(database: DatabaseSource): void {
    if (!database.rateLimit) return;
    
    database.rateLimit.lastRequestTime = Date.now();
    database.rateLimit.requestCount++;
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  static clearCache(): void {
    this.cache.clear();
    console.log('Archaeological database cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { entries: number; totalSize: number } {
    let totalSize = 0;
    for (const [, value] of this.cache) {
      totalSize += JSON.stringify(value).length;
    }
    
    return {
      entries: this.cache.size,
      totalSize
    };
  }
}
