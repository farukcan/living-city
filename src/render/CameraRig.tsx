import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { HEX_SIZE } from '../sim/terrain.ts';

/**
 * RTS-style camera. See docs/SPEC-04-rendering.md.
 *
 * Wraps three's own OrbitControls directly rather than pulling in a helper library for one
 * component. Every limit exists to make the colony impossible to lose: the polar clamp
 * keeps the camera above the horizon and off the vertical axis, and the target clamp keeps
 * the view inside the grid.
 */

const MIN_POLAR = Math.PI * 0.15;
/** Low enough to frame the horizon, high enough never to see under the ground plane. */
const MAX_POLAR = Math.PI * 0.49;
const MIN_DISTANCE = 5;
const MAX_DISTANCE = 45;
const DAMPING = 0.08;

type CameraRigProps = {
  gridRadius: number;
};

export function CameraRig({ gridRadius }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const panLimit = gridRadius * HEX_SIZE * 1.5;

  // Held in a ref rather than a memo: OrbitControls is a mutable imperative object, and
  // configuring a memoised value in an effect is exactly what the compiler rules forbid.
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = DAMPING;
    controls.minPolarAngle = MIN_POLAR;
    controls.maxPolarAngle = MAX_POLAR;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.screenSpacePanning = false;
    controlsRef.current = controls;

    return () => {
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, domElement]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    // Clamping every frame — rather than on the change event — also catches the drift that
    // damping keeps applying after the pointer is released.
    controls.target.x = Math.max(-panLimit, Math.min(panLimit, controls.target.x));
    controls.target.z = Math.max(-panLimit, Math.min(panLimit, controls.target.z));
    controls.target.y = 0;
    controls.update();
  });

  return null;
}
