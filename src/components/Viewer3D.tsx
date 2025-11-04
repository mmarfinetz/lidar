import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';
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

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

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

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // Color management & tonemapping for richer visuals
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

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

    // Raycaster for coordinate detection
    const raycaster = new THREE.Raycaster();
    raycasterRef.current = raycaster;

    // Layer Manager
    const layerManager = new LayerManager(scene);
    layerManagerRef.current = layerManager;
    onReady?.(layerManager);

    // Post-processing setup (RenderPass + SAO + FXAA)
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // SAO (Screen-space Ambient Occlusion) to enhance micro‑relief
    const saoPass = new SAOPass(scene, camera);
    saoPass.params.saoIntensity = 0.02;
    saoPass.params.saoScale = 100;
    saoPass.params.saoKernelRadius = 16;
    composer.addPass(saoPass);

    // FXAA for cleaner edges
    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    composer.addPass(fxaaPass);

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

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      controls.update();
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      if (fxaaPassRef.current) {
        const pixelRatio = renderer.getPixelRatio();
        fxaaPassRef.current.material.uniforms['resolution'].value.set(1 / (newWidth * pixelRatio), 1 / (newHeight * pixelRatio));
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave);

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
  }, [onReady]);

  // Handle grid visibility changes
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Update visualization when data changes
  useEffect(() => {
    if (!data || !layerManagerRef.current) return;

    console.log('Loading point cloud data:', data.count, 'points');

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
          const url = buildGoogleStaticMapUrl(bbox, apiKey, 1024);
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
              texture.minFilter = THREE.LinearFilter;
              texture.magFilter = THREE.LinearFilter;

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
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: 'grab' }}
      />
      
      {/* Coordinate Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 bg-black/80 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-sm font-mono shadow-lg border border-gray-600"
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
