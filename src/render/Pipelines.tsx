import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { definitionOf } from '../sim/constants.ts';
import { hexDistance, hexToWorld } from '../sim/hex.ts';
import type { Axial } from '../sim/hex.ts';
import { findTile, HEX_SIZE } from '../sim/terrain.ts';
import type { Building, ResourceKind, TerrainField } from '../sim/types.ts';
import { useStore } from '../state/store.ts';
import { PALETTE } from './palette.ts';
import { tileHeight } from './Terrain.tsx';

/**
 * Cable runs between buildings, the connector sockets at their ends, and the packets
 * that travel along them.
 *
 * These cables are **scenery with a job**: they make the colony read as connected
 * infrastructure rather than as models parked on tiles, and they give the flow packets
 * something to run along. They are not a transmission network — the simulation pools supply
 * and divides it by priority (docs/SPEC-01-simulation.md), so pairing each producer with
 * its nearest consumer is a visualisation of the allocation, not a model of it. Anyone
 * extending this should not mistake it for a graph solver.
 *
 * A cable's route follows the terrain height of every hex it crosses (not just its two
 * endpoints), so it reads as resting on the ground across uneven elevation instead of
 * clipping through hills or floating over dips.
 *
 * What is faithful is whether anything is moving at all: production is all-or-nothing, so a
 * line is either flowing at full rate or empty. There is no in-between to draw.
 */

const PACKETS_PER_LINK = 2;
const PACKET_SPEED = 0.34;
/** Radius of a packet on a running line. Stopped lines collapse theirs to zero. */
const PACKET_SCALE = 0.034;
const PIPE_RADIUS = 0.014;
/** Height above the tile surface where cable runs sit — low-profile, not floating pipework. */
const PIPE_HEIGHT = 0.045;
/** Producers further than this from any consumer are left unconnected. */
const MAX_LINK_DISTANCE = 5;
/** Lateral spacing between parallel cables that share the same producer/consumer pair. */
const BUNDLE_SPACING = 0.09;
const SOCKET_RADIUS = 0.06;
const SOCKET_HEIGHT = 0.04;
const TUBE_RADIAL_SEGMENTS = 6;

const FLOW_COLORS: Readonly<Record<ResourceKind, string>> = {
  power: '#FFB74D',
  water: '#6FB0F0',
  oxygen: '#FFFFFF',
  food: '#8BC34A',
  minerals: '#C9A227',
};

const LINKED_RESOURCES: readonly ResourceKind[] = ['power', 'water', 'oxygen', 'food'];

const scratchObject = new THREE.Object3D();
const scratchColor = new THREE.Color();
const scratchTangent = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

type Link = {
  readonly resource: ResourceKind;
  readonly producerId: string;
  readonly consumerId: string;
  /** Route points, one per hex crossed, each already at that hex's terrain height. */
  readonly points: THREE.Vector3[];
  /** Smooth curve through `points`; shares their Vector3 instances, so bundling offsets apply to it too. */
  readonly curve: THREE.CatmullRomCurve3;
};

function produces(building: Building, resource: ResourceKind): boolean {
  const definition = definitionOf(building.kind);
  if (resource === 'power') return definition.solarPeakKW > 0;
  return (definition.produces[resource] ?? 0) > 0;
}

function consumes(building: Building, resource: ResourceKind): boolean {
  const definition = definitionOf(building.kind);
  if (resource === 'power') return definition.basePowerKW > 0;
  // Life-critical resources are consumed by the crew, so they flow to where the crew is.
  if (resource !== 'minerals' && definition.populationCapacity > 0) return true;
  return (definition.consumes[resource] ?? 0) > 0;
}

function cubeRound(x: number, y: number, z: number): Axial {
  let rx = Math.round(x);
  const ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  // The largest-error axis is re-derived from the other two to keep rx + ry + rz === 0.
  // When that axis is y, rx/rz already stand as computed — y itself isn't returned below.
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  return { q: rx, r: rz };
}

