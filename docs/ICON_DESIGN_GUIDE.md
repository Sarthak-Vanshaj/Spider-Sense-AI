# Custom Icon Design Guide — Spider-Sense AI

Use this reference sheet while designing custom icons for the **WebWeave Acrylic HUD** (`#A15555` × `#59629E`).

---

## 1. Where to Save Your Icons

Save all exported icon files in:

```text
static/images/icons/
├── crest.svg     -> Header emblem (Project Beacon) & browser tab favicon
├── scan.svg      -> Scan Threat button
├── goblin.svg    -> Launch Goblin Attack button
├── shield.svg    -> Web Shield toggle button
└── reset.svg     -> Reset Scanner button
```

> **Tip:** Keeping these exact filenames allows drop-in integration without renaming.

---

## 2. Recommended File Format

- **Preferred Format:** **SVG (`.svg`)**
  - Scales cleanly across 4K, Retina, laptop, and mobile screens.
  - Supports dynamic CSS color transitions (hover highlights, armed emerald state, danger crimson state).
- **Fallback Format:** Transparent **PNG (`.png`)** at **`64×64` px** or **`128×128` px** (`@2x`), though PNGs cannot dynamically recolor strokes via CSS `currentColor`.

---

## 3. Artboard & Stroke Specifications

| Property | Button Icons (`scan`, `goblin`, `shield`, `reset`) | Header Crest (`crest.svg`) |
| --- | --- | --- |
| **Artboard / `viewBox`** | `24 × 24` px (`0 0 24 24`) | `40 × 40` px (`0 0 40 40`) |
| **Safe Padding** | `2 px` margin inside artboard (live area `20 × 20`) | `4 px` margin inside artboard (live area `32 × 32`) |
| **Background** | **100% Transparent** (no solid card/box behind icon) | **100% Transparent** |
| **Stroke Weight** | `1.6 px` – `1.8 px` uniform stroke | `1.8 px` stroke + clean geometric fill |
| **Line Caps & Joins** | `round` (`stroke-linecap="round"`, `stroke-linejoin="round"`) | `round` |
| **Color Style** | Single-color monochrome (`#FFFFFF` or `currentColor`) | Single-color monochrome (`#FFFFFF` / `#FBF8FC`) |

---

## 4. Theme Color Palette Reference

Your icons sit on dark see-through acrylic panels over a dual-tone `#A15555` × `#59629E` backdrop. Let CSS handle colors automatically, or use these tokens if designing multi-accent previews:

- **Primary Slate-Blue:** `#59629E` (highlight `#A6AFF0`) — *Neural Scanner / Oracle*
- **Primary Crimson:** `#A15555` (highlight `#DB8383`) — *Goblin Attack / Threat Alert*
- **Armed Defense Emerald:** `#10B981` (highlight `#6EE7B7`) — *Web Shield Active*
- **Text / Default Icon Foreground:** `#F8F6FA`

---

## 5. Export Checklist (Figma / Illustrator / Canva)

- [ ] Remove any background rectangle or frame fill before exporting.
- [ ] Center the icon inside a square `24×24` (or `40×40` for `crest`) frame.
- [ ] Keep geometry clean and minimal (avoid tiny `< 1 px` details that blur at `18×18` button render size).
- [ ] If using **Figma**: Export as **SVG** with *Include "id" attribute* unchecked and *Outline stroke* optional (either clean `<path stroke="currentColor">` or outlined paths).
- [ ] Save into `static/images/icons/` using the exact filenames in Section 1.

---

## 6. Applying Your Icons

Once your files are saved in `static/images/icons/`, let your assistant know — the SVGs will be cleaned to inherit CSS `currentColor` states and wired directly into `templates/index.html` (including the browser tab favicon).
