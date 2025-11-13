import React, { useRef, useCallback, useState } from 'react';
import { Eye, EyeOff, Layers, Grid3X3 } from 'lucide-react';
import { debounce } from '../utils/performance';

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
  // Local state for immediate UI feedback
  const [localSurfaceOpacity, setLocalSurfaceOpacity] = useState(surfaceOpacity);
  const [localTerrainOpacity, setLocalTerrainOpacity] = useState(terrainOpacity);

  // Create debounced handlers for performance
  const debouncedSurfaceOpacityChange = useRef(
    debounce((opacity: number) => onSurfaceOpacityChange(opacity), 50)
  ).current;

  const debouncedTerrainOpacityChange = useRef(
    debounce((opacity: number) => onTerrainOpacityChange(opacity), 50)
  ).current;

  // Handle surface opacity change with immediate UI update and debounced actual change
  const handleSurfaceOpacityChange = useCallback((value: number) => {
    setLocalSurfaceOpacity(value);
    debouncedSurfaceOpacityChange(value);
  }, [debouncedSurfaceOpacityChange]);

  // Handle terrain opacity change with immediate UI update and debounced actual change
  const handleTerrainOpacityChange = useCallback((value: number) => {
    setLocalTerrainOpacity(value);
    debouncedTerrainOpacityChange(value);
  }, [debouncedTerrainOpacityChange]);

  // Update local state when props change
  React.useEffect(() => {
    setLocalSurfaceOpacity(surfaceOpacity);
  }, [surfaceOpacity]);

  React.useEffect(() => {
    setLocalTerrainOpacity(terrainOpacity);
  }, [terrainOpacity]);
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
              value={localSurfaceOpacity}
              onChange={(e) => handleSurfaceOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="text-xs text-gray-500 text-right">
              {Math.round(localSurfaceOpacity * 100)}%
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
              value={localTerrainOpacity}
              onChange={(e) => handleTerrainOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="text-xs text-gray-500 text-right">
              {Math.round(localTerrainOpacity * 100)}%
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
