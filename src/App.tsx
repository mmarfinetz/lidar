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
  const [gridVisible, setGridVisible] = useState(true);
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

  const handleGridVisibilityChange = useCallback((visible: boolean) => {
    setGridVisible(visible);
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
    setGridVisible(true);
    setCurrentGradient('elevation');
  }, []);

  return (
    <div className="w-full h-screen flex flex-col bg-[#0a0e1a] text-gray-100" style={{ height: '100vh', minHeight: '100vh' }}>
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
            {!pointCloudData && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInputMode('map')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                    inputMode === 'map'
                      ? 'bg-blue-600/20 border border-blue-500/50 text-blue-300'
                      : 'bg-gray-800/50 border border-gray-600 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500'
                  }`}
                >
                  🗺️ Select from Map
                </button>
                
                <button
                  onClick={() => setInputMode('upload')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                    inputMode === 'upload'
                      ? 'bg-purple-600/20 border border-purple-500/50 text-purple-300'
                      : 'bg-gray-800/50 border border-gray-600 text-gray-300 hover:bg-gray-700/50 hover:border-gray-500'
                  }`}
                >
                  📁 Upload Files
                </button>
              </div>
            )}
            
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
          <div className="w-full h-full relative">
            {/* Full Width Map */}
            {inputMode === 'map' && (
              <MapSelector onRegionSelect={handleRegionSelect} loading={loading} />
            )}
            
            {/* Upload Modal Overlay */}
            {inputMode === 'upload' && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-gray-900/95 backdrop-blur-sm rounded-xl p-6 border border-gray-700 shadow-2xl max-w-2xl w-full mx-4">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-200">Upload Files</h2>
                    <button
                      onClick={() => setInputMode('map')}
                      className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                    >
                      ×
                    </button>
                  </div>
                  <DtmUploadPanel onLoaded={setPointCloudData} />
                </div>
              </div>
            )}
            
            {/* Status Overlays */}
            {loading && (
              <div className="absolute bottom-4 left-4 right-4 z-40">
                <div className="bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
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
              </div>
            )}

            {error && (
              <div className="absolute bottom-4 left-4 right-4 z-40">
                <div className="bg-red-900/95 backdrop-blur-sm rounded-lg p-4 border border-red-700">
                  <div className="flex items-start gap-3">
                    <div className="text-red-400 mt-0.5">⚠️</div>
                    <div>
                      <p className="text-sm font-medium text-red-300">Error loading data</p>
                      <p className="text-xs text-red-400 mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Viewer Screen */
          <div className="w-full h-full relative bg-gray-900" style={{ minHeight: '500px' }}>
            <div className="absolute inset-0">
              <Viewer3D 
                data={pointCloudData} 
                onReady={handleLayerManagerReady} 
                showGrid={gridVisible}
              />
            </div>

            {/* Control Panels */}
            <div className="absolute top-4 right-4 space-y-4 max-w-xs">
              <StatsPanel data={pointCloudData} />
              <LayerControls
                surfaceVisible={surfaceVisible}
                terrainVisible={terrainVisible}
                surfaceOpacity={surfaceOpacity}
                terrainOpacity={terrainOpacity}
                gridVisible={gridVisible}
                onSurfaceVisibilityChange={handleSurfaceVisibilityChange}
                onTerrainVisibilityChange={handleTerrainVisibilityChange}
                onSurfaceOpacityChange={handleSurfaceOpacityChange}
                onTerrainOpacityChange={handleTerrainOpacityChange}
                onGridVisibilityChange={handleGridVisibilityChange}
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
