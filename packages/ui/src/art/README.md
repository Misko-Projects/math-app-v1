# Art kit (`packages/ui/src/art`)

All Number Island art is SVG React components, parameterised by state (05 §11). The Storybook
**Art Gallery** shows every piece; **Art Gallery / Style guide** is the visual version of this file.

## Rules

- **Paint only with the tokens.** Use `paint('sea')` (→ `var(--color-sea)`) and `filled(fill)`;
  never a hex, `rgb()` or a colour outside `PALETTE`. `art.test.ts` enforces it per file. One
  palette drives every piece, and a `data-lighting="sunset"` scene re-tints them all
  (theme.css remaps only the environment colours; ink, pebble, paper and cloud stay put).
- **Outline every fill in its shade** from `OUTLINE_OF` (2–3 px at design size, `STROKE`), with
  rounded joins and caps. One soft highlight (`Highlight`, top-left) and one contact shadow
  (`ContactShadow`). No gradients except the sky and sea washes.
- **Contrast (06 §7):** numerals and controls ≥ 4.5:1, icons, rings and state outlines ≥ 3:1, by
  day *and* at sunset. Add each new meaningful mark/background pair to `core/contrast.ts`;
  `art.test.ts` checks every row in both lightings and the style guide displays them.
- **Never colour alone:** a state differs by shape, outline style (solid/dashed), an icon, lift or
  motion. Check every new state in a CVD story (`CvdCompare` in `gallery/Gallery.tsx`).
- **Motion:** idle loops are CSS, marked `motion-loop` plus an `art-*` class from `art.css` or a
  theme token (`--animate-bob`, `--animate-blink`, `--animate-sway`, `--animate-smoke`,
  `--animate-flutter`, `--animate-shimmer`, `--animate-pulse-soft`). Every loop must stop under
  reduced motion (OS setting and `data-reduced-motion="true"`). Motion (`motion/react`) is for
  one-off effects; Pixi only where many particles animate at once, lazy-loaded.
- **Deterministic:** no `Math.random`; use `seededRandom(hashSeed(...))`, so visual snapshots are
  stable.
- **Decorative by default:** `ArtSvg` is `aria-hidden` unless given a `title`. Children's words
  never live in components (AGENTS.md); titles come from the caller.
- **Originality (05 §1):** original characters and shapes only. Pebblings are shore critters whose
  shell holds pebbles in a 2 × 5 ten-frame, never stacked blocks with faces (Numberblocks) or
  DragonBox Nooms.

## Structure

| Folder | What |
|---|---|
| `core/` | `ArtSvg` root, `paint`/`filled`/`OUTLINE_OF`, `ContactShadow`/`Highlight`, shared types (`BuildingStage`, `BuildingArt`, `ItemArt`), the contrast table |
| `island/` | the island scene: geometry (`plotBox`, `plotCenter`, outlines), sky, layered sea with parallax, land, terrain tiles, plot markers, numbered road stones |
| `buildings/` | `buildingArt`: `building/<id>` → component taking `stage: 'construction' \| 1 \| 2 \| 3` |
| `characters/` | Pip, Glim and the Pebbling generator |
| `decor/`, `materials/` | `decorArt` (`decor/<id>`) and `materialArt` (`material/<id>`) |
| `effects/` | sparkle, confetti, firefly, splash |
| `gallery/` | story-only helpers and sample data (not exported) |

GameData `art` ids (02 §5.8) are `<group>/<id>` and resolve with `buildingArtFor`, `decorArtFor`
and `materialArtFor`; each group's map is keyed by the bare `<id>` (`buildingArt['road-crew']`).
The Numbered Road is a linear board (05 §3): `planRoad` draws every stone of the shown range once,
at its own spot, in order. Where a stone's full extent (`stoneExtent`: rings, lift, flag, shadow)
has room it is a numbered stone; where stones crowd it is an evenly spaced bead, and signposts
carry 1, the tens, the hundreds, the next and the counted stone. Every numeral on the map is one
size (`SIGN_NUMERAL`, about 21 CSS px at the default zoom). `roadShape` fixes each stone's form
from the whole road, so nothing changes form as the road grows. The next stone's tap target
(`data-hit="next"`, ≥ 80 CSS px) is drawn above everything on the island.
Anything that stands on the island is positioned with `plotBox(plot, footprint)` in scene units.
