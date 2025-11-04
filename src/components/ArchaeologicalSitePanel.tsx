import React from 'react';
import { MapPin, Calendar, Users, ExternalLink, Database, Zap, BookOpen, Star } from 'lucide-react';
import type { ArchaeologicalSite } from '../core/ArchaeologicalDatabaseService';

interface ArchaeologicalSitePanelProps {
  sites: ArchaeologicalSite[];
  onSiteSelect?: (site: ArchaeologicalSite) => void;
  compact?: boolean;
}

export const ArchaeologicalSitePanel: React.FC<ArchaeologicalSitePanelProps> = ({ 
  sites, 
  onSiteSelect,
  compact = false 
}) => {
  if (sites.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="text-center text-gray-400">
          <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No archaeological sites found in this region</p>
        </div>
      </div>
    );
  }

  const getSignificanceColor = (significance: string) => {
    switch (significance) {
      case 'high': return 'text-green-400 bg-green-900/30';
      case 'medium': return 'text-yellow-400 bg-yellow-900/30';
      case 'low': return 'text-gray-400 bg-gray-800/30';
      default: return 'text-gray-400 bg-gray-800/30';
    }
  };

  const getSignificanceIcon = (significance: string) => {
    switch (significance) {
      case 'high': return <Star className="w-3 h-3 fill-current" />;
      case 'medium': return <Star className="w-3 h-3" />;
      case 'low': return <MapPin className="w-3 h-3" />;
      default: return <MapPin className="w-3 h-3" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-5 h-5 text-orange-400" />
        <h3 className="font-medium text-gray-200">
          Archaeological Sites ({sites.length})
        </h3>
      </div>

      <div className="max-h-96 overflow-y-auto space-y-3">
        {sites.map((site, index) => (
          <div
            key={site.id || index}
            className={`bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors ${
              onSiteSelect ? 'cursor-pointer' : ''
            }`}
            onClick={() => onSiteSelect?.(site)}
          >
            {/* Site Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h4 className="font-medium text-gray-200 mb-1 flex items-center gap-2">
                  {site.name}
                  {site.hasLidarData && (
                    <span title="LiDAR data available">
                      <Zap className="w-4 h-4 text-green-400" />
                    </span>
                  )}
                </h4>
                
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getSignificanceColor(site.significance)}`}>
                    {getSignificanceIcon(site.significance)}
                    {site.significance} significance
                  </span>
                  
                  <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
                    {site.source.database}
                  </span>
                </div>
              </div>
            </div>

            {/* Site Details */}
            {!compact && (
              <>
                <p className="text-sm text-gray-300 mb-3 line-clamp-3">
                  {site.description}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
                  {site.period && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Calendar className="w-3 h-3" />
                      <span>{site.period}</span>
                    </div>
                  )}
                  
                  {site.culture && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Users className="w-3 h-3" />
                      <span>{site.culture}</span>
                    </div>
                  )}
                </div>

                {/* LiDAR Datasets */}
                {site.hasLidarData && site.lidarDatasets && site.lidarDatasets.length > 0 && (
                  <div className="mb-3 p-3 bg-green-900/20 rounded border border-green-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-green-400" />
                      <span className="text-sm font-medium text-green-300">
                        High-Resolution LiDAR Available
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      {site.lidarDatasets.map((dataset, idx) => (
                        <div key={idx} className="text-xs text-green-200 flex items-center justify-between">
                          <div>
                            <span className="font-mono bg-green-900/30 px-1 rounded">
                              {dataset.resolution}
                            </span>
                            <span className="ml-2">{dataset.source}</span>
                          </div>
                          {dataset.downloadUrl && (
                            <a
                              href={dataset.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* References */}
                {site.references && site.references.length > 0 && (
                  <div className="pt-3 border-t border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="w-3 h-3 text-gray-400" />
                      <span className="text-xs font-medium text-gray-400">References</span>
                    </div>
                    
                    <div className="space-y-1">
                      {site.references.slice(0, 3).map((ref, idx) => (
                        <div key={idx} className="text-xs">
                          {ref.url ? (
                            <a
                              href={ref.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {ref.title}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-gray-400">{ref.title}</span>
                          )}
                        </div>
                      ))}
                      
                      {site.references.length > 3 && (
                        <div className="text-xs text-gray-500">
                          +{site.references.length - 3} more references
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Source Info */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-700 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Database className="w-3 h-3" />
                    <span>{site.source.database}</span>
                  </div>
                  
                  {site.source.url && (
                    <a
                      href={site.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </>
            )}

            {/* Compact View */}
            {compact && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400 mb-1">{site.period || site.culture}</p>
                  <p className="text-xs text-gray-500 line-clamp-1">{site.description}</p>
                </div>
                
                {site.hasLidarData && (
                  <div className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
                    LiDAR
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
