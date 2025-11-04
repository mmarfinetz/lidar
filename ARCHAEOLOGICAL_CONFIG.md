# Archaeological Database Service Configuration

This document outlines the configuration options for the Archaeological Database Service.

## Environment Variables

Add these variables to your `.env` file to configure the archaeological database service:

### OpenTopography API Configuration
```bash
# Get your API key from: https://portal.opentopography.org/newUser
VITE_OPENTOPO_API_KEY=your_opentopography_api_key_here
```

### Archaeological Database Service Configuration
```bash
# Optional API key for ARIADNE Portal (if required in the future)
VITE_ARIADNE_API_KEY=optional_ariadne_api_key

# Rate limiting for Open Context API (requests per minute)
# Default: 60 requests per minute
VITE_OPENCONTEXT_RATE_LIMIT=60

# Cache TTL for archaeological site data (in milliseconds)
# Default: 86400000 (24 hours)
VITE_ARCHAEOLOGICAL_CACHE_TTL=86400000
```

## Database Sources

The Archaeological Database Service queries multiple databases in priority order:

### 1. Open Context (Priority 1)
- **URL**: https://opencontext.org/subjects-search/
- **Coverage**: Global archaeological database
- **Data**: Site metadata, descriptions, cultural context
- **Rate Limiting**: Configurable via VITE_OPENCONTEXT_RATE_LIMIT

### 2. ARIADNE Portal (Priority 2) 
- **URL**: https://ariadne-portal.uni-koeln.de/api/search
- **Coverage**: European archaeological data aggregator
- **Status**: Integration pending API confirmation
- **Authentication**: May require API key in future

### 3. Curated Database (Priority 999 - Fallback)
- **Coverage**: High-priority archaeological sites with confirmed LiDAR data
- **Sites Included**:
  - Mayapán (Maya, Mexico) - 0.5m LiDAR available
  - Middle Usumacinta Maya Region (Mexico) - 1m LiDAR available
  - Angkor Archaeological Park (Cambodia) - 1m LiDAR available

## Features

### Caching
- Results are cached for 24 hours (configurable)
- Cache keys based on bounding box coordinates
- Cache can be cleared programmatically

### Rate Limiting
- Respects API rate limits with exponential backoff
- Configurable requests per minute
- Automatic fallback if rate limit exceeded

### Error Handling
- 5-second timeout per API request
- Graceful degradation to cached data
- Fallback to curated database if APIs fail

### Duplicate Removal
- Removes duplicate sites within 100m tolerance
- Preserves highest quality data source

## Usage Examples

### Basic Site Query
```typescript
import { ArchaeologicalDatabaseService } from './core/ArchaeologicalDatabaseService';

const bbox = { south: 20.6, north: 20.7, west: -89.5, east: -89.4 };
const sites = await ArchaeologicalDatabaseService.findSitesInRegion(bbox);
```

### Sites with LiDAR Data Only
```typescript
const sitesWithLidar = await ArchaeologicalDatabaseService.findSitesWithLidarData(bbox);
```

### Cache Management
```typescript
// Clear cache
ArchaeologicalDatabaseService.clearCache();

// Get cache stats
const stats = ArchaeologicalDatabaseService.getCacheStats();
console.log(`Cache has ${stats.entries} entries, ${stats.totalSize} bytes`);
```

## Data Structure

### ArchaeologicalSite Interface
```typescript
interface ArchaeologicalSite {
  id: string;
  name: string;
  description: string;
  period?: string;
  culture?: string;
  significance: 'high' | 'medium' | 'low';
  coordinates: {
    south: number;
    north: number;  
    west: number;
    east: number;
  };
  hasLidarData: boolean;
  lidarDatasets?: Array<{
    id: string;
    resolution: string;
    source: string;
    downloadUrl?: string;
  }>;
  references?: Array<{
    title: string;
    url?: string;
    type: 'publication' | 'database' | 'website';
  }>;
  source: {
    database: string;
    url?: string;
    lastUpdated: string;
  };
}
```

## Integration Points

### DataAvailabilityService
The Archaeological Database Service replaces hardcoded site detection in the DataAvailabilityService:

```typescript
checkAvailability: async (bbox) => {
  try {
    const sites = await ArchaeologicalDatabaseService.findSitesInRegion(bbox);
    return sites.length > 0 && sites.some(site => site.hasLidarData || site.significance === 'high');
  } catch (error) {
    console.warn('Archaeological database query failed:', error);
    return false;
  }
}
```

### UI Components
- **ArchaeologicalSitePanel**: Displays site information with metadata
- **HighResolutionGuide**: Shows archaeological context for selected regions
- **MapSelector**: Integrates archaeological site detection for region selection

## Performance Considerations

- Cache TTL should balance data freshness with API usage
- Rate limiting prevents API abuse and service degradation
- Timeout prevents hanging requests in slow network conditions
- Fallback database ensures functionality even when APIs are unavailable

## Future Enhancements

1. **Additional Database Integrations**:
   - tDAR (Digital Archaeological Record)
   - DINAA (Digital Index of North American Archaeology)
   - Regional archaeological databases

2. **Enhanced Metadata**:
   - UNESCO World Heritage status
   - Site excavation status
   - Related publications and research

3. **Geospatial Features**:
   - Site polygon boundaries
   - Multi-point site geometries
   - Elevation and topographic context

4. **User Contributions**:
   - User-submitted site information
   - Community validation and corrections
   - Local knowledge integration
