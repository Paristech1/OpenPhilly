# Slop Philadelphia — build spec

Philadelphia remix of mrdoob's Slop New York (MIT). Single self-contained three.js page.

## 1. Requirements
- Explore Center City in 4 modes: Walk, Drive, Cycle, Fly (keys 1–4).
- Cameras: chase, low-angle, first-person (5–7); scenic shots (8–0 + menu); Auto-Director; Aerial.
- Time of day: Golden Hour, Midday, Blue Hour, Night (T).
- Street Atlas map (M): tap/click to teleport, drag to pan, pinch/scroll to zoom; landmark teleport list.
- Works on phone: joystick, fly up/down buttons, drag-to-look; auto quality downgrade.

## 2. Domain analysis
- Penn's grid: numbered streets Front–25th run N–S (Broad = 14th); named streets Spring Garden → Washington Ave run E–W.
- Neighborhood zones drive building generation: CBD towers, Old City brick, Society Hill / South Philly rowhouses, Chinatown, Callowhill warehouses, University City across the Schuylkill.
- Landmarks: City Hall + Penn statue, Comcast Technology Center, Comcast Center, One & Two Liberty, BNY Mellon, Three Logan, Independence Hall, Liberty Bell Center, Constitution Center, Ben Franklin Bridge, Art Museum + steps, Ben Franklin Parkway, Logan Circle, Rittenhouse / Washington / Franklin Squares, LOVE Park plaza, Reading Terminal, Convention Center, Chinatown gate, Italian Market, South St, Boathouse Row, 30th St Station, Cira Centre, FMC Tower, Schuylkill bridges.
- Stylized scale: ~130 m per numbered block; not survey-accurate.

## 3. Use cases
- Cruise Broad St to City Hall at golden hour; climb the Art Museum steps; drive the Ben Franklin Bridge; fly over Boathouse Row at night; teleport via map.

## 4. Architecture
- three r169 ES modules from jsDelivr via import map; EffectComposer + UnrealBloom (night glow).
- One InstancedMesh for all generated buildings with a procedural window shader (lit windows at night, glass reflections by day).
- Custom gradient sky shader → PMREM environment per time preset.
- Collision: spatial-hash grid of oriented boxes + solid surfaces (museum plateau/steps, bridge deck) + water blocking.
- AI traffic on lane polylines (ring around City Hall, yields to player); sidewalk pedestrians; lamp light pools.

## 5–6. Prototype & detailed design
- HUD: Dark Luxury (charcoal-violet glass panels, acid-green accent), Saira Condensed / IBM Plex.

## 7. Testing
- Headless Chromium (SwiftShader) harness with local three; screenshot each time preset; console-error check.
- Run from repo root: `npm install && npm run test:harness` (writes PNGs + `report.json` under `test-output/`).

## 8. Deployment
- Static single file (`index.html`); originally published as a private claude.ai artifact.

## 9. Iteration ideas
- Done: AFTERHOURS car port; rain (**Y**); SEPTA trolleys (Market, Spring Garden, Chestnut) + Market–Frankford El (elevated structure + trains); procedural audio after first tap (**N** mute); pre-baked OSM footprints in Rittenhouse grid with zone fallback elsewhere.
- Expand OSM coverage beyond the Rittenhouse sample bbox.
