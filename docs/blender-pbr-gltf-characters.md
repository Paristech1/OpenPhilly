# Blender PBR → glTF → Three.js (`MeshStandardMaterial`)

Reference for character assets (skin, cloth, hair) that must read correctly in **OpenPhilly / realcity**, which loads `.wasm` glTF packs via `GLTFLoader` and drives night glow from **material names** on `MeshStandardMaterial`.

**Authoritative export rules:** [Blender glTF 2.0 add-on manual](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html) (Metal/Rough PBR only; node trees outside the supported Principled BSDF wiring are ignored or baked).

---

## 1. What actually survives export

glTF **core PBR** maps 1:1 to Three.js `MeshStandardMaterial`:

| Blender Principled BSDF | glTF / `MeshStandardMaterial` | Notes |
|-------------------------|-------------------------------|--------|
| Base Color (+ texture) | `baseColorFactor` / `map` | sRGB texture |
| Metallic | `metallicFactor` / metalness map (B channel) | |
| Roughness | `roughnessFactor` / roughness map (G channel) | |
| Normal Map node → Normal | `normalTexture` | Tangent space, **+Y up**, texture **Non-Color** |
| Emission (+ texture) | `emissiveFactor` / `emissiveMap` | Linear; HDR factors → `KHR_materials_emissive_strength` |
| Alpha (opaque / clip / blend) | `alphaMode` OPAQUE / MASK / BLEND | Hair often MASK (`alphaTest` ~0.5 in engine) |
| Transmission, IOR, volume | Extensions (`KHR_materials_transmission`, `_volume`, …) | Three.js r169+ supports many; test in target build |
| Clearcoat / Sheen | `KHR_materials_clearcoat`, `_sheen` | Skin oils, lacquered cloth |
| **Subsurface** (SSS) | **Not exported** | No true SSS in glTF or `MeshStandardMaterial` |

**Subsurface scattering, specular tint from complex node graphs, Bump-only nodes, and particle hair systems do not export.** Bake or fake those effects in textures and material inputs the exporter understands.

**Preview in Blender:** Use **Eevee/Viewport** with a simple **Principled-only** tree; Cycles SSS previews will lie about the web runtime.

---

## 2. Principled BSDF wiring (minimal, export-safe)

Keep one **Principled BSDF** → **Material Output** per slot. Avoid `Mix Shader`, procedural normals, and custom BSDFs unless you bake them.

### Normal maps

```
Image Texture (Non-Color) → Normal Map (Tangent Space, Strength 0.5–1.0) → Principled Normal
```

- Bake tangents: **Tangent, R +X, G +Y, B +Z** (OpenGL / glTF convention; matches Three.js).
- Apply scale and mirror on the mesh; use **Apply Rotation & Scale** before export.
- Enable **tangents** in glTF export (default).

### ORM packing (optional)

Single **Non-Color** texture: **R** = ambient occlusion (often multiplied in base color offline), **G** = roughness, **B** = metallic. In Blender, **Separate RGB** → Roughness / Metallic on Principled (exporter recognizes this layout).

### Alpha (hair cards, lace)

| Look | Principled | glTF | Three.js |
|------|------------|------|----------|
| Hard cutout | Alpha Clip, texture in Base Color A | `ALPHA_MASK` | `alphaTest: 0.5`, `transparent: false` |
| Soft flyaways | Alpha Blend | `ALPHA_BLEND` | Sorting issues; prefer cards + clip |
| Opaque fiber | No alpha | `OPAQUE` | Fastest |

OpenPhilly landmark code uses **alphaTest 0.5** for masked foliage/windows (`alpha` flag on `winMat`); match that for hair if you register materials similarly.

---

## 3. Skin (no true SSS)

**Runtime model:** diffuse lobe + specular (GGX). Wax-like softness must be **faked**.

### Recommended Principled values (starting points)

| Input | Typical range | Purpose |
|-------|----------------|---------|
| Metallic | **0** | |
| Roughness | **0.35–0.55** (map: porous T-zone higher) | |
| Specular / IOR Level | Default or slight clearcoat on lips | Optional `KHR_materials_clearcoat` for wet lips |
| Subsurface (viewport only) | Radius ~(1.0, 0.4, 0.25), Weight **0** at export | Use only to **bake** if desired; **do not rely on export** |

### Subsurface approximation strategies (pick 1–2)

1. **Albedo + cavity paint**  
   Darken creases (orbital, nasal, ears); slightly warm cheeks/ears in base color. Subsurface RGB shift baked into diffuse.

2. **Dual normal detail**  
   Fine micro-normal in the map; lower **Normal Map Strength** (~0.4) so specular does not go chalky.

