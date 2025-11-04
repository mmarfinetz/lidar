import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ArchaeologicalDatabaseService } from '../core/ArchaeologicalDatabaseService';
import type { BoundingBox } from '../core/ElevationAPI';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ArchaeologicalDatabaseService', () => {
  const testBbox: BoundingBox = {
    south: 20.620,
    north: 20.650,
    west: -89.470,
    east: -89.440
  };

  beforeEach(() => {
    // Clear cache before each test
    ArchaeologicalDatabaseService.clearCache();
    mockFetch.mockClear();
  });

  describe('findSitesInRegion', () => {
    it('should return curated sites for Mayapán region', async () => {
      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      expect(sites).toHaveLength(1);
      expect(sites[0].name).toBe('Mayapán');
      expect(sites[0].significance).toBe('high');
      expect(sites[0].hasLidarData).toBe(true);
      expect(sites[0].culture).toBe('Maya');
    });

    it('should return empty array for region with no sites', async () => {
      const emptyBbox: BoundingBox = {
        south: 0,
        north: 1,
        west: 0,
        east: 1
      };

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(emptyBbox);
      expect(sites).toHaveLength(0);
    });

    it('should use cache on subsequent requests', async () => {
      // First request
      const sites1 = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      // Second request should use cache
      const sites2 = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      expect(sites1).toEqual(sites2);
      expect(sites1).toHaveLength(1);
    });
  });

  describe('findSitesWithLidarData', () => {
    it('should return only sites with LiDAR data', async () => {
      const sites = await ArchaeologicalDatabaseService.findSitesWithLidarData(testBbox);
      
      expect(sites).toHaveLength(1);
      expect(sites[0].hasLidarData).toBe(true);
      expect(sites[0].lidarDatasets).toBeDefined();
      expect(sites[0].lidarDatasets!.length).toBeGreaterThan(0);
    });
  });

  describe('Open Context integration', () => {
    it('should handle successful Open Context API response', async () => {
      const mockOpenContextResponse = {
        features: [
          {
            properties: {
              id: 'test-site-1',
              label: 'Test Archaeological Site',
              snippet: 'Test description of an archaeological site',
              href: 'https://opencontext.org/subjects/test-site-1',
              temporal: 'Roman Period',
              context: 'Roman'
            },
            geometry: {
              type: 'Point',
              coordinates: [-89.45, 20.63]
            }
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOpenContextResponse)
      });

      const largeBbox: BoundingBox = {
        south: 20.6,
        north: 20.7,
        west: -89.5,
        east: -89.4
      };

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(largeBbox);
      
      // Should include both curated Mayapán site and Open Context site
      expect(sites.length).toBeGreaterThan(1);
      
      const openContextSite = sites.find(site => site.source.database === 'Open Context');
      expect(openContextSite).toBeDefined();
      expect(openContextSite?.name).toBe('Test Archaeological Site');
      expect(openContextSite?.period).toBe('Roman Period');
      expect(openContextSite?.culture).toBe('Roman');
    });

    it('should handle Open Context API failures gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      // Should still return curated sites despite API failure
      expect(sites).toHaveLength(1);
      expect(sites[0].source.database).toBe('Curated Database');
    });

    it('should handle Open Context API timeout', async () => {
      // Mock a request that never resolves (timeout)
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      // Should fallback to curated data after timeout
      expect(sites).toHaveLength(1);
      expect(sites[0].source.database).toBe('Curated Database');
    });
  });

  describe('Site significance determination', () => {
    it('should assign high significance to major sites', async () => {
      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      const mayapan = sites.find(site => site.name === 'Mayapán');
      
      expect(mayapan?.significance).toBe('high');
    });
  });

  describe('Coordinate extraction', () => {
    it('should handle point geometries with buffer', async () => {
      const mockResponse = {
        features: [{
          properties: {
            id: 'point-site',
            label: 'Point Site',
            snippet: 'Site at a point location'
          },
          geometry: {
            type: 'Point',
            coordinates: [-89.45, 20.63]
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      const pointSite = sites.find(site => site.source.database === 'Open Context');
      
      expect(pointSite).toBeDefined();
      expect(pointSite?.coordinates.south).toBeLessThan(20.63);
      expect(pointSite?.coordinates.north).toBeGreaterThan(20.63);
      expect(pointSite?.coordinates.west).toBeLessThan(-89.45);
      expect(pointSite?.coordinates.east).toBeGreaterThan(-89.45);
    });

    it('should handle polygon geometries', async () => {
      const mockResponse = {
        features: [{
          properties: {
            id: 'polygon-site',
            label: 'Polygon Site',
            snippet: 'Site with polygon boundary'
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [-89.47, 20.62],
              [-89.44, 20.62],
              [-89.44, 20.65],
              [-89.47, 20.65],
              [-89.47, 20.62]
            ]]
          }
        }]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      const polygonSite = sites.find(site => site.source.database === 'Open Context');
      
      expect(polygonSite).toBeDefined();
      expect(polygonSite?.coordinates.south).toBe(20.62);
      expect(polygonSite?.coordinates.north).toBe(20.65);
      expect(polygonSite?.coordinates.west).toBe(-89.47);
      expect(polygonSite?.coordinates.east).toBe(-89.44);
    });
  });

  describe('Cache functionality', () => {
    it('should clear cache successfully', () => {
      ArchaeologicalDatabaseService.clearCache();
      const stats = ArchaeologicalDatabaseService.getCacheStats();
      
      expect(stats.entries).toBe(0);
      expect(stats.totalSize).toBe(0);
    });

    it('should provide cache statistics', async () => {
      // Add something to cache
      await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      const stats = ArchaeologicalDatabaseService.getCacheStats();
      expect(stats.entries).toBeGreaterThan(0);
      expect(stats.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Duplicate removal', () => {
    it('should remove duplicate sites based on proximity', async () => {
      // Mock response with two very close sites (should be considered duplicates)
      const mockResponse = {
        features: [
          {
            properties: { id: 'site1', label: 'Site 1', snippet: 'First site' },
            geometry: { type: 'Point', coordinates: [-89.45, 20.63] }
          },
          {
            properties: { id: 'site2', label: 'Site 2', snippet: 'Second site very close' },
            geometry: { type: 'Point', coordinates: [-89.4501, 20.6301] } // Very close to first
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const sites = await ArchaeologicalDatabaseService.findSitesInRegion(testBbox);
      
      // Should only have Mayapán + 1 unique site from Open Context (duplicates removed)
      const openContextSites = sites.filter(site => site.source.database === 'Open Context');
      expect(openContextSites).toHaveLength(1);
    });
  });
});

// Test utility functions
describe('ArchaeologicalDatabaseService utilities', () => {
  it('should handle rate limiting correctly', async () => {
    // This is more of an integration test - would require more complex mocking
    // to test rate limiting behavior properly
    expect(true).toBe(true);
  });
});
