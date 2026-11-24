import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, Layers, RotateCcw, Volume2 } from 'lucide-react';
import { buildConceptSceneBlueprint, type ConceptScenePartSpec } from '../utils/concept3dBlueprint';
import type { SimpliAnalysis } from '../types/simpli';
import type { useSpeechPlayer } from '../hooks/useSpeechPlayer';

interface ConceptScene3DProps {
  analysis: SimpliAnalysis;
  speech: ReturnType<typeof useSpeechPlayer>;
}

type CameraPreset = 'overview' | 'top' | 'detail';

// Module-scope scratch vectors — zero allocations inside animation loop
const _camGoal = new THREE.Vector3();
const _targetGoal = new THREE.Vector3();
const _rayPointer = new THREE.Vector2();

function createStudioNoiseTexture(baseHex: string, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      const x = (i * 73) % 256;
      const y = (i * 137) % 256;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(15,23,42,0.035)';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.strokeStyle = 'rgba(124,58,237,0.07)';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 256; g += 32) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(256, g);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(15,23,42,0.34)');
    grad.addColorStop(0.55, 'rgba(15,23,42,0.12)');
    grad.addColorStop(1, 'rgba(15,23,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBeveledShapeMesh(
  radius: number,
  height: number,
  sides: number,
  mat: THREE.Material
): THREE.Mesh {
  const shape = new THREE.Shape();
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildCompositeCore(
  archetype: 'cycle' | 'mechanics' | 'architecture',
  primaryHex: number,
  secondaryHex: number,
  shadowTex: THREE.CanvasTexture,
  partId: string
): THREE.Group {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.72,
    metalness: 0.08,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.28,
    metalness: 0.82,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.35,
    metalness: 0.25,
    emissive: new THREE.Color(primaryHex),
    emissiveIntensity: 0.14,
  });
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: secondaryHex,
    roughness: 0.12,
    metalness: 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });

  // Grounded radial contact shadow disc
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.8),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.01;
  group.add(shadowPlane);

  // Part 1: Stepped lathe plinth
  const lathePts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1.15, 0),
    new THREE.Vector2(1.15, 0.18),
    new THREE.Vector2(0.95, 0.24),
    new THREE.Vector2(0.95, 0.42),
    new THREE.Vector2(0.68, 0.48),
    new THREE.Vector2(0, 0.48),
  ];
  const plinth = new THREE.Mesh(new THREE.LatheGeometry(lathePts, 32), baseMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Part 2: Metallic precision collar ring
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.06, 16, 48), metalMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.5;
  collar.castShadow = true;
  group.add(collar);

  if (archetype === 'cycle') {
    // Part 3: Central glowing orbital core sphere
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.54, 32, 24), crystalMat);
    orb.position.y = 1.32;
    orb.castShadow = true;
    group.add(orb);

    // Part 4 & 5: Two tilted gimbal rings
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.045, 16, 48), accentMat);
    ring1.position.y = 1.32;
    ring1.rotation.set(Math.PI / 3, 0.3, 0);
    group.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.96, 0.035, 16, 48), metalMat);
    ring2.position.y = 1.32;
    ring2.rotation.set(-Math.PI / 3.2, -0.4, 0.2);
    group.add(ring2);
  } else if (archetype === 'mechanics') {
    // Part 3: Vertical column
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.45, 24), metalMat);
    mast.position.y = 1.2;
    mast.castShadow = true;
    group.add(mast);

    // Part 4: Cantilevered equilibrium beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.14, 0.24), accentMat);
    beam.position.y = 1.88;
    beam.rotation.z = 0.08;
    beam.castShadow = true;
    group.add(beam);

    // Part 5 & 6: Counterweight spheres at beam ends
    const weightL = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 20), crystalMat);
    weightL.position.set(-0.85, 1.56, 0);
    weightL.castShadow = true;
    group.add(weightL);

    const weightR = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 20), crystalMat);
    weightR.position.set(0.85, 1.72, 0);
    weightR.castShadow = true;
    group.add(weightR);
  } else {
    // Architecture: Bevelled knowledge tower + beacon crown
    const body = createBeveledShapeMesh(0.56, 1.25, 6, accentMat);
    body.position.y = 0.5;
    group.add(body);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.55, 6), crystalMat);
    cap.position.y = 2.08;
    cap.castShadow = true;
    group.add(cap);

    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.04, 14, 36), metalMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.82;
    group.add(halo);
  }

  group.traverse((child) => {
    child.userData.partId = partId;
  });
  return group;
}