3. **Thickness / curvature bake**  
   Bake ambient occlusion + thickness mask; multiply warm tint `(1.0, 0.85, 0.75)` into base color where thickness is high.

4. **Engine extension (OpenPhilly-specific)**  
   If a character needs live rim subsurface, add a **custom shader patch** on load (same pattern as building/window `onBeforeCompile` in `realcity/index.html`). That is outside stock glTF.

### Texture resolution

- Head: **2K** base + normal; body: **1K–2K** shared UV islands.
- Separate materials: **Skin_Head**, **Skin_Body**, **Skin_Lips**, **Eyes** (eyes often unlit or high spec + transmission for cornea).

---

## 4. Cloth

| Fabric | Roughness | Metallic | Maps |
|--------|-----------|----------|------|
| Cotton / wool | 0.75–0.95 | 0 | Base + normal; optional AO in base |
| Denim | 0.8–0.9 | 0 | Strong normal |
| Leather | 0.45–0.65 | 0 | Normal + subtle clearcoat |
| Silk / satin | 0.25–0.45 | 0 | **Anisotropy** (`KHR_materials_anisotropy`) if viewer supports |
| Metal trim | 0.2–0.4 | **1** | ORM blue channel |

**Folds:** author mid-frequency normal; avoid extreme high-pass that aliases at distance (OpenPhilly uses anisotropic filtering `anisotropy = 4` on loaded landmark maps).

---

## 5. Hair: cards vs particles

| Approach | Blender | glTF export |
|----------|---------|-------------|
| **Particle / Hair curve system** | Great in Cycles | **Not exported** (no strands in glTF) |
| **Mesh hair cards** | Planes / strips, UV’d strips | **Exports** as meshes + masked materials |
| **Solid helmet hair** | Sculpted volume | Exports; stylized only |

### Hair card workflow

1. Model **strips** following flow; one material per color/LOD band if needed.
2. **Alpha clip** on base color texture (RGB = color, A = mask).
3. **Double-sided** geometry or `side: DoubleSide` in Three.js after load.
4. **Vertex colors** optional for root-darkening (export as vertex color → multiply in engine if enabled).
5. **LOD:** separate meshes or `.gltf` LOD extension; OpenPhilly streams neighbourhood packs by distance—keep hero hair in the main asset, simplify distant LOD manually.

### Avoid

- Thin **alpha blend** shells without sorting strategy (z-fighting in city scenes).
- **Subsurface** on hair (not exported); darken roots in albedo instead.

---

## 6. AgX / ACES tone mapping and skin albedo

OpenPhilly **realcity** renders scene-linear HDR, then applies an **AgX** display transform in the film pass (see comments around `FILM_SHADER` / `AGX_BASE` in `realcity/index.html`). The renderer also sets `ACESFilmicToneMapping` at init, but **`applyFilm()` switches to `AgXToneMapping`** for the main presentation path.

**Implication for texture authoring:**

- Author base colors in **sRGB** (Blender color picker, Substance, etc.), but judge finals on a **Three.js preview** with **AgX + exposure ~1.5–1.7** (night presets add ~+0.25 EV in `FILMP`).
- AgX **compresses bright highlights** and slightly shifts saturation; skin that looks perfect in Blender **Filmic** can read **flat or gray** in AgX if albedo is too dark or too desaturated.
- **Do not** paint skin diffuse above **~0.85 sRGB luminance** except specular hotspots (lips, wetness)—highlights come from lighting, not albedo.
- **Flesh tone targets (sRGB hex, starting points, verify under AgX):**
  - Light: `#E8C4A8` – `#F0D0B8`
  - Medium: `#C8956C` – `#D4A574`
  - Deep: `#6B4428` – `#8B5A3C`
- If the character looks **washed out at night**, slightly **raise albedo value** (+5–8% RGB) or rely on **warm street lamps** (scene is already warm at night: `FILMP.night.k ≈ 6200 K`).

**Workflow:** Export test `.glb` → load in a minimal Three.js viewer with `AgXToneMapping`, `toneMappingExposure = 1.55`, environment map similar to game time-of-day → iterate base color once, not only in Blender viewport.

---

## 7. OpenPhilly night emissive naming (accessories / props)

Landmark glTF packs are post-processed in `rcLandmarkModels()` (`realcity/index.html`). Each mesh material name (strip trailing `.001`) is looked up for a **glow scale `k`**. At night, `emissiveIntensity = lampLevel * k` (with bloom).

### Naming rules

