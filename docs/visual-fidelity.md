# Visual fidelity goal (loop target)

Reference: modern open-world street chase — dense geometry, PBR materials, strong sun/shadow, wet reflective pavement.

## Checklist (drive Broad & Market at golden hour)

| Area | Target | Status |
|------|--------|--------|
| Street mesh | Subdivided crowned asphalt (not flat planes) | Done |
| Arterial mesh density | Finer subdivisions on Broad/Market corridor | Done |
| Sidewalk mesh | Subdivided concrete with slab variation | Done |
| Materials | Procedural noise, wetness + sky reflection response | Done |
| Wet pavement | View-dependent sun streaks when wet | Done |
| Wet night | Lamp pools on wet asphalt/sidewalk + reflective lane paint | Done |
| Sky reflection | Fresnel sky tint on asphalt (PMREM-aligned colors) | Done |
| Curbs | Beveled merged geometry + granite specular shader | Done |
| Buildings | Window shader + sills/spandrels + sky glass reflections | Done |
| Facade trim | Base courses + cornice bands near arterials | Done |
| Trees | 16-seg trunks, detail-2 crowns, multi-sphere clusters | Done |
| Arterial trees | Palm-style rows on Broad St & Market St | Done |
| Street lamps | 16-seg poles, spherical heads | Done |
| Lighting | 4K shadows (high), wider frustum, exposure | Done |
| Post | Bloom strength/threshold/radius per time preset | Done |
| Cars | AFTERHOURS high-poly models | Done |
| Capture gate | Scenic cameras + `__dev.broadMarketGate()` | Done |
| Pages perf | `DETAIL` scale + medium default on github.io | Done |
| Drive-through gate | Simulated northbound Broad drive in `broadMarketGate` | Done |

## Acceptance (automated)

From repo root (with a static server serving `index.html`):

```bash
cd scripts && npm install && npm run fidelity-gate -- http://127.0.0.1:8765/index.html
```

Pass criteria (proxy for “reads close to reference” without a pinned reference frame in CI):

1. No page errors during load.
2. `broadMarketGate('golden')` and `('night')` both return `ok: true`.
3. Triangle count between **4.5M** and **11M** on desktop `DETAIL=1`.
4. Drive sim reaches **z > 205** on Broad St from City Hall spawn (northbound ~6 s).

Manual: teleport **City Hall (Broad & Market)**, golden hour, drive north on Broad; graphics **High** on capable desktops, **Medium** default on GitHub Pages.

Play: https://paristech1.github.io/OpenPhilly/
