# LiDAR Visualizer

A production-ready web application for **scanning and visualizing real LiDAR elevation data** from anywhere on Earth. Select any region on an interactive map and instantly visualize it as a multi-layer 3D terrain. Built with React, TypeScript, Three.js, and Leaflet.

![LiDAR Visualizer](https://img.shields.io/badge/LiDAR-Visualizer-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![React](https://img.shields.io/badge/React-18-blue)
![Three.js](https://img.shields.io/badge/Three.js-Latest-green)

## Features

### 🌍 Real-Time Map-Based Scanning
- **Interactive Map Interface**: Select any region on Earth using an intuitive map selector
- **Public API Integration**: Fetches real elevation data from OpenTopography Global DEM API
- **Multiple Datasets**: Choose from SRTM (30m/90m) or ALOS World 3D (30m) resolution
- **Instant Visualization**: Downloaded data is automatically converted to 3D point clouds
- **OpenTopography API key required**: Add `VITE_OPENTOPO_API_KEY` in `.env` to scan real data

### Core Visualization
- **Multi-Layer Rendering**: Separate visualization of surface vegetation and underlying terrain
- **Elevation Heat Mapping**: Color-coded terrain based on elevation with multiple gradient options
- **Interactive 3D Controls**: Orbit, pan, and zoom with smooth camera movements
- **Real-time Layer Management**: Toggle visibility and adjust opacity for each layer independently

### Performance Optimizations
- Point cloud data normalization and spatial transformations
- Efficient TypedArray usage for GPU rendering
- Custom GLSL shaders for elevation mapping
- Handles datasets with 100K-1M points smoothly

### Color Gradients
- **Cool to Warm**: Blue → Cyan → Yellow → Red
- **Viridis**: Perceptually uniform color map
- **Terrain**: Multi-stop gradient optimized for topographic data
- **Plasma**: High-contrast scientific visualization
- **Elevation**: Custom gradient for archaeological/terrain analysis

## Quick Start

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173/`

### Building for Production

```bash
npm run build
```

The optimized build will be output to the `dist/` directory.

## Usage Guide

### Scanning Real Terrain

**This is the primary workflow - scan any region on Earth!**

0. Add your OpenTopography API key to `.env`:
   - `VITE_OPENTOPO_API_KEY=your_key_here`
   - Restart the dev server after editing `.env`

1. **Navigate the Map**: Drag to pan, scroll to zoom
2. **Select a Region**: Click and drag to draw a rectangle on the map
   - Minimum area: ~100m × 100m
   - Maximum area: ~100km × 100km
3. **Choose Dataset**: Select resolution (30m or 90m) from the dropdown
4. **Scan**: Click the "Scan Region" button
5. **Wait**: The app fetches real elevation data from OpenTopography (typically 2-10 seconds)
6. **Visualize**: Instantly see your selected terrain in interactive 3D!

Optional: If you add a Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) to your `.env`, a Google satellite basemap will be draped under the 3D terrain to combine Google Earth imagery with the LiDAR-derived surface.

#### Recommended Regions to Try
- **San Francisco Bay Area**: Complex urban + mountainous terrain
- **Grand Canyon**: Dramatic elevation changes
- **Mount Everest**: Himalayas region (28.0°N, 86.9°E)
- **Your Home**: Find your house and see the local terrain!

#### Available Datasets
- **SRTM GL3 (90m)**: Global coverage, fastest download
- **SRTM GL1 (30m)**: Higher resolution, global coverage
- **ALOS World 3D (30m)**: Alternative high-resolution global dataset

### Uploading a Processed DTM (Bare-Earth)

Prefer high-resolution airborne LiDAR for archaeology? Use the new "Upload Processed DTM (.asc)" mode. This is ideal for revealing walls, platforms, terraces, and ancient roadways under canopy (like the example image without the forest layer).

Steps:
- Run the offline workflow to produce `DTM_bareearth.asc` from your LAZ/LAS tiles (see below).
- In the app header, switch to "Upload Processed DTM (.asc)".
- Drag-drop `DTM_bareearth.asc` into the panel.
- The viewer renders a continuous surface mesh, applies elevation coloring and hillshade for clear bare-earth visualization.

Supported upload format: ASCII Grid (AAIGrid, `.asc`).

Tip: If you also need DSM/CHM/SVF/LRM/Composite, they are produced alongside the DTM by the workflow script.

## Archaeology LiDAR Workflow (PDAL/GDAL)

Automate the full bare-earth pipeline from classified point clouds using the included Python script.

Requirements:
- PDAL >= 2.5, GDAL >= 3.6, Python >= 3.9
- Optional: `rvt` (Relief Visualization Toolbox for Python) for SVF/LRM

Install tools (macOS): `brew install pdal gdal`  •  (Ubuntu): `sudo apt-get install -y pdal gdal-bin python3-gdal`

Quick start:
```bash
# 1) Create outputs folder (optional)
mkdir -p outputs/siteA

# 2) Run the workflow from your LAZ/LAS tiles
python scripts/archaeology_lidar_workflow.py \
  --input /path/to/tiles \
  --out outputs/siteA \
  --resolution 0.5 \
  --method existing-class

# 3) Load the bare-earth ASCII Grid in the app
# Use the Upload Processed DTM (.asc) panel and drop outputs/siteA/DTM_bareearth.asc
```

What it does:
- DTM (bare-earth) via PDAL with either existing Classification=2 or SMRF ground reclassification
- DSM (surface) via PDAL max Z per cell
- CHM = DSM - DTM via GDAL
- Multi-directional hillshade via gdaldem and averaging
- SVF + LRM via `rvt` if installed (optional)
- RRIM-style archaeology composite (RGB) from hillshade/LRM/SVF
- Exports `DTM_bareearth.asc` for viewer and `report.html` with parameters

Produced files in your output folder:
- `DTM_bareearth.tif` (float32), `DTM_bareearth.asc` (AAIGrid for viewer)
- `DSM_surface.tif`, `CHM_canopy.tif`
- `hillshade_multi.tif`, `SVF.tif` (if RVT), `LRM.tif` (if RVT)
- `archaeology_composite.tif`, `report.html`

Region/data guidance:
- USA: USGS 3DEP (≥ QL2, ≥ 2 pts/m²); coastal areas via NOAA Digital Coast
- UK: Environment Agency National Lidar Programme (1m DTM)
- Mexico: Prioritize INEGI or Mayapán datasets; tune for Maya platforms/sacbeob
- Europe: IGN LiDAR HD (FR), PNOA-LiDAR (ES), AHN (NL), DHM (DK), swissSURFACE3D (CH)

Quality tips:
- Aim for ≥2 pts/m² for archaeological detection, process in tiles with buffers, and check ground classification.
- If classification is poor, use `--method smrf` (iterative SMRF ground extraction) and validate results.
- For subtle micro-topography, add SVF and LRM (install `rvt`) and inspect the composite.

### Interacting with the Visualization

#### Camera Controls
- **Rotate**: Left-click + drag
- **Pan**: Right-click + drag
- **Zoom**: Mouse wheel scroll
- **Reset View**: Click the "Reset" button in the header

#### Layer Controls (Right Panel)

**Surface Layer** (Vegetation)
- Toggle visibility with the eye icon
- Adjust opacity with the slider (0-100%)
- Default color: Green tint for vegetation

**Terrain Layer** (Ground)
- Toggle visibility with the eye icon
- Adjust opacity with the slider (0-100%)
- Uses elevation-based color mapping

#### Color Scheme Selector
- Choose from 5 predefined color gradients
- Real-time shader updates
- Applies to the terrain layer only

#### Dataset Statistics
- Total point count
- Spatial dimensions (X, Y, Z ranges)
- Elevation range (min/max)
- Feature flags (color data, classification)

## Project Structure

```
Lidar_Scan/
├── src/
│   ├── components/          # React UI components
│   │   ├── Viewer3D.tsx              # Main Three.js canvas
│   │   ├── FileUploader.tsx          # Drag-drop file handler
│   │   ├── LayerControls.tsx         # Layer visibility/opacity controls
│   │   ├── ColorGradientSelector.tsx # Color scheme picker
│   │   └── StatsPanel.tsx            # Dataset information display
│   ├── core/                # Core business logic
│   │   ├── PointCloudLoader.ts       # Multi-format file parser
│   │   ├── ElevationAPI.ts           # Fetch elevation (DEM) from OpenTopography
│   │   ├── Basemap.ts                # Google Static Maps helper
│   │   └── LayerManager.ts           # Dual-layer rendering system
│   ├── shaders/             # Custom GLSL shaders
│   │   ├── terrain.vert.glsl         # Terrain vertex shader
│   │   ├── terrain.frag.glsl         # Terrain fragment shader (elevation mapping)
│   │   ├── points.vert.glsl          # Points vertex shader
│   │   └── points.frag.glsl          # Points fragment shader
│   ├── utils/               # Utility functions
│   │   ├── colorMaps.ts              # Color gradient definitions
│   │   └── spatial.ts                # Spatial transformations
│   ├── types/               # TypeScript type definitions
│   │   └── lidar.ts                  # LiDAR data types
│   ├── App.tsx              # Main application component
│   └── index.css            # Global styles (Tailwind)
├── public/
│   └── textures/            # Static texture assets (if any)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── README.md                # This file
```

## Data Format Specifications

### XYZ/TXT Format

Plain text format with space or tab-separated values:

```
# Lines starting with # are comments
X Y Z [Intensity] [R G B] [Classification]
```

Example:
```
0.0 0.0 0.0 5000 2
1.0 0.5 0.2 5100 2
2.0 1.0 1.5 6000 4
```

**Columns:**
1. X coordinate (required)
2. Y coordinate (required)
3. Z coordinate (required)
4. Intensity value (optional, 0-65535)
5-7. RGB color values (optional, 0-255)
8. Classification code (optional, see below)

### LAS Format

Binary format following ASPRS LAS specification (versions 1.2, 1.3, 1.4).

**Supported Point Data Formats:**
- Format 0: X, Y, Z, Intensity, Return Number, Classification
- Format 1: Format 0 + GPS Time
- Format 2: Format 0 + RGB
- Format 3: Format 1 + RGB
- Format 5: Format 3 + additional attributes

### Classification Codes

Standard ASPRS classification codes:

| Code | Description |
|------|-------------|
| 0 | Created, never classified |
| 1 | Unclassified |
| 2 | Ground |
| 3 | Low Vegetation |
| 4 | Medium Vegetation |
| 5 | High Vegetation |
| 6 | Building |
| 7 | Low Point (noise) |
| 9 | Water |

The application automatically separates points into:
- **Surface Layer**: Classes 1, 3, 4, 5 (unclassified + vegetation)
- **Terrain Layer**: Class 2 (ground)

## Technical Architecture

### Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **3D Rendering**: Three.js (WebGL)
- **Mapping**: Leaflet + React-Leaflet
- **Imagery (optional)**: Google Static Maps (satellite) overlay under the 3D scene
- **Data Source**: OpenTopography Global DEM API
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React

### Key Design Decisions

1. **TypedArrays for Performance**: All point cloud data is stored in Float32Arrays for efficient GPU transfer
2. **Custom GLSL Shaders**: Elevation-based color mapping happens on the GPU for maximum performance
3. **Spatial Normalization**: Point clouds are centered and scaled to fit in a 10-unit space for consistent camera positioning
4. **Component-Based Architecture**: Modular React components for easy maintenance and extension
5. **Type Safety**: Strict TypeScript configuration for compile-time error detection

### Rendering Pipeline

1. **Map Selection** → User draws bounding box on Leaflet map
2. **API Request** → Fetch elevation raster from OpenTopography
3. **Data Parsing** → Parse ASCII Grid format (AAIGrid)
4. **Point Cloud Conversion** → Convert elevation raster to 3D points
5. **Data Processing** → Calculate bounds, normalize coordinates
6. **Geometry Creation** → Convert to Three.js BufferGeometry
7. **Shader Application** → Apply custom materials with GLSL shaders
8. **Scene Rendering** → WebGL rendering with orbit controls

## Performance Considerations

### Tested Performance

| Points | Load Time | FPS | Memory |
|--------|-----------|-----|--------|
| 10K    | <100ms    | 60  | <50MB  |
| 50K    | <500ms    | 60  | <100MB |
| 100K   | <1s       | 60  | <150MB |
| 500K   | <3s       | 55-60 | <500MB |
| 1M     | <6s       | 50-60 | <1GB   |

### Optimization Techniques

- Points are rendered using `THREE.Points` with BufferGeometry
- Color mapping happens in fragment shader (GPU-accelerated)
- Frustum culling handled automatically by Three.js
- Efficient disposal of old geometries when loading new data

### Future Optimizations (Roadmap)

- [ ] Web Workers for background file parsing
- [ ] LOD (Level of Detail) system for large datasets
- [ ] Octree spatial indexing
- [ ] Streaming for massive datasets (10M+ points)
- [ ] Progressive loading with chunking

## Development

### Prerequisites

- Node.js 18+ and npm
- Modern web browser with WebGL support

Required/optional `.env` configuration:

```
VITE_OPENTOPO_API_KEY=your_opentopo_key   # required for scanning real data
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_key # optional, for basemap overlay
```

### Development Workflow

```bash
# Install dependencies
npm install

# Start dev server with hot reload
npm run dev

# Type checking
npm run build

# Preview production build
npm run preview
```

### Code Style

- ESLint for linting (configured in project)
- Prettier for formatting
- Strict TypeScript mode enabled
- Functional components with hooks (React)

## Troubleshooting

### Issue: White/blank screen
**Solution**: Check browser console for errors. Ensure WebGL is supported.

### Issue: Slow performance with large files
**Solution**: Try decimating your point cloud data or test with a smaller selection area or a smaller input file.

### Issue: LAZ files not loading
**Solution**: LAZ support is coming soon. Convert to LAS or XYZ format using tools like CloudCompare or PDAL.

### Issue: Points not visible
**Solution**: Check layer visibility toggles in the right panel. Try adjusting opacity sliders.

## Sample Datasets

Free LiDAR datasets for testing:

1. **USGS 3DEP Program**: https://www.usgs.gov/3d-elevation-program
2. **OpenTopography**: https://opentopography.org/
3. **CloudCompare Sample Data**: https://cloudcompare.org/samples/

## Browser Support

- Chrome 90+ (recommended)
- Firefox 88+
- Edge 90+
- Safari 14+

WebGL 1.0+ required.

## Contributing

Contributions are welcome! Areas for improvement:

- LAZ decompression support
- Web Worker integration
- Advanced measurement tools
- Export functionality (screenshots, 3D models)
- Time-series visualization
- VR/AR support (WebXR)

## License

MIT License - feel free to use this project for any purpose.

## Acknowledgments

- Three.js community for excellent 3D rendering library
- ASPRS for LAS format specification
- Tailwind CSS for utility-first styling
- Open-source LiDAR community

---

**Built with ❤️ using React, Three.js, and modern web technologies.**
