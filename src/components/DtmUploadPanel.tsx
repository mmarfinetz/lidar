import React, { useCallback, useState } from 'react';
import { FileUploader } from './FileUploader';
import { loadAsciiGrid } from '../core/AsciiGridLoader';
import type { PointCloudData } from '../types/lidar';
import { Info } from 'lucide-react';

interface DtmUploadPanelProps {
  onLoaded: (data: PointCloudData) => void;
}

export const DtmUploadPanel: React.FC<DtmUploadPanelProps> = ({ onLoaded }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFileSelect = useCallback(async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext !== 'asc') {
        throw new Error('Please upload an ASCII Grid (.asc) file exported from the workflow');
      }
      const data = await loadAsciiGrid(file);
      onLoaded(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ASCII Grid');
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  return (
    <div className="w-full">
      <FileUploader onFileSelect={onFileSelect} loading={loading} />
      
      {error && (
        <div className="mt-4 p-3 bg-red-900/40 border border-red-700 rounded text-sm text-red-300 flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-800/30 rounded-lg border border-gray-600">
        <h4 className="text-sm font-medium text-gray-300 mb-2">📋 Supported Formats</h4>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• <span className="font-mono text-gray-300">.asc</span> - ASCII Grid (processed DTM)</li>
          <li>• <span className="font-mono text-gray-300">.las/.laz</span> - LiDAR point clouds</li>
          <li>• <span className="font-mono text-gray-300">.xyz/.txt</span> - XYZ point data</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
        <h4 className="text-sm font-medium text-blue-300 mb-2">🧙‍♂️ Pro Tip</h4>
        <p className="text-xs text-gray-400 leading-relaxed">
          For archaeological analysis, use the Python workflow in <span className="font-mono text-gray-300">scripts/</span> 
          to process raw LiDAR into bare-earth DTM files that reveal hidden structures.
        </p>
      </div>
    </div>
  );
};

