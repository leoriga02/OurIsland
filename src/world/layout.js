// Island 2.0: the hand-designed layout of the main island. Terrain.js turns this into a heightfield.
// Axes: +x east, +z south. The player washes ashore on the big south beach.

const deg = (d) => (d * Math.PI) / 180;
// point on a circle around a centre (angles measured from +x toward +z)
export const polar = (c, a, d) => [c.x + Math.cos(deg(a)) * d, c.z + Math.sin(deg(a)) * d];

// ---- land masses (signed-distance ellipses / capsules, smoothly unioned) ----
export const LAND = [
  { type: 'ellipse', x: 0, z: 10, rx: 250, rz: 185, rot: 0.2 },        // island core (jungle, main clearing)
  { type: 'ellipse', x: -35, z: 205, rx: 175, rz: 105, rot: -0.12 },   // big south beach lobe (start)
  { type: 'ellipse', x: -255, z: 60, rx: 125, rz: 150, rot: 0.35 },    // west lobe (second clearing, rocky coast)
  { type: 'ellipse', x: -175, z: -205, rx: 175, rz: 140, rot: -0.35 }, // north-west highlands
  { type: 'ellipse', x: 140, z: -200, rx: 150, rz: 118, rot: 0.3 },    // north-east lobe (lookout)
  { type: 'ellipse', x: 285, z: -55, rx: 78, rz: 68, rot: 0.1 },       // east headland around the hidden cove
  { type: 'capsule', ax: 170, az: 40, bx: 360, bz: 88, r: 55 },        // east peninsula (rocky coast, arch)
  { type: 'capsule', ax: -250, az: 235, bx: -345, bz: 300, r: 34 },    // south-west rocky point
];

// ---- water carved back into the land ----
export const CARVE = [
  { type: 'circle', x: 175, z: 238, r: 92 },     // south-east bay
  { type: 'circle', x: -15, z: -315, r: 82 },    // north bay (end of the mountain pass)
  { type: 'circle', x: -395, z: -30, r: 48 },    // small west inlet
  { type: 'circle', x: 300, z: -58, r: 31 },     // hidden cove basin
  { type: 'capsule', ax: 300, az: -58, bx: 390, bz: -95, r: 9 }, // narrow sea mouth of the cove
];

// ---- tiered limestone massifs: stacked mesas give cliffs + flat terraces ----
// tier: { x, z, r, h (height gain), w (edge width: small = cliff, large = walkable slope) }
export const MASSIF_A = { x: -150, z: -190 }; // main mountain: tallest peak, waterfall, cave
export const MASSIF_B = { x: 118, z: -192 };  // lookout mountain
export const MASSIFS = [
  { id: 'A', tiers: [
    { x: -150, z: -190, r: 172, h: 13, w: 55 },
    { x: -150, z: -190, r: 115, h: 19, w: 8 },
    { x: -166, z: -208, r: 60, h: 22, w: 7 },
    { x: -172, z: -214, r: 26, h: 16, w: 30 },
  ] },
  { id: 'B', tiers: [
    { x: 118, z: -192, r: 126, h: 11, w: 45 },
    { x: 118, z: -192, r: 78, h: 17, w: 7 },
    { x: 124, z: -198, r: 40, h: 4, w: 30 },
  ] },
  { id: 'W', tiers: [ // low rocky ridge behind the west coast
    { x: -318, z: -55, r: 55, h: 8, w: 30 },
    { x: -322, z: -60, r: 30, h: 9, w: 7 },
  ] },
];

// ---- flat buildable land ----
export const CLEARINGS = [
  { id: 'main', x: 42, z: 22, r: 62, blend: 32 },   // big clearing for the future base/farm
  { id: 'west', x: -238, z: 72, r: 30, blend: 22 }, // smaller second clearing
];

