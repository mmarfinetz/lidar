import React from 'react';
import { Palette } from 'lucide-react';
import type { ColorGradient } from '../types/lidar';
import { COLOR_GRADIENTS } from '../utils/colorMaps';

interface ColorGradientSelectorProps {
  currentGradient: string;
  onGradientChange: (gradient: ColorGradient) => void;
}

export const ColorGradientSelector: React.FC<ColorGradientSelectorProps> = ({
  currentGradient,
  onGradientChange,
}) => {
  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-xl">
      <div className="flex items-center gap-2 mb-3">
        <Palette className="w-5 h-5 text-purple-400" />
        <h3 className="text-sm font-semibold text-gray-200">Color Scheme</h3>
      </div>

      <div className="space-y-2">
        {Object.entries(COLOR_GRADIENTS).map(([key, gradient]) => (
          <button
            key={key}
            onClick={() => onGradientChange(gradient)}
            className={`w-full p-2 rounded-lg text-left transition-all ${
              currentGradient === key
                ? 'bg-blue-600/30 border border-blue-500'
                : 'bg-gray-800 border border-transparent hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-200">
                {gradient.name}
              </span>
            </div>
            <div
              className="h-3 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${gradient.colors.join(', ')})`,
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};
