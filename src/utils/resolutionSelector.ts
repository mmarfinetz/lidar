/**
 * Automatic Resolution Selector
 * Intelligently selects the highest available resolution dataset for a given region
 */

import type { BoundingBox } from '../core/ElevationAPI';

export interface DatasetPriority {
  id: string;
  name: string;
  resolution: number; // meters per pixel
  priority: number; // lower = higher priority
  coverage: (bbox: BoundingBox) => boolean;
}

/**
 * Dataset priority list (ordered by quality)
 */
const DATASET_PRIORITIES: DatasetPriority[] = [
  {
    id: 'USGS_3DEP',
    name: 'USGS 3DEP LiDAR (1-2m)',
    resolution: 1.5,
    priority: 1,
    coverage: (bbox) => {
      // USGS 3DEP covers USA and territories
      return bbox.west >= -180 && bbox.east <= -60 &&
             bbox.south >= 15 && bbox.north <= 72;
    }
  },
  {
    id: 'AW3D30',
    name: 'ALOS World 3D (30m)',
    resolution: 30,
    priority: 2,
    coverage: () => true // Global coverage
  },
  {
    id: 'SRTMGL1',
    name: 'SRTM GL1 (30m)',
    resolution: 30,
    priority: 3,
    coverage: (bbox) => {
      // SRTM covers 60°N to 56°S
      return bbox.south >= -56 && bbox.north <= 60;
    }
  },
  {
    id: 'SRTMGL1_E',
    name: 'SRTM GL1 Ellipsoidal (30m)',
    resolution: 30,
    priority: 4,
    coverage: (bbox) => {
      return bbox.south >= -56 && bbox.north <= 60;
    }
  },
  {
    id: 'SRTMGL3',
    name: 'SRTM GL3 (90m)',
    resolution: 90,
    priority: 5,
    coverage: (bbox) => {
      return bbox.south >= -56 && bbox.north <= 60;
    }
  },
];

/**
 * Select the best available dataset for a given bounding box
 * Prioritizes highest resolution with regional coverage
 */
export function selectBestDataset(bbox: BoundingBox): {
  dataset: string;
  name: string;
  resolution: number;
  isHighRes: boolean;
} {
  // Filter to datasets that cover this region
  const availableDatasets = DATASET_PRIORITIES.filter(ds => ds.coverage(bbox));

  if (availableDatasets.length === 0) {
    // Fallback to global coverage if nothing matches
    return {
      dataset: 'SRTMGL1',
      name: 'SRTM GL1 (30m)',
      resolution: 30,
      isHighRes: false,
    };
  }

  // Sort by priority (lower number = higher priority)
  availableDatasets.sort((a, b) => a.priority - b.priority);

  const best = availableDatasets[0];

  return {
    dataset: best.id,
    name: best.name,
    resolution: best.resolution,
    isHighRes: best.resolution < 10, // Consider <10m as "high res"
  };
}

/**
 * Get all available datasets for a region, sorted by quality
 */
export function getAvailableDatasets(bbox: BoundingBox): DatasetPriority[] {
  return DATASET_PRIORITIES
    .filter(ds => ds.coverage(bbox))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Check if high-resolution data (< 10m) is available for a region
 */
export function hasHighResolutionData(bbox: BoundingBox): boolean {
  const best = selectBestDataset(bbox);
  return best.isHighRes;
}

/**
 * Get recommended dataset for archaeological analysis
 * Prioritizes absolute best quality regardless of processing time
 */
export function getArchaeologicalDataset(bbox: BoundingBox): string {
  const best = selectBestDataset(bbox);

  // For archaeology, we want the absolute best
  if (best.resolution <= 2) {
    return best.dataset;
  }

  // If no high-res available, still use best available
  return best.dataset;
}
