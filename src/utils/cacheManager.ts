/**
 * Cache Manager using IndexedDB
 * Caches processed elevation data for instant loading on repeat visits
 */

import type { PointCloudData } from '../types/lidar';

const DB_NAME = 'LidarVisualizerCache';
const DB_VERSION = 1;
const STORE_NAME = 'elevationData';
const MAX_CACHE_SIZE_MB = 500; // Maximum cache size in MB
const CACHE_EXPIRY_DAYS = 7; // Cache entries expire after 7 days

interface CacheEntry {
  key: string;
  data: PointCloudData;
  timestamp: number;
  sizeBytes: number;
}

export class CacheManager {
  private db: IDBDatabase | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.warn('IndexedDB initialization failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('sizeBytes', 'sizeBytes', { unique: false });
        }
      };
    });
  }

  /**
   * Generate cache key from bounding box and dataset
   */
  private generateKey(bbox: {
    south: number;
    north: number;
    west: number;
    east: number;
  }, dataset: string): string {
    // Round to 6 decimal places to handle floating point variations
    const s = bbox.south.toFixed(6);
    const n = bbox.north.toFixed(6);
    const w = bbox.west.toFixed(6);
    const e = bbox.east.toFixed(6);
    return `${dataset}_${s}_${n}_${w}_${e}`;
  }

  /**
   * Estimate size of PointCloudData in bytes
   */
  private estimateSize(data: PointCloudData): number {
    let size = 0;

    // Points array
    size += data.points.length * (3 * 8 + 2 * 4); // 3 doubles + 2 ints per point (approximate)

    // Geo data
    if (data.geo?.positionsMeters) {
      size += data.geo.positionsMeters.byteLength;
    }
    if (data.geo?.heightGrid) {
      size += data.geo.heightGrid.byteLength;
    }

    // Other data (approximate)
    size += 1000; // Metadata overhead

    return size;
  }

  /**
   * Get cached data if available and not expired
   */
  async get(bbox: {
    south: number;
    north: number;
    west: number;
    east: number;
  }, dataset: string): Promise<PointCloudData | null> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve(null);
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const key = this.generateKey(bbox, dataset);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        // Check if cache entry has expired
        const now = Date.now();
        const age = now - entry.timestamp;
        const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

        if (age > maxAge) {
          console.log('Cache entry expired, removing:', key);
          this.delete(bbox, dataset);
          resolve(null);
          return;
        }

        console.log('Cache hit for:', key, `(${(entry.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);

        // Reconstruct TypedArrays
        if (entry.data.geo?.positionsMeters && !(entry.data.geo.positionsMeters instanceof Float32Array)) {
          entry.data.geo.positionsMeters = new Float32Array(entry.data.geo.positionsMeters);
        }
        if (entry.data.geo?.heightGrid && !(entry.data.geo.heightGrid instanceof Float32Array)) {
          entry.data.geo.heightGrid = new Float32Array(entry.data.geo.heightGrid);
        }

        resolve(entry.data);
      };

      request.onerror = () => {
        console.warn('Cache retrieval failed:', request.error);
        resolve(null);
      };
    });
  }

  /**
   * Store data in cache
   */
  async set(bbox: {
    south: number;
    north: number;
    west: number;
    east: number;
  }, dataset: string, data: PointCloudData): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const key = this.generateKey(bbox, dataset);
      const sizeBytes = this.estimateSize(data);
      const sizeMB = sizeBytes / 1024 / 1024;

      // Don't cache if too large
      if (sizeMB > MAX_CACHE_SIZE_MB) {
        console.warn(`Data too large to cache: ${sizeMB.toFixed(2)} MB`);
        resolve();
        return;
      }

      // Check total cache size and clean up if needed
      this.cleanupIfNeeded().then(() => {
        if (!this.db) {
          reject(new Error('Database not initialized'));
          return;
        }

        const entry: CacheEntry = {
          key,
          data,
          timestamp: Date.now(),
          sizeBytes,
        };

        const transaction = this.db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => {
          console.log('Cached elevation data:', key, `(${sizeMB.toFixed(2)} MB)`);
          resolve();
        };

        request.onerror = () => {
          console.warn('Cache storage failed:', request.error);
          reject(request.error);
        };
      });
    });
  }

  /**
   * Delete cached entry
   */
  async delete(bbox: {
    south: number;
    north: number;
    west: number;
    east: number;
  }, dataset: string): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const key = this.generateKey(bbox, dataset);
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Clean up old cache entries if total size exceeds limit
   */
  private async cleanupIfNeeded(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve) => {
      if (!this.db) {
        resolve();
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      const entries: CacheEntry[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

        if (cursor) {
          entries.push(cursor.value as CacheEntry);
          cursor.continue();
        } else {
          // Calculate total size
          const totalSize = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
          const totalSizeMB = totalSize / 1024 / 1024;

          if (totalSizeMB > MAX_CACHE_SIZE_MB) {
            console.log(`Cache size ${totalSizeMB.toFixed(2)} MB exceeds limit, cleaning up...`);

            // Sort by timestamp (oldest first)
            entries.sort((a, b) => a.timestamp - b.timestamp);

            // Delete oldest entries until under limit
            let currentSize = totalSize;
            for (const entry of entries) {
              if (currentSize / 1024 / 1024 <= MAX_CACHE_SIZE_MB * 0.8) {
                break; // Keep 20% buffer
              }

              store.delete(entry.key);
              currentSize -= entry.sizeBytes;
              console.log('Deleted old cache entry:', entry.key);
            }
          }

          resolve();
        }
      };

      request.onerror = () => {
        console.warn('Cache cleanup failed:', request.error);
        resolve();
      };
    });
  }

  /**
   * Clear all cached data
   */
  async clear(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Cache cleared');
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ count: number; totalSizeMB: number }> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        const totalSize = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);

        resolve({
          count: entries.length,
          totalSizeMB: totalSize / 1024 / 1024,
        });
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
