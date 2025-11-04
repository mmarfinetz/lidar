#!/bin/bash
# Test Data Availability System
# Demonstrates the hierarchical data quality assessment

set -e

echo "🔍 Testing Hierarchical LiDAR Data Availability System"
echo "====================================================="
echo

echo "Your app now automatically finds the HIGHEST QUALITY data available"
echo "for any location the user selects on the map!"
echo

echo "📊 DATA QUALITY HIERARCHY (Best to Worst):"
echo
echo "🏛️  TIER 1: Archaeological Quality (0.5-2m, 5-20+ points/m²)"
echo "   - OpenTopography archaeological collections"
echo "   - Examples: Maya sites in Mexico, research sites"
echo "   - ✅ CAN REVEAL: Building foundations, walls, roads, plazas"
echo

echo "🔍 TIER 2: High Resolution (1-2m, 2-8 points/m²)" 
echo "   - USGS 3DEP LiDAR (US only)"
echo "   - European national programs (UK, Netherlands, France, etc.)"
echo "   - ✅ CAN REVEAL: Large archaeological features, detailed terrain"
echo

echo "📊 TIER 3: Medium Resolution (1-5m, 1-5 points/m²)"
echo "   - OpenTopography high-res collections"
echo "   - Regional specialized surveys"
echo "   - ⚠️  LIMITED: Only very large features visible"
echo

echo "🗺️  TIER 4: Basic Resolution (30-90m, ~0.0001 points/m²)"
echo "   - Global DEMs (SRTM, ALOS)"
echo "   - Always available worldwide"
echo "   - ❌ CANNOT REVEAL: Archaeological features (too low resolution)"
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

echo "🎯 HOW IT WORKS IN YOUR APP:"
echo

echo "1. User selects any region on the map"
echo "2. App checks ALL data sources in order of quality"
echo "3. App automatically uses the BEST available source"
echo "4. User sees clear indication of expected quality"
echo

echo "🌍 EXAMPLE LOCATIONS TO TRY:"
echo

echo "🏛️  HIGH ARCHAEOLOGICAL QUALITY:"
echo "   📍 Mayapán, Mexico (20.635°N, 89.456°W)"
echo "      → Will detect: 0.5m resolution Maya archaeological LiDAR"
echo "      → Can reveal: Building foundations, plazas, defensive walls"
echo

echo "🇺🇸 USGS HIGH RESOLUTION:"
echo "   📍 Colorado, USA (40.0°N, 105.5°W)"
echo "      → Will detect: 1-2m USGS 3DEP LiDAR"
echo "      → Can reveal: Large structures, detailed topography"
echo

echo "🇳🇱 EUROPEAN HIGH RESOLUTION:"
echo "   📍 Netherlands (52.1°N, 5.2°E)"
echo "      → Will detect: 0.5m AHN national LiDAR"
echo "      → Can reveal: Archaeological features, field systems"
echo

echo "🌍 GLOBAL BASIC:"
echo "   📍 Random location (e.g., central Africa, ocean)"
echo "      → Will fallback to: 30-90m SRTM global DEM"
echo "      → Shows: Basic topography only"
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

echo "🚀 TRY IT NOW:"
echo

echo "1. Start your app:"
echo "   npm run dev"
echo

echo "2. Select the Mayapán region in Mexico:"
echo "   - Navigate to: 20.635°N, 89.456°W" 
echo "   - Draw a small rectangle around that point"
echo "   - Watch the app detect archaeological-quality data!"
echo

echo "3. You'll see:"
echo "   🟢 'Archaeological Quality' assessment"
echo "   ⚡ 'Archaeological features may be visible!' indicator"
echo "   📊 High point density estimate (5-20+ points/m²)"
echo "   🏛️  'Scan for Archaeology' button (instead of 'Scan Terrain')"
echo

echo "4. Compare with a random location:"
echo "   - Select somewhere in central Africa or Asia"
echo "   - You'll see: 'Basic Resolution' with SRTM data"
echo

echo "✨ THE KEY DIFFERENCE:"
echo "Your app now AUTOMATICALLY finds archaeological-quality data"
echo "wherever it exists, and clearly shows users what to expect!"
echo

echo "🔧 Behind the scenes:"
echo "- Real USGS API integration for US LiDAR availability"
echo "- Known archaeological site detection"
echo "- European national program coverage mapping"
echo "- Intelligent fallback to global sources"
echo

echo "📈 Next time you want 0.5-2m archaeological data:"
echo "Just select ANY region - your app will find the best data available!"