function buildCompositeSatellite(
  part: ConceptScenePartSpec,
  shadowTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.78,
    metalness: 0.05,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.26,
    metalness: 0.8,
  });
  const nodeMat = new THREE.MeshPhysicalMaterial({
    color: part.accentHex,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 0.75,
    clearcoatRoughness: 0.15,
    emissive: new THREE.Color(part.accentHex),
    emissiveIntensity: 0.12,
  });

  // Grounded contact shadow disc
  const shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 1.75),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.01;
  group.add(shadowDisc);

  // Part 1: Bevelled hexagonal pad
  const pad = createBeveledShapeMesh(0.62, 0.22, 6, plinthMat);
  pad.position.y = 0.04;
  group.add(pad);

  // Part 2: Metallic socket collar
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.16, 20), collarMat);
  socket.position.y = 0.36;
  socket.castShadow = true;
  group.add(socket);

  // Part 3: Sculpted faceted concept crystal
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), nodeMat);
  crystal.position.y = 0.88;
  crystal.castShadow = true;
  group.add(crystal);

  // Part 4: Floating accent ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.032, 12, 32), collarMat);
  ring.rotation.x = Math.PI / 2.4;
  ring.position.y = 0.88;
  group.add(ring);

  group.traverse((child) => {
    child.userData.partId = part.id;
  });
  return group;
}

