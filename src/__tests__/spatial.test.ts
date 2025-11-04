import { describe, it, expect } from 'vitest'
import {
  calculateBounds,
  normalizePoints,
  pointsToTypedArrays,
  filterByClassification,
  decimatePoints,
} from '../utils/spatial'
import type { LiDARPoint } from '../types/lidar'

describe('utils/spatial', () => {
  it('calculateBounds returns correct mins and maxes', () => {
    const pts: LiDARPoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: -5, z: 2 },
      { x: -3, y: 8, z: 20 },
    ]
    const b = calculateBounds(pts)
    expect(b).toEqual({ minX: -3, maxX: 10, minY: -5, maxY: 8, minZ: 0, maxZ: 20 })
  })

  it('normalizePoints centers XY, shifts Z to start at 0 and scales to ~10 units', () => {
    const pts: LiDARPoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 10, z: 5 },
      { x: 10, y: 10, z: 20 },
    ]
    const before = calculateBounds(pts)
    normalizePoints(pts, before)
    const after = calculateBounds(pts)

    // Z min should be ~0 after normalization
    expect(after.minZ).toBeCloseTo(0, 5)
    // The largest range should be ~10 units
    const ranges = [after.maxX - after.minX, after.maxY - after.minY, after.maxZ - after.minZ]
    expect(Math.max(...ranges)).toBeCloseTo(10, 3)
    // XY should be roughly centered around 0
    expect((after.minX + after.maxX) / 2).toBeCloseTo(0, 3)
    expect((after.minY + after.maxY) / 2).toBeCloseTo(0, 3)
  })

  it('pointsToTypedArrays maps positions and colors; flags hasColor if any point has RGB', () => {
    const pts: LiDARPoint[] = [
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6, r: 255, g: 127, b: 0 },
    ]
    const { positions, colors, hasColor } = pointsToTypedArrays(pts)
    expect(positions).toHaveLength(6)
    expect(Array.from(positions)).toEqual([1, 2, 3, 4, 5, 6])
    expect(colors).toHaveLength(6)
    // First point default white
    expect(colors[0]).toBeCloseTo(1)
    expect(colors[1]).toBeCloseTo(1)
    expect(colors[2]).toBeCloseTo(1)
    // Second point reflects provided RGB
    expect(colors[3]).toBeCloseTo(1)
    expect(colors[4]).toBeCloseTo(127 / 255)
    expect(colors[5]).toBeCloseTo(0)
    expect(hasColor).toBe(true)
  })

  it('filterByClassification matches list and includes undefined classification', () => {
    const pts: LiDARPoint[] = [
      { x: 0, y: 0, z: 0, classification: 2 },
      { x: 1, y: 0, z: 0, classification: 5 },
      { x: 2, y: 0, z: 0 }, // undefined classification should pass through
    ]
    const out = filterByClassification(pts, [2])
    expect(out).toHaveLength(2)
    expect(out[0].classification).toBe(2)
    expect(out[1].classification).toBeUndefined()
  })

  it('decimatePoints reduces arrays by skip factor', () => {
    const count = 10
    const positions = new Float32Array(count * 3).map((_, i) => i)
    const colors = new Float32Array(count * 3).map((_, i) => i / 100)
    const { positions: p2, colors: c2, count: n } = decimatePoints(positions, colors, 2)
    expect(n).toBe(Math.ceil(count / 2))
    // Expect we kept indices 0,2,4,6,8
    expect(Array.from(p2.slice(0, 3 * n))).toEqual([
      0, 1, 2, // idx 0
      6, 7, 8, // idx 2
      12, 13, 14, // idx 4
      18, 19, 20, // idx 6
      24, 25, 26, // idx 8
    ])
    expect(c2.length).toBe(p2.length)
  })
})

