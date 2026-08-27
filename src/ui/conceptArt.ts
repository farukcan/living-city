import batteryBank from '../assets/concept_art/battery_bank.jpg';
import crewRocket from '../assets/concept_art/crew_rocket.jpg';
import electrolyzer from '../assets/concept_art/electrolyzer.jpg';
import greenhouse from '../assets/concept_art/greenhouse.jpg';
import habitat from '../assets/concept_art/habitat.jpg';
import iceExtractor from '../assets/concept_art/ice_extractor.jpg';
import mine from '../assets/concept_art/mine.jpg';
import rocketPad from '../assets/concept_art/landing_pad.jpg';
import solarArray from '../assets/concept_art/solar_array.jpg';
import storageDepot from '../assets/concept_art/storage_depot.jpg';
import type { BuildingKind } from '../sim/types.ts';

/**
 * Painted concept art for each building, shown at the head of the inspector.
 *
 * The renders in the world are deliberately low-poly, which reads as a diagram rather than a
 * place. These are the same buildings imagined at full fidelity, and they are what makes the
 * inspector feel like a page from a mission dossier instead of a stat block.
 *
 * Imported rather than served from `public/` so the bundler fingerprints them and rewrites
 * the URLs for the GitHub Pages base path.
 */
export const CONCEPT_ART: Readonly<Record<BuildingKind, string>> = {
  solarArray,
  batteryBank,
  habitat,
  iceExtractor,
  electrolyzer,
  greenhouse,
  mine,
  storageDepot,
  rocketPad,
};

/**
 * The Landing Pad with a crew rocket standing on it.
 *
 * Not part of `CONCEPT_ART` because it is not a building: the rocket is a phase of the pad,
 * so which of the two the inspector shows depends on the moment rather than on the kind.
 */
export const CREW_ROCKET_ART: string = crewRocket;
