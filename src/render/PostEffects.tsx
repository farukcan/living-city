import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { BloomEffect } from 'postprocessing';
import { useStore } from '../state/store.ts';

/**
 * Screen-space finishing. See docs/SPEC-04-rendering.md.
 *
 * Four effects, each doing one job:
 *
 * - **Ambient occlusion** puts contact shadows where geometry meets geometry. This is what
 *   stops buildings looking like decals pasted onto tiles; nothing else in the pipeline
 *   darkens the crevice between a habitat and the ground it stands on.
 * - **Bloom** makes the emissive parts — window bands, status strips, flow packets — read
 *   as light sources rather than as bright paint. It is thresholded so only genuinely
 *   emissive surfaces bloom, not the pale terrain at noon.
 * - **Vignette** pulls attention to the middle of the frame, where the colony is.
 * - **SMAA** smooths the edges, last so it works on the finished image.
 *
 * Bloom strength rises after dark: at night the lit windows are the whole picture, and at
 * noon a strong bloom just washes out the sky.
 */

const BLOOM_DAY = 0.42;
const BLOOM_NIGHT = 0.95;

export function PostEffects() {
  const bloomRef = useRef<BloomEffect>(null);

  useFrame(() => {
    const bloom = bloomRef.current;
    if (!bloom) return;
    const { sunIntensity } = useStore.getState().sim.report.environment;
    const night = 1 - Math.min(1, sunIntensity * 1.6);
    bloom.intensity = BLOOM_DAY + (BLOOM_NIGHT - BLOOM_DAY) * night;
  });

  // Anti-aliasing is SMAA's job, not the composer's. MSAA here means every frame resolves a
  // multisampled buffer before N8AO can read depth and normals, and on a retina display at
  // 120 Hz that alone blew the frame budget: an interleaved A/B measured ~93 fps with MSAA
  // against a locked 120 fps with SMAA. Frames that miss the refresh cadence are what make
  // slow motion — the sun's arc, the panels tracking it — judder, so the arithmetic being
  // right is not enough; the frame has to land on time too.
  return (
    <EffectComposer enableNormalPass multisampling={0}>
      {/* Occlusion is a contact shadow, not a mood: pushed harder it greys out the whole
          palette, which on a warm-toned scene reads as dirt rather than as depth. */}
      <N8AO aoRadius={0.9} intensity={1.1} distanceFalloff={1} quality="medium" halfRes />
      <Bloom
        ref={bloomRef}
        intensity={BLOOM_DAY}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette offset={0.36} darkness={0.38} blendFunction={BlendFunction.NORMAL} />
      <SMAA />
    </EffectComposer>
  );
}
