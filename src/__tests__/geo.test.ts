import { describe, it, expect } from 'vitest'
import { metersPerDegree, approximateStaticMapZoom } from '../utils/geo'

describe('utils/geo', () => {
  it('metersPerDegree behaves reasonably across latitudes', () => {
    const eq = metersPerDegree(0)
    const lat60 = metersPerDegree(60)
    // Rough sanity checks (not exact equality)
    expect(eq.lat).toBeGreaterThan(110000)
    expect(eq.lat).toBeLessThan(112000)
    expect(eq.lon).toBeGreaterThan(110000)
    expect(lat60.lon).toBeLessThan(eq.lon)
  })

  it('approximateStaticMapZoom returns small zoom for world, large for tiny bbox', () => {
    const world = approximateStaticMapZoom(-80, 80, -180, 180, 256)
    expect(world).toBeGreaterThanOrEqual(0)
    expect(world).toBeLessThanOrEqual(2)

    const tiny = approximateStaticMapZoom(0, 0.01, 0, 0.01, 1024)
    expect(tiny).toBeGreaterThanOrEqual(10)
    expect(tiny).toBeLessThanOrEqual(21)
  })
})

