import { describe, it, expect } from 'vitest'
import { PointCloudLoader } from '../core/PointCloudLoader'

function fileFromString(name: string, content: string, type = 'text/plain'): File {
  return new File([content], name, { type })
}

describe('core/PointCloudLoader', () => {
  it('detectFormat identifies extensions', () => {
    expect(PointCloudLoader.detectFormat('data.xyz')).toBe('xyz')
    expect(PointCloudLoader.detectFormat('data.txt')).toBe('xyz')
    expect(PointCloudLoader.detectFormat('cloud.las')).toBe('las')
    expect(PointCloudLoader.detectFormat('cloud.laz')).toBe('laz')
    expect(() => PointCloudLoader.detectFormat('unknown.bin')).toThrow()
  })

  it('loadXYZ parses simple XYZ with optional fields and normalizes bounds', async () => {
    const content = [
      '# sample',
      '0 0 0 10 255 0 0 2', // with intensity, rgb, class
      '10 0 5', // bare xyz
    ].join('\n')
    const file = fileFromString('sample.xyz', content)
    const pc = await PointCloudLoader.loadXYZ(file)
    expect(pc.count).toBe(2)
    expect(pc.hasColor).toBe(true) // one point had RGB
    // Largest dimension should be ~<= 10 after normalization
    const rX = pc.bounds.maxX - pc.bounds.minX
    const rY = pc.bounds.maxY - pc.bounds.minY
    const rZ = pc.bounds.maxZ - pc.bounds.minZ
    expect(Math.max(rX, rY, rZ)).toBeLessThanOrEqual(10.0001)
  })

  it('loadLAS throws on invalid signature', async () => {
    const bad = new Uint8Array([0x58, 0x58, 0x58, 0x58]) // 'XXXX'
    const file = new File([bad], 'bad.las', { type: 'application/octet-stream' })
    await expect(PointCloudLoader.loadLAS(file)).rejects.toThrow(/Invalid LAS file/)
  })

  it('loadLAZ indicates unimplemented support', async () => {
    const file = fileFromString('sample.laz', 'fake')
    await expect(PointCloudLoader.loadLAZ(file)).rejects.toThrow(/LAZ format support/)
  })
})

