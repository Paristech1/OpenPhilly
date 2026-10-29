# Cursor handoff: OpenPhilly graphics work

Paste one task at a time into Cursor. Each task is deliberately small: one system, one PR, testable on its own.

```
OpenPhilly/
├── index.html              <- the whole game (three.js r169, WebGL)
├── docs/
│   ├── spec.md
│   ├── visual-fidelity.md
│   └── cursor-handoff.md   <- this file
└── scripts/                <- headless capture / fidelity gate
```

---

## Rules for every task (paste these with each task)

1. **Never use `normal` or `metalnessFactor` inside a `color_fragment` or `roughnessmap_fragment` shader patch.** They aren't declared yet at that point. Use `vNormal`, and put metalness edits in `metalnessmap_fragment`. Breaking this rule is what blanked the buildings.
2. **Don't switch to `WebGPURenderer` or `three/webgpu`.** The game relies on `onBeforeCompile` shader patches, and WebGPU silently ignores them.
3. **Don't change the three.js version** (pinned at 0.169.0) or the import map.
4. **Before you commit:** open the page, open the browser console and confirm there are **zero `THREE.WebGLProgram: Shader Error` messages**. Check all 4 times of day (press T), in Drive and Fly.
5. **Mobile check:** in Chrome DevTools, use iPhone device emulation and reload. The city must still render, with no floating slabs.
6. One task = one PR. Don't bundle tasks.

---

## Task 1: Brighter night streets (easy)
Night roads are nearly black. Raise the warm pool under each street lamp (`lampPool` / `swLamp` in `asphaltSurfMat` and `concreteSurfMat`) and lift the night `hemi` ambient slightly in the `TIMES.night` preset.
**Done when:** at night on Broad & Walnut, the road is readable and lamp pools are visible, and the windows are not blown out.

## Task 2: Headlights that light the road (easy)
Add a `SpotLight` to the player car (Drive mode only) pointing forward and down. Turn it on only for Blue Hour and Night. No shadows on it (cost).
**Done when:** at night, the cab lights the street ahead of it.

## Task 3: Traffic light poles at major intersections (medium)
Broad & Market, Broad & Walnut, 15th & Market, 18th & Walnut. Build them as a pole with a horizontal mast arm and a signal head, like the reference photo. Use **one `InstancedMesh` per part** (follow the `buildStreetDetail` pattern), not individual meshes.
**Done when:** the new parts add under 50 draw calls total (`renderer.info.render.calls`).

## Task 4: Car paint material (medium)
Give the Philly Cab and AI traffic a `MeshPhysicalMaterial` with `clearcoat: 1, clearcoatRoughness: 0.08`. Keep their current colors.
**Done when:** cars show a sharp sky reflection. Check that FPS on iPhone emulation doesn't drop below 30.

## Task 5: Replace palm trees on Philly streets (easy)
Philadelphia doesn't have palm trees. In `buildArterialPalms`, swap the palm trunk and fronds for street trees (London plane / honey locust style): a trunk plus 2–3 `ICO2` crown blobs. Reuse the `buildTrees` approach.

## Task 6: Rain toggle (medium)
`SURF.wet` already drives wet roads. Add a menu button "Rain" that sets `SURF.wet.value = 1`, and add falling rain as a single `THREE.Points` or `InstancedMesh` of thin quads that follows the camera.

---

## Don't hand these to Cursor (bring them back to Claude)
- Porting to WebGPU / TSL shaders
- Anything touching `winMat`'s facade shader (windows, bricks, storefronts)
- Real Philly / Google 3D Tiles alignment or ground snapping
- The post-processing chain (`GTAOPass`, grade pass, MSAA composer)

---

## What changed in this pass (for context)
- **Post stack:** 4× MSAA (2× on phones) HDR composer → GTAO ambient occlusion (desktop, High) → bloom → output → film grade (contrast, saturation, split-tone, vignette, grain per time of day).
- **Facades:** running-bond brick with mortar relief, office panel joints, curtain-wall mullions, ground-floor storefronts (lit at night), grime streaks, contact shadow at street level.
- **Real Philly 3D (press P or use the menu):** Google Photorealistic 3D Tiles in Fly mode, centered on City Hall and rotated to the game grid. Needs a Google Maps Platform key with the Map Tiles API enabled, saved in localStorage only. Google attribution is shown at the bottom while it's on.
- Desktop now defaults to High quality. Auto-quality still steps down if FPS drops below ~28.
