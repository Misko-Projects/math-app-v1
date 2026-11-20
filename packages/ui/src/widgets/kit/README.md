# Widget kit

Shared building blocks for the math widgets (U03, used by U04/U05). Widgets import from `../kit`;
workshops never do (they render `WidgetHost`, see `../README.md`). Everything uses the U01 tokens
in `theme.css` and the age-mode sizes (`--target-min` 80 px K / 64 px G1+, `--target-gap` 12 px).
No widget defines its own palette.

| Module | What it gives you |
|---|---|
| `sprites.tsx` | `ObjectSprite` (shell, fish, starfish, crab, leaf, stone, pebble, stick, plank, firefly, counter; unknown ids draw a pebble) in two group tones that differ in lightness as well as hue (a colour-b counter also carries an ink ring, so the two colours differ by a mark). `spriteNameKey(id)` → `ui.sprite.<id>` for labels and the spoken name. |
| `layout.ts` | Pure, deterministic layouts in cell units: `objectSetLayout(ObjectSet)` (line, array, circle, scatter from `layoutSeed`, ten-frames, dice tiles, groups on plates, distractors, `sizeVaries`) and `dotsLayout` for `dots` stimuli. Counted objects keep reading order, so object `i` is `obj-<i>`. |
| `ObjectSetView.tsx` | Draws a layout. Static by default (one `img`); pass `renderObject` to turn objects into tap or drag targets, and `cell`/`minCell` to keep them tap-sized. |
| `StimulusView.tsx` | One renderer per `StimulusSpec` kind: objects, dots (incl. fingers), ten-frame, rekenrek, number line, number bond, expression (with `renderBlank`), groups, array, base ten, scene. Kinds owned by U04/U05 (clock, coins, fraction, gauge, chart, shape, bar model) draw a neutral card until those issues add their `case`. A picture's accessible name is "Look at the picture", never the quantity asked for. |
| `NumberLineView.tsx` | Fixed-pixel number line (numerals stay 32 px): ticks, an even label stride when crowded, marks, jump arcs; `children(scale)` draws widget overlays with `scale.x(value)`, `scale.value(x)` and `scale.lineY`. |
| `FitPicture.tsx` | `FitPicture`: a stimulus fitted to a measured box (cards, compare sides): countable pictures re-flow their cell (`countLayout`, `cellToFit`; a double ten-frame may stack), fixed-pixel ones (number line, base ten, expressions) are drawn at their size and scaled down as a whole (`Scaled`). `naturalPictureSize` gives the aspect a layout plans with. |
| `room.ts` | `useWidgetRoom(rootRef)`: the widget's measured room (`width`, and the height its host gives it or Infinity), for container-relative layouts that keep targets full size (06 §1, §4). |
| `controls.tsx` | `CheckButton` (debounced 400 ms, icon-only in K), `PickCard` and `NumeralTray` (picked = ink ring + check badge; demo highlight = `.ni-invite`), `NumberPadKeys` (3 × 4 with no empty cell: `. 0 ⌫` when decimals are allowed, else a wide 0 and ⌫; desktop digits/Backspace/Enter), `applyPadKey`/`padValue`, and demo helpers `useAlive`, `useDemoPause`. |
| `NumberEntry.tsx` | `NumberEntry`: the numeral answer that follows a manipulative (tenframe-fill and rekenrek `thenAsk` or `read`, number-bond blanks), on main's controls: a `NumeralTray` 0…max (max ≤ 20) in the `columns` the widget's layout chose (trayGrid rows), else `NumberPadKeys` with the entered number shown large (`compact` keys at --target-min for short areas, the number above or beside them). The widget renders its own Check. `entrySize`, `entryChoices`/`entryGroups` (tray widths first, then the pad) and `nextPadKey` for layouts and demos. A card's or key's invite ring sits inside it, 12 px clear of its neighbours. Traces `opt-<n>` / `key-<k>`. |
| `arrange.ts` | Pure layout arithmetic for a picture plus items: `arrangedSize(row / side / stack / column / split, main, items, gap)`, `overflow`, `firstFit`, `numeralTraySize`, `trayColumnChoices`. Widgets compute each candidate layout's size from the measured room and keep the first that fits. |
| `commit.ts` | `useCommitBarrier()`: `await committed()` at the end of a demo `play`, so it resolves only after React committed the op's last state change (#85). |
| `flight.tsx` | `useFlight(rootRef)`: demo-mode flights. `fly(fromRect, toRect, node)` glides a copy inside the widget root and resolves when it lands (at once with reduced motion); render `layer` in the root. |

Each widget imports its own stylesheet next to its component (`./<format>.css`), so parallel
widget PRs never edit one shared CSS file.
