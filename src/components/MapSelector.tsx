import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Rectangle, useMapEvents, ZoomControl } from 'react-leaflet';
import { LatLngBounds, LatLng } from 'leaflet';
import type { BoundingBox } from '../core/ElevationAPI';
import { ElevationAPI } from '../core/ElevationAPI';
import { DataAvailabilityService, type AvailabilityResult } from '../core/DataAvailabilityService';
import { HighResolutionGuide } from './HighResolutionGuide';
import { SmallAreaAnalysis } from './SmallAreaAnalysis';
import { MapPin, Download, Info, Square, Hand, Zap, AlertTriangle, Target, ZoomIn } from 'lucide-react';
import { rafThrottle } from '../utils/performance';

interface MapSelectorProps {
  onRegionSelect: (bbox: BoundingBox, dataset: string) => void;
  loading?: boolean;
}

const DrawRectangle: React.FC<{
  onBoundsChange: (bounds: LatLngBounds | null) => void;
  drawingEnabled: boolean;
}> = ({ onBoundsChange, drawingEnabled }) => {
  const [startPoint, setStartPoint] = useState<LatLng | null>(null);
  const [endPoint, setEndPoint] = useState<LatLng | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Create a throttled version of setEndPoint for smooth performance
  const throttledSetEndPoint = useRef(
    rafThrottle((latlng: LatLng) => setEndPoint(latlng))
  ).current;

  const map = useMapEvents({
    mousedown: (e) => {
      // Only start drawing if drawing mode is enabled
      if (!drawingEnabled) return;

      // Prevent default drag behavior
      e.originalEvent.preventDefault();

      setStartPoint(e.latlng);
      setEndPoint(e.latlng);
      setIsDrawing(true);

      // Disable map dragging while drawing
      map.dragging.disable();
      map.doubleClickZoom.disable();
    },
    mousemove: (e) => {
      if (startPoint && isDrawing && drawingEnabled) {
        // Use throttled update for smooth performance
        throttledSetEndPoint(e.latlng);
      }
    },
    mouseup: (e) => {
      if (startPoint && isDrawing && drawingEnabled) {
        setEndPoint(e.latlng);
        const bounds = new LatLngBounds(startPoint, e.latlng);

        // Only update bounds if the selection has a minimum size (prevents accidental clicks)
        // Minimum area is 0.000001 deg² for detailed small-area analysis (~11m x 11m)
        const latDiff = Math.abs(bounds.getNorth() - bounds.getSouth());
        const lonDiff = Math.abs(bounds.getEast() - bounds.getWest());
        const area = latDiff * lonDiff;

        console.log('Selection size:', { latDiff, lonDiff, area, minArea: 0.000001 });

        if (area >= 0.000001) {
          console.log('Selection accepted, calling onBoundsChange');
          onBoundsChange(bounds);
        } else {
          console.log('Selection too small, ignored. Minimum area: 0.000001 deg²');
        }

        // Clean up state
        setStartPoint(null);
        setEndPoint(null);
        setIsDrawing(false);

        // Re-enable map interactions
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    },
    // Handle cases where mouse leaves the map area
    mouseout: () => {
      if (isDrawing) {
        // Clean up if drawing state gets stuck
        setStartPoint(null);
        setEndPoint(null);
        setIsDrawing(false);
        map.dragging.enable();
        map.doubleClickZoom.enable();
      }
    }
  });

  // Update cursor style based on drawing mode
  useEffect(() => {
    if (map) {
      const container = map.getContainer();
      if (drawingEnabled) {
        container.style.cursor = 'crosshair';
      } else {
        container.style.cursor = '';
      }
    }
  }, [map, drawingEnabled]);

  if (startPoint && endPoint && isDrawing) {
    const bounds = new LatLngBounds(startPoint, endPoint);
    return <Rectangle bounds={bounds} pathOptions={{ color: '#3b82f6', weight: 2, fillOpacity: 0.1 }} />;
  }

  return null;
};

export const MapSelector: React.FC<MapSelectorProps> = ({ onRegionSelect, loading }) => {
  const [selectedBounds, setSelectedBounds] = useState<LatLngBounds | null>(null);
  const [selectedDataset] = useState('SRTMGL1'); // Use 30m resolution instead of 90m for higher quality
  const [validationError, setValidationError] = useState<string | null>(null);
  const [estimatedPoints, setEstimatedPoints] = useState<number>(0);
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [dataAvailability, setDataAvailability] = useState<AvailabilityResult | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [showHighResGuide, setShowHighResGuide] = useState(false);
  const [showSmallAreaAnalysis, setShowSmallAreaAnalysis] = useState(false);
  const apiKeyPresent = Boolean((import.meta as any).env?.VITE_OPENTOPO_API_KEY);

  // Debug: Log when selectedBounds changes
  useEffect(() => {
    console.log('selectedBounds state changed to:', selectedBounds);
  }, [selectedBounds]);

  const handleBoundsChange = useCallback(async (bounds: LatLngBounds | null) => {
    console.log('🔵 handleBoundsChange called with:', bounds);
    setSelectedBounds(bounds);
    setValidationError(null);
    setDrawingEnabled(false); // Exit drawing mode after selection
    setDataAvailability(null);

    if (bounds) {
      const bbox: BoundingBox = {
        south: bounds.getSouth(),
        north: bounds.getNorth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      };

      // Validate bounds first
      const validation = ElevationAPI.validateBBox(bbox);
      if (!validation.valid) {
        setValidationError(validation.error || 'Invalid selection');
        setEstimatedPoints(0);
        return;
      }

      // Check data availability
      setCheckingAvailability(true);
      try {
        console.log('🔍 Checking data availability for region...');
        const availability = await DataAvailabilityService.checkAvailability(bbox);
        setDataAvailability(availability);
        setEstimatedPoints(availability.estimatedPoints);

        console.log('📊 Data availability result:', {
          bestSource: availability.bestSource.name,
          quality: availability.expectedQuality,
          canRevealArchaeology: availability.canRevealArchaeology
        });

        // Auto-scan with best available data source
        console.log('🟣 Auto-scanning with best available data source...');
        onRegionSelect(bbox, selectedDataset);
      } catch (error) {
        console.warn('Failed to check data availability:', error);
        // Fallback to basic estimation
        try {
          const points = ElevationAPI.estimatePoints(bbox, selectedDataset);
          setEstimatedPoints(points);
          if (apiKeyPresent) {
            onRegionSelect(bbox, selectedDataset);
          }
        } catch (estimateError) {
          console.warn('Failed to estimate points:', estimateError);
          setEstimatedPoints(0);
        }
      } finally {
        setCheckingAvailability(false);
      }
    } else {
      setEstimatedPoints(0);
    }
  }, [selectedDataset, onRegionSelect, apiKeyPresent]);

  const handleScan = useCallback(() => {
    if (!selectedBounds) return;

    const bbox: BoundingBox = {
      south: selectedBounds.getSouth(),
      north: selectedBounds.getNorth(),
      west: selectedBounds.getWest(),
      east: selectedBounds.getEast(),
    };

    const validation = ElevationAPI.validateBBox(bbox);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid selection');
      return;
    }

    onRegionSelect(bbox, selectedDataset);
  }, [selectedBounds, selectedDataset, onRegionSelect]);

  const handleClear = useCallback(() => {
    setSelectedBounds(null);
    setValidationError(null);
    setEstimatedPoints(0);
    setDrawingEnabled(false);
  }, []);

  const toggleDrawingMode = useCallback(() => {
    setDrawingEnabled(prev => !prev);
  }, []);

  const handleShowHighResGuide = useCallback(() => {
    setShowHighResGuide(true);
  }, []);

  const handleCloseHighResGuide = useCallback(() => {
    setShowHighResGuide(false);
  }, []);

  const handleShowSmallAreaAnalysis = useCallback(() => {
    setShowSmallAreaAnalysis(true);
  }, []);

  const handleCloseSmallAreaAnalysis = useCallback(() => {
    setShowSmallAreaAnalysis(false);
  }, []);

  const handleSmallAreaAnalyze = useCallback((bbox: BoundingBox) => {
    onRegionSelect(bbox, selectedDataset);
  }, [onRegionSelect, selectedDataset]);

  // Check if this is a small area suitable for detailed analysis
  const isSmallArea = selectedBounds ? (() => {
    const latDiff = Math.abs(selectedBounds.getNorth() - selectedBounds.getSouth());
    const lonDiff = Math.abs(selectedBounds.getEast() - selectedBounds.getWest());
    return (latDiff * lonDiff) < 0.01; // < ~1km x 1km
  })() : false;

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawingEnabled) {
          setDrawingEnabled(false);
        } else if (selectedBounds) {
          handleClear();
        }
      }
      // Toggle draw mode with 'D' key
      if (e.key === 'd' || e.key === 'D') {
        if (!loading) {
          toggleDrawingMode();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedBounds, drawingEnabled, loading, handleClear, toggleDrawingMode]);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Toolbar */}
      <div className="bg-gray-900/95 backdrop-blur-sm px-6 py-3 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-gray-200">
              {drawingEnabled ? 'Click and drag to select' : 'Navigate to find your region'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDrawingMode}
              disabled={loading}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                drawingEnabled
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {drawingEnabled ? (
                <>
                  <Square className="w-3 h-3" />
                  Drawing
                </>
              ) : (
                <>
                  <Hand className="w-3 h-3" />
                  Pan Map
                </>
              )}
            </button>
            {drawingEnabled && (
              <span className="text-xs text-gray-400">
                Press <kbd className="px-1 py-0.5 bg-gray-800 rounded text-xs">Esc</kbd> to cancel
              </span>
            )}
          </div>
        </div>
      </div>


      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <MapContainer
          center={[37.7749, -122.4194]} // San Francisco
          zoom={10}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
          zoomControl={false} // Disable default zoom control to reposition it
        >
          {/* Add zoom control in top-left corner */}
          <ZoomControl position="topleft" />

          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <DrawRectangle onBoundsChange={handleBoundsChange} drawingEnabled={drawingEnabled} />

          {selectedBounds && !validationError && (
            <Rectangle
              bounds={selectedBounds}
              pathOptions={{ color: '#3b82f6', weight: 3, fillOpacity: 0.2 }}
            />
          )}

          {selectedBounds && validationError && (
            <Rectangle
              bounds={selectedBounds}
              pathOptions={{ color: '#ef4444', weight: 3, fillOpacity: 0.2 }}
            />
          )}
        </MapContainer>

        {/* Drawing Mode Indicator */}
        {drawingEnabled && !selectedBounds && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600/95 backdrop-blur-sm rounded-lg px-4 py-2 border border-blue-400 z-[1000] animate-pulse">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Square className="w-4 h-4" />
              <span>Click and drag to select region</span>
            </div>
          </div>
        )}

        {/* Data Availability Overlay */}
        {selectedBounds && (
          <div
            className="absolute top-4 right-4 bg-gray-900/95 backdrop-blur-sm rounded-lg p-4 border border-gray-700 max-w-sm shadow-xl z-50"
          >
            {checkingAvailability ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Checking data availability...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  {dataAvailability?.canRevealArchaeology ? (
                    <Zap className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                  <h4 className="text-sm font-semibold text-gray-200">Data Quality Assessment</h4>
                </div>

                {dataAvailability && (
                  <div className="mb-4 p-3 bg-gray-800/50 rounded-lg border border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Best Available:</span>
                      <span className={`text-xs font-medium ${DataAvailabilityService.getQualityDescription(dataAvailability.expectedQuality).color}`}>
                        {dataAvailability.bestSource.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Resolution:</span>
                      <span className="text-xs text-gray-200 font-mono">
                        {dataAvailability.bestSource.resolution}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">Point Density:</span>
                      <span className="text-xs text-gray-200 font-mono">
                        {dataAvailability.bestSource.pointDensity}
                      </span>
                    </div>

                    {estimatedPoints > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                        <span className="text-xs text-gray-400">Est. Points:</span>
                        <span className="text-xs text-blue-400 font-mono">
                          {estimatedPoints.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <div className="mt-3 p-2 bg-gray-900/50 rounded">
                      <div className={`text-xs ${DataAvailabilityService.getQualityDescription(dataAvailability.expectedQuality).color}`}>
                        {DataAvailabilityService.getQualityDescription(dataAvailability.expectedQuality).title}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {DataAvailabilityService.getQualityDescription(dataAvailability.expectedQuality).description}
                      </div>
                    </div>

                    {dataAvailability.canRevealArchaeology && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-green-400">
                        <Zap className="w-3 h-3" />
                        <span>Archaeological features may be visible!</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Coordinate Details (Collapsible) */}
                <details className="mb-4">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
                    📍 Coordinates
                  </summary>
                  <div className="mt-2 space-y-1 text-xs pl-2">
                    <div className="flex justify-between">
                      <span className="text-gray-500">North:</span>
                      <span className="text-gray-300 font-mono">{selectedBounds.getNorth().toFixed(6)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">South:</span>
                      <span className="text-gray-300 font-mono">{selectedBounds.getSouth().toFixed(6)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">East:</span>
                      <span className="text-gray-300 font-mono">{selectedBounds.getEast().toFixed(6)}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">West:</span>
                      <span className="text-gray-300 font-mono">{selectedBounds.getWest().toFixed(6)}°</span>
                    </div>
                  </div>
                </details>

                {validationError && (
                  <div className="mb-4 p-2 bg-red-900/30 border border-red-700 rounded text-xs text-red-400 flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {/* Small Area Analysis Option - Show when area is small enough */}
                  {selectedBounds && isSmallArea && (
                    <button
                      onClick={handleShowSmallAreaAnalysis}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-medium text-sm transition-all"
                    >
                      <ZoomIn className="w-4 h-4" />
                      Small Area Analysis (Higher Detail)
                    </button>
                  )}

                  {/* High-Resolution Processing Option */}
                  {selectedBounds && (dataAvailability?.canRevealArchaeology || dataAvailability?.expectedQuality === 'high') && (
                    <button
                      onClick={handleShowHighResGuide}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium text-sm transition-all"
                    >
                      <Target className="w-4 h-4" />
                      High-Resolution Structure Detection
                    </button>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleScan}
                      disabled={loading || !!validationError || !selectedBounds}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        dataAvailability?.canRevealArchaeology 
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500' 
                          : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
                      }`}
                    >
                      {loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                          Scanning...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          {dataAvailability?.canRevealArchaeology ? 'Quick Scan' : 'Scan Terrain'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleClear}
                      disabled={loading}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-all disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>

                  {/* Information about resolution options */}
                  {selectedBounds && dataAvailability && (
                    <div className="text-xs text-gray-400 text-center">
                      {dataAvailability.bestSource.id === 'aws_terrain_tiles' ? (
                        <>
                          <span className="text-cyan-400">🗺️ AWS Terrain Tiles</span> - Higher resolution for small areas
                        </>
                      ) : dataAvailability.canRevealArchaeology || dataAvailability.expectedQuality === 'high' ? (
                        <>
                          <span className="text-green-400">🎯 High-res processing</span> reveals structures beneath vegetation
                        </>
                      ) : isSmallArea ? (
                        <>
                          <span className="text-blue-400">💡 Tip:</span> Small area selected - higher detail available via AWS Tiles
                        </>
                      ) : (
                        <>Quick scan uses available global data ({dataAvailability.bestSource.resolution})</>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-gray-900/95 backdrop-blur-sm px-6 py-3 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Info className="w-3 h-3" />
          <span>
            Powered by <span className="text-gray-300">OpenTopography</span> + <span className="text-gray-300">AWS Terrain Tiles</span> •
            Select small areas (&lt;1km²) for detailed structure analysis
          </span>
        </div>
      </div>

      {/* High-Resolution Processing Guide Modal */}
      {showHighResGuide && selectedBounds && (
        <HighResolutionGuide
          bbox={{
            south: selectedBounds.getSouth(),
            north: selectedBounds.getNorth(),
            west: selectedBounds.getWest(),
            east: selectedBounds.getEast()
          }}
          onClose={handleCloseHighResGuide}
        />
      )}

      {/* Small Area Analysis Modal */}
      {showSmallAreaAnalysis && selectedBounds && (
        <SmallAreaAnalysis
          bbox={{
            south: selectedBounds.getSouth(),
            north: selectedBounds.getNorth(),
            west: selectedBounds.getWest(),
            east: selectedBounds.getEast()
          }}
          onClose={handleCloseSmallAreaAnalysis}
          onAnalyze={handleSmallAreaAnalyze}
        />
      )}
    </div>
  );
};