/** Axial hexes on the straight line from a to b, inclusive — the route a cable follows. */
function hexLine(a: Axial, b: Axial): Axial[] {
  const distance = hexDistance(a, b);
  if (distance === 0) return [a];

  const ay = -a.q - a.r;
  const by = -b.q - b.r;
  const hexes: Axial[] = [];
  for (let step = 0; step <= distance; step++) {
    const t = step / distance;
    hexes.push(cubeRound(a.q + (b.q - a.q) * t, ay + (by - ay) * t, a.r + (b.r - a.r) * t));
  }
  return hexes;
}

function pointAt(hex: Axial, field: TerrainField): THREE.Vector3 {
  const tile = findTile(field, hex.q, hex.r);
  const { x, z } = hexToWorld(hex, HEX_SIZE);
  return new THREE.Vector3(x, (tile ? tileHeight(tile) : 0) + PIPE_HEIGHT, z);
}

/** Cable route between two buildings, following the terrain height of every hex it crosses. */
function routePoints(producer: Building, consumer: Building, field: TerrainField): THREE.Vector3[] {
  return hexLine(producer, consumer).map((hex) => pointAt(hex, field));
}

/** One link per producer, to its nearest consumer of that resource. */
function computeLinks(buildings: readonly Building[], field: TerrainField): Link[] {
  const links: Link[] = [];

  for (const resource of LINKED_RESOURCES) {
    const consumers = buildings.filter(
      (building) => building.status !== 'idle' && consumes(building, resource),
    );
    if (consumers.length === 0) continue;

    for (const producer of buildings) {
      if (producer.status === 'idle' || !produces(producer, resource)) continue;

      let nearest: Building | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const consumer of consumers) {
        if (consumer.id === producer.id) continue;
        const distance = hexDistance(producer, consumer);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = consumer;
        }
      }

      if (nearest === null || nearestDistance > MAX_LINK_DISTANCE) continue;
      const points = routePoints(producer, nearest, field);
      links.push({
        resource,
        producerId: producer.id,
        consumerId: nearest.id,
        points,
        // Shares the `points` Vector3 instances, so later offsetting them (bundling) bends this curve too.
        curve: new THREE.CatmullRomCurve3(points),
      });
    }
  }

  bundleParallelLinks(links);
  return links;
}

/**
 * Cables sharing a producer/consumer pair (e.g. power and water between the same two
 * buildings) would otherwise overlap exactly. Spreading them sideways, perpendicular to
 * the run, reads as a bundled cable tray instead of a single flickering line.
 */
function bundleParallelLinks(links: readonly Link[]): void {
  const groups = new Map<string, Link[]>();
  for (const link of links) {
    const key = `${link.producerId}>${link.consumerId}`;
    const group = groups.get(key);
    if (group) group.push(link);
    else groups.set(key, [link]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first] = group;
    const start = first?.points[0];
    const end = first?.points[first.points.length - 1];
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const perpX = -dz / length;
    const perpZ = dx / length;

    group.forEach((link, index) => {
      const offset = (index - (group.length - 1) / 2) * BUNDLE_SPACING;
      for (const point of link.points) {
        point.x += perpX * offset;
        point.z += perpZ * offset;
      }
    });
  }
}

type PipelinesProps = {
  field: TerrainField;
  buildings: readonly Building[];
  /** Packets are the readable part; the cables themselves always stand. */
  showPackets: boolean;
};

export function Pipelines({ field, buildings, showPackets }: PipelinesProps) {
  const links = useMemo(() => computeLinks(buildings, field), [buildings, field]);

  return (
    <>
      <PipeRuns links={links} />
      <ConnectorSockets links={links} />
      {showPackets && <FlowPackets links={links} />}
    </>
  );
}

/**
 * The cables: one tube per link, following its route's terrain-hugging curve. All tubes
 * are merged into a single buffer geometry, so the whole network is one draw call
 * regardless of how many buildings are connected.
 */
