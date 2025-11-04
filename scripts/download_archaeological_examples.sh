#!/bin/bash
# Download Archaeological LiDAR Examples
# Run this to get high-resolution archaeological data to try in your app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/../archaeological_examples"

echo "🏛️  Downloading Archaeological LiDAR Examples"
echo "=================================================="

# Create output directory
mkdir -p "$OUTPUT_DIR"
cd "$OUTPUT_DIR"

echo
echo "📦 1. Mayapán Maya Archaeological Site (Mexico)"
echo "   - Resolution: 0.5m (very high detail)"
echo "   - Shows Maya ruins beneath forest canopy"
echo "   - Perfect example of archaeological LiDAR"
echo

if [ ! -f "mayapan_dtm.tif" ]; then
    echo "Downloading Mayapán DTM (bare-earth)..."
    curl -L "https://cloud.sdsc.edu/v1/AUTH_opentopography/Raster/OTSDEM.032016.32616.1/OTSDEM.032016.32616.1_BE.tif" \
         -o mayapan_dtm.tif
    echo "✅ Downloaded mayapan_dtm.tif"
else
    echo "✅ mayapan_dtm.tif already exists"
fi

if [ ! -f "mayapan_dsm.tif" ]; then
    echo "Downloading Mayapán DSM (top-of-canopy)..."
    curl -L "https://cloud.sdsc.edu/v1/AUTH_opentopography/Raster/OTSDEM.032016.32616.1/OTSDEM.032016.32616.1_FE.tif" \
         -o mayapan_dsm.tif
    echo "✅ Downloaded mayapan_dsm.tif"
else
    echo "✅ mayapan_dsm.tif already exists"
fi

echo
echo "🔄 Converting to formats your app can read..."

# Check if GDAL is available
if command -v gdal_translate >/dev/null 2>&1; then
    echo "Converting to ASCII Grid (.asc) format..."
    
    if [ ! -f "mayapan_dtm.asc" ]; then
        gdal_translate -of AAIGrid mayapan_dtm.tif mayapan_dtm.asc
        echo "✅ Created mayapan_dtm.asc (bare-earth - shows archaeological features)"
    fi
    
    if [ ! -f "mayapan_dsm.asc" ]; then
        gdal_translate -of AAIGrid mayapan_dsm.tif mayapan_dsm.asc
        echo "✅ Created mayapan_dsm.asc (surface with vegetation)"
    fi
    
    echo
    echo "🎯 FILES READY FOR YOUR APP:"
    echo "   📄 mayapan_dtm.asc  ← UPLOAD THIS to see archaeological features!"
    echo "   📄 mayapan_dsm.asc  ← Compare with this (shows vegetation)"
    
else
    echo
    echo "⚠️  GDAL not found. Please install GDAL to convert files:"
    echo "   macOS: brew install gdal"
    echo "   Ubuntu: sudo apt-get install gdal-bin"
    echo
    echo "   After installing GDAL, run this script again."
    echo
    echo "📄 Downloaded files (need conversion):"
    echo "   mayapan_dtm.tif (bare-earth)"
    echo "   mayapan_dsm.tif (surface)"
fi

echo
echo "🚀 HOW TO USE IN YOUR APP:"
echo "================================"
echo "1. Start your app: cd .. && npm run dev"
echo "2. In the app, look for 'File Upload' or 'Upload Data'"
echo "3. Upload: archaeological_examples/mayapan_dtm.asc"
echo "4. You'll see the Maya ruins revealed by LiDAR!"
echo
echo "🔍 WHAT YOU'LL SEE:"
echo "   - Rectangular building foundations"
echo "   - Plaza arrangements"
echo "   - Defensive walls"
echo "   - Ancient roads and causeways"
echo "   - All hidden beneath forest canopy!"
echo

# Show file info if available
if [ -f "mayapan_dtm.asc" ]; then
    echo "📊 Dataset Information:"
    echo "   Location: Mayapán, Yucatán, Mexico (20.63°N, 89.46°W)"
    echo "   Site: Important Late Classic Maya center"
    echo "   File size: $(du -h mayapan_dtm.asc | cut -f1)"
    echo "   Resolution: ~0.5 meters per pixel"
    echo
fi

echo "✨ Done! Ready to explore Maya archaeology with LiDAR!"
