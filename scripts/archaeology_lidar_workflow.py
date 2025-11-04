#!/usr/bin/env python3
"""
Archaeology LiDAR Workflow

Automates LiDAR point cloud processing into bare-earth products for archaeological prospection.

Requirements (install beforehand):
  - PDAL >= 2.5 (pdal)
  - GDAL >= 3.6 (gdalinfo, gdal_translate, gdaldem, gdal_calc.py)
  - Python >= 3.9 (rasterio, numpy, optional: rvt for SVF/LRM)

Typical usage:
  python scripts/archaeology_lidar_workflow.py \
    --input /path/to/laz_dir \
    --out outputs/siteA \
    --resolution 0.5 \
    --method existing-class \
    --aoi-epsg 32616

Outputs:
  - DTM_bareearth.tif (float32)
  - DSM_surface.tif (float32)
  - CHM_canopy.tif (float32)
  - hillshade_multi.tif (uint8)
  - SVF.tif (float32)            [if RVT installed]
  - LRM.tif (float32)            [if RVT installed]
  - archaeology_composite.tif (uint8 RGB)
  - DTM_bareearth.asc            (AAIGrid for web viewer upload)
  - report.html

Notes:
  - This script assumes input LAZ/LAS tiles are in a projected CRS (meter units).
  - If your files are geographic (EPSG:4326), reproject first or set --aoi-epsg appropriately.
  - If classification is poor/missing, use --method smrf to reclassify ground.

"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


def run_cmd(cmd: List[str], cwd: Optional[str] = None) -> None:
  print("[cmd]", " ".join(cmd))
  proc = subprocess.run(cmd, cwd=cwd)
  if proc.returncode != 0:
    raise RuntimeError(f"Command failed with exit code {proc.returncode}: {' '.join(cmd)}")


def which(exe: str) -> bool:
  return shutil.which(exe) is not None


def ensure_tools():
  missing = [
    exe for exe in ["pdal", "gdalinfo", "gdal_translate", "gdaldem", "gdal_calc.py"]
    if not which(exe)
  ]
  if missing:
    raise SystemExit(
      "Missing required tools: " + ", ".join(missing) + "\n"
      "Install PDAL and GDAL first. On macOS (Homebrew):\n"
      "  brew install pdal gdal\n"
      "On Ubuntu:\n  sudo apt-get install -y pdal gdal-bin python3-gdal\n"
    )


def find_lidar_files(input_path: Path) -> List[str]:
  if input_path.is_file():
    return [str(input_path)]
  laz = sorted([str(p) for p in input_path.rglob("*.laz")])
  las = sorted([str(p) for p in input_path.rglob("*.las")])
  files = laz + las
  if not files:
    raise SystemExit(f"No LAS/LAZ files found in {input_path}")
  return files


def build_dtm_pipeline(files: List[str], out_tif: str, resolution: float, method: str = "existing-class", terrain_type: str = "mixed") -> dict:
  readers = [{"type": "readers.las", "filename": f} for f in files]
  stages: List[dict] = readers

  # Auto-optimize SMRF parameters based on terrain type for better archaeological feature detection
  if method == "smrf":
    if terrain_type == "dense_forest":
      # Dense canopy - more aggressive parameters to penetrate vegetation
      smrf_params = {
        "type": "filters.smrf",
        "scalar": 1.5,      # More aggressive filtering
        "slope": 0.10,      # Lower slope tolerance
        "threshold": 0.35,   # Lower threshold for denser canopy
        "window": 25.0      # Larger window for dense vegetation
      }
    elif terrain_type == "archaeological":
      # Optimize for revealing subtle architectural features
      smrf_params = {
        "type": "filters.smrf", 
        "scalar": 1.0,       # Conservative to preserve structures
        "slope": 0.20,       # Higher slope tolerance for walls/platforms
        "threshold": 0.50,    # Higher threshold to preserve features
        "window": 12.0       # Smaller window for fine details
      }
    else:  # mixed terrain
      smrf_params = {
        "type": "filters.smrf",
        "scalar": 1.2,
        "slope": 0.15,
        "threshold": 0.45,
        "window": 18.0
      }
    
    stages += [
      smrf_params,
      {"type": "filters.range", "limits": "Classification[2:2]"},
    ]
  else:
    stages += [{"type": "filters.range", "limits": "Classification[2:2]"}]

  # Enhanced outlier removal for cleaner archaeological features
  stages += [
    {"type": "filters.outlier", "method": "statistical", "mean_k": 12, "multiplier": 2.5},
    {"type": "filters.outlier", "method": "radius", "radius": resolution * 2, "min_k": 3},
  ]

  # Optimized interpolation for archaeological feature preservation
  interpolation_radius = max(resolution * 1.5, 0.75)  # Adaptive radius
  stages += [
    {
      "type": "writers.gdal",
      "filename": out_tif,
      "resolution": resolution,
      "radius": interpolation_radius,
      "output_type": "idw",      # IDW good for preserving sharp features
      "power": 2.0,              # Power parameter for IDW
      "gdaldriver": "GTiff",
      "data_type": "float32",
      "window_size": 5,           # Larger window for smoother results
      "nodata": -9999,
      "gdalopts": [
        "TILED=YES",
        "COMPRESS=DEFLATE",
        "PREDICTOR=3"             # Floating point predictor
      ]
    }
  ]
  return {"pipeline": stages}


def build_dsm_pipeline(files: List[str], out_tif: str, resolution: float) -> dict:
  readers = [{"type": "readers.las", "filename": f} for f in files]
  stages: List[dict] = readers + [
    # Use maximum Z per cell to represent surface (top of canopy/structures)
    {
      "type": "writers.gdal",
      "filename": out_tif,
      "resolution": resolution,
      "output_type": "max",
      "gdaldriver": "GTiff",
      "data_type": "float32",
      "nodata": -9999
    }
  ]
  return {"pipeline": stages}


def write_json(obj: dict, path: Path) -> None:
  path.write_text(json.dumps(obj, indent=2))


def pdal_run(pipeline: dict) -> None:
  with tempfile.TemporaryDirectory() as td:
    pth = Path(td) / "pipeline.json"
    write_json(pipeline, pth)
    run_cmd(["pdal", "pipeline", str(pth)])


def gdal_calc_chm(dsm: Path, dtm: Path, out_chm: Path) -> None:
  run_cmd([
    "gdal_calc.py",
    "-A", str(dsm),
    "-B", str(dtm),
    "--outfile", str(out_chm),
    "--calc", "A-B",
    "--NoDataValue=-9999",
    "--type=Float32",
    "--overwrite"
  ])


def gdaldem_multi_hillshade(dtm: Path, out_hs: Path) -> None:
  tmp_dir = out_hs.parent / "_tmp_hs"
  tmp_dir.mkdir(parents=True, exist_ok=True)
  shades = []
  for az in [315, 45, 135, 225]:
    hs = tmp_dir / f"hs_{az}.tif"
    run_cmd(["gdaldem", "hillshade", str(dtm), str(hs), "-az", str(az), "-alt", "35", "-compute_edges"])
    shades.append(hs)
  # Average the hillshades
  run_cmd([
    "gdal_calc.py",
    "--overwrite",
    "-A", str(shades[0]),
    "-B", str(shades[1]),
    "-C", str(shades[2]),
    "-D", str(shades[3]),
    "--calc", "(A + B + C + D) / 4.0",
    "--outfile", str(out_hs),
    "--type=Byte",
  ])
  shutil.rmtree(tmp_dir, ignore_errors=True)


def try_rvt_svf_lrm(dtm: Path, out_svf: Path, out_lrm: Path) -> bool:
  try:
    import rvt.vis
    import rvt.default
    import rasterio
    from rasterio.transform import Affine
  except Exception as e:
    print("RVT not available (SVF/LRM will be skipped):", e)
    return False

  # Use RVT defaults
  params = rvt.default.DefaultValues()
  ds = rvt.vis.DEM(str(dtm))

  print("Computing Sky View Factor (RVT)...")
  svf = rvt.vis.sky_view_factor(dem=ds, n_directions=16, radius=10.0)
  with rasterio.open(str(out_svf), 'w', driver='GTiff', height=svf.shape[0], width=svf.shape[1], count=1,
                     dtype=svf.dtype, crs=ds.crs, transform=Affine.from_gdal(*ds.geotransform)) as dst:
    dst.write(svf, 1)

  print("Computing Local Relief Model (RVT)...")
  lrm = rvt.vis.local_relief_model(dem=ds, radius=20.0)
  with rasterio.open(str(out_lrm), 'w', driver='GTiff', height=lrm.shape[0], width=lrm.shape[1], count=1,
                     dtype=lrm.dtype, crs=ds.crs, transform=Affine.from_gdal(*ds.geotransform)) as dst:
    dst.write(lrm, 1)

  return True


def create_slope_analysis(dtm: Path, out_slope: Path) -> None:
  """Create slope analysis optimized for detecting archaeological features."""
  run_cmd(["gdaldem", "slope", str(dtm), str(out_slope), "-alg", "ZevenbergenThorne", 
           "-compute_edges", "-s", "1.0"])  # Scale factor for vertical units

def create_curvature_analysis(dtm: Path, out_curvature: Path) -> None:
  """Create curvature analysis to highlight linear features like walls, roads."""
  # Use GDAL's TPI (Topographic Position Index) as proxy for curvature
  run_cmd(["gdaldem", "TPI", str(dtm), str(out_curvature), "-compute_edges"])

def create_enhanced_archaeological_composite(dtm: Path, hs: Path, svf: Optional[Path], lrm: Optional[Path], 
                                           slope: Optional[Path], curvature: Optional[Path], out_rgb: Path) -> None:
  """Build an advanced RGB composite optimized for archaeological feature detection.
  
  Enhanced RRIM (Red Relief Image Map) technique:
    - R: Local Relief Model (enhances large structures) + Curvature (enhances linear features)
    - G: Multi-directional hillshade (general topography)
    - B: Sky View Factor inverse (enhances concave features like ditches, depressions)
  """
  tmp_dir = out_rgb.parent / "_tmp_rgb"
  tmp_dir.mkdir(parents=True, exist_ok=True)

  r = tmp_dir / "R.tif"
  g = tmp_dir / "G.tif" 
  b = tmp_dir / "B.tif"
  r_enhanced = tmp_dir / "R_enhanced.tif"

  # R channel: Enhanced combination of LRM and Curvature for structure detection
  if lrm and lrm.exists() and curvature and curvature.exists():
    # Combine LRM (large features) with Curvature (linear features)
    run_cmd([
      "gdal_calc.py", "--overwrite", 
      "-A", str(lrm), "-B", str(curvature),
      "--calc", "clip(round((A * 0.7 + B * 0.3) * 255), 0, 255)",
      "--outfile", str(r_enhanced), "--type", "Byte"
    ])
    run_cmd(["gdal_translate", str(r_enhanced), str(r), "-ot", "Byte", "-of", "GTiff"])
  elif lrm and lrm.exists():
    # Use histogram stretching for better contrast
    run_cmd(["gdal_translate", str(lrm), str(r), "-ot", "Byte", "-of", "GTiff", 
             "-scale", "0", "100", "0", "255"])  # Stretch to enhance subtle features
  else:
    # Enhanced hillshade with contrast stretching
    run_cmd(["gdal_translate", str(hs), str(r), "-ot", "Byte", "-of", "GTiff"])

  # G channel: Multi-directional hillshade with enhanced contrast
  run_cmd(["gdal_translate", str(hs), str(g), "-ot", "Byte", "-of", "GTiff",
           "-scale", "0", "255", "20", "235"])  # Increase contrast

  # B channel: Enhanced SVF or slope-based enhancement
  if svf and svf.exists():
    # Invert SVF and enhance for better depression visibility
    run_cmd([
      "gdal_calc.py", "--overwrite", "-A", str(svf),
      "--calc", "clip(round(((1.0 - A) ** 0.8) * 255), 0, 255)",  # Power law for better contrast
      "--outfile", str(b), "--type", "Byte"
    ])
  elif slope and slope.exists():
    # Use inverted slope to highlight flat areas (potential platforms/plazas)
    run_cmd([
      "gdal_calc.py", "--overwrite", "-A", str(slope),
      "--calc", "clip(round((1.0 - (A / maximum(A))) * 255), 0, 255)",
      "--outfile", str(b), "--type", "Byte"
    ])
  else:
    # Enhanced inverted hillshade
    run_cmd([
      "gdal_calc.py", "--overwrite", "-A", str(hs),
      "--calc", "clip(round(((1.0 - (A/255.0)) ** 0.8) * 255), 0, 255)",
      "--outfile", str(b), "--type", "Byte"
    ])

  # Stack as RGB with optimized compression
  vrt = tmp_dir / "comp.vrt"
  run_cmd(["gdalbuildvrt", "-separate", str(vrt), str(r), str(g), str(b)])
  run_cmd(["gdal_translate", str(vrt), str(out_rgb), "-ot", "Byte", "-of", "GTiff",
           "-co", "PHOTOMETRIC=RGB", "-co", "TILED=YES", "-co", "COMPRESS=DEFLATE",
           "-co", "PREDICTOR=2", "-co", "ZLEVEL=9"])  # High compression for web use
  
  shutil.rmtree(tmp_dir, ignore_errors=True)

# Keep the old function for compatibility
rgb_composite_rrim = create_enhanced_archaeological_composite


def export_ascii_grid(dtm_tif: Path, out_asc: Path) -> None:
  run_cmd(["gdal_translate", "-of", "AAIGrid", str(dtm_tif), str(out_asc)])


def write_report(out_dir: Path, params: dict) -> None:
  html = out_dir / "report.html"
  html.write_text(f"""
