// Guided early-game objective chain: explore → gather → craft → survive → build → improve.
export const QUESTS = [
  {
    id: 'gather', title: 'Washed Ashore',
    lines: (s) => [
      { text: `Pick up sticks (${Math.min(s.col.stick || 0, 3)}/3)`, done: (s.col.stick || 0) >= 3 },
      { text: `Pick up stones (${Math.min(s.col.stone || 0, 3)}/3)`, done: (s.col.stone || 0) >= 3 },
    ],
    hint: 'Walk up to items on the beach and press the action button.',
  },
  {
    id: 'fiber', title: 'Plant Fiber',
    lines: (s) => [{ text: `Collect plant fiber (${Math.min(s.col.fiber || 0, 4)}/4)`, done: (s.col.fiber || 0) >= 4 }],
    hint: 'Pale, tall grass plants near the beach give fiber.',
  },
  {
    id: 'axe', title: 'First Tool',
    lines: (s) => [{ text: 'Craft a Stone Axe', done: (s.crafted.axe || 0) >= 1 }],
    hint: 'Open the backpack and go to the Crafting tab.',
  },
  {
    id: 'chop', title: 'Timber!',
    lines: (s) => [{ text: `Chop down a tree (${Math.min(s.felled, 1)}/1)`, done: s.felled >= 1 }],
    hint: 'Face a palm tree with the axe and keep pressing action.',
  },
  {
    id: 'campfire', title: 'Make Camp',
    lines: (s) => [
      { text: 'Craft a Campfire', done: (s.crafted.campfire || 0) >= 1 },
      { text: 'Place the Campfire', done: s.placed.campfire >= 1 },
    ],
    hint: 'Stones lie all along the beach. Tap the campfire in your hotbar to place it.',
  },
  {
    id: 'drink', title: 'Fresh Water',
    lines: (s) => [{ text: 'Quench your thirst', done: s.drank >= 1 || (s.ate.coconut || 0) >= 1 }],
    hint: 'Follow the dirt path inland to the waterfall pond — or crack open a coconut.',
  },
  {
    id: 'foundation', title: 'A Place to Call Home',
    lines: (s) => [
      { text: 'Craft Rope from fiber', done: (s.crafted.rope || 0) >= 1 || s.placed.foundation >= 1 },
      { text: 'Build a Wooden Foundation', done: s.placed.foundation >= 1 },
    ],
    hint: 'Tap the hammer to enter build mode. Flat ground works best.',
  },
  {
    id: 'walls', title: 'Raise the Walls',
    lines: (s) => [
      { text: `Walls (${Math.min(s.placed.walls, 3)}/3)`, done: s.placed.walls >= 3 },
      { text: 'A Doorway', done: s.placed.doorway >= 1 },
    ],
    hint: 'Walls snap to the edges of your foundation. Turn the camera to pick an edge.',
  },
  {
    id: 'roof', title: 'Roof Over Your Head',
    lines: (s) => [{ text: 'Add a Thatch Roof', done: s.placed.roof >= 1 }],
    hint: 'Palm leaves come from felled palm trees.',
  },
  {
    id: 'bed', title: 'Sweet Dreams',
    lines: (s) => [
      { text: 'Craft a Leaf Bed', done: (s.crafted.bed || 0) >= 1 },
      { text: 'Place it in your hut', done: s.placed.bed >= 1 },
      { text: 'Sleep or rest in your bed', done: s.slept >= 1 },
    ],
    hint: 'Sleeping at night skips to morning and sets your respawn point.',
  },
];

export const FREE_PLAY = (s) => ({
  title: 'Island Life',
  lines: [
    { text: 'Cook a crab at your campfire', done: (s.crafted.crab_cooked || 0) >= 1 },
    { text: `Expand your home (${Math.min(s.placed.foundation, 4)}/4 floors)`, done: s.placed.foundation >= 4 },
    { text: 'Climb to the foot of the karst peaks', done: s.reachedPeak },
  ],
  hint: 'Your first home is done. Explore, gather and grow your camp!',
});
