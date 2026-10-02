# Our Island

A mobile-first, third-person tropical survival prototype built with Three.js. The in-game text is in Italian. There's no build step. Ground textures, rocks and understorey plants are CC0 scanned assets from Poly Haven (`assets/external/`, see its CREDITS.md). Everything else (characters, trees, buildings, sounds) is generated in code, and the game falls back to procedural versions if the assets fail to load.

**Early-game loop:** wash ashore → gather sticks, stones and fiber → craft a stone axe → fell palms → make a campfire → find fresh water → build a raised wooden hut (foundation, walls, doorway, thatch roof) → craft a leaf bed and sleep through the night.

**Progression:** short Italian objectives that say what to do next and what each step unlocks: gather → first axe → water and food → spear → campfire → shelter → storage chest → first fiber crop → bed → explore. Crafting is split into 5 tiers:
1. *Sopravvivenza*
2. *Base*, after the first tree is felled
3. *Coltivazione*, after the first shelter
4. *Attrezzi migliori*, from a blueprint in the cave
5. *Costruzione avanzata*, from a blueprint in the hidden cove

Eight one-time supply caches sit at the island's landmarks; the last one is deep inside the cave.

**View:** first person by default; Settings or the V key switches to third person.

**Building:** the placement preview is green or red, grid pieces snap, and objects can be rotated or cancelled. *Smonta* (or X) dismantles a piece for half its cost back; placed items come back whole.

**Self-sufficient base:**
- **Food crops:** potatoes, corn, medicinal herbs and pineapple. Each has its own seed and use; seeds come from caches, berry bushes, crates washed ashore and every harvest.
- **Coop (*Pollaio*):** hatch wild jungle eggs, feed corn, collect eggs; well-fed hens breed. Hens are drawn only once `assets/external/animals/chicken.glb` exists; until then the coop shows eggs and a hen count.
- **Fishing:** cast, wait for the float to dip, pull. Sea and pond fish, with the occasional grouper or message in a bottle.
- **Cooking:** campfire dishes give short buffs: *Sazio* (half hunger), *Energia* (running tires less), *Rigenerazione*.
- **Water collector:** fills over play time.
- **World event:** crates now and then wash up on a beach and show on the map.
- **Goals:** the HUD shows three levels: right now, the current objective, and progress towards a self-sufficient base.

**Cave and metal:**
- **Cave (*La grotta*):** a tunnel carved into the main mountain, with an entry chamber, a narrow gallery and a deep chamber. It gets dark inside, so carry a torch or lantern. The rock roof can be walked on from above.
- **Danger:** the gallery's roof is unstable. A rumble and falling dust warn you, then a rock drops where you were standing.
- **Mining:** iron veins (*Vena di ferro*) sit along the walls and obsidian (*Ossidiana*) in the deep chamber. Every vein has a finite yield and respawns. Obsidian needs the iron pickaxe.
- **Smelting:** the miners' chest in the deep chamber unlocks *Metallurgia*. Build a furnace (*Fornace*), load ore and wood, and it turns out one ingot every 20 s of play. Its contents and progress are saved.
- **Tools:** stone → reinforced → metal. The iron pickaxe and axe hit three times as hard, the iron spear does 10 damage and the obsidian spear 14, and the lantern gives a stronger light.
- **Drying rack (*Essiccatoio*):** hang raw meat or fish and it turns into jerky or dried fish over play time. These keep the *Esploratore* buff going, which slows thirst.

**Survival systems:**
- **Farming:** wild fiber plants drop sprouts. Plant them in a crafted farm plot (Orto); they grow on played time and harvest into fiber plus new sprouts.
- **Wildlife and combat:** boars and chickens appear once their models are added (see `assets/external/animals/`). Boars chase and attack within a limited range. Fight with the craftable spear (Lancia) or any tool; boars drop meat and hide, and meat can be cooked at a campfire.
- **Renewable resources:** trees, rocks, plants and animals respawn.
- **Data tables** (to extend content): `ITEMS`, `RECIPES`, `PIECES`, `FREE_PLACE`, `COOKING`, `WEAPON_DMG`, `MINERALS`, `SMELT` and `DRYING` in `src/game/items.js`, `CROPS` in `src/game/farming.js`, and `SPECIES` in `src/entities/wildlife.js`.

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
- `src/game/`: items and recipes, inventory, building system, quests, the cave (`cave.js`: roof, veins, rockfall), and the game orchestrator (`game.js`)
- `src/ui/`: HUD, panels and minimap. Item icons are rendered from the 3D models
- `src/fx/`: particles, fire and lights, procedural WebAudio
- `src/net/`: `net.js` handles the WebRTC connection (PeerJS) and `coop.js` handles avatar and world sync

The PNG files in the repo root are the visual reference images.
