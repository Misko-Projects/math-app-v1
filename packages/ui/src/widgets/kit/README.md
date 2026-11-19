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
| `StimulusView.tsx` | One renderer per `StimulusSpec` kind: objects, dots (incl. fingers), ten-frame, rekenrek, number line, number bond, expression (with `renderBlank`), groups, array, base ten, scene. Kinds owned by U04/U05 (clock, coins, fraction, gauge, chart, shape, bar model) draw a neutral card until those issues add their `case`. A picture's accessible name is "Look at the picture", never the quantity asked for. |
| `NumberLineView.tsx` | Fixed-pixel number line (numerals stay 32 px): ticks, an even label stride when crowded, marks, jump arcs; `children(scale)` draws widget overlays with `scale.x(value)`, `scale.value(x)` and `scale.lineY`. `numberLineViewScale(props)` returns the same scale outside the SVG, for HTML controls laid over the line (a draggable flag, a hopping critter). |
| `room.ts` | `useWidgetRoom(rootRef)`: the widget's measured room (`width`, and the height its host gives it or Infinity), for container-relative layouts that keep targets full size (06 §1, §4). |
| `motion.ts` | `flyFrom(el, fromRect, { ms, lift })`: FLIP flight along an arc on the CSS `translate` property (0 ms with reduced motion). Put it on a wrapper, never on a `useDragToTarget` item. |
| `controls.tsx` | `CheckButton` (debounced 400 ms, icon-only in K; `compact`: icon-only and square in any mode, for a short room), `PickCard` and `NumeralTray` (picked = ink ring + check badge; demo highlight = `.ni-invite`), `NumberPadKeys` (3 × 4 with no empty cell: `. 0 ⌫` when decimals are allowed, else a wide 0 and ⌫; or `shape="4x3"` for a short room; keys `--pad-key`, default `--target-big`, digits `--pad-digit`; an invited key's ring is drawn inside it, 12 px clear of its neighbours; desktop digits/Backspace/Enter), `applyPadKey`/`padValue`, and demo helpers `useAlive`, `useDemoPause`. |

Each widget imports its own stylesheet next to its component (`./<format>.css`), so parallel
widget PRs never edit one shared CSS file.
