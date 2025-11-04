/**
 * Geospatial helpers
 */

/**
 * Approximate meters per degree at a given latitude.
 * Returns { lat, lon } meters per degree for latitude and longitude.
 */
export function metersPerDegree(latDeg: number): { lat: number; lon: number } {
  // WGS84 ellipsoid approximations
  // Source: common approximations; good enough for visualization scale
  const lat = Math.abs(latDeg);
  const metersPerDegLat = 111132.92 - 559.82 * Math.cos(2 * toRad(lat)) + 1.175 * Math.cos(4 * toRad(lat)) - 0.0023 * Math.cos(6 * toRad(lat));
  const metersPerDegLon = 111412.84 * Math.cos(toRad(lat)) - 93.5 * Math.cos(3 * toRad(lat)) + 0.118 * Math.cos(5 * toRad(lat));
  return { lat: metersPerDegLat, lon: metersPerDegLon };
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Compute an approximate Google Static Maps zoom level that fits a bbox into `size` pixels.
 * Returns a clamped integer zoom in [0, 21].
 */
export function approximateStaticMapZoom(
  south: number,
  north: number,
  west: number,
  east: number,
  size: number
): number {
  const latDiff = Math.max(1e-9, Math.abs(north - south));
  const lonDiff = Math.max(1e-9, Math.abs(east - west));
  const centerLat = (north + south) / 2;

  // Degrees per pixel at equator: 360 / (256 * 2^z)
  // Solve z for lon span and account for latitude shrinkage by cos(lat)
  const cosLat = Math.cos(toRad(centerLat));
  const lonDpp = lonDiff / size;
  const lonZoom = Math.log2((360 * cosLat) / (256 * lonDpp));

  // Lat span is more complex due to Mercator; use a simple approximation
  const latDpp = latDiff / size;
  const latZoom = Math.log2(360 / (256 * latDpp));

  const z = Math.floor(Math.min(lonZoom, latZoom));
  return Math.max(0, Math.min(21, isFinite(z) ? z : 0));
}

