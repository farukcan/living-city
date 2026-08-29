import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
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

/**
 * Keyboard pan, in world units per second per unit of camera distance.
 *
 * Scaled by distance rather than fixed: zoomed out, the same screen-space travel covers far
 * more ground, and a fixed rate reads as sluggish at one end and uncontrollable at the other.
 */
const PAN_SPEED = 0.5;

/** Physical key positions — `code`, not `key`, so WASD holds on AZERTY and Turkish-Q. */
const PAN_KEYS: Readonly<Record<string, readonly [right: number, forward: number]>> = {
  KeyW: [0, 1],
  KeyS: [0, -1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

// Module-level scratch: the frame callback may not allocate.
const scratchForward = new THREE.Vector3();
const scratchMove = new THREE.Vector3();

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
  const heldKeysRef = useRef<Set<string>>(new Set());

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

  // Held keys rather than per-event steps: pan has to be continuous and frame-rate
  // independent, which means the frame loop needs to know what is down right now.
  useEffect(() => {
    const held = heldKeysRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      // Modified chords belong to the browser and to the OS, never to the camera.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (PAN_KEYS[event.code] === undefined) return;
      // Arrows scroll whatever HUD panel happens to hold focus otherwise.
      if (event.code.startsWith('Arrow')) event.preventDefault();
      held.add(event.code);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      held.delete(event.code);
    };

    // Without this a key held while the tab loses focus never reports its keyup, and the
    // camera keeps drifting after the player comes back.
    const onBlur = () => held.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      held.clear();
    };
  }, []);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    panByKeyboard(camera, controls, heldKeysRef.current, delta, panLimit);

    // Clamping every frame — rather than on the change event — also catches the drift that
    // damping keeps applying after the pointer is released.
    controls.target.x = Math.max(-panLimit, Math.min(panLimit, controls.target.x));
    controls.target.z = Math.max(-panLimit, Math.min(panLimit, controls.target.z));
    controls.target.y = 0;
    controls.update();
  });

  return null;
}

/**
 * Moves the target and the camera together by whatever the held keys ask for.
 *
 * The camera follows the distance the target actually travelled rather than the distance
 * requested, so pushing into the grid edge stops the view instead of sliding the camera off
 * its target.
 */
function panByKeyboard(
  camera: THREE.Camera,
  controls: OrbitControls,
  heldKeys: ReadonlySet<string>,
  delta: number,
  panLimit: number,
): void {
  let right = 0;
  let forward = 0;
  for (const code of heldKeys) {
    const direction = PAN_KEYS[code];
    if (direction === undefined) continue;
    right += direction[0];
    forward += direction[1];
  }
  if (right === 0 && forward === 0) return;

  // Ground-plane heading: the camera looks down at the colony, so its own forward vector
  // has to lose its vertical component before it can pan a map.
  camera.getWorldDirection(scratchForward);
  scratchForward.y = 0;
  if (scratchForward.lengthSq() === 0) return;
  scratchForward.normalize();

  scratchMove
    .set(-scratchForward.z, 0, scratchForward.x)
    .multiplyScalar(right)
    .addScaledVector(scratchForward, forward)
    .normalize()
    .multiplyScalar(PAN_SPEED * delta * controls.getDistance());

  const clampedX = Math.max(-panLimit, Math.min(panLimit, controls.target.x + scratchMove.x));
  const clampedZ = Math.max(-panLimit, Math.min(panLimit, controls.target.z + scratchMove.z));
  camera.position.x += clampedX - controls.target.x;
  camera.position.z += clampedZ - controls.target.z;
  controls.target.x = clampedX;
  controls.target.z = clampedZ;
}
