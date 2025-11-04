import { describe, it, expect } from 'vitest'
import { COLOR_GRADIENTS, getColorFromGradient, applyElevationColors } from '../utils/colorMaps'

function colorToHex(c: { r: number; g: number; b: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

describe('utils/colorMaps', () => {
  it('getColorFromGradient clamps to endpoints (compares against same API)', () => {
    const g = COLOR_GRADIENTS.coolWarm
    const c0 = getColorFromGradient(-1, g)
    const c0e = getColorFromGradient(0, g)
    const c1 = getColorFromGradient(2, g)
    const c1e = getColorFromGradient(1, g)
    expect(colorToHex(c0)).toBe(colorToHex(c0e))
    expect(colorToHex(c1)).toBe(colorToHex(c1e))
  })

  it('getColorFromGradient interpolates between stops', () => {
    const g = COLOR_GRADIENTS.viridis
    const mid = getColorFromGradient(0.5, g)
    // Should not equal endpoints exactly
    expect(colorToHex(mid)).not.toBe(g.colors[0].toLowerCase())
    expect(colorToHex(mid)).not.toBe(g.colors[g.colors.length - 1].toLowerCase())
  })

  it('applyElevationColors writes normalized gradient colors', () => {
    const points = new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 2]) // z values: 0,1,2
    const colors = new Float32Array(9)
    const g = COLOR_GRADIENTS.plasma
    applyElevationColors(points, colors, 0, 2, g, 2)

    const c0 = { r: colors[0], g: colors[1], b: colors[2] }
    const c1 = { r: colors[3], g: colors[4], b: colors[5] }
    const c2 = { r: colors[6], g: colors[7], b: colors[8] }

    const c0e = getColorFromGradient(0, g)
    const c1e = getColorFromGradient(0.5, g)
    const c2e = getColorFromGradient(1, g)
    expect(colorToHex(c0)).toBe(colorToHex(c0e))
    expect(colorToHex(c1)).toBe(colorToHex(c1e))
    expect(colorToHex(c2)).toBe(colorToHex(c2e))
  })
})
