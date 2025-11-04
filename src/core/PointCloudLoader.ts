/**
 * Point Cloud Loader
 * Supports XYZ, LAS, and LAZ formats
 */

import type { LiDARPoint, PointCloudData, FileFormat } from '../types/lidar';
import { calculateBounds, normalizePoints } from '../utils/spatial';

export class PointCloudLoader {
  /**
   * Detect file format from extension
   */
  static detectFormat(filename: string): FileFormat {
    const ext = filename.toLowerCase().split('.').pop();
    switch (ext) {
      case 'xyz':
      case 'txt':
        return 'xyz';
      case 'las':
        return 'las';
      case 'laz':
        return 'laz';
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Load point cloud from file
   */
  static async load(file: File, onProgress?: (progress: number) => void): Promise<PointCloudData> {
    const format = this.detectFormat(file.name);

    switch (format) {
      case 'xyz':
        return this.loadXYZ(file, onProgress);
      case 'las':
        return this.loadLAS(file, onProgress);
      case 'laz':
        return this.loadLAZ(file, onProgress);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Parse XYZ text format
   * Format: X Y Z [Intensity] [R G B] [Classification]
   */
  static async loadXYZ(file: File, onProgress?: (progress: number) => void): Promise<PointCloudData> {
    const text = await file.text();
    const lines = text.trim().split('\n');
    const points: LiDARPoint[] = [];

    let hasColor = false;
    let hasClassification = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;

      const values = line.split(/\s+/).map(Number);
      if (values.length < 3) continue;

      const point: LiDARPoint = {
        x: values[0],
        y: values[1],
        z: values[2],
      };

      // Optional intensity (4th column)
      if (values.length >= 4) {
        point.intensity = values[3];
      }

      // Optional RGB color (5th, 6th, 7th columns)
      if (values.length >= 7) {
        point.r = values[4];
        point.g = values[5];
        point.b = values[6];
        hasColor = true;
      }

      // Optional classification (8th column)
      if (values.length >= 8) {
        point.classification = values[7];
        hasClassification = true;
      }

      points.push(point);

      // Progress update every 10000 points
      if (i % 10000 === 0 && onProgress) {
        onProgress((i / lines.length) * 100);
      }
    }

    onProgress?.(100);

    // Calculate bounds before normalization (needed for the normalization process)
    const originalBounds = calculateBounds(points);
    normalizePoints(points, originalBounds);

    // Recalculate bounds after normalization to get correct normalized coordinates
    const normalizedBounds = calculateBounds(points);

    return {
      points,
      bounds: normalizedBounds,
      count: points.length,
      hasColor,
      hasClassification,
    };
  }

  /**
   * Parse LAS binary format
   * Reference: https://www.asprs.org/wp-content/uploads/2010/12/LAS_1_4_r13.pdf
   */
  static async loadLAS(file: File, onProgress?: (progress: number) => void): Promise<PointCloudData> {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // Read LAS header (version 1.2/1.3/1.4)
    const signature = new TextDecoder().decode(buffer.slice(0, 4));
    if (signature !== 'LASF') {
      throw new Error('Invalid LAS file: missing LASF signature');
    }

    // Version info (for future use)
    // const versionMajor = view.getUint8(24);
    // const versionMinor = view.getUint8(25);
    // const headerSize = view.getUint16(94, true);
    const offsetToPoints = view.getUint32(96, true);
    const pointDataFormat = view.getUint8(104);
    const pointDataRecordLength = view.getUint16(105, true);
    const numberOfPoints = view.getUint32(107, true);

    // Scale and offset factors
    const xScale = view.getFloat64(131, true);
    const yScale = view.getFloat64(139, true);
    const zScale = view.getFloat64(147, true);
    const xOffset = view.getFloat64(155, true);
    const yOffset = view.getFloat64(163, true);
    const zOffset = view.getFloat64(171, true);

    const points: LiDARPoint[] = [];
    let hasColor = pointDataFormat === 2 || pointDataFormat === 3 || pointDataFormat === 5;
    let hasClassification = true;

    // Parse point records
    for (let i = 0; i < numberOfPoints; i++) {
      const offset = offsetToPoints + i * pointDataRecordLength;

      // Read scaled coordinates
      const x = view.getInt32(offset, true) * xScale + xOffset;
      const y = view.getInt32(offset + 4, true) * yScale + yOffset;
      const z = view.getInt32(offset + 8, true) * zScale + zOffset;
      const intensity = view.getUint16(offset + 12, true);
      const returnByte = view.getUint8(offset + 14);
      const classification = view.getUint8(offset + 15);

      const point: LiDARPoint = {
        x,
        y,
        z,
        intensity,
        classification,
        returnNumber: returnByte & 0x07,
        numberOfReturns: (returnByte >> 3) & 0x07,
      };

      // Read RGB if available (format 2, 3, or 5)
      if (hasColor) {
        let colorOffset = offset + 20;
        if (pointDataFormat === 3 || pointDataFormat === 5) {
          colorOffset = offset + 28; // Skip GPS time
        }

        point.r = view.getUint16(colorOffset, true) >> 8; // Scale from 16-bit to 8-bit
        point.g = view.getUint16(colorOffset + 2, true) >> 8;
        point.b = view.getUint16(colorOffset + 4, true) >> 8;
      }

      points.push(point);

      // Progress update
      if (i % 10000 === 0 && onProgress) {
        onProgress((i / numberOfPoints) * 100);
      }
    }

    onProgress?.(100);

    // Calculate bounds before normalization (needed for the normalization process)
    const originalBounds = calculateBounds(points);
    normalizePoints(points, originalBounds);

    // Recalculate bounds after normalization to get correct normalized coordinates
    const normalizedBounds = calculateBounds(points);

    return {
      points,
      bounds: normalizedBounds,
      count: points.length,
      hasColor,
      hasClassification,
    };
  }

  /**
   * Parse LAZ compressed format
   * Uses laz-perf library for decompression
   */
  static async loadLAZ(_file: File, _onProgress?: (progress: number) => void): Promise<PointCloudData> {
    // For now, throw error - will implement with laz-perf or laslaz.js
    // This requires WebAssembly module which is complex to integrate
    throw new Error('LAZ format support coming soon. Please convert to LAS or XYZ format.');

    // TODO: Integrate laz-perf decompression
    // const decompressed = await decompressLAZ(file);
    // return this.loadLAS(decompressed, onProgress);
  }
}
