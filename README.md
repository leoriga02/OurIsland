# Our Island

A mobile-first, third-person tropical survival prototype built with Three.js. There's no build step and it needs no external assets: all models, textures and sounds are generated in code.

**Early-game loop:** wash ashore → gather sticks, stones and fiber → craft a stone axe → fell palms → make a campfire → find fresh water → build a raised wooden hut (foundation, walls, doorway, thatch roof) → craft a leaf bed and sleep through the night.

## Run it

Serve the folder over HTTP. ES modules don't load from `file://`.

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

To play on an iPhone, open that URL from a device on the same network, or use the included GitHub Pages workflow. For the workflow, go to *Settings → Pages → Source* and choose **GitHub Actions**. Play in landscape.

## Co-op (2 players, 2 devices)

1. Both players open the game URL. For playing apart, GitHub Pages works best; on the same Wi-Fi, a local server works too.
2. Player 1 taps **Host Co-op** and then **Invite**, which shares a link or copies it (the 5-letter room code also works).
3. Player 2 opens the link, or taps **Join Co-op** and types the code, then taps **Join Island**.

There's no server to set up. The two browsers connect directly over WebRTC; the free public PeerJS service only introduces them (with a relay fallback for strict mobile networks). The host's island is the shared world, and it's saved on the host's device. The guest keeps their own backpack and progress. Players see each other move and act. Gathering, felling trees, mining, building and sleeping through the night are shared. If the connection drops, the guest reconnects automatically.

If the public PeerJS service is ever down, run your own with `npx peer --port 9000` and add `?peer=your-host:9000` to both URLs.

## Controls

| Touch (primary) | Keyboard / mouse |
| --- | --- |
| Left thumb anywhere on the left side: floating joystick | WASD / arrows |
| Hold the » button to sprint (uses more food and water) | Shift |
| Right thumb drag: look. Pinch: zoom | Drag the mouse to look, wheel to zoom |
| Big button: contextual action (pick up, chop, mine, drink, cook, sleep, place). Hold it to repeat | E / F |
| Jump button | Space |
| Hammer: build mode | B (R rotates, Q exits) |
| Backpack: inventory, crafting, building | Tab / I, C |
| Tap a hotbar slot to equip a tool, eat food or place an item | 1–8 |

Progress autosaves to `localStorage`. On the title screen, **New island** resets it. Add `?low` to the URL for the low-quality mode.

## Code map

- `src/world/`: terrain heightfield, water shader, sky and day/night cycle, vegetation and rocks (instanced, with LOD), props, waterfall
- `src/entities/`: procedural character and animation, player controller and camera, crabs, seagulls
- `src/game/`: items and recipes, inventory, building system, quests, and the game orchestrator (`game.js`)
- `src/ui/`: HUD, panels and minimap. Item icons are rendered from the 3D models
- `src/fx/`: particles, fire and lights, procedural WebAudio
- `src/net/`: `net.js` handles the WebRTC connection (PeerJS) and `coop.js` handles avatar and world sync

The PNG files in the repo root are the visual reference images.