<!doctype html>
<html><head>
  <meta charset=\"utf-8\" />
  <title>LiDAR Archaeology Processing Report</title>
  <style>
    body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; color: #111; }}
    code, pre {{ background: #f5f5f5; padding: 0.2rem 0.4rem; border-radius: 4px; }}
    h1 {{ margin-bottom: 0.5rem; }}
    ul {{ line-height: 1.6; }}
  </style>
  </head><body>
  <h1>Processing Report</h1>
  <p><strong>Output directory:</strong> {out_dir}</p>
  <h2>Parameters</h2>
  <pre>{json.dumps(params, indent=2)}</pre>
  <h2>Products</h2>
  <ul>
    <li>DTM: <code>DTM_bareearth.tif</code></li>
    <li>DSM: <code>DSM_surface.tif</code></li>
    <li>CHM: <code>CHM_canopy.tif</code></li>
    <li>Hillshade: <code>hillshade_multi.tif</code></li>
    <li>SVF: <code>SVF.tif</code> (if RVT available)</li>
    <li>LRM: <code>LRM.tif</code> (if RVT available)</li>
    <li>Composite: <code>archaeology_composite.tif</code></li>
    <li>AAIGrid for viewer: <code>DTM_bareearth.asc</code></li>
  </ul>
  <p>Load <code>DTM_bareearth.asc</code> in the app (Upload Processed DTM) to view the bare-earth surface similar to the example image.</p>
  </body></html>
  """)


@dataclass
class Args:
  input: Path
  out: Path
  resolution: float
  method: str
  terrain_type: str
  aoi_epsg: Optional[int]
  auto_resolution: bool


def auto_detect_optimal_resolution(files: List[str]) -> float:
  """Auto-detect optimal resolution based on point density analysis."""
  try:
    # Sample the first file to estimate point density
    sample_file = files[0]
    result = subprocess.run(
      ["pdal", "info", sample_file, "--metadata"], 
      capture_output=True, text=True, check=True
    )
    
    import json
    info = json.loads(result.stdout)
    
    # Extract point density estimates
    stats = info.get("metadata", {}).get("statistics", [])
    if stats and len(stats) > 0:
      count = stats[0].get("count", 0)
      bbox = stats[0].get("bbox", {})
      
      if count and bbox:
        # Estimate area and density
        area_deg2 = (bbox["maxx"] - bbox["minx"]) * (bbox["maxy"] - bbox["miny"])
        area_m2 = area_deg2 * 111320 * 111320  # Rough conversion
        density_per_m2 = count / area_m2 if area_m2 > 0 else 0
        
        print(f"Estimated point density: {density_per_m2:.2f} points/m²")
        
        # Optimize resolution based on density
        if density_per_m2 > 15:  # Very high density
          return 0.25
        elif density_per_m2 > 8:  # High density
          return 0.5
        elif density_per_m2 > 2:  # Medium density
          return 1.0
        else:  # Low density
          return 2.0
  except Exception as e:
    print(f"Could not auto-detect resolution: {e}")
  
  return 1.0  # Default fallback

def main(argv: Optional[List[str]] = None) -> int:
  parser = argparse.ArgumentParser(description="Enhanced LiDAR archaeology processing workflow")
  parser.add_argument("--input", required=True, type=Path, help="Path to LAZ/LAS file or directory of tiles")
  parser.add_argument("--out", required=True, type=Path, help="Output directory")
  parser.add_argument("--resolution", type=float, default=None, help="Output raster resolution in meters (auto-detected if not specified)")
  parser.add_argument("--method", choices=["existing-class", "smrf"], default="existing-class",
                      help="Ground extraction method: use existing Classification=2 or run SMRF reclassification")
  parser.add_argument("--terrain-type", choices=["dense_forest", "mixed", "archaeological"], default="mixed",
                      help="Terrain type for processing optimization: dense_forest (heavy vegetation), mixed (general), archaeological (known sites)")
  parser.add_argument("--aoi-epsg", type=int, default=None, help="EPSG code of AOI CRS for outputs (optional)")
  parser.add_argument("--auto-resolution", action="store_true", 
                      help="Auto-detect optimal resolution based on point density (overrides --resolution)")

  ns = parser.parse_args(argv)
  
  # Determine resolution
  resolution = ns.resolution
  auto_resolution = ns.auto_resolution or (resolution is None)
  if resolution is None:
    resolution = 1.0  # Default
  
  args = Args(ns.input, ns.out, resolution, ns.method, ns.terrain_type, ns.aoi_epsg, auto_resolution)

  ensure_tools()
  args.out.mkdir(parents=True, exist_ok=True)
  files = find_lidar_files(args.input)

  # Auto-detect optimal resolution if requested
  if args.auto_resolution:
    print("\n=== Auto-detecting optimal resolution ===")
    optimal_resolution = auto_detect_optimal_resolution(files)
    print(f"Using auto-detected resolution: {optimal_resolution}m")
    args.resolution = optimal_resolution

  print(f"Processing with {args.resolution}m resolution for {args.terrain_type} terrain")
  
  # Define output paths
  dtm = args.out / "DTM_bareearth.tif"
  dsm = args.out / "DSM_surface.tif"
  chm = args.out / "CHM_canopy.tif"
  hs = args.out / "hillshade_multi.tif"
  svf = args.out / "SVF.tif"
  lrm = args.out / "LRM.tif"
  slope = args.out / "slope.tif"
  curvature = args.out / "curvature.tif"
  comp = args.out / "archaeology_composite.tif"
  asc = args.out / "DTM_bareearth.asc"

  # DTM with terrain-optimized parameters
  print("\n=== Generating DTM (bare-earth) ===")
  pdal_run(build_dtm_pipeline(files, str(dtm), args.resolution, method=args.method, terrain_type=args.terrain_type))

  # DSM
  print("\n=== Generating DSM (surface) ===")
  pdal_run(build_dsm_pipeline(files, str(dsm), args.resolution))

  # CHM
  print("\n=== Computing CHM (DSM - DTM) ===")
  gdal_calc_chm(dsm, dtm, chm)

  # Multi-directional Hillshade
  print("\n=== Multi-directional Hillshade ===")
  gdaldem_multi_hillshade(dtm, hs)

  # Advanced terrain analysis for structure detection
  print("\n=== Advanced Terrain Analysis ===")
  print("  → Computing slope analysis...")
  create_slope_analysis(dtm, slope)
  
  print("  → Computing curvature analysis...")
  create_curvature_analysis(dtm, curvature)

  # SVF/LRM via RVT (optional but recommended for archaeology)
  print("\n=== Sky View Factor & Local Relief Model ===")
  have_rvt = try_rvt_svf_lrm(dtm, svf, lrm)
  if not have_rvt:
    print("  ⚠️  RVT not available. Install with: pip install rvt")
    print("  ⚠️  SVF and LRM enhance archaeological feature detection significantly!")

  # Enhanced Archaeological Composite
  print("\n=== Enhanced Archaeological Composite ===")
  create_enhanced_archaeological_composite(
    dtm, hs, 
    svf if have_rvt else None, 
    lrm if have_rvt else None,
    slope, curvature, 
    comp
  )

  # Export ASCII Grid for web viewer
  print("\n=== Export DTM as ASCII Grid for web viewer ===")
  export_ascii_grid(dtm, asc)

  # Enhanced report with processing details
  print("\n=== Writing processing report ===")
  write_report(args.out, {
    "resolution": args.resolution,
    "method": args.method,
    "terrain_type": args.terrain_type,
    "auto_resolution": args.auto_resolution,
    "n_files": len(files),
    "inputs": files[:5] + (["..."] if len(files) > 5 else []),
    "has_rvt_products": have_rvt,
    "products_generated": [
      "DTM_bareearth.tif (main bare-earth surface)",
      "DSM_surface.tif (digital surface model)",
      "CHM_canopy.tif (canopy height)",
      "hillshade_multi.tif (multi-directional hillshade)",
      "slope.tif (slope analysis)",
      "curvature.tif (curvature analysis)",
      "SVF.tif (sky view factor)" if have_rvt else None,
      "LRM.tif (local relief model)" if have_rvt else None,
      "archaeology_composite.tif (enhanced RRIM visualization)",
      "DTM_bareearth.asc (for web app upload)"
    ]
  })

  print(f"\n✅ Processing complete! Outputs in: {args.out}")
  print(f"\n📊 Key products for structure detection:")
  print(f"   • DTM_bareearth.asc - Upload this to your web app!")
  print(f"   • archaeology_composite.tif - Enhanced visualization showing structures")
  print(f"   • Resolution: {args.resolution}m (optimal for your point density)")
  if have_rvt:
    print(f"   • Advanced products: SVF + LRM enhance small feature detection")
  
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
