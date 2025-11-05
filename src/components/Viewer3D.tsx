import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { LayerManager } from '../core/LayerManager';
import type { PointCloudData } from '../types/lidar';
import { buildGoogleStaticMapUrl } from '../core/Basemap';

interface Viewer3DProps {
  data: PointCloudData | null;
  onReady?: (manager: LayerManager) => void;
  showGrid?: boolean;
}

interface TooltipData {
  x: number;
  y: number;
  coordinate: {
    x: number;
    y: number;
    z: number;
  };
  screenX: number;
  screenY: number;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({ data, onReady, showGrid = true }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const layerManagerRef = useRef<LayerManager | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const basemapMeshRef = useRef<THREE.Mesh | null>(null);
  const basemapTextureRef = useRef<THREE.Texture | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const fxaaPassRef = useRef<ShaderPass | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    try {

    const container = containerRef.current;
    let width = container.clientWidth;
    let height = container.clientHeight;
    
    console.log('Initializing 3D viewer with dimensions:', { width, height });
    
    // If dimensions are not ready, use fallback dimensions and set up ResizeObserver
    if (width === 0 || height === 0) {
      console.warn('Container has zero dimensions, using fallback dimensions');
      width = 800;
      height = 600;
    }

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a); // Dark background
    scene.fog = new THREE.FogExp2(0x0a0e1a, 0.02);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 5000);
    // Use Z-up world to match elevation on Z
    camera.up.set(0, 0, 1);
    camera.position.set(15, 15, 15);
    cameraRef.current = camera;

