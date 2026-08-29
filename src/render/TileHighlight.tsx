import { useMemo } from 'react';
import { hexToWorld, parseAxialKey } from '../sim/hex.ts';
import type { AxialKey } from '../sim/hex.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { TerrainField } from '../sim/types.ts';
import { PALETTE } from './palette.ts';
import { tileHeight } from './Terrain.tsx';

type TileHighlightProps = {
  field: TerrainField;
  tileKey: AxialKey | null;
};

/**
 * A thin hex slab floating just above the hovered tile.
 *
 * Drawn as its own mesh rather than by recolouring the terrain instance, so the tile's own
 * colour — which encodes elevation and deposit — stays visible underneath.
 *
 * One colour, because this only ever renders with placement disarmed (see `Scene`) and there
 * is nothing for a hover to be invalid about: an empty tile is a click that clears the
 * selection and an occupied one is a click that opens the inspector. `PlacementGhost` is what
 * colours a tile by whether it can be built on, and it runs the real `checkPlacement`.
 */
export function TileHighlight({ field, tileKey }: TileHighlightProps) {
  const placement = useMemo(() => {
    if (tileKey === null) return null;
    const { q, r } = parseAxialKey(tileKey);
    const tile = findTile(field, q, r);
    if (tile === null) return null;
    const { x, z } = hexToWorld(tile, HEX_SIZE);
    return { x, z, y: tileHeight(tile) + 0.02 };
  }, [field, tileKey]);

  if (placement === null) return null;

  return (
    <mesh position={[placement.x, placement.y, placement.z]} rotation={[0, Math.PI / 6, 0]}>
      <cylinderGeometry args={[HEX_SIZE * 0.96, HEX_SIZE * 0.96, 0.04, 6]} />
      <meshBasicMaterial color={PALETTE.hoverValid} transparent opacity={0.45} />
    </mesh>
  );
}
