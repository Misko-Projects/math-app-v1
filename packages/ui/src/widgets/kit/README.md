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
| `StimulusView.tsx` | One renderer per `StimulusSpec` kind: objects, dots (incl. fingers), ten-frame, rekenrek, number line, number bond, expression (with `renderBlank`), groups, array, base ten, scene. `chart` draws `ChartView` (U05). Kinds owned by U04/U05 (clock, coins, fraction, gauge, shape, bar model) draw a neutral card until those issues add their `case`. A picture's accessible name is "Look at the picture", never the quantity asked for. |
| `NumberLineView.tsx` | Fixed-pixel number line (numerals stay 32 px): ticks, an even label stride when crowded, marks, jump arcs; `children(scale)` draws widget overlays with `scale.x(value)`, `scale.value(x)` and `scale.lineY`. |
| `ChartView.tsx`, `chartLayout.ts` | U05 (#14): the `chart` stimulus and the bar-graph widgets' chart. Picture graphs (a key and half symbols at scale 2+), bar graphs either way, tally charts (fives with a gate), tables, line plots, from pure geometry (`chartGeometry`, unit-tested: bars end on their values, exact symbol counts). `values` draws a build, `renderLabel` makes category buttons, `renderOverlay` adds drop targets. `useMeasuredBox` sizes it to its cell. |
| `Stepper.tsx` | U05 (#14): one more / one less around a large number (counts aloud). The K number answer where a 3 × 4 pad cannot fit the 960 × 600 widget area, and the tile builder of growing patterns. |
| `controls.tsx` | `CheckButton` (debounced 400 ms, icon-only in K), `PickCard` and `NumeralTray` (picked = ink ring + check badge; demo highlight = `.ni-invite`), `NumberPadKeys` (3 × 4, decimal only when allowed, desktop digits/Backspace/Enter), `applyPadKey`/`padValue`, and demo helpers `useAlive`, `useDemoPause`. |

Each widget imports its own stylesheet next to its component (`./<format>.css`), so parallel
widget PRs never edit one shared CSS file.