// ---- landmarks ----
// the pond and cave sit at the foot of massif A's cliff; Terrain finds the exact cliff line along these bearings
export const POND = { angle: 56, r: 11 };
export const CAVE = { angle: -8 };
export const COVE = { x: 300, z: -58, r: 31, rimIn: 42, rimOut: 72, rimH: 12 };
const lookC = polar({ x: 124, z: -198 }, 70, 30);
export const LOOKOUT = { x: lookC[0], z: lookC[1] };
export const ARCH = { x: 445, z: 112, rot: 0.35 };
export const ISLETS = [
  { x: -225, z: 345, r: 11, h: 11 }, { x: 150, z: 262, r: 9, h: 8 }, { x: 70, z: -372, r: 12, h: 15 },
  { x: -440, z: -120, r: 13, h: 17 }, { x: -330, z: -345, r: 10, h: 12 }, { x: 420, z: -170, r: 9, h: 13 },
];

// rocky-coast regions (cliffy shoreline instead of beach): x, z, radius
export const ROCKY = [
  { x: -390, z: 60, r: 120 }, { x: -330, z: 280, r: 70 }, { x: 350, z: 70, r: 110 },
  { x: 330, z: -70, r: 85 }, { x: -300, z: -300, r: 90 }, { x: 250, z: -300, r: 80 },
];
// wide sandy beaches: x, z, radius
export const BEACHES = [
  { x: -30, z: 320, r: 190 }, { x: 150, z: 180, r: 80 }, { x: -15, z: -250, r: 70 }, { x: 300, z: -58, r: 25 },
];

// ---- paths ----
// ramp: heights interpolated end-to-end (cuts ledges/gullies into cliffs); otherwise the path follows the ground.
// w: flat width, f: falloff. hidden: no dirt colouring (natural passage).
export const PATHS = [
  // start beach -> through the jungle -> main clearing
  { pts: [[-18, 292], [-8, 250], [18, 200], [10, 150], [28, 100], [38, 62]] },
  // main clearing -> waterfall pool (climbs the foothill)
  { id: 'pond', pts: [[22, -8], [-10, -38], [-45, -60], [-66, -76]] },
  // mountain pass: clearing -> valley between the two massifs -> north bay beach
  { ramp: true, w: 8, f: 18, pts: [[58, -38], [44, -80], [22, -130], [8, -180], [-2, -222], [-8, -252]] },
  // clearing -> east -> rocky east peninsula
  { pts: [[100, 28], [160, 40], [220, 52], [280, 66], [330, 80]] },
  // clearing -> west -> second clearing
  { pts: [[-18, 30], [-80, 45], [-150, 62], [-212, 70]] },
  // start beach west along the dunes to the south-west point
  { pts: [[-60, 290], [-140, 280], [-215, 262], [-260, 248]] },
  // massif A: ramp from the foothill up to the second tier (south-west flank, away from the waterfall)
  { ramp: true, w: 4.2, f: 6, pts: [polar(MASSIF_A, 96, 138), polar(MASSIF_A, 108, 130), polar(MASSIF_A, 120, 122), polar(MASSIF_A, 132, 112), polar(MASSIF_A, 142, 98), polar(MASSIF_A, 150, 88)] },
  // massif A: second tier -> summit tier (climbs the inner cliff on the side facing the plateau)
  { ramp: true, w: 4.2, f: 6, pts: [polar({ x: -166, z: -208 }, 0, 86), polar({ x: -166, z: -208 }, 15, 80), polar({ x: -166, z: -208 }, 30, 72), polar({ x: -166, z: -208 }, 45, 64), polar({ x: -166, z: -208 }, 58, 54), polar({ x: -166, z: -208 }, 68, 46)] },
  // massif B: switchback to the lookout plateau
  { ramp: true, w: 4.2, f: 6, pts: [polar(MASSIF_B, 45, 96), polar(MASSIF_B, 62, 92), polar(MASSIF_B, 80, 88), polar(MASSIF_B, 98, 84), polar(MASSIF_B, 114, 76), polar(MASSIF_B, 126, 68)] },
  // hidden cove: a narrow gully down through the cliff rim
  { ramp: true, w: 2, f: 4, hidden: true, pts: [[226, -114], [240, -104], [252, -95], [263, -86], [273, -77]] },
];
