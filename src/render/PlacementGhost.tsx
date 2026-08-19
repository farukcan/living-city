import { useMemo } from 'react';
import { definitionOf } from '../sim/constants.ts';
import { hexToWorld, parseAxialKey } from '../sim/hex.ts';
import type { AxialKey } from '../sim/hex.ts';
import { checkPlacement } from '../sim/placement.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { BuildingKind } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { buildingGeometry } from './geometry/buildingGeometry.ts';
import { PALETTE } from './palette.ts';
import { tileHeight } from './Terrain.tsx';

type PlacementGhostProps = {
  kind: BuildingKind;
  tileKey: AxialKey | null;
};

/**
 * A translucent preview of the building under the cursor, tinted by whether it can
 * actually be placed. It runs the real `checkPlacement`, so the preview can never disagree
 * with what the click will do.
 *
 * The simulation is read imperatively and the re-render is driven by the three things that
 * can change the answer: what is hovered, what is being built, and whether minerals
 * crossed a whole unit. Subscribing to `sim` itself would re-render this on every tick.
 */
export function PlacementGhost({ kind, tileKey }: PlacementGhostProps) {
  const geometry = useMemo(() => buildingGeometry(kind), [kind]);
  const terrain = useStore((state) => state.sim.terrain);
  const wholeMinerals = useStore((state) => Math.floor(state.sim.stocks.minerals));

  const placement = useMemo(() => {
    if (tileKey === null) return null;
    const { q, r } = parseAxialKey(tileKey);
    const tile = findTile(terrain, q, r);
    if (tile === null) return null;
    const { x, z } = hexToWorld(tile, HEX_SIZE);
    const sim = useStore.getState().sim;
    return { x, y: tileHeight(tile), z, valid: checkPlacement(sim, kind, q, r).ok };
    // `wholeMinerals` is not read in this block but it is a genuine input: affordability is
    // part of `valid`, and it is subscribed to precisely so the ghost recomputes when the
    // mineral count crosses a whole unit. Reading `sim` through getState is what keeps this
    // component off the 10 Hz re-render path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, wholeMinerals, kind, tileKey]);

  if (placement === null) return null;

  return (
    <group position={[placement.x, placement.y, placement.z]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={placement.valid ? PALETTE.hoverValid : PALETTE.hoverInvalid}
          transparent
          opacity={0.55}
          depthWrite={false}
          emissive={placement.valid ? PALETTE.hoverValid : PALETTE.hoverInvalid}
          emissiveIntensity={0.35}
        />
      </mesh>
      <mesh rotation={[0, Math.PI / 6, 0]} position={[0, 0.03, 0]}>
        <cylinderGeometry args={[HEX_SIZE * 0.94, HEX_SIZE * 0.94, 0.05, 6]} />
        <meshBasicMaterial
          color={placement.valid ? PALETTE.hoverValid : PALETTE.hoverInvalid}
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
}

/** Cost label helper for the build bar; kept next to the ghost so the two agree. */
export function buildCost(kind: BuildingKind): number {
  return definitionOf(kind).cost;
}
