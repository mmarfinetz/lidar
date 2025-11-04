import type { BoundingBox } from './ElevationAPI';
import { approximateStaticMapZoom } from '../utils/geo';

/**
 * Google Static Maps helper
 */
export function buildGoogleStaticMapUrl(
  bbox: BoundingBox,
  apiKey: string,
  size: number = 1024
): string {
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLon = (bbox.east + bbox.west) / 2;
  const zoom = approximateStaticMapZoom(bbox.south, bbox.north, bbox.west, bbox.east, size);
  const scale = 2; // high-DPI

  const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
  url.searchParams.set('center', `${centerLat},${centerLon}`);
  url.searchParams.set('zoom', `${zoom}`);
  url.searchParams.set('size', `${size}x${size}`);
  url.searchParams.set('scale', `${scale}`);
  url.searchParams.set('maptype', 'satellite');
  url.searchParams.set('key', apiKey);
  // Optional attribution can be rendered in UI; the Static Maps API includes internal attribution too
  return url.toString();
}