function PipeRuns({ links }: { links: readonly Link[] }) {
  const geometry = useMemo(() => {
    if (links.length === 0) return null;
    const tubes = links.map((link) => {
      const tubularSegments = Math.max(8, (link.points.length - 1) * 6);
      return new THREE.TubeGeometry(
        link.curve,
        tubularSegments,
        PIPE_RADIUS,
        TUBE_RADIAL_SEGMENTS,
        false,
      );
    });
    const merged = mergeGeometries(tubes, false);
    tubes.forEach((tube) => tube.dispose());
    return merged;
  }, [links]);

  // TubeGeometry allocates GPU buffers that outlive the JS object; release the previous
  // merged geometry whenever links recompute (buildings placed/removed) or on unmount.
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={PALETTE.pipe} roughness={0.75} metalness={0.1} flatShading />
    </mesh>
  );
}

/**
 * The connector sockets: small hexagonal housings at each cable endpoint, lit in the
 * colour of the resource they carry. These stand in for the "node" — a fixed fixture
 * mounted where the cable meets the building, rather than a large freestanding sphere.
 */
function ConnectorSockets({ links }: { links: readonly Link[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const total = links.length * 2;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    scratchObject.quaternion.identity();
    scratchObject.scale.setScalar(1);

    links.forEach((link, index) => {
      const from = link.points[0];
      const to = link.points[link.points.length - 1];
      if (!from || !to) return;
      scratchColor.set(FLOW_COLORS[link.resource]);

      scratchObject.position.copy(from);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index * 2, scratchObject.matrix);
      mesh.setColorAt(index * 2, scratchColor);

      scratchObject.position.copy(to);
      scratchObject.updateMatrix();
      mesh.setMatrixAt(index * 2 + 1, scratchObject.matrix);
      mesh.setColorAt(index * 2 + 1, scratchColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [links]);

  if (total === 0) return null;

  return (
    <instancedMesh key={`sockets-${total}`} ref={meshRef} args={[undefined, undefined, total]}>
      <cylinderGeometry args={[SOCKET_RADIUS, SOCKET_RADIUS, SOCKET_HEIGHT, 6]} />
      {/* toneMapped off so these stay saturated and trigger bloom, like the flow packets. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** Glowing packets sliding along each cable's curve, one instanced mesh for the whole colony. */
function FlowPackets({ links }: { links: readonly Link[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const total = links.length * PACKETS_PER_LINK;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    links.forEach((link, linkIndex) => {
      scratchColor.set(FLOW_COLORS[link.resource]);
      for (let packet = 0; packet < PACKETS_PER_LINK; packet++) {
        mesh.setColorAt(linkIndex * PACKETS_PER_LINK + packet, scratchColor);
      }
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [links]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh || total === 0) return;

    const elapsed = state.clock.elapsedTime;
    const { efficiencyById } = useStore.getState().sim.report;

    links.forEach((link, linkIndex) => {
      // Efficiency is a run flag; the halfway test only guards against float noise.
      const running = (efficiencyById[link.producerId] ?? 0) >= 0.5;
      // A stopped producer collapses its packets to nothing rather than parking them.
      const scale = running ? PACKET_SCALE : 0;

      for (let packet = 0; packet < PACKETS_PER_LINK; packet++) {
        const phase = (elapsed * PACKET_SPEED + packet / PACKETS_PER_LINK) % 1;
        link.curve.getPointAt(phase, scratchObject.position);
        // Aligned to the curve's tangent so the capsule points along its direction of travel.
        link.curve.getTangentAt(phase, scratchTangent);
        scratchObject.quaternion.setFromUnitVectors(UP, scratchTangent);
        scratchObject.scale.setScalar(scale);
        scratchObject.updateMatrix();
        mesh.setMatrixAt(linkIndex * PACKETS_PER_LINK + packet, scratchObject.matrix);
      }
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  if (total === 0) return null;

  return (
    <instancedMesh key={`packets-${total}`} ref={meshRef} args={[undefined, undefined, total]}>
      {/* Elongated along Y (aligned to the cable's tangent above) so motion reads as a streak, not a dot. */}
      <capsuleGeometry args={[0.5, 1.2, 4, 8]} />
      {/* toneMapped off so these stay saturated and trigger bloom. */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
