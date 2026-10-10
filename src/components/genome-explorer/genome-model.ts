export type GenomeZoom = 0 | 1 | 2;

// Shared drawing coordinates keep the canvas and its annotations aligned.
const HELIX_TOP = 40;
const HELIX_HEIGHT = 490;
export const SEQUENCE_Y = [205, 335] as const;
export const SEQUENCE_START = 150;
export const SEQUENCE_END = 525;
export const SEQUENCE_STEP = (SEQUENCE_END - SEQUENCE_START) / 12;
export const SEQUENCE_VARIANT_X = SEQUENCE_START + 6 * SEQUENCE_STEP;

export const FEATURED_PAIR = 10;
// The final two illustrations are alternatives for pair 23, joined by “or”.
export const CHROMOSOMES = Array.from({ length: 24 }, (_, index) => {
  return {
    x: 75 + (index % 6) * 90,
    y: 150 + Math.floor(index / 6) * 104,
    height: 68 - Math.min(index, 22) * 1.2,
    label: index === 22 ? "XX" : index === 23 ? "XY" : String(index + 1),
  };
});

// An invented excerpt, read in the same direction on homologous chromosomes.
export const MATERNAL_SEQUENCE = "ACGTACATGCACT";
export const PATERNAL_SEQUENCE = "ACGTACGTGCACT";
export const VARIANT_INDEX = 6;

// Shared pose math keeps the 3D molecule, fallback, and gene brackets together.
export function helixPose(parent: number, time = 0) {
  return {
    x: 300 + (parent ? 136 : -136),
    y: HELIX_TOP + HELIX_HEIGHT / 2,
    roll: (parent ? -1 : 1) * (0.14 + Math.sin(time * 0.48 + parent * 1.4) * 0.016),
    pitch: 0.32 + Math.sin(time * 0.32 + parent) * 0.035,
    phase: 0.7 + parent * 0.85 + time * (parent ? -0.38 : 0.38),
  };
}

export function helixPoint(t: number, side: number, pose: ReturnType<typeof helixPose>) {
  const angle = t * Math.PI * 5.2 + side * Math.PI + pose.phase;
  const x = Math.cos(angle) * 38;
  const z = Math.sin(angle) * 38;
  const axial = (t - 0.5) * HELIX_HEIGHT;
  const y = axial * Math.cos(pose.pitch) - z * Math.sin(pose.pitch);
  return {
    x: pose.x + x * Math.cos(pose.roll) + y * Math.sin(pose.roll),
    y: pose.y - x * Math.sin(pose.roll) + y * Math.cos(pose.roll),
    z: axial * Math.sin(pose.pitch) + z * Math.cos(pose.pitch),
  };
}

// A quiet horizontal echo of each molecule behind its readable sequence.
export function sequenceHelixPoint(t: number, side: number, parent: number, time = 0) {
  const angle =
    t * Math.PI * 6.4 + side * Math.PI + 0.7 + parent * 0.85 + time * (parent ? -0.3 : 0.3);
  return {
    x: SEQUENCE_START - 18 + t * (SEQUENCE_END - SEQUENCE_START + 36) + Math.sin(angle) * 5,
    y: SEQUENCE_Y[parent]! + Math.cos(angle) * 34,
    z: Math.sin(angle) * 34 - 10,
  };
}

export function helixFrameTransform(pose: ReturnType<typeof helixPose>) {
  return `translate(${pose.x} ${pose.y}) rotate(${((-pose.roll * 180) / Math.PI).toFixed(3)})`;
}

export function helixConnector(parent: number, pose: ReturnType<typeof helixPose>) {
  const edge = parent ? -55 : 55;
  const x = pose.x + edge * Math.cos(pose.roll);
  const y = pose.y - edge * Math.sin(pose.roll);
  const targetX = parent ? 350 : 250;
  const middleX = (x + targetX) / 2;
  return `M${x.toFixed(3)} ${y.toFixed(3)}C${middleX.toFixed(3)} ${y.toFixed(3)} ${middleX.toFixed(3)} ${pose.y} ${targetX} ${pose.y}`;
}
