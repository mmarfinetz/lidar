import { useState, useCallback, useRef } from 'react';
import { Viewer3D } from './components/Viewer3D';
import { MapSelector } from './components/MapSelector';
import { DtmUploadPanel } from './components/DtmUploadPanel';
import { LayerControls } from './components/LayerControls';
import { ColorGradientSelector } from './components/ColorGradientSelector';
import { StatsPanel } from './components/StatsPanel';
import { LayerManager } from './core/LayerManager';
import { ElevationAPI, type BoundingBox } from './core/ElevationAPI';
import type { PointCloudData, ColorGradient } from './types/lidar';
import { COLOR_GRADIENTS } from './utils/colorMaps';
import { RotateCcw, Github, Sparkles } from 'lucide-react';

function App() {
  const [pointCloudData, setPointCloudData] = useState<PointCloudData | null>(null);
  const [inputMode, setInputMode] = useState<'map' | 'upload'>('map');
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [surfaceVisible, setSurfaceVisible] = useState(true);
  const [terrainVisible, setTerrainVisible] = useState(true);
  const [surfaceOpacity, setSurfaceOpacity] = useState(1.0);
  const [terrainOpacity, setTerrainOpacity] = useState(1.0);
  const [currentGradient, setCurrentGradient] = useState('elevation');

  const layerManagerRef = useRef<LayerManager | null>(null);

  const handleRegionSelect = useCallback(async (bbox: BoundingBox, dataset: string) => {
    setLoading(true);
    setError(null);
    setLoadProgress(0);

    try {
      const data = await ElevationAPI.fetchElevationData(bbox, dataset, (progress, status) => {
        setLoadProgress(progress);
        console.log(`${status} (${Math.round(progress)}%)`);
      });

      setPointCloudData(data);
      console.log('Elevation data loaded successfully:', data);
    } catch (err) {
      console.error('Error loading elevation data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch elevation data');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLayerManagerReady = useCallback((manager: LayerManager) => {
    layerManagerRef.current = manager;
  }, []);

  const handleSurfaceVisibilityChange = useCallback((visible: boolean) => {
    setSurfaceVisible(visible);
    layerManagerRef.current?.setLayerVisibility('surface', visible);
  }, []);

  const handleTerrainVisibilityChange = useCallback((visible: boolean) => {
    setTerrainVisible(visible);
    layerManagerRef.current?.setLayerVisibility('terrain', visible);
  }, []);

  const handleSurfaceOpacityChange = useCallback((opacity: number) => {
    setSurfaceOpacity(opacity);
    layerManagerRef.current?.setLayerOpacity('surface', opacity);
  }, []);

  const handleTerrainOpacityChange = useCallback((opacity: number) => {
    setTerrainOpacity(opacity);
    layerManagerRef.current?.setLayerOpacity('terrain', opacity);
  }, []);

  const handleGradientChange = useCallback((gradient: ColorGradient) => {
    const gradientKey = Object.keys(COLOR_GRADIENTS).find(
      key => COLOR_GRADIENTS[key].name === gradient.name
    );
    if (gradientKey) {
      setCurrentGradient(gradientKey);
      layerManagerRef.current?.setColorGradient(gradient);
    }
  }, []);

  const handleReset = useCallback(() => {
    setPointCloudData(null);
    setError(null);
    setInputMode('map');
    setSurfaceVisible(true);
    setTerrainVisible(true);
    setSurfaceOpacity(1.0);
    setTerrainOpacity(1.0);
    setCurrentGradient('elevation');
  }, []);

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0e1a] text-gray-100">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                LiDAR Visualizer
              </h1>
              <p className="text-xs text-gray-400">Multi-Layer Point Cloud Analysis</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {pointCloudData && (
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            )}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="View on GitHub"
            >
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="w-full flex-1 min-h-0">
        {!pointCloudData ? (
          /* Input Selection Screen */
          <div className="w-full h-full flex min-h-0">
            
            {/* Sidebar */}
            <div className="w-80 bg-gray-900/95 backdrop-blur-sm border-r border-gray-700 flex flex-col">
              
              {/* Mode Selection Header */}
              <div className="p-6 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">Choose Data Source</h2>
                
                <div className="space-y-3">
                  <button
                    onClick={() => setInputMode('map')}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      inputMode === 'map'
                        ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                        : 'bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-800/70 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">🗺️</div>
                      <div>
                        <div className="font-medium">Select from Map</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Browse and select regions using OpenTopography datasets
                        </div>
                      </div>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => setInputMode('upload')}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      inputMode === 'upload'
                        ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                        : 'bg-gray-800/50 border-gray-600 text-gray-300 hover:bg-gray-800/70 hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">📁</div>
                      <div>
                        <div className="font-medium">Upload Files</div>
                        <div className="text-xs text-gray-400 mt-1">
                          Upload LAS, LAZ, XYZ, or processed DTM files
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-hidden">
                {inputMode === 'upload' && (
                  <div className="p-6">
                    <DtmUploadPanel onLoaded={setPointCloudData} />
                  </div>
                )}
              </div>

              {/* Status Footer */}
              <div className="border-t border-gray-700">
                {/* Loading State */}
                {loading && (
                  <div className="p-4 bg-gray-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-300">Processing data...</span>
                      <span className="text-sm text-gray-400">{Math.round(loadProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${loadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {error && (
                  <div className="p-4 bg-red-900/20 border-t border-red-800/50">
                    <div className="text-sm text-red-400 font-medium mb-1">Error</div>
                    <div className="text-xs text-red-300">{error}</div>
                  </div>
                )}

                {/* Info Footer */}
                {!loading && !error && (
                  <div className="p-4 bg-gray-900/30">
                    <div className="text-xs text-gray-500">
                      {inputMode === 'map' 
                        ? "🎯 Find and analyze terrain data from global datasets"
                        : "📊 Supported: .las, .laz, .xyz, .txt, .asc files"
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 relative min-h-0">
              {inputMode === 'map' ? (
                <MapSelector onRegionSelect={handleRegionSelect} loading={loading} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                  <div className="text-center">
                    <div className="text-8xl mb-6 opacity-50">📁</div>
                    <h3 className="text-2xl font-semibold text-gray-300 mb-3">Upload Your Data Files</h3>
                    <p className="text-gray-400 max-w-md mx-auto mb-8 leading-relaxed">
                      Drag and drop your LiDAR point cloud files or processed elevation data. 
                      Supported formats include LAS, LAZ, XYZ, and ASCII Grid.
                    </p>
                    <div className="bg-gray-800/50 rounded-lg p-8 border-2 border-dashed border-gray-600 max-w-md mx-auto">
                      <DtmUploadPanel onLoaded={setPointCloudData} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Viewer Screen */
          <div className="w-full h-full relative">
            <Viewer3D data={pointCloudData} onReady={handleLayerManagerReady} />

            {/* Control Panels */}
            <div className="absolute top-4 right-4 space-y-4 max-w-xs">
              <StatsPanel data={pointCloudData} />
              <LayerControls
                surfaceVisible={surfaceVisible}
                terrainVisible={terrainVisible}
                surfaceOpacity={surfaceOpacity}
                terrainOpacity={terrainOpacity}
                onSurfaceVisibilityChange={handleSurfaceVisibilityChange}
                onTerrainVisibilityChange={handleTerrainVisibilityChange}
                onSurfaceOpacityChange={handleSurfaceOpacityChange}
                onTerrainOpacityChange={handleTerrainOpacityChange}
              />
              <ColorGradientSelector
                currentGradient={currentGradient}
                onGradientChange={handleGradientChange}
              />
            </div>

            {/* Help Text */}
            <div className="absolute bottom-4 left-4 bg-gray-900/80 backdrop-blur-sm rounded-lg px-4 py-2 border border-gray-700">
              <p className="text-xs text-gray-400">
                <span className="font-medium text-gray-300">Controls:</span> Left-click + drag to rotate • Right-click + drag to pan • Scroll to zoom
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
