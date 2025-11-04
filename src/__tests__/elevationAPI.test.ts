import { describe, it, expect } from 'vitest'
import { ElevationAPI, type BoundingBox } from '../core/ElevationAPI'

const bbox: BoundingBox = { south: 0, north: 2, west: 0, east: 3 }

describe('core/ElevationAPI', () => {
  it('validateBBox enforces ordering, ranges, and area bounds', () => {
    expect(ElevationAPI.validateBBox({ south: 1, north: 2, west: 0, east: 1 }).valid).toBe(true)
    expect(ElevationAPI.validateBBox({ south: 2, north: 1, west: 0, east: 1 }).valid).toBe(false)
    expect(ElevationAPI.validateBBox({ south: 0, north: 1, west: 1, east: 0 }).valid).toBe(false)
    expect(ElevationAPI.validateBBox({ south: -91, north: 0, west: 0, east: 1 }).valid).toBe(false)
    expect(ElevationAPI.validateBBox({ south: 0, north: 1, west: -181, east: 0 }).valid).toBe(false)
    // Too large (area > 1 deg^2)
    expect(ElevationAPI.validateBBox({ south: 0, north: 2, west: 0, east: 2 }).valid).toBe(false)
    // Too small (area < 0.001)
    expect(ElevationAPI.validateBBox({ south: 0, north: 0.02, west: 0, east: 0.04 }).valid).toBe(false)
  })

  it('estimatePoints approximates count based on dataset resolution', () => {
    const b = { south: 0, north: 0.5, west: 0, east: 0.5 }
    const est = ElevationAPI.estimatePoints(b, 'SRTMGL1')
    expect(est).toBe(0.25 * 3600 * 3600)
  })

  it('parseASCIIGrid converts a small grid into a normalized point cloud', () => {
    // Access private method for deterministic unit testing
    const parse = (ElevationAPI as unknown as { parseASCIIGrid: Function }).parseASCIIGrid
    const asc = [
      'ncols         3',
      'nrows         2',
      'xllcorner     0',
      'yllcorner     0',
      'cellsize      1',
      'NODATA_value  -9999',
      '1 2 3',
      '4 -9999 6',
    ].join('\n')

    const pc = parse(asc, bbox)
    // 6 cells with 1 NODATA -> 5 points
    expect(pc.count).toBe(5)
    expect(pc.points.length).toBe(5)
    expect(pc.hasClassification).toBe(true)
    // Z should have been shifted so minZ ~ 0
    expect(pc.bounds.minZ).toBeCloseTo(0, 5)
    // Geo metadata available
    expect(pc.geo).toBeDefined()
    expect(pc.geo?.grid?.ncols).toBe(3)
    expect(pc.geo?.grid?.nrows).toBe(2)
    expect(pc.geo?.positionsMeters).toBeInstanceOf(Float32Array)
    expect(pc.geo?.heightGrid).toBeInstanceOf(Float32Array)
    // heightGrid should have length nrows*ncols with 1 NaN
    const hg = pc.geo!.heightGrid!
    expect(hg.length).toBe(6)
    const nanCount = Array.from(hg).filter((v) => Number.isNaN(v)).length
    expect(nanCount).toBe(1)
  })
})

