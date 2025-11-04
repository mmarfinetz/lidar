/**
 * High-Resolution LiDAR Processing Service
 * Seamlessly integrates map selection with high-resolution archaeological processing
 */

import type { BoundingBox } from './ElevationAPI';
import { USGSLidarService, type USGSProduct } from './USGSLidarService';
import { DataAvailabilityService } from './DataAvailabilityService';

export interface ProcessingOptions {
  resolution?: number;          // Target resolution in meters (auto-detected if not specified)
  terrainType: 'dense_forest' | 'mixed' | 'archaeological';
  method: 'existing-class' | 'smrf';
  generateAdvancedProducts: boolean; // Include SVF, LRM, curvature analysis
}

export interface ProcessingStatus {
  stage: string;
  progress: number;
  message: string;
  substage?: string;
}

export interface ProcessingResult {
  success: boolean;
  outputPath?: string;
  dtmPath?: string;        // Path to bare-earth ASCII grid for web app
  compositePath?: string;  // Path to enhanced archaeological composite
  products: string[];      // List of all generated products
  processingReport: string;
  error?: string;
}

export class HighResolutionProcessor {
  
  /**
   * Analyze region and recommend optimal processing parameters
   */
  static async analyzeRegion(bbox: BoundingBox): Promise<{
    recommendedResolution: number;
    terrainType: 'dense_forest' | 'mixed' | 'archaeological';
    processingMethod: 'existing-class' | 'smrf';
    expectedQuality: 'archaeological' | 'high' | 'medium' | 'low';
    estimatedProcessingTime: number; // minutes
    dataSize: number; // MB
  }> {
    // Check data availability first
    const availability = await DataAvailabilityService.checkAvailability(bbox);
    
    // Calculate area for processing estimates
    const latDiff = bbox.north - bbox.south;
    const lonDiff = bbox.east - bbox.west;
    const areaKm2 = latDiff * lonDiff * 111.32 * 111.32; // Approximate km²
    
    // Determine optimal resolution based on data quality and area
    let recommendedResolution = 1.0; // Default
    if (availability.expectedQuality === 'archaeological') {
      recommendedResolution = Math.min(0.25, 5.0 / Math.sqrt(areaKm2)); // Higher res for smaller areas
    } else if (availability.expectedQuality === 'high') {
      recommendedResolution = Math.min(0.5, 10.0 / Math.sqrt(areaKm2));
    } else if (availability.expectedQuality === 'medium') {
      recommendedResolution = Math.min(1.0, 20.0 / Math.sqrt(areaKm2));
    } else {
      recommendedResolution = Math.max(2.0, Math.sqrt(areaKm2) / 10.0);
    }
    
    // Estimate terrain type based on location and data characteristics
    let terrainType: 'dense_forest' | 'mixed' | 'archaeological' = 'mixed';
    
    // Known archaeological regions
    const archaeologicalRegions = [
      { name: 'Maya Lowlands', south: 14.0, north: 22.0, west: -92.5, east: -86.0 },
      { name: 'Angkor', south: 13.0, north: 14.0, west: 103.0, east: 104.5 },
      { name: 'Mediterranean', south: 30.0, north: 47.0, west: -10.0, east: 45.0 },
    ];
    
    const inArchaeologicalRegion = archaeologicalRegions.some(region =>
      bbox.south < region.north && bbox.north > region.south &&
      bbox.west < region.east && bbox.east > region.west
    );
    
    if (inArchaeologicalRegion || availability.bestSource.name.toLowerCase().includes('archaeological')) {
      terrainType = 'archaeological';
    } else {
      // Dense forest regions (tropical/subtropical)
      const denseForestRegions = [
        { south: -10.0, north: 10.0, west: -80.0, east: -50.0 }, // Amazon
        { south: -10.0, north: 10.0, west: 10.0, east: 30.0 },   // Central Africa
        { south: -10.0, north: 20.0, west: 90.0, east: 150.0 },  // Southeast Asia
      ];
      
      const inDenseForest = denseForestRegions.some(region =>
        bbox.south < region.north && bbox.north > region.south &&
        bbox.west < region.east && bbox.east > region.west
      );
      
      terrainType = inDenseForest ? 'dense_forest' : 'mixed';
    }
    
    // Choose processing method based on data quality and terrain
    const processingMethod = (availability.expectedQuality === 'low' || terrainType === 'dense_forest') ? 'smrf' : 'existing-class';
    
    // Estimate processing time (rough heuristic)
    const baseProcessingTime = areaKm2 * 2; // 2 minutes per km² base
    const resolutionMultiplier = 1.0 / (recommendedResolution * recommendedResolution); // Higher resolution = longer processing
    const estimatedProcessingTime = Math.max(1, baseProcessingTime * resolutionMultiplier);
    
    // Estimate data size
    const pointsEstimated = availability.estimatedPoints;
    const dataSize = Math.max(10, pointsEstimated * 0.000001); // Rough estimate in MB
    
    return {
      recommendedResolution,
      terrainType,
      processingMethod,
      expectedQuality: availability.expectedQuality,
      estimatedProcessingTime: Math.min(estimatedProcessingTime, 120), // Cap at 2 hours
      dataSize
    };
  }

