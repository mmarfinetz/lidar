import React from 'react';
import { BarChart3, Box, Ruler } from 'lucide-react';
import type { PointCloudData } from '../types/lidar';

interface StatsPanelProps {
  data: PointCloudData | null;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ data }) => {
  if (!data) return null;

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatCoord = (num: number) => {
    return num.toFixed(2);
  };

  const rangeX = data.bounds.maxX - data.bounds.minX;
  const rangeY = data.bounds.maxY - data.bounds.minY;
  const rangeZ = data.bounds.maxZ - data.bounds.minZ;

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-green-400" />
        <h3 className="text-sm font-semibold text-gray-200">Dataset Info</h3>
      </div>

      <div className="space-y-3 text-xs">
        {/* Point Count */}
        <div>
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <Box className="w-3 h-3" />
            <span>Points</span>
          </div>
          <div className="text-gray-200 font-mono pl-5">
            {formatNumber(data.count)}
          </div>
        </div>

        {/* Bounds */}
        <div>
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <Ruler className="w-3 h-3" />
            <span>Dimensions</span>
          </div>
          <div className="text-gray-200 font-mono pl-5 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">X:</span>
              <span>{formatCoord(rangeX)} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Y:</span>
              <span>{formatCoord(rangeY)} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Z:</span>
              <span>{formatCoord(rangeZ)} units</span>
            </div>
          </div>
        </div>

        {/* Elevation Range */}
        <div>
          <div className="text-gray-400 mb-1">Elevation Range</div>
          <div className="text-gray-200 font-mono pl-5 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Min:</span>
              <span>{formatCoord(data.bounds.minZ)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Max:</span>
              <span>{formatCoord(data.bounds.maxZ)}</span>
            </div>
          </div>
        </div>

        {/* Features */}
        <div>
          <div className="text-gray-400 mb-1">Features</div>
          <div className="text-gray-200 font-mono pl-5 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-400">Color:</span>
              <span className={data.hasColor ? 'text-green-400' : 'text-gray-500'}>
                {data.hasColor ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Classification:</span>
              <span className={data.hasClassification ? 'text-green-400' : 'text-gray-500'}>
                {data.hasClassification ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
