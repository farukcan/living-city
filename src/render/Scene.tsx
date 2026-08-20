import { useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { parseAxialKey } from '../sim/hex.ts';
import type { AxialKey } from '../sim/hex.ts';
import { HEX_SIZE } from '../sim/terrain.ts';
import { placeBuilding } from '../state/actions.ts';
import { useStore } from '../state/store.ts';
import { DistantHills, GroundPlane, SkyDome } from './Atmosphere.tsx';
import { Buildings } from './Buildings.tsx';
import { CameraRig } from './CameraRig.tsx';
import { Pipelines } from './Pipelines.tsx';
import { PALETTE } from './palette.ts';
import { PlacementGhost } from './PlacementGhost.tsx';
import { PostEffects } from './PostEffects.tsx';
import { RenderStatsProbe } from './RenderStatsProbe.tsx';
import { Rocket } from './Rocket.tsx';
import { SunLight } from './SunLight.tsx';
import { Outcrops, Pebbles, Terrain } from './Terrain.tsx';
import { TileHighlight } from './TileHighlight.tsx';

/**
 * The 3D view.
 *
 * Subscribes to structural state only — terrain, the building list, what is hovered — so a
 * simulation tick never re-renders this tree. Lighting is provisional until F-18 brings the
 * moving sun (docs/ROADMAP.md, day 5).
 */
export function Scene() {
  const terrain = useStore((state) => state.sim.terrain);
  const buildings = useStore((state) => state.sim.buildings);
  const hoveredTile = useStore((state) => state.interaction.hoveredTile);
  const buildMode = useStore((state) => state.interaction.buildMode);
  const showFlowLines = useStore((state) => state.interaction.showFlowLines);
  const showProfiler = useStore((state) => state.interaction.showProfiler);
  const setHoveredTile = useStore((state) => state.setHoveredTile);
  const selectBuilding = useStore((state) => state.selectBuilding);

  const handleTileClick = useCallback(
    (key: AxialKey) => {
      const mode = useStore.getState().interaction.buildMode;
      if (mode === null) {
        selectBuilding(null);
        return;
      }
      const { q, r } = parseAxialKey(key);
      placeBuilding(mode, q, r);
    },
    [selectBuilding],
  );

  return (
    <Canvas
      shadows
      // A lower camera puts the horizon in frame, which is what sells the planet.
      // 40% further than the original [13, 8, 13] so the larger board reads at first glance.
      camera={{ position: [18.2, 11.2, 18.2], fov: 42 }}
      // No `antialias`: PostEffects is always mounted, so the scene is drawn into the
      // composer's own targets and the canvas only ever receives a fullscreen triangle.
      // Context MSAA would have no geometric edge left to smooth, and would still cost a
      // multisampled default framebuffer and a resolve every frame. SMAA does the job.
      gl={{ toneMappingExposure: 1.35 }}
      onPointerMissed={() => setHoveredTile(null)}
    >
      {/* Fog only; the background is the sky dome, which draws its own horizon. */}
      <fog attach="fog" args={[PALETTE.skyDay, 34, 150]} />

      <SkyDome />
      <DistantHills />
      <GroundPlane gridRadius={terrain.radius * HEX_SIZE * 1.62} surfaceHeight={0.72} />
      <SunLight />

      <Terrain field={terrain} onHoverTile={setHoveredTile} onClickTile={handleTileClick} />
      <Outcrops field={terrain} />
      <Pebbles field={terrain} />
      <Buildings field={terrain} buildings={buildings} onSelect={selectBuilding} />
      <Pipelines field={terrain} buildings={buildings} showPackets={showFlowLines} />
      <Rocket field={terrain} buildings={buildings} />

      {buildMode === null ? (
        <TileHighlight field={terrain} tileKey={hoveredTile} />
      ) : (
        <PlacementGhost kind={buildMode} tileKey={hoveredTile} />
      )}

      <CameraRig gridRadius={terrain.radius} />
      <PostEffects />
      {/* Mounted only while the overlay is open, so a closed panel costs nothing. */}
      {showProfiler ? <RenderStatsProbe /> : null}
    </Canvas>
  );
}
