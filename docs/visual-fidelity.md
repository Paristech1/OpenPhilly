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
| Capture gate | Scenic camera “Broad & Market (golden)” | Done |
| Next loop | Side-by-side reference compare, performance budget on Pages, wet night pass | Planned |

Loop continues until street-level views read close to reference while staying playable on GitHub Pages.
