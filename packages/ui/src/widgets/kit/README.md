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
| `NumberLineView.tsx` | Fixed-pixel number line (numerals stay 32 px): ticks, an even label stride when crowded, marks, jump arcs; `children(scale)` draws widget overlays with `scale.x(value)`, `scale.value(x)` and `scale.lineY`. |
| `controls.tsx` | `CheckButton` (debounced 400 ms, icon-only in K), `PickCard` and `NumeralTray` (picked = ink ring + check badge; demo highlight = `.ni-invite`), `NumberPadKeys` (3 × 4, decimal only when allowed, desktop digits/Backspace/Enter), `applyPadKey`/`padValue`, and demo helpers `useAlive`, `useDemoPause`. |
| `FractionView.tsx`, `fractionShapes.ts` (U05) | The `fraction` stimulus (StimulusView's `fraction` case): a circle, rect, bar (strip) or loaf cut into `parts`, the first `shaded` filled. Parts come from the engine's exact geometry (`fractionPicture`, `guidedLines`), so equal parts are equal to the pixel and unequal ones visibly unequal; filled = sea-deep fill with a solid outline, empty = dashed outline (as the Half-Crab's FractionShell); cuts are two-tone lines. `FracNumeral` writes a/b as stacked ≥ 32 px numerals. The building blocks (`WholeBase`, `FractionParts`, `CutLines`, `shapeFrame`, `pictureGeoms`) are what fraction-cut draws its manipulative with. |
| `FractionEntry.tsx` (U05) | Typing a fraction: two boxes stacked as a fraction and a compact 4 × 3 pad that fits beside a picture in the 906 × 373 area; one box with a decimal point for decimals. Desktop digits, Backspace, ArrowUp/ArrowDown, Enter. |

Each widget imports its own stylesheet next to its component (`./<format>.css`), so parallel
widget PRs never edit one shared CSS file.
