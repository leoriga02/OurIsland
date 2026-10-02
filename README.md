# Our Island

A mobile-first, third-person tropical survival prototype built with Three.js. The in-game text is in Italian. There's no build step. Ground textures, rocks and understorey plants are CC0 scanned assets from Poly Haven (`assets/external/`, see its CREDITS.md). Everything else (characters, trees, buildings, sounds) is generated in code, and the game falls back to procedural versions if the assets fail to load.

**Early-game loop:** wash ashore → gather sticks, stones and fiber → craft a stone axe → fell palms → make a campfire → find fresh water → build a raised wooden hut (foundation, walls, doorway, thatch roof) → craft a leaf bed and sleep through the night.

**Survival systems:**
- **Farming:** wild fiber plants drop sprouts. Plant them in a crafted farm plot (Orto); they grow on played time and harvest into fiber plus new sprouts.
- **Wildlife and combat:** boars and chickens appear once their models are added (see `assets/external/animals/`). Boars chase and attack within a limited range. Fight with the craftable spear (Lancia) or any tool; boars drop meat and hide, and meat can be cooked at a campfire.
- **Renewable resources:** trees, rocks, plants and animals respawn.
- **Data tables** (to extend content): `ITEMS`, `RECIPES`, `PIECES`, `FREE_PLACE`, `COOKING` and `WEAPON_DMG` in `src/game/items.js`, `CROPS` in `src/game/farming.js`, and `SPECIES` in `src/entities/wildlife.js`.

## Run it

Serve the folder over HTTP. ES modules don't load from `file://`.

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

To play on an iPhone, open that URL from a device on the same network, or use the included GitHub Pages workflow. For the workflow, go to *Settings → Pages → Source* and choose **GitHub Actions**. Play in landscape.

## Co-op (2 players, 2 devices)

1. Both players open the game URL. For playing apart, GitHub Pages works best; on the same Wi-Fi, a local server works too.
2. Player 1 taps **Crea partita co-op** and then **Invita**, which shares a link or copies it (the 5-letter room code also works).
3. Player 2 opens the link, or taps **Unisciti in co-op** and types the code, then taps **Raggiungi l’isola**.

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

Progress autosaves to `localStorage` every 20 seconds and whenever the tab is hidden or closed. Settings also has a **Salva partita** button. Saves carry a format version and are migrated on load. On the title screen, **Nuova isola** resets it. Add `?low` to the URL for the low-quality mode.

## Code map

- `src/world/`: `layout.js` is the hand-designed island map (coastline, mountains, clearings, paths and ramps, landmarks), and `terrain.js` turns it into the heightfield. Also here: water shader, sky and day/night, biome-driven vegetation, rocks and fractured cliff columns (instanced, with LOD), props (wreckage, waterfall, cave, sea arch, cairn) and distant islands
- `src/entities/`: procedural character and animation, player controller and camera, crabs, seagulls
- `src/game/`: items and recipes, inventory, building system, quests, and the game orchestrator (`game.js`)
- `src/ui/`: HUD, panels and minimap. Item icons are rendered from the 3D models
- `src/fx/`: particles, fire and lights, procedural WebAudio
- `src/net/`: `net.js` handles the WebRTC connection (PeerJS) and `coop.js` handles avatar and world sync

The PNG files in the repo root are the visual reference images.
