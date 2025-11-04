import React from 'react';
import { Eye, EyeOff, Layers, Grid3X3 } from 'lucide-react';

interface LayerControlsProps {
  surfaceVisible: boolean;
  terrainVisible: boolean;
  surfaceOpacity: number;
  terrainOpacity: number;
  gridVisible: boolean;
  onSurfaceVisibilityChange: (visible: boolean) => void;
  onTerrainVisibilityChange: (visible: boolean) => void;
  onSurfaceOpacityChange: (opacity: number) => void;
  onTerrainOpacityChange: (opacity: number) => void;
  onGridVisibilityChange: (visible: boolean) => void;
}

export const LayerControls: React.FC<LayerControlsProps> = ({
  surfaceVisible,
  terrainVisible,
  surfaceOpacity,
  terrainOpacity,
  gridVisible,
  onSurfaceVisibilityChange,
  onTerrainVisibilityChange,
  onSurfaceOpacityChange,
  onTerrainOpacityChange,
  onGridVisibilityChange,
}) => {
  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-xl">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-5 h-5 text-blue-400" />
        <h3 className="text-sm font-semibold text-gray-200">Layer Controls</h3>
      </div>

      {/* Surface Layer */}
      <div className="mb-4 pb-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Surface Layer</span>
          <button
            onClick={() => onSurfaceVisibilityChange(!surfaceVisible)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
            title={surfaceVisible ? 'Hide layer' : 'Show layer'}
          >
            {surfaceVisible ? (
              <Eye className="w-4 h-4 text-green-400" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>

        {surfaceVisible && (
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={surfaceOpacity}
              onChange={(e) => onSurfaceOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="text-xs text-gray-500 text-right">
              {Math.round(surfaceOpacity * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* Terrain Layer */}
      <div className="mb-4 pb-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Terrain Layer</span>
          <button
            onClick={() => onTerrainVisibilityChange(!terrainVisible)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
            title={terrainVisible ? 'Hide layer' : 'Show layer'}
          >
            {terrainVisible ? (
              <Eye className="w-4 h-4 text-blue-400" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>

        {terrainVisible && (
          <div className="space-y-1">
            <label className="text-xs text-gray-400">Opacity</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={terrainOpacity}
              onChange={(e) => onTerrainOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="text-xs text-gray-500 text-right">
              {Math.round(terrainOpacity * 100)}%
            </div>
          </div>
        )}
      </div>

      {/* Grid Control */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-300">Grid</span>
          <button
            onClick={() => onGridVisibilityChange(!gridVisible)}
            className="p-1 rounded hover:bg-gray-700 transition-colors"
            title={gridVisible ? 'Hide grid' : 'Show grid'}
          >
            {gridVisible ? (
              <Grid3X3 className="w-4 h-4 text-yellow-400" />
            ) : (
              <Grid3X3 className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>

      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 14px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
        }
        .slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #3b82f6;
          cursor: pointer;
          border-radius: 50%;
          border: none;
        }
      `}</style>
    </div>
  );
};