  /**
   * Get downloadable data products for a region
   */
  static async getDownloadableProducts(bbox: BoundingBox): Promise<{
    usgsProducts: USGSProduct[];
    openTopoProducts: Array<{
      id: string;
      title: string;
      downloadUrl: string;
      format: string;
      resolution: string;
    }>;
    downloadInstructions: string;
  }> {
    try {
      // Get USGS products
      const usgsAvailability = await USGSLidarService.checkLidarAvailability(bbox);
      const downloadInstructions = USGSLidarService.generateDownloadInstructions(usgsAvailability.products);
      
      // Get OpenTopography collections (from ElevationAPI)
      const { ElevationAPI } = await import('./ElevationAPI');
      const openTopoCollections = await ElevationAPI.searchLidarCollections(bbox);
      
      const openTopoProducts = openTopoCollections.map(collection => ({
        id: collection.id,
        title: collection.title,
        downloadUrl: collection.downloadUrl || '',
        format: collection.dataType,
        resolution: collection.resolution
      }));

      return {
        usgsProducts: usgsAvailability.products,
        openTopoProducts,
        downloadInstructions
      };
    } catch (error) {
      console.error('Error fetching downloadable products:', error);
      return {
        usgsProducts: [],
        openTopoProducts: [],
        downloadInstructions: 'Unable to fetch download information at this time.'
      };
    }
  }

  /**
   * Generate processing command for downloaded LiDAR data
   */
  static generateProcessingCommand(
    inputPath: string,
    outputPath: string,
    options: ProcessingOptions
  ): string {
    const cmd = [
      'python scripts/archaeology_lidar_workflow.py',
      `--input "${inputPath}"`,
      `--out "${outputPath}"`,
      `--terrain-type ${options.terrainType}`,
      `--method ${options.method}`
    ];

    if (options.resolution) {
      cmd.push(`--resolution ${options.resolution}`);
    } else {
      cmd.push('--auto-resolution');
    }

    return cmd.join(' ');
  }

  /**
   * Generate complete processing workflow instructions
   */
  static generateWorkflowInstructions(
    bbox: BoundingBox,
    analysis: Awaited<ReturnType<typeof HighResolutionProcessor.analyzeRegion>>
  ): string {
    const coords = `${bbox.north.toFixed(4)}, ${bbox.south.toFixed(4)}, ${bbox.east.toFixed(4)}, ${bbox.west.toFixed(4)}`;
    
    return `
🎯 **High-Resolution Archaeological Processing Workflow**

📊 **Region Analysis:**
- Coordinates: ${coords}
- Expected Quality: ${analysis.expectedQuality}
- Recommended Resolution: ${analysis.recommendedResolution}m
- Terrain Type: ${analysis.terrainType.replace('_', ' ')}
- Processing Time: ~${Math.round(analysis.estimatedProcessingTime)} minutes

🔧 **Optimized Processing Command:**
\`\`\`bash
${this.generateProcessingCommand(
  '/path/to/downloaded/lidar',
  './outputs/archaeological_site',
  {
    terrainType: analysis.terrainType,
    method: analysis.processingMethod,
    generateAdvancedProducts: true
  }
)}
\`\`\`

📥 **Download Steps:**
1. Use the coordinates above to download LiDAR data from USGS National Map or OpenTopography
2. Create input directory: \`mkdir -p /path/to/downloaded/lidar\`
3. Place all LAZ/LAS files in the input directory
4. Run the processing command above
5. Upload \`outputs/archaeological_site/DTM_bareearth.asc\` to this web app

✨ **What This Will Reveal:**
- Building foundations and walls beneath vegetation
- Ancient roads and pathways
- Defensive earthworks and terraces
- Plaza areas and ceremonial platforms
- Water management features (canals, reservoirs)

🎨 **Visualization Products:**
- Enhanced RRIM composite highlighting structures
- Sky View Factor showing depressions and enclosures
- Local Relief Model emphasizing subtle topographic features
- Multi-directional hillshade revealing linear features

💡 **Pro Tips:**
- Use \`--terrain-type archaeological\` for known sites
- Use \`--terrain-type dense_forest\` in heavily vegetated areas
- Lower resolution (0.25-0.5m) reveals more detail but takes longer
- Install RVT (\`pip install rvt\`) for advanced visualization products
`;
  }
}