export function ConceptScene3D({ analysis, speech }: ConceptScene3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blueprint = useMemo(() => buildConceptSceneBlueprint(analysis), [analysis]);

  const [selectedPart, setSelectedPart] = useState<ConceptScenePartSpec | null>(
    () => blueprint.parts[0] ?? null
  );
  const [explodeRatio, setExplodeRatio] = useState<number>(0);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  const explodeRef = useRef(explodeRatio);
  explodeRef.current = explodeRatio;
  const autoOrbitRef = useRef(autoOrbit);
  autoOrbitRef.current = autoOrbit;
  const presetRef = useRef<{ mode: CameraPreset; version: number }>({ mode: 'overview', version: 0 });

  useEffect(() => {
    setSelectedPart(blueprint.parts[0] ?? null);
  }, [blueprint]);

  const applyPreset = (mode: CameraPreset) => {
    setPreset(mode);
    presetRef.current = { mode, version: presetRef.current.version + 1 };
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });

    // Software WebGL detection (SwiftShader / llvmpipe / Mesa)
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
      : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|Mesa/i.test(rendererStr);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(blueprint.horizonHex);
    scene.fog = new THREE.FogExp2(blueprint.horizonHex, 0.036);

    // Studio IBL via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(6.2, 4.2, 6.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 14;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.target.set(0, 0.9, 0);

    // Lighting: warm directional key + cool hemisphere fill
    const hemiLight = new THREE.HemisphereLight(0xc7d7fe, 0x3a3642, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    keyLight.position.set(6, 9, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 26;
      keyLight.shadow.camera.left = -6;
      keyLight.shadow.camera.right = 6;
      keyLight.shadow.camera.top = 6;
      keyLight.shadow.camera.bottom = -6;
      keyLight.shadow.bias = -0.0004;
    }
    scene.add(keyLight);

    // Ground stage disc with procedural texture
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createStudioNoiseTexture('#eef2f9', maxAniso);
    const shadowTex = createContactShadowTexture();

    const stageFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(5.6, 5.8, 0.18, 48),
      new THREE.MeshStandardMaterial({
        map: floorTex,
        roughness: 0.86,
        metalness: 0.04,
      })
    );
    stageFloor.position.y = -0.09;
    stageFloor.receiveShadow = true;
    scene.add(stageFloor);

    // Build composite subject + satellites + curved tube conduits
    const assembly = new THREE.Group();
    scene.add(assembly);

    const partMeshes: Array<{ spec: ConceptScenePartSpec; group: THREE.Group }> = [];
    const pickableObjects: THREE.Object3D[] = [];

    for (const spec of blueprint.parts) {
      const partGroup =
        spec.role === 'core'
          ? buildCompositeCore(
              blueprint.archetype,
              blueprint.primaryHex,
              blueprint.secondaryHex,
              shadowTex,
              spec.id
            )
          : buildCompositeSatellite(spec, shadowTex);

      partGroup.position.set(spec.basePosition[0], spec.basePosition[1], spec.basePosition[2]);
      assembly.add(partGroup);
      partMeshes.push({ spec, group: partGroup });
      pickableObjects.push(partGroup);

      if (spec.role === 'satellite') {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(0, 0.72, 0),
          new THREE.Vector3(
            spec.basePosition[0] * 0.5,
            Math.max(0.95, spec.basePosition[1] + 0.85),
            spec.basePosition[2] * 0.5
          ),
          new THREE.Vector3(spec.basePosition[0], spec.basePosition[1] + 0.5, spec.basePosition[2])
        );
        const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.032, 8, false);
        const tubeMat = new THREE.MeshStandardMaterial({
          color: spec.accentHex,
          roughness: 0.42,
          metalness: 0.35,
        });
        const conduit = new THREE.Mesh(tubeGeo, tubeMat);
        conduit.userData.partId = spec.id;
        assembly.add(conduit);
        pickableObjects.push(conduit);
      }
    }

    // Raycaster pointer picking
    const raycaster = new THREE.Raycaster();
    let pointerDownX = 0;
    let pointerDownY = 0;

    const onPointerDown = (ev: PointerEvent) => {
      pointerDownX = ev.clientX;
      pointerDownY = ev.clientY;
    };

    const onPointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - pointerDownX, ev.clientY - pointerDownY);
      if (moved > 6) return; // Ignore orbit drags
      const rect = renderer.domElement.getBoundingClientRect();
      _rayPointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      _rayPointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(_rayPointer, camera);
      const hits = raycaster.intersectObjects(pickableObjects, true);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData?.partId as string | undefined;
        const found = blueprint.parts.find((p) => p.id === hitId);
        if (found) setSelectedPart(found);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 320);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let currentExplode = 0;
    let handledPresetVersion = 0;
    let cameraAnimating = false;
    let dirty = true;

    const markDirty = () => {
      dirty = true;
    };
    controls.addEventListener('change', markDirty);

    const scheduleNext = () => {
      if (disposed) return;
      if (isSoftwareGl) {
        timerId = window.setTimeout(() => {
          if (!disposed) rafId = window.requestAnimationFrame(tick);
        }, 48);
      } else {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const tick = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const explodeDiff = Math.abs(currentExplode - explodeRef.current);
      if (explodeDiff > 0.001) {
        currentExplode = THREE.MathUtils.damp(currentExplode, explodeRef.current, 6, dt);
        for (const item of partMeshes) {
          item.group.position.set(
            item.spec.basePosition[0] + item.spec.explodeOffset[0] * currentExplode,
            item.spec.basePosition[1] + item.spec.explodeOffset[1] * currentExplode,
            item.spec.basePosition[2] + item.spec.explodeOffset[2] * currentExplode
          );
        }
        dirty = true;
      }

      if (presetRef.current.version !== handledPresetVersion) {
        handledPresetVersion = presetRef.current.version;
        cameraAnimating = true;
        dirty = true;
      }

      if (cameraAnimating) {
        if (presetRef.current.mode === 'top') {
          _camGoal.set(0.01, 8.6, 2.2);
          _targetGoal.set(0, 0.4, 0);
        } else if (presetRef.current.mode === 'detail') {
          _camGoal.set(2.9, 2.3, 3.6);
          _targetGoal.set(0, 1.15, 0);
        } else {
          _camGoal.set(6.2, 4.2, 6.8);
          _targetGoal.set(0, 0.9, 0);
        }
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camGoal.x, 5.5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camGoal.y, 5.5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camGoal.z, 5.5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _targetGoal.x, 5.5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _targetGoal.y, 5.5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _targetGoal.z, 5.5, dt);
        dirty = true;
        if (camera.position.distanceTo(_camGoal) < 0.04) {
          cameraAnimating = false;
        }
      }

      controls.autoRotate = autoOrbitRef.current && !cameraAnimating;
      controls.autoRotateSpeed = 0.85;
      if (controls.update() || controls.autoRotate) {
        dirty = true;
      }

      if (dirty) {
        renderer.render(scene, camera);
        dirty = false;
      }
      scheduleNext();
    };

    // Initial synchronous draw so first frame appears immediately
    renderer.render(scene, camera);
    scheduleNext();

    return () => {
      disposed = true;
      window.clearTimeout(timerId);
      window.cancelAnimationFrame(rafId);
      controls.removeEventListener('change', markDirty);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      envTarget.dispose();
      floorTex.dispose();
      shadowTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [blueprint]);

  return (
    <div
      className="relative w-full h-[380px] sm:h-[440px] rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-[#f4f7fb]"
      data-testid="concept-scene-3d"
    >
      {/* Dedicated WebGL Mount Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label={`Interactive 3D concept scene for ${blueprint.topic}`}
      />

      {/* Top-Left Concept Readout (no backdrop-filter over WebGL) */}
      <div className="pointer-events-auto absolute top-3 left-3 max-w-[235px] rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#7C3AED]">
          {blueprint.archetypeTitle}
        </p>
        {selectedPart ? (
          <div className="mt-1 space-y-1">
            <h4 className="font-display text-xs sm:text-sm font-bold text-slate-900 leading-snug">
              {selectedPart.label}
            </h4>
            <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">
              {selectedPart.detail}
            </p>
            <button
              type="button"
              onClick={() =>
                speech.speak(
                  `scene-part-${selectedPart.id}`,
                  `${selectedPart.label}. ${selectedPart.detail}`
                )
              }
              className="mt-1 inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer"
            >
              <Volume2 className="h-3 w-3" aria-hidden="true" />
              <span>Speak Part</span>
            </button>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-600">
            Drag to orbit or click any 3D pillar to inspect its role.
          </p>
        )}
      </div>

      {/* Bottom Collapsible Control Dock (<= 15% viewport height, no backdrop-filter) */}
      <div className="pointer-events-auto absolute bottom-3 left-3 right-3 flex justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Layers className="h-3.5 w-3.5 text-[#7C3AED]" aria-hidden="true" />
              <span>3D Explorer</span>
              <span className="hidden sm:inline text-[11px] font-normal text-slate-500">
                · Click any part to inspect
              </span>
            </div>

            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              aria-label={dockCollapsed ? 'Expand 3D controls' : 'Collapse 3D controls'}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <span>{dockCollapsed ? 'Controls' : 'Hide'}</span>
              {dockCollapsed ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2">
              <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700">
                <span>Explode</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={explodeRatio}
                  onChange={(e) => setExplodeRatio(Number(e.target.value))}
                  aria-label="Explode 3D concept layers"
                  className="w-24 accent-[#7C3AED] cursor-pointer"
                />
              </label>

              <div className="flex flex-wrap items-center gap-1.5">
                {(['overview', 'top', 'detail'] as CameraPreset[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => applyPreset(mode)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold capitalize cursor-pointer ${
                      preset === mode
                        ? 'bg-[#7C3AED] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setAutoOrbit((v) => !v)}
                  className={`rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                    autoOrbit ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {autoOrbit ? 'Orbit On' : 'Orbit Off'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExplodeRatio(0);
                    applyPreset('overview');
                  }}
                  aria-label="Reset 3D view"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
