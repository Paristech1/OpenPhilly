# Visual fidelity goal (loop target)

Reference: modern open-world street chase — dense geometry, PBR materials, strong sun/shadow, wet reflective pavement.

## Checklist (drive Broad & Market at golden hour)

| Area | Target | Status |
|------|--------|--------|
| Street mesh | Subdivided crowned asphalt (not flat planes) | Done |
| Sidewalk mesh | Subdivided concrete with slab variation | Done |
| Materials | Procedural noise, wetness response | In progress |
| Wet pavement | View-dependent sun streaks when wet | Done |
| Curbs | Beveled merged geometry (not flat boxes) | Done |
| Buildings | Higher-segment boxes + window shader + sills/spandrels | In progress |
| Trees / poles | 12-seg trunks, icosa detail-1 crowns | Done |
| Lighting | 4K shadows (high), wider frustum, exposure | Done |
| Post | Bloom tuned per time preset | Partial |
| Cars | AFTERHOURS high-poly models | Done |
| Next loop | Tree clusters, lamp poles 16-seg, env reflections on glass | Planned |

Loop continues until street-level views read close to reference while staying playable on GitHub Pages.
