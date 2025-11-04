import React, { useState, useCallback, useEffect } from 'react';
import { Download, ExternalLink, Copy, CheckCircle, Info, Zap, Settings, FileText, MapPin } from 'lucide-react';
import type { BoundingBox } from '../core/ElevationAPI';
import { HighResolutionProcessor } from '../core/HighResolutionProcessor';
import { ArchaeologicalDatabaseService, type ArchaeologicalSite } from '../core/ArchaeologicalDatabaseService';
import { ArchaeologicalSitePanel } from './ArchaeologicalSitePanel';

interface HighResolutionGuideProps {
  bbox: BoundingBox;
  onClose: () => void;
}

export const HighResolutionGuide: React.FC<HighResolutionGuideProps> = ({ bbox, onClose }) => {
  const [analysis, setAnalysis] = useState<any>(null);
  const [products, setProducts] = useState<any>(null);
  const [archaeologicalSites, setArchaeologicalSites] = useState<ArchaeologicalSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'analysis' | 'sites' | 'download' | 'workflow'>('analysis');
  const [copied, setCopied] = useState(false);

  // Load analysis, products, and archaeological sites on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [regionAnalysis, downloadProducts, sites] = await Promise.all([
          HighResolutionProcessor.analyzeRegion(bbox),
          HighResolutionProcessor.getDownloadableProducts(bbox),
          ArchaeologicalDatabaseService.findSitesInRegion(bbox)
        ]);
        
        setAnalysis(regionAnalysis);
        setProducts(downloadProducts);
        setArchaeologicalSites(sites);
        
        // Auto-switch to sites tab if archaeological sites are found
        if (sites.length > 0) {
          setActiveTab('sites');
        }
      } catch (error) {
        console.error('Error loading high-resolution data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [bbox]);

  const handleCopyCommand = useCallback(async () => {
    if (!analysis) return;
    
    const command = HighResolutionProcessor.generateProcessingCommand(
      '/path/to/downloaded/lidar',
      './outputs/archaeological_site',
      {
        terrainType: analysis.terrainType,
        method: analysis.processingMethod,
        generateAdvancedProducts: true
      }
    );

    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy command:', error);
    }
  }, [analysis]);

  const handleCopyWorkflow = useCallback(async () => {
    if (!analysis) return;
    
    const workflow = HighResolutionProcessor.generateWorkflowInstructions(bbox, analysis);
    
    try {
      await navigator.clipboard.writeText(workflow);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy workflow:', error);
    }
  }, [analysis, bbox]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg p-8 max-w-md mx-4">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400" />
            <span className="text-gray-200">Analyzing region for optimal processing...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-green-400" />
            <div>
              <h2 className="text-xl font-bold text-gray-200">High-Resolution Structure Detection</h2>
              <p className="text-sm text-gray-400">Optimized workflow for revealing archaeological features</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-xl font-bold w-8 h-8 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {[
            { id: 'analysis', label: 'Region Analysis', icon: Settings },
            { 
              id: 'sites', 
              label: `Archaeological Sites${archaeologicalSites.length > 0 ? ` (${archaeologicalSites.length})` : ''}`, 
              icon: MapPin 
            },
            { id: 'download', label: 'Data Sources', icon: Download },
            { id: 'workflow', label: 'Processing Workflow', icon: FileText }
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-950/30'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === 'analysis' && analysis && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="font-medium text-gray-200 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-400" />
                    Processing Parameters
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Recommended Resolution:</span>
                      <span className="text-green-400 font-mono">{analysis.recommendedResolution}m</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Terrain Type:</span>
                      <span className="text-blue-400">{analysis.terrainType.replace('_', ' ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Processing Method:</span>
                      <span className="text-purple-400">{analysis.processingMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Expected Quality:</span>
                      <span className={`font-medium ${
                        analysis.expectedQuality === 'archaeological' ? 'text-green-400' :
                        analysis.expectedQuality === 'high' ? 'text-blue-400' :
                        analysis.expectedQuality === 'medium' ? 'text-yellow-400' : 'text-gray-400'
                      }`}>
                        {analysis.expectedQuality}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="font-medium text-gray-200 mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Processing Estimates
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Processing Time:</span>
                      <span className="text-yellow-400">~{Math.round(analysis.estimatedProcessingTime)} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Data Size:</span>
                      <span className="text-yellow-400">~{Math.round(analysis.dataSize)} MB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Output Products:</span>
                      <span className="text-green-400">9 files</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-green-950/30 border border-green-800 rounded-lg p-4">
                <h3 className="font-medium text-green-300 mb-2">What This Resolution Will Reveal:</h3>
                <ul className="text-sm text-green-200 space-y-1">
                  {analysis.recommendedResolution <= 0.5 ? (
                    <>
                      <li>• Individual wall stones and building details</li>
                      <li>• Small residential structures and storage areas</li>
                      <li>• Precise boundaries of archaeological features</li>
                      <li>• Fine-scale landscape modifications</li>
                    </>
                  ) : analysis.recommendedResolution <= 1.0 ? (
                    <>
                      <li>• Building foundations and major walls</li>
                      <li>• Plaza areas and ceremonial platforms</li>
                      <li>• Ancient roads and pathways</li>
                      <li>• Defensive earthworks and terraces</li>
                    </>
                  ) : (
                    <>
                      <li>• Large architectural complexes</li>
                      <li>• Major landscape modifications</li>
                      <li>• Settlement patterns and site boundaries</li>
                      <li>• Large-scale water management features</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'sites' && (
            <div className="space-y-6">
              {archaeologicalSites.length > 0 ? (
                <>
                  <div className="bg-orange-950/30 border border-orange-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-5 h-5 text-orange-400" />
                      <h3 className="font-medium text-orange-300">Archaeological Context</h3>
                    </div>
                    <p className="text-sm text-orange-200">
                      {archaeologicalSites.length} archaeological site{archaeologicalSites.length > 1 ? 's' : ''} found in this region. 
                      LiDAR processing is highly recommended for this area to reveal hidden structures and cultural features beneath vegetation.
                    </p>
                    {archaeologicalSites.some(site => site.hasLidarData) && (
                      <div className="mt-3 p-2 bg-green-900/30 border border-green-800 rounded text-xs text-green-300">
                        <Zap className="w-3 h-3 inline mr-1" />
                        High-resolution LiDAR data is available for some sites in this region
                      </div>
                    )}
                  </div>
                  
                  <ArchaeologicalSitePanel 
                    sites={archaeologicalSites}
                    onSiteSelect={(site) => {
                      console.log('Selected archaeological site:', site);
                      // Could add functionality to zoom to site or show more details
                    }}
                  />
                </>
              ) : (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-300 mb-2">No Archaeological Sites Found</h3>
                  <p className="text-sm text-gray-400 max-w-md mx-auto">
                    No known archaeological sites were found in this region. However, LiDAR processing may still reveal 
                    previously unknown structures or cultural features.
                  </p>
                  <div className="mt-4 p-3 bg-blue-950/30 border border-blue-800 rounded-lg text-xs text-blue-300">
                    Tip: Even areas without known sites can benefit from high-resolution LiDAR analysis to discover new archaeological features.
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'download' && products && (
            <div className="space-y-6">
              {products.usgsProducts.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-200 mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-blue-400" />
                    USGS 3DEP High-Resolution Data ({products.usgsProducts.length} products)
                  </h3>
                  <div className="bg-gray-800 rounded-lg p-4 mb-4">
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Format:</span>
                        <span className="text-blue-400 ml-2">LAZ (LiDAR Point Cloud)</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Resolution:</span>
                        <span className="text-green-400 ml-2">1-2m (2-8 points/m²)</span>
                      </div>
                    </div>
                  </div>
                  <a
                    href="https://apps.nationalmap.gov/downloader/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open USGS National Map Downloader
                  </a>
                </div>
              )}

              {products.openTopoProducts.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-200 mb-4 flex items-center gap-2">
                    <Download className="w-5 h-5 text-green-400" />
                    OpenTopography Collections ({products.openTopoProducts.length} products)
                  </h3>
                  <div className="space-y-3">
                    {products.openTopoProducts.map((product: any, index: number) => (
                      <div key={index} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium text-gray-200">{product.title}</h4>
                            <div className="text-sm text-gray-400 mt-1">
                              Resolution: {product.resolution} • Format: {product.format}
                            </div>
                          </div>
                          {product.downloadUrl && (
                            <a
                              href={product.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="font-medium text-gray-200 mb-3">Download Instructions</h3>
                <div className="text-sm text-gray-300 whitespace-pre-line">
                  {products.downloadInstructions}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'workflow' && analysis && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-200">Optimized Processing Command</h3>
                  <button
                    onClick={handleCopyCommand}
                    className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-gray-900 p-3 rounded text-sm text-green-400 font-mono overflow-x-auto">
                  {HighResolutionProcessor.generateProcessingCommand(
                    '/path/to/downloaded/lidar',
                    './outputs/archaeological_site',
                    {
                      terrainType: analysis.terrainType,
                      method: analysis.processingMethod,
                      generateAdvancedProducts: true
                    }
                  )}
                </pre>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-200">Complete Workflow Guide</h3>
                  <button
                    onClick={handleCopyWorkflow}
                    className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded transition-colors"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy All'}
                  </button>
                </div>
                <div className="bg-gray-900 p-4 rounded text-sm text-gray-300 overflow-x-auto max-h-60">
                  <pre className="whitespace-pre-wrap">
                    {HighResolutionProcessor.generateWorkflowInstructions(bbox, analysis)}
                  </pre>
                </div>
              </div>

              <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-4">
                <h3 className="font-medium text-blue-300 mb-2">💡 Pro Tips for Maximum Structure Detection:</h3>
                <ul className="text-sm text-blue-200 space-y-1">
                  <li>• Install RVT library for advanced visualization: <code className="bg-gray-800 px-1 rounded">pip install rvt</code></li>
                  <li>• Use multiple processing methods if unsure about ground classification</li>
                  <li>• Lower resolution takes longer but reveals more architectural detail</li>
                  <li>• The enhanced RRIM composite is specifically tuned for archaeological features</li>
                  <li>• Upload the generated <code className="bg-gray-800 px-1 rounded">DTM_bareearth.asc</code> file to this web app for 3D visualization</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-400">
              Coordinates: {bbox.north.toFixed(4)}°N, {bbox.south.toFixed(4)}°S, {bbox.east.toFixed(4)}°E, {bbox.west.toFixed(4)}°W
            </div>
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
