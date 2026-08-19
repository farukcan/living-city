import * as THREE from 'three';

/**
 * The building material: one MeshStandardMaterial that knows which vertices glow.
 *
 * Buildings are drawn as one instanced mesh per type, which means one material — but a
 * habitat needs a lit window band and a dim hull at the same time. The geometry carries an
 * `aGlow` attribute per vertex (see geometry/primitives.ts) and this patch turns it into
 * emissive output scaled by a night factor, so lights come on by themselves as the sun
 * goes down.
 *
 * Multiplying the glow by the instance colour is deliberate: an idled building is tinted
 * dark, and its windows go dark with it, for free.
 */

export type GlowMaterial = THREE.MeshStandardMaterial & {
  userData: { nightUniform: { value: number } | null };
};

export function createBuildingMaterial(): GlowMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.55,
    metalness: 0.25,
  }) as GlowMaterial;

  material.userData.nightUniform = null;

  material.onBeforeCompile = (shader) => {
    const nightUniform = { value: 0 };
    shader.uniforms.uNight = nightUniform;
    material.userData.nightUniform = nightUniform;

    shader.vertexShader =
      `attribute float aGlow;\nvarying float vGlow;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  vGlow = aGlow;',
      );

    shader.fragmentShader =
      `uniform float uNight;\nvarying float vGlow;\n${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
       // Emissive rides on the surface colour so lights match the panel they sit in, and
       // dims with the instance tint when a building is idled.
       totalEmissiveRadiance += diffuseColor.rgb * vGlow * uNight * 2.4;`,
      );
  };

  // Forces a distinct program so this patch never collides with an unpatched standard
  // material sharing the same cache key.
  material.customProgramCacheKey = () => 'building-glow-v1';

  return material;
}

/** 0 in full sun, 1 at night. Applied to every building material each frame. */
export function setNightFactor(material: GlowMaterial, night: number): void {
  const uniform = material.userData.nightUniform;
  if (uniform) uniform.value = night;
}