| Pattern | Default `k` | Use |
|---------|-------------|-----|
| Exact name in table `K` | Per entry (e.g. `2.6`) | Landmarks, hero props |
| `*_Win` | `1.15` | Lit windows |
| `*_Glow` | `2.0` | Emissive trim, signs, jewelry LEDs |
| Anything else | `0` (no auto-glow) | Skin, cloth, hair |

**Examples from the live table:**

```text
BHR_Lights, BFB_CableLights, BFB_Aviation, BFB_Lamp, PMA_Lamp
CC_LibGable_Glow, CC_Spire_Glow, CC_ComCrown_Glow, CC_Frost_Glow
LP_Jet_Glow, LP_Lamp_Glow, LP_SaucerGlass_Glow
IH_Clock_Glow, IH_Steeple_Glow, TS_Portico_Glow
```

For a **character pack** (e.g. file `ped.glb` → deployed as `data/ped.wasm` if wired in), name emissive accessory materials:

```text
{PACK}_{Part}_Glow
```

Examples: `PED_Watch_Glow`, `PED_Earring_Glow`, `PED_Phone_Glow`.

Register stronger/weaker night response by adding entries to `K` in `rcLandmarkModels()` (same pattern as landmarks).

### Blender → engine emissive setup

1. **Principled BSDF → Emission Color** (and **Emission Strength** if HDR trim; >1.0 exports `KHR_materials_emissive_strength`).
2. **Emission Texture** optional (`emissiveMap`). On load, if `emissiveMap` exists, the engine sets **`emissive` to white `(1,1,1)`** and uses the map for pattern; **night scale is `k` from the material name**, not Blender emission strength.
3. **Base color** should still describe the **daytime** look; emissive map/color is for night bloom. For glow-only quads (LED), base color **black**, roughness **1.0** (per Blender glTF manual).
4. **`emissiveIntensity` starts at 0** in code and is driven by time-of-day; do not depend on a fixed intensity in the glTF file for OpenPhilly night mode.

Procedural city code also uses `glowMat(color, emissiveHex, k)` for built-in geometry; exported characters should use the **material-name convention** above instead.

---

## 8. Export checklist (Blender → OpenPhilly)

**Scene**

- [ ] Units: meters; character ~1.7 m; apply transforms.
- [ ] Armature + skin weights if animated; only **meshes + armature** export (no empties for logic unless needed).

**Materials**

- [ ] One Principled per slot; textures **PNG/JPEG/WebP**; normal/ORM **Non-Color**.
- [ ] No SSS reliance; skin warmth in **base color** maps.
- [ ] Hair: **mesh cards**, alpha clip, consistent material names.

**Emissive accessories**

- [ ] Material names: `{PACK}_*_Glow` or register in `K`.
- [ ] Test emissive map with white multiplier in Three.js.

**glTF export settings (typical)**

- Format: **glTF Binary (.glb)** for authoring; pipeline may repack to `.wasm` like other landmark data.
- **Include:** meshes, materials, textures, skins, shape keys (if needed).
- **Transform:** +Y up, applied modifiers, **tangents** on.
- **Images:** WebP optional for size; OpenPhilly sets `map.anisotropy = 4` on load.
- **Draco:** optional; city tiles use Draco—match decoder version if enabling.
- **Extensions:** enable only what Three.js r169 loads (emissive strength, clearcoat, transmission for eyes/glass).

**Verify in Three.js**

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.55;

// Load glb, traverse meshes, confirm MeshStandardMaterial maps + normal + emissiveMap
// Night: emissiveIntensity = k * lampLevel (mock lampLevel 0..1)
```

---

## 9. Quick material presets (copy into Principled)

**Skin**

- Base Color: painted map (warm)
- Metallic: 0
- Roughness: 0.45 (map)
- Normal: 0.6 strength

**Cotton shirt**

- Roughness: 0.88
- Metallic: 0

**Hair card**

- Alpha: Clip, 0.5 threshold
- Roughness: 0.55–0.7
- Specular: default
- Double-sided mesh

**LED accessory (OpenPhilly night)**

- Material name: `PED_Item_Glow`
- Base Color: `#111111`
- Emission Color: `#ffaa55` or emissive map
- Roughness: 1.0
- Add `PED_Item_Glow: 1.8` (example) to `K` if default `2.0` is too hot with bloom

---

## 10. References

- [Blender glTF 2.0 exporter — materials](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html#exported-materials)
- [Khronos glTF 2.0 material spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#materials)
- [Three.js `MeshStandardMaterial`](https://threejs.org/docs/#api/en/materials/MeshStandardMaterial)
- OpenPhilly glow hook: `rcLandmarkModels` in `realcity/index.html` (`K`, `kOf`, `GLOW` array, `lampLevel` animation loop)
