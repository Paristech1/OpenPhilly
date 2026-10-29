# OpenPhilly (Slop Philadelphia)

A Philadelphia remix of mrdoob's Slop New York (MIT): an explorable 3D Center City in a single self-contained three.js page.

## Run it

```
OpenPhilly/
├── index.html   <- the whole game
├── README.md
└── docs/
    └── spec.md  <- build spec
```

1. Open `index.html` in a modern browser (needs internet for three.js and fonts from jsDelivr / Google Fonts).
2. Or serve it locally: `python3 -m http.server 8000`, then visit `http://localhost:8000`.

## Controls

| Key | Action |
|---|---|
| 1–4 | Walk, Drive, Cycle, Fly |
| 5–7 | Chase, low-angle, first-person cameras |
| 8–0 | Scenic shots |
| T | Time of day (Golden Hour, Midday, Blue Hour, Night) |
| M | Street Atlas map (click to teleport) |

On phones: on-screen joystick, fly up/down buttons, drag to look.

## Notes

- Stylized scale (~130 m per numbered block), not survey-accurate.
- See `docs/spec.md` for architecture and iteration ideas.
