import React, { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
  loading?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onFileSelect, loading }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        onFileSelect(e.dataTransfer.files[0]);
      }
    },
    [onFileSelect]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        onFileSelect(e.target.files[0]);
      }
    },
    [onFileSelect]
  );

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragActive
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-600 hover:border-gray-500'
      } ${loading ? 'opacity-50 pointer-events-none' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept=".xyz,.txt,.las,.laz,.asc"
        onChange={handleChange}
        disabled={loading}
      />

      <label
        htmlFor="file-upload"
        className="cursor-pointer flex flex-col items-center gap-3"
      >
        {loading ? (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        ) : (
          <Upload className="w-12 h-12 text-gray-400" />
        )}

        <div>
          <p className="text-lg font-medium text-gray-200">
            {loading ? 'Loading...' : 'Upload LiDAR Data'}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Drop file here or click to browse
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Supports: XYZ, LAS, LAZ, ASC (AAIGrid)
          </p>
        </div>
      </label>
    </div>
  );
};
