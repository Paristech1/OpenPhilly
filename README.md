# OpenPhilly (Slop Philadelphia)

A Philadelphia remix of mrdoob's Slop New York (MIT): an explorable 3D Center City in a single self-contained three.js page.

## Run it

**Play in the browser:** [https://paristech1.github.io/OpenPhilly/](https://paristech1.github.io/OpenPhilly/) (GitHub Pages)

```
OpenPhilly/
├── index.html   <- the whole game
├── README.md
└── docs/
    └── spec.md  <- build spec
```

1. Open the GitHub Pages link above, or open `index.html` locally (needs internet for three.js and fonts from jsDelivr / Google Fonts).
2. Or serve it locally: `python3 -m http.server 8000`, then visit `http://localhost:8000`.

## Controls

| Key | Action |
|---|---|
| 1–4 | Walk, Drive, Cycle, Fly |
| 5–7 | Chase, low-angle, first-person cameras |
| 8–0 | Scenic shots |
| T | Time of day (Golden Hour, Midday, Blue Hour, Night) |
| M | Street Atlas map (click to teleport) |
| P | Real Philly 3D: Google photorealistic city in Fly mode (needs a Google Maps API key with Map Tiles API) |

On phones: on-screen joystick, fly up/down buttons, drag to look.

## Landmarks

City Hall · Comcast Technology Center · Comcast Center · One & Two Liberty Place · BNY Mellon Center · Three Logan Square · Commerce Square · PSFS Building · Independence Hall, Congress Hall & Old City Hall · Liberty Bell Center · National Constitution Center · Christ Church · Rittenhouse, Washington & Franklin Squares · LOVE Park · Logan Circle (Swann Fountain) · Cathedral Basilica · Free Library · Franklin Institute · Eakins Oval · Philadelphia Museum of Art (72 steps) · Fairmount Water Works · Boathouse Row & Turtle Rock Lighthouse · Ben Franklin Bridge · Reading Terminal Market · Convention Center · Chinatown Friendship Gate · Italian Market · South Street · 30th Street Station · Cira Centre · FMC Tower · Moshulu · USS Olympia & Becuna · RiverRink · Spruce Street Harbor Park

## Notes

- Stylized scale (~130 m per numbered block), not survey-accurate.
- See `docs/spec.md` for architecture and iteration ideas.
- Street-level visual fidelity checklist and automated gate: `docs/visual-fidelity.md` and `scripts/fidelity-gate.mjs`.
