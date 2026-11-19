# Widget kit

Shared building blocks for the math widgets (U03, used by U04/U05). Widgets import from `../kit`;
workshops never do (they render `WidgetHost`, see `../README.md`). Everything uses the U01 tokens
in `theme.css` and the age-mode sizes (`--target-min` 80 px K / 64 px G1+, `--target-gap` 12 px).
No widget defines its own palette.

| Module | What it gives you |
|---|---|
| `sprites.tsx` | `ObjectSprite` (shell, fish, starfish, crab, leaf, stone, pebble, stick, plank, firefly, counter; unknown ids draw a pebble) in two group tones that differ in lightness as well as hue. `spriteNameKey(id)` → `ui.sprite.<id>` for labels and the spoken name. |
| `layout.ts` | Pure, deterministic layouts in cell units: `objectSetLayout(ObjectSet)` (line, array, circle, scatter from `layoutSeed`, ten-frames, dice tiles, groups on plates, distractors, `sizeVaries`) and `dotsLayout` for `dots` stimuli. Counted objects keep reading order, so object `i` is `obj-<i>`. |
| `ObjectSetView.tsx` | Draws a layout. Static by default (one `img`); pass `renderObject` to turn objects into tap or drag targets, and `cell`/`minCell` to keep them tap-sized. |
| `StimulusView.tsx` | One renderer per `StimulusSpec` kind: objects, dots (incl. fingers), ten-frame, rekenrek, number line, number bond, expression (with `renderBlank`), groups, array, base ten, scene, shape (`ShapeView`), gauge (`GaugeView`). Kinds owned by U04/U05 (clock, coins, fraction, chart, bar model) draw a neutral card until those issues add their `case`. A picture's accessible name is "Look at the picture", never the quantity asked for. |
| `NumberLineView.tsx` | Fixed-pixel number line (numerals stay 32 px): ticks, an even label stride when crowded, marks, jump arcs; `children(scale)` draws widget overlays with `scale.x(value)`, `scale.value(x)` and `scale.lineY`. |
| `controls.tsx` | `CheckButton` (debounced 400 ms, icon-only in K), `PickCard` and `NumeralTray` (picked = ink ring + check badge; demo highlight = `.ni-invite`), `NumberPadKeys` (3 × 4, decimal only when allowed, desktop digits/Backspace/Enter), `applyPadKey`/`padValue`, and demo helpers `useAlive`, `useDemoPause`. |

Each widget imports its own stylesheet next to its component (`./<format>.css`), so parallel
widget PRs never edit one shared CSS file.

U05 (#14) measurement and geometry additions:

| Module | What it gives you |
|---|---|
| `ShapeView.tsx` | `ShapeView` draws a `ShapeCard` exactly (`shapeGeometry`: equal sides and square corners where the kind has them, regular polygons regular, open figures open, solids in oblique view with hidden edges dashed); `rotationDeg` and `scale` applied, with one `extent` per set so sizes compare truly; attribute marks (sides, corners, square corners, equal-side hash marks). `ShapeSetView` is the `shape` stimulus. |
| `GaugeView.tsx` | The `gauge` stimulus: a kitchen-scale dial, a beaker or a thermometer that reads exactly `value`, ticks every `ticksEvery`, numerals (≥ 32 px) every `labelsEvery`, thinned by an even stride when crowded. |
| `LengthViews.tsx` | `LengthObject` (rope, ribbon, plank, log, vine), `UnitPiece` (cube 1, shell 2, stick 4) and `StringPiece`, each exactly its px length; a `Ruler` at a fixed px per unit with ≥ 32 px numerals. |
| `NumberEntry.tsx` | Answer boxes plus the number pad; `compact` puts the boxes beside a 6 × 2 (`wide`) or 3 × 4 (`tall`) pad for the smallest landscape area. |
| `sprites-measure.tsx`, `SceneAnchors.tsx` | Object sprites for the measurement and geometry items (merged into `ObjectSprite`), and the position-word scene anchors drawn to their `ANCHOR_SIZE` boxes. |
| `useAvailableSize.ts`, `useFlip.ts` | The widget area's size (to pick a compact layout), and a FLIP glide for items that move between containers. |
