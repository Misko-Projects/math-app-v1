import {
  formatModel,
  type GridCell,
  type PuzzleGridState,
  type PuzzleMark,
  type PuzzleValue,
  puzzleBlanks,
  puzzleUnmet,
  rectanglePairs,
  TRIANGLE_CELLS,
} from '@number-island/engine';
import { FORMAT_SUPPORT, type NarrationKey, type WidgetAction } from '@number-island/shared';
import { type CSSProperties, type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useNarrationText, useSpeech, useUiPreferences } from '../../preferences/UiProvider';
import { useWidgetDemo } from '../demo';
import {
  COMPACT_ROOM_H,
  roomBox,
  StepActions,
  useActionSize,
  useAlive,
  useDemoPause,
  useInviteHand,
  useModelState,
  useSmallestRoom,
  useSubmitGuard,
  useWidgetRoom,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import { ClearArt, LookArt, PieceArt } from './art';
import {
  type Box,
  CAGE_PAD,
  cageLabelPx,
  cellKey,
  GAP,
  numeralPx,
  OUTLINE_PAD,
  planPuzzle,
} from './layout';
import './puzzle-grid.css';

/**
 * `puzzle-grid` (03 §5.5): a small grid puzzle, its tray and Check, on one screen fitted to the
 * widget's room (06 §1).
 *
 * One way to work for every variant: one empty box is the current one (the first, or the one
 * touched); a card of the tray goes into it, and the next empty box becomes current. A filled box
 * is changed by touching it and then another card, and emptied with the tray's last card.
 * Keyboard: Tab or the arrow keys move between boxes, Enter or Space makes one current, a digit
 * that is on the tray goes in, Backspace empties; the cards are buttons too.
 *
 * - **number-path**: the path runs box to box along a track with arrows.
 * - **sum-triangle**: three corners and three middles on the triangle's sides.
 * - **all-ways**: a card for each way, two boxes with a plus between them.
 * - **shape-fill**: the outline's boxes; a square covers one, a rectangle the box and a
 *   neighbour (two rectangle boxes side by side are drawn as one piece; one alone is half a
 *   piece, dashed).
 * - **cage-sum** (mini-KenKen, 3 × 3 and 4 × 4): cages drawn round their boxes, each with its
 *   sum and a plus in its first box.
 * - **magic-square**, **missing-digit**: the sum of each line printed at its end.
 *
 * Every box says where it is (its row and place, or a sum triangle's corner or side) to a
 * screen reader, after what it holds.
 *
 * The widget never judges: Check sends the grid. After a Check that leaves a rule unmet, the
 * boxes of that rule (the row, column, cage, line, step or pieces) are marked at the grid until
 * the child changes a box; the rule is read from the config, which `answerIssues` holds equal to
 * the checker's target. A card whose number or piece is used up (`use-each`) is drawn spent.
 *
 * Trace targets: `cell-<r>-<c>` (a box touched), `card-<value>` (a card put in the current box),
 * `clear` (the current box emptied).
 *
 * Demo ops (03 §5.5): `fill {r, c, value}`, `check-line {index}`, `highlight-cage {id}`, plus
 * `answer {values}` (the blanks in reading order, one by one).
 */

type Config = ConfigFor<'puzzle-grid'>;
type State = PuzzleGridState;

const OPS: readonly string[] = [...FORMAT_SUPPORT['puzzle-grid'].ops, 'answer'];

function stateModel() {
  const m = formatModel('puzzle-grid');
  if (!m) throw new Error('puzzle-grid has no state model');
  return m;
}
const model = stateModel();
const initial = (c: Config) => model.initialState(c) as State;
const applyAction = (s: State, a: WidgetAction) => model.apply(s, a) as State;

// Motion (03 §6.3): a demo shows the card it takes, then the box with the card in it.
const PICK_MS = 500;
const PLACE_MS = 320;
const SHOW_MS = 900;

const PIECE_NAME: Record<string, NarrationKey> = {
  square: 'shape.square.one',
  rectangle: 'shape.rectangle.one',
};
/** What the status line says about the marked boxes (also what a screen reader hears). */
const LOOK: Record<PuzzleMark['kind'], NarrationKey> = {
  row: 'ui.widget.pz.look.row',
  col: 'ui.widget.pz.look.col',
  cage: 'ui.widget.pz.look.cage',
  line: 'ui.widget.pz.look.line',
  step: 'ui.widget.pz.look.step',
  ways: 'ui.widget.pz.look.ways',
  pieces: 'ui.widget.pz.look.pieces',
  pairs: 'ui.widget.pz.look.pairs',
};

/** The six boxes of a sum triangle, in `TRIANGLE_CELLS` order, and its sides in `line-sum` order. */
const TRIANGLE_SPOT: readonly NarrationKey[] = [
  'ui.widget.pz.spot.top',
  'ui.widget.pz.spot.left-middle',
  'ui.widget.pz.spot.right-middle',
  'ui.widget.pz.spot.left',
  'ui.widget.pz.spot.bottom-middle',
  'ui.widget.pz.spot.right',
];
const TRIANGLE_SIDE_LOOK: readonly NarrationKey[] = [
  'ui.widget.pz.look.side.left',
  'ui.widget.pz.look.side.right',
  'ui.widget.pz.look.side.bottom',
];

const cls = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const keyOf = ([r, c]: GridCell) => cellKey(r, c);

export function PuzzleGridWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const prefs = useUiPreferences();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();
  const ageMode = prefs.ageMode;
  const shapes = config.variant === 'shape-fill';

  const { state, stateRef, act, applyOp, committed } = useModelState<State>(
    () => initial(config),
    applyAction,
  );
  const blanks = useMemo(() => puzzleBlanks(config), [config]);
  const isBlank = (r: number, c: number) => blanks.some((b) => b.r === r && b.c === c);
  const valueAt = (s: State, r: number, c: number): PuzzleValue => s.fill[r]?.[c] ?? '';

  /** The current box: where the next card goes. */
  const [cursor, setCursor] = useState<GridCell | null>(() => {
    const first = blanks[0];
    return first ? [first.r, first.c] : null;
  });
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const moveCursor = (to: GridCell | null) => {
    cursorRef.current = to;
    setCursor(to);
  };
  const [mark, setMark] = useState<PuzzleMark | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardLit, setCardLit] = useState<PuzzleValue | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const interactive = !disabled && !busy;

  // ---------- layout: the measured room, the Check button, the plan ----------

  // Planned for the smallest room the item has had (kit `useSmallestRoom`): a prompt that wraps
  // or a hint line makes the room shorter, and nothing changes places when it grows back.
  const room = useSmallestRoom(useWidgetRoom(rootRef), rootRef);
  const whole = roomBox(room);
  const actRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const button = useActionSize(actRef, zoomRef, ageMode);
  const plan = useMemo(
    () => planPuzzle({ config, room: { w: whole.w, h: whole.h }, button, ageMode }),
    [config, whole.w, whole.h, button, ageMode],
  );
  const { geometry, cell } = plan;
  const boxOf = (r: number, c: number) => geometry.cells[cellKey(r, c)] as Box;

  // ---------- what is lit, marked and spent ----------

  const lineCells = (index: number | null): GridCell[] => {
    const k = index === null ? undefined : config.constraints[index];
    return k?.kind === 'line-sum' ? k.cells.map(([r, c]): GridCell => [r, c]) : [];
  };
  const lit = new Set<string>([
    ...lineCells(state.checkedLine).map(keyOf),
    ...config.cells
      .filter((x) => state.highlightedCage !== null && x.cage === state.highlightedCage)
      .map((x) => cellKey(x.r, x.c)),
  ]);
  const marked = new Set<string>((mark?.cells ?? []).map(keyOf));

  const useEach = config.constraints.find((k) => k.kind === 'use-each');
  /** Whether every one of a tray value is in the grid already (a `use-each` list). */
  const spent = (value: PuzzleValue): boolean => {
    if (useEach?.kind !== 'use-each') return false;
    const have = useEach.values.filter((v) => v === value).length;
    const pool =
      shapes || useEach.values.length === config.cells.length
        ? config.cells
        : config.cells.filter((x) => x.blank);
    const holding = pool.filter((x) => valueAt(state, x.r, x.c) === value).length;
    // A rectangle is one piece on two boxes.
    // Half a rectangle still needs its card: only whole pieces count.
    return Math.floor(holding / (value === 'rectangle' ? 2 : 1)) >= have;
  };

  // ---------- child input ----------

  const speak = (value: PuzzleValue) => {
    if (!prefs.speakOnTap || value === '') return;
    if (typeof value === 'number') sayNumber(value);
    else if (PIECE_NAME[value]) say(PIECE_NAME[value]);
  };
  const childStep = () => {
    setInvite(null);
    setMark(null);
  };
  /** The empty box after `from` in reading order (round to the start), or `from` itself. */
  const nextEmpty = (s: State, from: GridCell): GridCell => {
    const at = blanks.findIndex((b) => b.r === from[0] && b.c === from[1]);
    for (let k = 1; k <= blanks.length; k += 1) {
      const b = blanks[(at + k) % blanks.length];
      if (b && valueAt(s, b.r, b.c) === '') return [b.r, b.c];
    }
    return from;
  };
  const focusCell = ([r, c]: GridCell) =>
    rootRef.current?.querySelector<HTMLElement>(`[data-cue="cell-${r}-${c}"]`)?.focus();

  const onCell = (r: number, c: number) => {
    if (!interactive) return;
    // Touching a box changes nothing in it: the mark stays until a box changes.
    setInvite(null);
    trace('tap', `cell-${r}-${c}`);
    speak(valueAt(stateRef.current, r, c));
    if (isBlank(r, c)) moveCursor([r, c]);
  };
  /** Puts a tray value in the current box; true when it went in. */
  const put = (value: PuzzleValue): boolean => {
    const at = cursorRef.current;
    if (!interactive || !at) return false;
    childStep();
    trace('tap', `card-${value}`);
    speak(value);
    act({ op: 'fill', args: { r: at[0], c: at[1], value } });
    moveCursor(nextEmpty(stateRef.current, at));
    return true;
  };
  const clear = () => {
    const at = cursorRef.current;
    if (!interactive || !at) return;
    childStep();
    trace('undo', 'clear');
    if (prefs.speakOnTap) say('ui.widget.pz.clear');
    act({ op: 'fill', args: { r: at[0], c: at[1], value: '' } });
  };

  /** The arrow keys move between boxes; a digit of the tray goes in; Backspace empties. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!el || !interactive) return;
    const here: GridCell = [Number(el.dataset.r), Number(el.dataset.c)];
    const dir = (
      { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as const
    )[e.key as 'ArrowLeft'];
    if (dir) {
      // The nearest box that way, by where the boxes are drawn.
      const from = centre(boxOf(here[0], here[1]));
      let best: { cell: GridCell; d: number } | null = null;
      for (const x of config.cells) {
        const to = centre(boxOf(x.r, x.c));
        const along = (to.x - from.x) * dir[1] + (to.y - from.y) * dir[0];
        const across = Math.abs((to.x - from.x) * dir[0]) + Math.abs((to.y - from.y) * dir[1]);
        if (along <= 0 || across > along) continue;
        const d = along + across;
        if (!best || d < best.d) best = { cell: [x.r, x.c], d };
      }
      if (best) focusCell(best.cell);
      e.preventDefault();
      return;
    }
    if (!isBlank(here[0], here[1])) return;
    const digit = /^[0-9]$/.test(e.key) ? Number(e.key) : null;
    if (digit !== null && config.palette.includes(digit)) {
      moveCursor(here);
      if (put(digit) && cursorRef.current) focusCell(cursorRef.current);
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      moveCursor(here);
      clear();
      e.preventDefault();
    }
  };

  const ready = blanks.every((b) => valueAt(state, b.r, b.c) !== '');
  const submit = useSubmitGuard(() => {
    if (!interactive) return false;
    const s = stateRef.current;
    const response = model.toResponse(s);
    if (!response) return false;
    // Where to look again, if a rule is not met: shown at the grid, said by nobody here.
    setMark(puzzleUnmet(config, s.fill));
    onResponse(response);
    return true;
  });

  // ---------- demo ----------

  const demoFill = async (r: number, c: number, value: PuzzleValue) => {
    if (!isBlank(r, c)) return;
    moveCursor([r, c]);
    setCardLit(value);
    await pause(PICK_MS);
    if (!alive.current) return;
    await applyOp({ op: 'fill', args: { r, c, value } });
    setCardLit(null);
    await pause(PLACE_MS);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setBusy(true);
      setInvite(null);
      setMark(null);
      try {
        switch (action.op) {
          case 'fill': {
            const r = Number(action.args?.r);
            const c = Number(action.args?.c);
            const value = action.args?.value;
            if (typeof value === 'number' || typeof value === 'string') {
              await demoFill(r, c, value);
            }
            break;
          }
          case 'answer': {
            const values = action.args?.values;
            if (!Array.isArray(values)) break;
            for (const [i, b] of blanks.entries()) {
              const value = values[i];
              if (!alive.current) break;
              if (typeof value === 'number' || typeof value === 'string') {
                await demoFill(b.r, b.c, value);
              }
            }
            break;
          }
          case 'check-line':
          case 'highlight-cage':
            await applyOp(action);
            await pause(SHOW_MS);
            break;
        }
      } finally {
        setCardLit(null);
        if (alive.current) {
          setBusy(false);
          await committed();
        }
      }
    },
    invite: (action) => {
      setMark(null);
      setInvite(action);
    },
  });

  // The one ring: the box a demonstration invites the child to fill.
  const invited = ((): GridCell | null => {
    if (!invite) return null;
    if (invite.op === 'fill') {
      const r = Number(invite.args?.r);
      const c = Number(invite.args?.c);
      return isBlank(r, c) ? [r, c] : null;
    }
    if (invite.op === 'answer') {
      const b = blanks.find((x) => valueAt(state, x.r, x.c) === '');
      return b ? [b.r, b.c] : null;
    }
    return null;
  })();
  const invitedKey = invited ? keyOf(invited) : '';
  const invitedEmpty = invited !== null && valueAt(state, invited[0], invited[1]) === '';
  const { hand: inviteHand, rootStyle: handRootStyle } = useInviteHand(
    rootRef,
    (root) =>
      invited
        ? root.querySelector<HTMLElement>(`[data-cue="cell-${invited[0]}-${invited[1]}"]`)
        : null,
    invited ? `${invitedKey}:${invitedEmpty}:${cell}:${plan.arrangement}` : '',
    // Inside an empty box, pointing into it; a filled one gets the hand beside it.
    invitedEmpty ? 'inside' : undefined,
  );

  // ---------- the drawing under the boxes ----------

  const cageOf = (id: string) => config.cells.filter((x) => x.cage === id);
  const cageIds = [...new Set(config.cells.flatMap((x) => (x.cage ? [x.cage] : [])))];
  /** A cage's shape: each of its boxes grown by `grow`, and a bridge to each neighbour. */
  const cageRects = (id: string, grow: number): Box[] => {
    const cells = cageOf(id);
    const out: Box[] = [];
    for (const x of cells) {
      const b = boxOf(x.r, x.c);
      out.push({ x: b.x - grow, y: b.y - grow, w: b.w + 2 * grow, h: b.h + 2 * grow });
      if (cells.some((y) => y.r === x.r && y.c === x.c + 1)) {
        out.push({ x: b.x + b.w - grow, y: b.y - grow, w: GAP + 2 * grow, h: b.h + 2 * grow });
      }
      if (cells.some((y) => y.r === x.r + 1 && y.c === x.c)) {
        out.push({ x: b.x - grow, y: b.y + b.h - grow, w: b.w + 2 * grow, h: GAP + 2 * grow });
      }
    }
    return out;
  };
  const rect = (b: Box, key: string, className: string, rx = 14) => (
    <rect key={key} className={className} x={b.x} y={b.y} width={b.w} height={b.h} rx={rx} />
  );

  const under = (() => {
    switch (config.variant) {
      case 'number-path': {
        const points = config.cells.map((x) => centre(boxOf(x.r, x.c)));
        return (
          <>
            <polyline
              className="ni-pz__track"
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              strokeWidth={Math.round(cell * 0.34)}
            />
            {points.slice(1).map((p, i) => {
              const from = points[i] as { x: number; y: number };
              const angle = (Math.atan2(p.y - from.y, p.x - from.x) * 180) / Math.PI;
              const key = `${i}`;
              return (
                <path
                  key={key}
                  className="ni-pz__arrow"
                  d="M-5 -7 6 0 -5 7Z"
                  transform={`translate(${(from.x + p.x) / 2} ${(from.y + p.y) / 2}) rotate(${angle})`}
                />
              );
            })}
          </>
        );
      }
      case 'sum-triangle':
        return config.constraints.map((k, i) => {
          if (k.kind !== 'line-sum') return null;
          const a = centre(boxOf(...(k.cells[0] as [number, number])));
          const b = centre(boxOf(...(k.cells[k.cells.length - 1] as [number, number])));
          const key = `side-${i}`;
          return (
            <line
              key={key}
              className="ni-pz__side-line"
              data-lit={state.checkedLine === i ? 'true' : undefined}
              data-marked={mark?.kind === 'line' && mark.constraint === i ? 'true' : undefined}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        });
      case 'all-ways':
        return geometry.ways.map((w, i) => rect(w, `way-${i}`, 'ni-pz__way', 20));
      case 'cage-sum':
        return cageIds.map((id) => (
          <g
            key={id}
            className="ni-pz__cage-shape"
            data-lit={state.highlightedCage === id ? 'true' : undefined}
          >
            {cageRects(id, CAGE_PAD).map((b, i) => rect(b, `o${i}`, 'ni-pz__cage-edge', 16))}
            {cageRects(id, 2).map((b, i) => rect(b, `f${i}`, 'ni-pz__cage-fill', 14))}
          </g>
        ));
      case 'shape-fill': {
        const holding = (piece: string) =>
          config.cells
            .filter((x) => valueAt(state, x.r, x.c) === piece)
            .map((x): GridCell => [x.r, x.c]);
        const { pairs, alone } = rectanglePairs(holding('rectangle'));
        const span = (a: Box, b: Box): Box => ({
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
          h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
        });
        // The outline's ink edge is 3 px more: together the layout's OUTLINE_PAD.
        const GROW = OUTLINE_PAD - 3;
        const outline = [
          ...config.cells.map((x) => boxOf(x.r, x.c)),
          ...config.cells.flatMap((x) => {
            const b = boxOf(x.r, x.c);
            const right = geometry.cells[cellKey(x.r, x.c + 1)];
            const down = geometry.cells[cellKey(x.r + 1, x.c)];
            return [...(right ? [span(b, right)] : []), ...(down ? [span(b, down)] : [])];
          }),
        ].map((b): Box => ({ x: b.x - GROW, y: b.y - GROW, w: b.w + 2 * GROW, h: b.h + 2 * GROW }));
        return (
          <>
            {outline.map((b, i) => rect(b, `e${i}`, 'ni-pz__outline-edge', 18))}
            {outline.map((b, i) => rect(b, `o${i}`, 'ni-pz__outline', 18))}
            {holding('square').map(([r, c]) =>
              rect(boxOf(r, c), `s${r}-${c}`, 'ni-pz__piece ni-pz__piece--square'),
            )}
            {pairs.map(([a, b]) =>
              rect(
                span(boxOf(a[0], a[1]), boxOf(b[0], b[1])),
                `r${a[0]}-${a[1]}`,
                'ni-pz__piece ni-pz__piece--rectangle',
              ),
            )}
            {alone.map(([r, c]) =>
              rect(boxOf(r, c), `h${r}-${c}`, 'ni-pz__piece ni-pz__piece--half'),
            )}
          </>
        );
      }
      default:
        return null;
    }
  })();

  // ---------- render ----------

  /**
   * Where a box is, in words, for a child who cannot see the picture: a sum triangle's corner or
   * the side it is the middle of (a corner is on two sides), else its row and its place in it.
   */
  const placeOf = (r: number, c: number): string => {
    if (config.variant === 'sum-triangle') {
      const spot = TRIANGLE_CELLS.findIndex(([tr, tc]) => tr === r && tc === c);
      const key = TRIANGLE_SPOT[spot];
      if (key) return t(key);
    }
    return t('ui.widget.pz.at', { r: r + 1, c: c + 1 });
  };
  /** The status line of a mark: a sum triangle's side by its name, else by the kind of rule. */
  const lookKey = (m: PuzzleMark): NarrationKey => {
    const side = m.constraint === undefined ? undefined : TRIANGLE_SIDE_LOOK[m.constraint];
    return config.variant === 'sum-triangle' && m.kind === 'line' && side ? side : LOOK[m.kind];
  };

  const numeral = numeralPx(cell);
  const cageSum = (id: string) => {
    const k = config.constraints.find((x) => x.kind === 'cage-sum' && x.cage === id);
    return k?.kind === 'cage-sum' ? k.sum : undefined;
  };
  /** The first box of each cage (reading order) carries its label. */
  const labelled = new Map(
    cageIds.map((id) => {
      const first = [...cageOf(id)].sort((a, b) => a.r - b.r || a.c - b.c)[0];
      return [first ? cellKey(first.r, first.c) : '', id] as const;
    }),
  );

  const cells = config.cells.map((x) => {
    const key = cellKey(x.r, x.c);
    const b = boxOf(x.r, x.c);
    const value = valueAt(state, x.r, x.c);
    const blank = x.blank === true;
    const current = blank && cursor !== null && keyOf(cursor) === key;
    const cage = labelled.get(key);
    const sum = cage === undefined ? undefined : cageSum(cage);
    const label = sum === undefined ? '' : cageOf(cage as string).length > 1 ? `${sum}+` : `${sum}`;
    const piece = typeof value === 'string' && value !== '' ? PIECE_NAME[value] : undefined;
    // The box's name is what it shows: the cage's label, then its number, or these words.
    // Every box names its cage by the cage's first box and its number: the outline is a picture a
    // screen reader skips, and two cages can make the same number.
    const inCage = x.cage === undefined ? undefined : cageSum(x.cage);
    const head =
      x.cage === undefined
        ? undefined
        : [...cageOf(x.cage)].sort((a, b) => a.r - b.r || a.c - b.c)[0];
    const words = [
      ...(value === '' ? [t('ui.widget.pz.empty')] : piece ? [t(piece)] : []),
      placeOf(x.r, x.c),
      ...(inCage === undefined || head === undefined
        ? []
        : [t('ui.widget.pz.in-cage', { r: head.r + 1, c: head.c + 1, sum: inCage })]),
    ].join(', ');
    return (
      <button
        key={key}
        type="button"
        className={cls('ni-pz__cell', invitedKey === key && 'ni-invite')}
        data-cue={`cell-${x.r}-${x.c}`}
        data-r={x.r}
        data-c={x.c}
        data-kind={blank ? (value === '' ? 'empty' : 'filled') : 'given'}
        data-current={current ? 'true' : undefined}
        data-lit={lit.has(key) ? 'true' : undefined}
        data-marked={marked.has(key) ? 'true' : undefined}
        data-labelled={label ? 'true' : undefined}
        aria-pressed={blank ? current : undefined}
        disabled={!interactive}
        style={{ left: b.x, top: b.y, width: b.w, height: b.h, fontSize: numeral }}
        onClick={() => onCell(x.r, x.c)}
      >
        {label ? (
          <span className="ni-pz__cage-label" style={{ fontSize: cageLabelPx(cell) }}>
            {label}
          </span>
        ) : null}
        {label ? ' ' : null}
        {typeof value === 'number' ? <span className="ni-pz__numeral">{value}</span> : null}
        <span className="ni-visually-hidden">{words}</span>
      </button>
    );
  });

  const firstMarked = mark?.cells[0];
  const markBox = firstMarked ? boxOf(firstMarked[0], firstMarked[1]) : null;

  const puzzle = (
    // biome-ignore lint/a11y/useSemanticElements: the boxes are placed by the layout; a fieldset brings its own box model
    <div
      className="ni-pz__puzzle"
      role="group"
      aria-label={t('ui.widget.pz.puzzle')}
      style={{ width: geometry.w, height: geometry.h }}
      onKeyDown={onKeyDown}
    >
      <svg
        className="ni-pz__under"
        width={geometry.w}
        height={geometry.h}
        viewBox={`0 0 ${geometry.w} ${geometry.h}`}
        aria-hidden="true"
        focusable="false"
      >
        {under}
      </svg>
      {geometry.signs.map((s, i) => {
        const key = `sign-${i}`;
        return (
          <span
            key={key}
            className="ni-pz__sign"
            aria-hidden="true"
            style={{ left: s.x, top: s.y, width: s.w, height: s.h, fontSize: numeral }}
          >
            +
          </span>
        );
      })}
      {cells}
      {geometry.tags.map((tag) => (
        <span
          key={tag.constraint}
          className="ni-pz__tag"
          role="img"
          aria-label={`${t('ui.widget.pz.line')} ${tag.sum}`}
          data-line={tag.line.kind}
          data-lit={state.checkedLine === tag.constraint ? 'true' : undefined}
          data-marked={
            mark?.kind === 'line' && mark.constraint === tag.constraint ? 'true' : undefined
          }
          style={{ left: tag.x, top: tag.y, width: tag.w, height: tag.h }}
        >
          {tag.sum}
        </span>
      ))}
      {markBox ? (
        <span
          className="ni-pz__look"
          aria-hidden="true"
          style={{ left: markBox.x + markBox.w - 16, top: markBox.y - 8 }}
        >
          <LookArt />
        </span>
      ) : null}
    </div>
  );

  const tray = (
    <fieldset
      className="ni-pz__tray"
      aria-label={t(shapes ? 'ui.widget.pz.pieces' : 'ui.widget.numbers')}
      disabled={!interactive}
      style={
        {
          width: plan.tray.w,
          gridTemplateColumns: `repeat(${plan.trayCols}, ${cell}px)`,
          gridAutoRows: `${cell}px`,
          fontSize: numeral,
        } as CSSProperties
      }
    >
      {config.palette.map((value) => {
        const piece = typeof value === 'string' ? PIECE_NAME[value] : undefined;
        return (
          <button
            key={value}
            type="button"
            className={cls('ni-pz__card', cardLit === value && 'ni-pz__card--lit')}
            data-cue={`card-${value}`}
            data-spent={spent(value) ? 'true' : undefined}
            aria-label={piece ? t(piece) : String(value)}
            onClick={() => put(value)}
          >
            {typeof value === 'number' ? (
              <span className="ni-pz__numeral">{value}</span>
            ) : (
              <PieceArt kind={value} />
            )}
          </button>
        );
      })}
      <button
        type="button"
        className="ni-pz__card ni-pz__card--clear"
        data-cue="clear"
        aria-label={t('ui.widget.pz.clear')}
        onClick={clear}
      >
        <ClearArt />
      </button>
    </fieldset>
  );

  return (
    <div
      ref={rootRef}
      className="ni-pz"
      data-variant={config.variant}
      data-tier={tier}
      data-arrangement={plan.arrangement}
      data-cell={cell}
      data-disabled={disabled ? 'true' : undefined}
      data-fits={plan.fits ? undefined : 'false'}
      style={handRootStyle}
    >
      <div className="ni-pz__parts">
        {puzzle}
        <div className="ni-pz__answer">
          {tray}
          <StepActions
            actRef={actRef}
            step="ask"
            back={false}
            interactive={interactive}
            ready={ready}
            onStep={() => {}}
            onCheck={submit}
            compact={whole.h < COMPACT_ROOM_H}
          />
        </div>
      </div>
      {/* Which boxes to look at again, in words (the mark at the grid is a picture). */}
      <p className="ni-visually-hidden" role="status">
        {mark ? t(lookKey(mark)) : ''}
      </p>
      {inviteHand}
    </div>
  );
}

export default PuzzleGridWidget;
