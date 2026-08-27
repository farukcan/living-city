import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { buildingGeometry } from './geometry/buildingGeometry.ts';
import { rocketGeometry, ROCKET_SCALE } from './geometry/rocketGeometry.ts';
import { createBuildingMaterial, setNightFactor } from './buildingMaterial.ts';
import { PALETTE } from './palette.ts';
import type { BuildingKind } from '../sim/types.ts';

export type StudioBuildingKind = BuildingKind | 'rocket';

interface BuildingStudioProps {
  kind: StudioBuildingKind;
}

const HEX_RADIUS = 1.18;
const HEX_HEIGHT = 0.32;

function HexBase({ kind }: { kind: StudioBuildingKind }) {
  const geometry = useMemo(() => {
    const hex = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS * 0.96, HEX_HEIGHT, 6);
    hex.rotateY(Math.PI / 6);
    hex.translate(0, -HEX_HEIGHT / 2, 0);
    return hex;
  }, []);

  const material = useMemo(() => {
    if (kind === 'iceExtractor') {
      return new THREE.MeshStandardMaterial({
        color: PALETTE.iceTint,
        roughness: 0.14,
        metalness: 0.08,
        flatShading: true,
      });
    }
    if (kind === 'mine') {
      return new THREE.MeshStandardMaterial({
        color: PALETTE.oreTint,
        roughness: 0.85,
        metalness: 0.12,
        flatShading: true,
      });
    }
    if (kind === 'rocket' || kind === 'rocketPad') {
      return new THREE.MeshStandardMaterial({
        color: '#3E4247',
        roughness: 0.65,
        metalness: 0.25,
        flatShading: true,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: PALETTE.terrainLow,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    });
  }, [kind]);

  return <mesh geometry={geometry} material={material} receiveShadow castShadow />;
}

const ROTATIONS: Record<StudioBuildingKind, [number, number, number]> = {
  solarArray: [0, -0.3, 0],
  batteryBank: [0, 0, 0],
  habitat: [0, 0, 0],
  iceExtractor: [0, 0.2, 0],
  electrolyzer: [0, 0.25, 0],
  greenhouse: [0, -Math.PI / 2, 0],
  mine: [0, Math.PI / 4, 0],
  storageDepot: [0, Math.PI + 0.45, 0],
  rocketPad: [0, 0, 0],
  rocket: [0, 0.45, 0],
};

/**
 * How lit the studio renders the glow mask. Full night blows every window and status board
 * out to flat white, so the reference renders use a dusk value where the lights still read
 * as their own colour.
 */
const STUDIO_NIGHT = 0.4;

function BuildingModel({ kind }: { kind: StudioBuildingKind }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => createBuildingMaterial(), []);

  const geometry = useMemo(() => {
    if (kind === 'rocket') {
      return rocketGeometry();
    }
    return buildingGeometry(kind);
  }, [kind]);

  const scale = kind === 'rocket' ? ROCKET_SCALE : 1.2;
  const rotation = ROTATIONS[kind] ?? [0, 0, 0];

  useEffect(() => {
    setNightFactor(material, STUDIO_NIGHT);
  }, [material]);

  useFrame(() => {
    setNightFactor(material, STUDIO_NIGHT);
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      scale={scale}
      rotation={rotation}
      castShadow
      receiveShadow
    />
  );
}

const ZOOM_FACTOR = 1.1;

const CAMERA_CONFIGS: Record<
  StudioBuildingKind,
  { position: [number, number, number]; target: [number, number, number]; fov: number }
> = {
  solarArray: {
    position: [2.5 * ZOOM_FACTOR, 2.3 * ZOOM_FACTOR, 2.5 * ZOOM_FACTOR],
    target: [0, 0.45, 0],
    fov: 32,
  },
  batteryBank: {
    position: [2.3 * ZOOM_FACTOR, 2.0 * ZOOM_FACTOR, 2.3 * ZOOM_FACTOR],
    target: [0, 0.35, 0],
    fov: 30,
  },
  habitat: {
    position: [2.6 * ZOOM_FACTOR, 2.1 * ZOOM_FACTOR, 2.6 * ZOOM_FACTOR],
    target: [0, 0.42, 0],
    fov: 30,
  },
  iceExtractor: {
    position: [3.3 * ZOOM_FACTOR, 2.4 * ZOOM_FACTOR, 3.3 * ZOOM_FACTOR],
    target: [0, 0.85, 0],
    fov: 34,
  },
  electrolyzer: {
    position: [2.6 * ZOOM_FACTOR, 2.1 * ZOOM_FACTOR, 2.6 * ZOOM_FACTOR],
    target: [0, 0.5, 0],
    fov: 30,
  },
  greenhouse: {
    position: [2.7 * ZOOM_FACTOR, 2.2 * ZOOM_FACTOR, 2.7 * ZOOM_FACTOR],
    target: [0, 0.35, 0],
    fov: 30,
  },
  mine: {
    position: [2.6 * ZOOM_FACTOR, 2.2 * ZOOM_FACTOR, 2.6 * ZOOM_FACTOR],
    target: [0.05, 0.4, 0],
    fov: 32,
  },
  storageDepot: {
    position: [2.5 * ZOOM_FACTOR, 2.2 * ZOOM_FACTOR, 2.5 * ZOOM_FACTOR],
    target: [0, 0.3, 0],
    fov: 30,
  },
  rocketPad: {
    position: [2.3 * ZOOM_FACTOR, 2.5 * ZOOM_FACTOR, 2.3 * ZOOM_FACTOR],
    target: [0, 0.1, 0],
    fov: 30,
  },
  rocket: {
    position: [3.1 * ZOOM_FACTOR, 1.8 * ZOOM_FACTOR, 3.1 * ZOOM_FACTOR],
    target: [0, 0.8, 0],
    fov: 34,
  },
};

function CameraRig({ kind }: { kind: StudioBuildingKind }) {
  const config = CAMERA_CONFIGS[kind];
  useFrame(({ camera }) => {
    camera.position.set(...config.position);
    camera.lookAt(...config.target);
  });
  return null;
}

export function BuildingStudio({ kind }: BuildingStudioProps) {
  const config = CAMERA_CONFIGS[kind];

  return (
    <div
      className="relative w-full h-full flex items-center justify-center bg-[#15121D]"
      style={{ width: '100vw', height: '100vh' }}
    >
      <Canvas
        shadows
        camera={{ position: config.position, fov: config.fov }}
        gl={{ antialias: true, toneMappingExposure: 1.35, preserveDrawingBuffer: true }}
        style={{ width: '100vw', height: '100vh' }}
      >
        <color attach="background" args={['#16131F']} />
        <fog attach="fog" args={['#16131F', 8, 35]} />

        {/* Studio Mars Lighting */}
        <ambientLight color="#E8A87C" intensity={0.7} />
        <directionalLight
          position={[4.5, 6.5, 3.5]}
          intensity={2.7}
          color="#FFE8D0"
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.001}
          shadow-camera-near={0.5}
          shadow-camera-far={25}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.5}
          shadow-camera-bottom={-2.5}
        />
        <directionalLight position={[-3, 2.5, -3]} intensity={0.6} color="#9FB4D8" />
        <pointLight position={[0, -0.4, 0]} intensity={0.4} color="#8C4A32" />

        <CameraRig kind={kind} />

        <group position={[0, 0, 0]}>
          <HexBase kind={kind} />
          <BuildingModel kind={kind} />
        </group>
      </Canvas>
    </div>
  );
}