    // Renderer with enhanced quality settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: "high-performance",
      precision: "highp",
      preserveDrawingBuffer: false, // Better performance
    });
    renderer.setSize(width, height);
    // Enhanced pixel ratio for crisp visuals on high-DPI displays
    const pixelRatio = Math.min(window.devicePixelRatio, 2); // Cap at 2 for performance
    renderer.setPixelRatio(pixelRatio);
    
    // Enhanced color management & tonemapping
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2; // Slightly brighter for better detail
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Advanced rendering features
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
    renderer.shadowMap.autoUpdate = true;
    
    // Enable hardware acceleration features
    renderer.setAnimationLoop = renderer.setAnimationLoop;
    renderer.info.autoReset = false;
    
    // Make sure the canvas takes full size
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    console.log('Renderer initialized and canvas added to DOM:', {
      canvasSize: { width: renderer.domElement.width, height: renderer.domElement.height },
      containerSize: { width: container.clientWidth, height: container.clientHeight },
      pixelRatio
    });

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
    controls.maxDistance = 100;
    // Allow top-down (aerial) orbiting
    controls.maxPolarAngle = Math.PI;
    controlsRef.current = controls;

    // Enhanced lighting setup for better visual quality
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    // Enhanced shadow quality
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.radius = 4;
    scene.add(directionalLight);

    // Add rim lighting for better depth perception
    const rimLight = new THREE.DirectionalLight(0x87ceeb, 0.3); // Sky blue rim light
    rimLight.position.set(-10, -10, 15);
    scene.add(rimLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    // Place grid on XY plane for Z-up world
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.visible = showGrid;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Axes helper
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Add a test cube to ensure the scene is working (will be removed when data loads)
    const testGeometry = new THREE.BoxGeometry(4, 4, 4);
    const testMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      wireframe: false,
      transparent: true,
      opacity: 0.7 
    });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(0, 0, 2);
    testCube.name = 'testCube';
    scene.add(testCube);
    
    // Add rotation animation to the test cube
    const animateTestCube = () => {
      if (testCube.parent) { // Only animate if still in scene
        testCube.rotation.x += 0.01;
        testCube.rotation.y += 0.01;
      }
    };
    
    console.log('Added animated test cube to scene');

    // Raycaster for coordinate detection
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // Layer Manager with camera reference for LOD
    const layerManager = new LayerManager(scene);
    layerManager.setCamera(camera);
    layerManagerRef.current = layerManager;
    onReady?.(layerManager);

    // Enhanced post-processing pipeline for superior visual quality
    const composer = new EffectComposer(renderer);
    
    // Base render pass
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Enhanced SAO (Screen-space Ambient Occlusion) for micro-relief detail
    const saoPass = new SAOPass(scene, camera);
    saoPass.params.saoIntensity = 0.025; // Slightly more intense
    saoPass.params.saoScale = 120;       // Better scale for terrain
    saoPass.params.saoKernelRadius = 20; // Larger kernel for smoother AO
    saoPass.params.saoMinResolution = 0.0;
    saoPass.params.saoBlur = true;
    saoPass.params.saoBlurRadius = 8;
    saoPass.params.saoBlurStdDev = 4;
    saoPass.params.saoBlurDepthCutoff = 0.01;
    composer.addPass(saoPass);

    // Subtle bloom for enhanced lighting
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.15, 0.4, 0.85);
    bloomPass.threshold = 0.8;   // Only bright areas bloom
    bloomPass.strength = 0.15;   // Subtle effect
    bloomPass.radius = 0.4;      // Medium blur radius
    composer.addPass(bloomPass);

    // Enhanced FXAA for crystal-clear edges
    const fxaaPass = new ShaderPass(FXAAShader);
    const currentPixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(
      1 / (width * currentPixelRatio), 
      1 / (height * currentPixelRatio)
    );
    // Enhanced FXAA quality settings - only set if uniforms exist
    const uniforms = fxaaPass.material.uniforms;
    if (uniforms['fxaaQualitySubpix']) {
      uniforms['fxaaQualitySubpix'].value = 0.80; // Increased from 0.75 for better subpixel detail
    }
    if (uniforms['fxaaQualityEdgeThreshold']) {
      uniforms['fxaaQualityEdgeThreshold'].value = 0.125; // Reduced from 0.166 for sharper edges
    }
    if (uniforms['fxaaQualityEdgeThresholdMin']) {
      uniforms['fxaaQualityEdgeThresholdMin'].value = 0.0625; // Reduced from 0.0833 for sharper detail
    }
    composer.addPass(fxaaPass);

    // Final output pass for proper tone mapping
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    composerRef.current = composer;
    fxaaPassRef.current = fxaaPass;

    // Mouse move handler for coordinate tooltip
    const handleMouseMove = (event: MouseEvent) => {
      if (!raycaster || !camera || !scene || !data) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(mouse, camera);
      
      // Get all terrain meshes for raycasting
      const terrainMeshes: THREE.Object3D[] = [];
      scene.traverse((child) => {
        if (child.userData.isTerrainMesh) {
          terrainMeshes.push(child);
        }
      });

      if (terrainMeshes.length > 0) {
        const intersects = raycaster.intersectObjects(terrainMeshes, true);
        if (intersects.length > 0) {
          const intersect = intersects[0];
          const point = intersect.point;
          
          setTooltip({
            x: point.x,
            y: point.y,
            coordinate: {
              x: point.x,
              y: point.y,
              z: point.z,
            },
            screenX: event.clientX,
            screenY: event.clientY,
          });
        } else {
          setTooltip(null);
        }
      } else {
        setTooltip(null);
      }
    };

    const handleMouseLeave = () => {
      setTooltip(null);
    };

    // Add mouse event listeners
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseleave', handleMouseLeave);

    // Enhanced animation loop with LOD updates
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      
      // Animate test cube
      animateTestCube();
      
      // Update LOD for optimized terrain meshes
      if (layerManagerRef.current) {
        layerManagerRef.current.updateLOD();
      }
      
      // Render with enhanced post-processing pipeline
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();
    
    // Force an immediate render
    renderer.render(scene, camera);
    console.log('First render completed');

    // Enhanced window resize handler
    const handleResize = () => {
      if (!containerRef.current || !composerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      if (newWidth === 0 || newHeight === 0) return;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      
      // Update post-processing pipeline
      composerRef.current.setSize(newWidth, newHeight);
      
      // Update FXAA resolution
      if (fxaaPassRef.current) {
        const pixelRatio = renderer.getPixelRatio();
        fxaaPassRef.current.material.uniforms['resolution'].value.set(
          1 / (newWidth * pixelRatio), 
          1 / (newHeight * pixelRatio)
        );
      }
    };

    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for better container size detection
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newWidth, height: newHeight } = entry.contentRect;
        console.log('ResizeObserver detected size change:', { newWidth, newHeight });
        if (newWidth > 0 && newHeight > 0) {
          camera.aspect = newWidth / newHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(newWidth, newHeight);
          
          if (composerRef.current) {
            composerRef.current.setSize(newWidth, newHeight);
          }
        }
      }
    });

    resizeObserver.observe(container);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave);
      resizeObserver.disconnect();

      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }

      layerManager.dispose();
      // Dispose basemap
      if (basemapMeshRef.current) {
        scene.remove(basemapMeshRef.current);
        basemapMeshRef.current.geometry.dispose();
        const mat = basemapMeshRef.current.material as THREE.Material;
        mat.dispose();
        basemapMeshRef.current = null;
      }
      if (basemapTextureRef.current) {
        basemapTextureRef.current.dispose();
        basemapTextureRef.current = null;
      }
      controls.dispose();
      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }
      renderer.dispose();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    
    } catch (error) {
      console.error('Error initializing 3D viewer:', error);
      // Create a fallback scene if initialization fails
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      containerRef.current?.appendChild(renderer.domElement);
      
      // Add a simple error message
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const cube = new THREE.Mesh(geometry, material);
      scene.add(cube);
      camera.position.z = 5;
      
      const errorAnimate = () => {
        requestAnimationFrame(errorAnimate);
        cube.rotation.x += 0.01;
        cube.rotation.y += 0.01;
        renderer.render(scene, camera);
      };
      errorAnimate();
    }
  }, [onReady]);

  // Handle grid visibility changes
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Update visualization when data changes
  useEffect(() => {
    if (!data || !layerManagerRef.current || !sceneRef.current) return;

    console.log('Loading point cloud data:', data.count, 'points');

    // Remove test cube if it exists
    const testCube = sceneRef.current.getObjectByName('testCube');
    if (testCube) {
      sceneRef.current.remove(testCube);
      console.log('Removed test cube');
    }

    // Clear existing layers
    layerManagerRef.current.clearAll();

    // Create both layers
    layerManagerRef.current.createTerrainLayer(data);
    layerManagerRef.current.createSurfaceLayer(data);

    // Default enhanced shading options for archaeological relief
    layerManagerRef.current.setSun(315, 35);          // NW light, 35° altitude
    layerManagerRef.current.setLighting(0.5, 0.9, 0.25); // ambient, diffuse, slope emphasis
    layerManagerRef.current.setContours(60, 0.2);     // subtle contour lines
    layerManagerRef.current.setVerticalExaggeration(1.3); // slight vertical exaggeration

    // Adjust camera to fit data (Z-up: X=east, Y=north, Z=up)
    if (cameraRef.current && controlsRef.current) {
      const bounds = data.bounds;
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const centerZ = (bounds.minZ + bounds.maxZ) / 2;

      controlsRef.current.target.set(centerX, centerY, centerZ);
      // Place camera diagonally above the scene for good perspective
      cameraRef.current.position.set(centerX + 15, centerY + 15, centerZ + 15);
      controlsRef.current.update();
    }

    // Optionally add Google satellite basemap as a textured ground plane
    try {
      const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
      if (apiKey && sceneRef.current) {
        const bbox = data.geo?.bbox;
        if (bbox) {
          // Use maximum allowed resolution for Google Static Maps (640 with scale=2 = 1280x1280)
          const url = buildGoogleStaticMapUrl(bbox, apiKey, 640);
          const width = data.bounds.maxX - data.bounds.minX;   // east-west
          const height = data.bounds.maxY - data.bounds.minY;  // north-south
          const centerX = (data.bounds.minX + data.bounds.maxX) / 2;
          const centerY = (data.bounds.minY + data.bounds.maxY) / 2;
          const baseZ = data.bounds.minZ; // normalized base elevation (~0)

          // Clean up existing basemap first
          if (basemapMeshRef.current && sceneRef.current) {
            sceneRef.current.remove(basemapMeshRef.current);
            basemapMeshRef.current.geometry.dispose();
            const mat = basemapMeshRef.current.material as THREE.Material;
            mat.dispose();
            basemapMeshRef.current = null;
          }
          if (basemapTextureRef.current) {
            basemapTextureRef.current.dispose();
            basemapTextureRef.current = null;
          }

          const loader = new THREE.TextureLoader();
          loader.crossOrigin = 'anonymous';
          loader.load(
            url,
            (texture) => {
              basemapTextureRef.current = texture;
              texture.wrapS = THREE.ClampToEdgeWrapping;
              texture.wrapT = THREE.ClampToEdgeWrapping;
              // Enhanced texture filtering for crisp basemaps
              texture.minFilter = THREE.LinearMipmapLinearFilter;
              texture.magFilter = THREE.LinearFilter;
              texture.anisotropy = rendererRef.current!.capabilities.getMaxAnisotropy(); // Maximum anisotropic filtering
              texture.generateMipmaps = true;
              texture.colorSpace = THREE.SRGBColorSpace; // Proper color space for accurate colors
              texture.format = THREE.RGBAFormat; // Use RGBA for better compatibility

              const geometry = new THREE.PlaneGeometry(width, height); // XY plane (Z-up)
              const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95 });
              const mesh = new THREE.Mesh(geometry, material);
              // Place at ground level (z ~ base elevation)
              mesh.position.set(centerX, centerY, baseZ);
              mesh.name = 'basemap_plane';

              sceneRef.current!.add(mesh);
              basemapMeshRef.current = mesh;
            },
            undefined,
            (err) => {
              console.warn('Failed to load Google Static Map basemap:', err);
            }
          );
        }
      }
    } catch (e) {
      console.warn('Basemap overlay disabled:', e);
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{
        cursor: 'grab',
        minWidth: '100%',
        minHeight: '100%'
      }}
    >
      
      {/* Status indicator */}
      <div className="absolute top-4 left-4 bg-black/90 text-white px-3 py-2 rounded text-sm z-10">
        {!data ? (
          <div className="text-yellow-400">🔄 Initializing 3D viewer...</div>
        ) : (
          <div className="text-green-400">
            ✓ {data.count} points loaded | Bounds: {data.bounds.minX.toFixed(1)} to {data.bounds.maxX.toFixed(1)}
          </div>
        )}
      </div>
      
      {/* Coordinate Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-20 bg-black/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-sm font-mono shadow-lg border border-gray-600"
          style={{
            left: tooltip.screenX + 10,
            top: tooltip.screenY - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <div className="flex flex-col space-y-1">
            <div>X: {tooltip.coordinate.x.toFixed(2)}</div>
            <div>Y: {tooltip.coordinate.y.toFixed(2)}</div>
            <div>Z: {tooltip.coordinate.z.toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
};
