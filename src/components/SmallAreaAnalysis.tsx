import React from 'react';
import { X, Maximize2, ZoomIn, Map, Info, CheckCircle } from 'lucide-react';
import type { BoundingBox } from '../core/ElevationAPI';
import { TerrainTilesService } from '../core/TerrainTilesService';
import { DataAvailabilityService } from '../core/DataAvailabilityService';

interface SmallAreaAnalysisProps {
  bbox: BoundingBox;
  onClose: () => void;
  onAnalyze: (bbox: BoundingBox) => void;
}

export const SmallAreaAnalysis: React.FC<SmallAreaAnalysisProps> = ({ bbox, onClose, onAnalyze }) => {
  const coverage = DataAvailabilityService.calculateCoverage(bbox);
  const resInfo = TerrainTilesService.estimateResolution(bbox);

  // Check if this is a small area suitable for detailed analysis
  const area = (bbox.north - bbox.south) * (bbox.east - bbox.west);
  const isSmallArea = area < 0.01; // < ~1km x 1km
  const isVerySmallArea = area < 0.001; // < ~100m x 100m

  const handleAnalyze = () => {
    onAnalyze(bbox);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <ZoomIn className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Small Area Analysis</h2>
              <p className="text-sm text-gray-400">High-resolution terrain data</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Area Info */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Map className="w-4 h-4" />
              Selected Area
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Size:</span>
                <span className="text-gray-200 ml-2">
                  {coverage.kilometers.lat.toFixed(2)} x {coverage.kilometers.lon.toFixed(2)} km
                </span>
              </div>
              <div>
                <span className="text-gray-500">Area:</span>
                <span className="text-gray-200 ml-2">
                  {coverage.hectares.toFixed(1)} hectares
                </span>
              </div>
            </div>
          </div>

          {/* Resolution Info */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Maximize2 className="w-4 h-4" />
              Expected Resolution
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Zoom Level:</span>
                <span className="text-blue-400 font-mono">{resInfo.zoomLevel}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Resolution:</span>
                <span className="text-green-400 font-mono">{resInfo.resolution}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Meters/Pixel:</span>
                <span className="text-gray-300 font-mono">{resInfo.metersPerPixel.toFixed(1)}m</span>
              </div>
            </div>
          </div>

          {/* What Can You See */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              What You Can Detect
            </h3>
            <ul className="space-y-2 text-sm">
              {resInfo.metersPerPixel <= 5 && (
                <>
                  <li className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Large buildings and structures
                  </li>
                  <li className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Roads and pathways
                  </li>
                  <li className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    Terrain features (hills, valleys)
                  </li>
                </>
              )}
              {resInfo.metersPerPixel <= 10 && (
                <>
                  <li className="flex items-center gap-2 text-yellow-400">
                    <CheckCircle className="w-4 h-4" />
                    Major terrain variations
                  </li>
                  <li className="flex items-center gap-2 text-yellow-400">
                    <CheckCircle className="w-4 h-4" />
                    Large-scale features
                  </li>
                </>
              )}
              {resInfo.metersPerPixel > 10 && (
                <li className="flex items-center gap-2 text-gray-400">
                  <Info className="w-4 h-4" />
                  Regional terrain overview (select smaller area for more detail)
                </li>
              )}
            </ul>
          </div>

          {/* Tips */}
          {!isSmallArea && (
            <div className="bg-yellow-900/30 rounded-lg p-4 border border-yellow-700/50">
              <h3 className="text-sm font-medium text-yellow-400 mb-2">Tip: Select a Smaller Area</h3>
              <p className="text-sm text-yellow-200/80">
                For best results with structure detection, select an area smaller than 1km x 1km.
                Zoom in on the map and draw a small rectangle around your area of interest.
              </p>
            </div>
          )}

          {isVerySmallArea && (
            <div className="bg-green-900/30 rounded-lg p-4 border border-green-700/50">
              <h3 className="text-sm font-medium text-green-400 mb-2">Optimal Selection</h3>
              <p className="text-sm text-green-200/80">
                Your selection is small enough for maximum detail. AWS Terrain Tiles will provide
                the highest available resolution for this area.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAnalyze}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
          >
            <ZoomIn className="w-4 h-4" />
            Analyze Area
          </button>
        </div>
      </div>
    </div>
  );
};
