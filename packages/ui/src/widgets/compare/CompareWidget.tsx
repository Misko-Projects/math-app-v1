import { formatModel } from '@number-island/engine';
import type { StimulusSpec, WidgetAction } from '@number-island/shared';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useInteractionTrace } from '../../interaction/trace';
import { useDragToTarget } from '../../interaction/useDragToTarget';
import {
  useNarrationText,
  useReducedMotion,
  useSpeech,
  useUiPreferences,
} from '../../preferences/UiProvider';
import { CheckIcon, CloseIcon, HandPointerIcon } from '../../primitives/icons';
import { MIN_TARGET_PX } from '../../tokens/tokens';
import { useWidgetDemo, wait } from '../demo';
import {
  CheckButton,
  dotsLayout,
  fitCell,
  ObjectSetView,
  ObjectSprite,
  objectSetLayout,
  PickCard,
  StimulusView,
  spriteNameKey,
  useAlive,
  useDemoPause,
  useSubmitGuard,
} from '../kit';
import type { ConfigFor, WidgetProps } from '../types';
import './compare.css';

/**
 * `compare` (03 §5.5): two sides, each any `StimulusSpec` (objects, dots, ten-frames, numerals,
 * number lines…), framed side by side, and one question:
 *
 * - **more / fewer / longer / heavier**: tap the side (`left` | `right`) or "the same" (`same`);
 * - **same-or-not**: "the same" (=) or "not the same" (≠) (`same` | `not-same`);
 * - **symbol**: tap `<`, `=` or `>` (or drag it into the gap between the sides; keyboard works);
 *   the chosen symbol shows between the sides;
 * - **true-false**: yes (check) or no (cross) (`true` | `false`); a plain statement with no
 *   relation of its own reads "left = right".
 *
 * With `allowMatchLines` on the concrete tier (objects on both sides) the two sets show as rows
 * and the child may pair objects: tap one in the top row, then one in the bottom row, and a line
 * joins them (trace `tap` `left-obj-<i>` / `right-obj-<i>`, then `move` `match-<l>-<r>`). Matches
 * are help, never the answer. "Check" sends `{ kind: 'choice', id }` through the format model.
 * Selection is an ink ring plus a check badge, never colour alone (06 §7).
 *
 * Demo ops (03 §5.5): `match {left, right}`, `highlight {side}`, `place-symbol {symbol}`, plus
 * `answer {id}`.
 */

const OPS = ['match', 'highlight', 'place-symbol', 'answer'] as const;
const FLY_MS = 520;

type Config = ConfigFor<'compare'>;
type Side = 'left' | 'right';
type Symbol = '<' | '=' | '>';
type Match = [number, number];

const SIDE_ASKS = new Set<Config['ask']>(['more', 'fewer', 'longer', 'heavier']);
const SYMBOLS: readonly Symbol[] = ['<', '=', '>'];
const SYMBOL_KEY: Record<Symbol, string> = {
  '<': 'ui.compare.less',
  '=': 'ui.compare.equal',
  '>': 'ui.compare.greater',
};

type GlyphKind = 'eq' | 'ne' | 'lt' | 'gt' | 'yes' | 'no' | 'pointer';
const SYMBOL_GLYPH: Record<Symbol, GlyphKind> = { '<': 'lt', '=': 'eq', '>': 'gt' };

/** A pick control below the sides: its answer id, narration key and glyph. */
interface Choice {
  id: string;
  label: string;
  glyph: GlyphKind;
}

function choicesFor(ask: Config['ask']): Choice[] {
  switch (ask) {
    case 'same-or-not':
      return [
        { id: 'same', label: 'ui.compare.same', glyph: 'eq' },
        { id: 'not-same', label: 'ui.compare.not-same', glyph: 'ne' },
      ];
    case 'true-false':
      return [
        { id: 'true', label: 'ui.compare.yes', glyph: 'yes' },
        { id: 'false', label: 'ui.compare.no', glyph: 'no' },
      ];
    case 'symbol':
      return [];
    default:
      return [{ id: 'same', label: 'ui.compare.same', glyph: 'eq' }];
  }
}

/** Chunky relation glyphs (ink strokes on light cards, ≥ 3:1). */
function Glyph({ kind }: { kind: GlyphKind }) {
  if (kind === 'yes') return <CheckIcon />;
  if (kind === 'no') return <CloseIcon />;
  const ink = 'var(--color-ink)';
  const paths: Record<Exclude<GlyphKind, 'yes' | 'no'>, ReactNode> = {
    eq: <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />,
    ne: (
      <>
        <path d="M10 18h28M10 30h28" stroke={ink} strokeWidth="6" />
        <path d="M31 8 17 40" stroke={ink} strokeWidth="5" />
      </>
    ),
    lt: <path d="M36 10 12 24l24 14" stroke={ink} strokeWidth="6" />,
    gt: <path d="m12 10 24 14-24 14" stroke={ink} strokeWidth="6" />,
    pointer: (
      <path
        d="M14 8v32l24-16L14 8Z"
        fill="var(--color-sunshine)"
        stroke={ink}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    ),
  };
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="ni-cmp__glyph-svg"
      data-glyph={kind}
    >
      {paths[kind]}
    </svg>
  );
}

/** The single number a side shows as a numeral (spoken on tap), or null. */
function sideNumeral(s: StimulusSpec): number | null {
  if (s.kind !== 'expression') return null;
  const [tok, ...rest] = s.expr.tokens;
  return tok?.t === 'num' && rest.length === 0 ? tok.v : null;
}

const hasRelation = (s: StimulusSpec) =>
  s.kind === 'expression' && s.expr.tokens.some((tok) => tok.t === 'rel');

interface Line {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Flight {
  symbol: Symbol;
  from: DOMRect;
  to: DOMRect;
  moving: boolean;
}

export function CompareWidget({
  config,
  tier,
  disabled,
  onResponse,
  onInteract,
  demo,
}: WidgetProps<Config>) {
  const t = useNarrationText();
  const { say, sayNumber } = useSpeech();
  const { speakOnTap, textLabels, ageMode } = useUiPreferences();
  const reduced = useReducedMotion();
  const trace = useInteractionTrace(onInteract);
  const alive = useAlive();
  const pause = useDemoPause();

  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState<{ side: Side; index: number } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [invite, setInvite] = useState<WidgetAction | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  const interactive = !disabled && !demoBusy;
  const ask = config.ask;
  const sidePick = SIDE_ASKS.has(ask);
  const matchMode =
    tier === 'concrete' &&
    config.allowMatchLines &&
    config.left.kind === 'objects' &&
    config.right.kind === 'objects';
  const choices = choicesFor(ask);
  const validIds: string[] =
    ask === 'symbol'
      ? [...SYMBOLS]
      : [...(sidePick ? ['left', 'right'] : []), ...choices.map((c) => c.id)];
  const symbol = ask === 'symbol' && selected !== null ? (selected as Symbol) : null;

  const speakKey = (key: string) => {
    if (speakOnTap) say(key);
  };

  const choose = (id: string, speak?: () => void) => {
    if (!interactive || !validIds.includes(id)) return;
    trace('tap', id);
    speak?.();
    setInvite(null);
    setSelected(id);
  };

  const submit = useSubmitGuard(() => {
    if (!interactive || selected === null) return false;
    const model = formatModel('compare');
    if (!model) return false;
    const state = model.apply(model.initialState(config), {
      op: 'answer',
      args: { id: selected },
    });
    const response = model.toResponse(state);
    if (!response) return false;
    onResponse(response);
    return true;
  });

  // ---------- symbol: tap or drag into the gap ----------

  const placeSymbol = (s: Symbol) => {
    speakKey(SYMBOL_KEY[s]);
    setInvite(null);
    setSelected(s);
  };
  const dndRef = useRef<{ select: (item: Symbol | null) => void } | null>(null);
  const dnd = useDragToTarget<Symbol, 'gap'>({
    disabled: !interactive || ask !== 'symbol',
    trace,
    // A tap on a symbol places it straight away (one tap for pre-readers); a drag drops it.
    onSelect: (item) => {
      if (item === null) return;
      placeSymbol(item);
      dndRef.current?.select(null);
    },
    onPlace: ({ item }) => placeSymbol(item),
  });
  dndRef.current = dnd;

  // ---------- match lines ----------

  const leftSet = config.left.kind === 'objects' ? config.left.set : null;
  const rightSet = config.right.kind === 'objects' ? config.right.set : null;

  const addMatch = (l: number, r: number) => {
    setMatches((prev) => [...prev.filter(([x, y]) => x !== l && y !== r), [l, r]]);
  };

  const tapObject = (side: Side, index: number, sprite: string) => {
    if (!interactive) return;
    trace('tap', `${side}-obj-${index}`);
    if (speakOnTap) say(spriteNameKey(sprite));
    setInvite(null);
    if (pending && pending.side !== side) {
      const l = side === 'left' ? index : pending.index;
      const r = side === 'right' ? index : pending.index;
      trace('move', `match-${l}-${r}`);
      addMatch(l, r);
      setPending(null);
    } else if (pending && pending.index === index) {
      setPending(null);
    } else {
      setPending({ side, index });
    }
  };

  // Measure each matched pair's objects and draw a line between them (top row → bottom row).
  const measureLines = useCallback(() => {
    const rows = rowsRef.current;
    if (!rows) return;
    const box = rows.getBoundingClientRect();
    const next: Line[] = [];
    for (const [l, r] of matches) {
      const a = rows.querySelector(`[data-obj="left-obj-${l}"]`)?.getBoundingClientRect();
      const b = rows.querySelector(`[data-obj="right-obj-${r}"]`)?.getBoundingClientRect();
      if (!a || !b) continue;
      next.push({
        key: `${l}-${r}`,
        x1: a.left + a.width / 2 - box.left,
        y1: a.bottom - box.top - 6,
        x2: b.left + b.width / 2 - box.left,
        y2: b.top - box.top + 6,
      });
    }
    setLines(next);
  }, [matches]);

  useLayoutEffect(() => {
    if (!matchMode) return;
    measureLines();
    const rows = rowsRef.current;
    if (!rows || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureLines());
    ro.observe(rows);
    return () => ro.disconnect();
  }, [matchMode, measureLines]);

  // ---------- demo mode (03 §6.3) ----------

  const flyRect = (selector: string) =>
    rootRef.current?.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

  const flySymbol = async (s: Symbol) => {
    const from = flyRect(`[data-symbol="${CSS.escape(s)}"]`);
    const to = flyRect('.ni-cmp__pad');
    if (reduced || !from || !to) return;
    setFlight({ symbol: s, from, to, moving: false });
    await wait(20);
    if (!alive.current) return;
    setFlight({ symbol: s, from, to, moving: true });
    await wait(FLY_MS);
    if (alive.current) setFlight(null);
  };

  useWidgetDemo(demo, {
    ops: OPS,
    play: async (action) => {
      setDemoBusy(true);
      setInvite(null);
      try {
        if (action.op === 'highlight') {
          const side = action.args?.side;
          if (side !== 'left' && side !== 'right') return;
          setHighlight(side);
          await pause(1200);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'match') {
          const l = Number(action.args?.left);
          const r = Number(action.args?.right);
          const ok =
            config.allowMatchLines &&
            Number.isInteger(l) &&
            Number.isInteger(r) &&
            l >= 0 &&
            r >= 0 &&
            l < (leftSet?.count ?? 0) &&
            r < (rightSet?.count ?? 0);
          if (!ok) return;
          if (!matchMode) {
            // A picture tier has no tappable objects: point at each side in turn.
            setHighlight('left');
            await pause(500);
            if (!alive.current) return;
            setHighlight('right');
            await pause(500);
            if (alive.current) setHighlight(null);
            return;
          }
          setHighlight(`left-obj-${l}`);
          if (leftSet) say(spriteNameKey(leftSet.sprite));
          await pause(500);
          if (!alive.current) return;
          setHighlight(`right-obj-${r}`);
          addMatch(l, r);
          await pause(600);
          if (alive.current) setHighlight(null);
        } else if (action.op === 'place-symbol' || action.op === 'answer') {
          const id = String(action.op === 'place-symbol' ? action.args?.symbol : action.args?.id);
          if (!validIds.includes(id)) return;
          if (ask === 'symbol') {
            setHighlight(`symbol-${id}`);
            say(SYMBOL_KEY[id as Symbol]);
            await pause(400);
            if (!alive.current) return;
            await flySymbol(id as Symbol);
            if (!alive.current) return;
          } else {
            setHighlight(id);
            await pause(600);
            if (!alive.current) return;
          }
          setSelected(id);
          setHighlight(null);
          await pause(300);
        }
      } finally {
        setDemoBusy(false);
        setFlight(null);
      }
    },
    invite: (action) => setInvite(action),
  });

  /** The element id a demo invite points at: a side, an object, a symbol or a choice. */
  const invited: string | null = (() => {
    if (!invite) return null;
    const a = invite.args ?? {};
    switch (invite.op) {
      case 'highlight':
        return typeof a.side === 'string' ? a.side : null;
      case 'match':
        return matchMode ? `left-obj-${Number(a.left)}` : 'left';
      case 'place-symbol':
        return `symbol-${String(a.symbol)}`;
      case 'answer':
        return ask === 'symbol' ? `symbol-${String(a.id)}` : String(a.id);
      default:
        return null;
    }
  })();
  const lit = (id: string) => highlight === id || invited === id;
  const hand = (id: string, className = 'ni-cmp__hand') =>
    invited === id ? (
      <span className={`ni-hand ${className}`}>
        <HandPointerIcon />
      </span>
    ) : null;

  // ---------- render ----------

  const sideLabel = (side: Side) => t(side === 'left' ? 'ui.compare.left' : 'ui.compare.right');

  // Two counted pictures share one object size, so size is never a cue the numbers don't give
  // (a line of 6 must not look smaller than a scatter of 6).
  const countLayout = (s: StimulusSpec) =>
    s.kind === 'objects'
      ? objectSetLayout(s.set)
      : s.kind === 'dots' && s.arrangement !== 'fingers'
        ? dotsLayout(s)
        : null;
  const sideLayouts = { left: countLayout(config.left), right: countLayout(config.right) };
  const sharedCell =
    sideLayouts.left && sideLayouts.right
      ? Math.min(fitCell(sideLayouts.left, 420, 230), fitCell(sideLayouts.right, 420, 230))
      : null;

  const renderTray = (side: Side) => {
    const spec = config[side];
    if (spec.kind === 'none') return <div className="ni-cmp__side" data-side={side} />;
    const name = sidePick ? undefined : sideLabel(side);
    const layout = sideLayouts[side];
    const picture =
      sharedCell !== null && layout ? (
        <div className="ni-stimulus" data-kind={spec.kind}>
          <ObjectSetView layout={layout} cell={sharedCell} label={name} />
        </div>
      ) : (
        <StimulusView spec={spec} maxWidth={440} maxHeight={250} label={name} />
      );
    const n = sideNumeral(spec);
    return (
      <div className="ni-cmp__side" data-side={side} data-pick={sidePick ? 'true' : undefined}>
        {sidePick ? (
          <PickCard
            className="ni-cmp__tray"
            variant="picture"
            label={n === null ? sideLabel(side) : `${sideLabel(side)}: ${n}`}
            selected={selected === side}
            highlighted={lit(side)}
            data-id={side}
            disabled={!interactive}
            onPress={() =>
              choose(side, () => {
                if (n !== null && speakOnTap) sayNumber(n);
              })
            }
          >
            <span className="ni-cmp__trayspace" />
          </PickCard>
        ) : (
          <div
            className={['ni-cmp__tray', 'ni-cmp__tray--static', lit(side) ? 'ni-invite' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {picture}
          </div>
        )}
        {/* A pickable side draws its picture over the card (the card is named by its side), so
            the button holds no text of its own (axe label-content-name-mismatch). */}
        {sidePick ? (
          <div className="ni-cmp__trayface" aria-hidden="true">
            {picture}
          </div>
        ) : null}
        {hand(side)}
      </div>
    );
  };

  const gapLabel = t('ui.compare.gap');
  const renderMiddle = () => {
    if (ask === 'symbol') {
      const pad = dnd.targetProps('gap', { label: gapLabel });
      return (
        <div className="ni-cmp__gap" data-filled={symbol ? 'true' : undefined}>
          <div {...pad} className={`${pad.className} ni-cmp__pad`} />
          {symbol ? (
            <span className="ni-cmp__placed" aria-hidden="true">
              <Glyph kind={SYMBOL_GLYPH[symbol]} />
            </span>
          ) : null}
        </div>
      );
    }
    if (ask === 'true-false' && config.right.kind !== 'none' && !hasRelation(config.left)) {
      return (
        <div className="ni-cmp__relation" aria-hidden="true">
          <Glyph kind="eq" />
        </div>
      );
    }
    return <div className="ni-cmp__spacer" />;
  };

  // Match mode: the two sets as rows, objects as tap targets, lines between them.
  const minTarget = MIN_TARGET_PX[ageMode];
  const OBJ_SCALE = 0.9;
  // Both rows share one cell size and a left edge, so object i sits above object i: a match line
  // between equal positions is straight, and the extra objects stand out at the end.
  const leftLayout = leftSet ? objectSetLayout(leftSet) : null;
  const rightLayout = rightSet ? objectSetLayout(rightSet) : null;
  const minCell = Math.ceil(minTarget / OBJ_SCALE);
  const rowCell = Math.min(
    ...[leftLayout, rightLayout].map((l) => (l ? fitCell(l, 860, 150, minCell) : 112)),
  );
  const renderRow = (side: Side) => {
    const set = side === 'left' ? leftSet : rightSet;
    const layout = side === 'left' ? leftLayout : rightLayout;
    if (!set || !layout) return null;
    const cell = Math.max(minCell, rowCell);
    const size = Math.round(cell * OBJ_SCALE);
    return (
      <div className="ni-cmp__row" data-side={side}>
        {sidePick ? (
          <span className="ni-cmp__row-pick">
            <PickCard
              className="ni-cmp__this"
              variant="picture"
              label={`${t('ui.compare.this-one')}: ${sideLabel(side)}`}
              selected={selected === side}
              highlighted={lit(side)}
              data-id={side}
              disabled={!interactive}
              onPress={() => choose(side)}
            >
              <span className="ni-cmp__glyph">
                <Glyph kind="pointer" />
              </span>
            </PickCard>
            {hand(side)}
          </span>
        ) : null}
        <div
          className={['ni-cmp__tray', 'ni-cmp__tray--objects', lit(side) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <ObjectSetView
            layout={layout}
            cell={cell}
            label={sideLabel(side)}
            renderObject={(o, style) => {
              if (o.kind === 'distractor') {
                return (
                  <span
                    key={`d-${o.index}`}
                    className="ni-objects__item"
                    style={style}
                    aria-hidden="true"
                  >
                    <ObjectSprite sprite={o.sprite} tone={o.tone} />
                  </span>
                );
              }
              const id = `${side}-obj-${o.index}`;
              const matched = matches.some(([l, r]) => (side === 'left' ? l : r) === o.index);
              const isPending = pending?.side === side && pending.index === o.index;
              const left = Number(style.left) + (Number(style.width) - size) / 2;
              const top = Number(style.top) + (Number(style.height) - size) / 2;
              const objStyle: CSSProperties = { left, top, width: size, height: size };
              return (
                <span key={id} className="ni-cmp__objwrap">
                  <button
                    type="button"
                    className={['ni-cmp__obj', lit(id) ? 'ni-invite' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={objStyle}
                    data-obj={id}
                    data-matched={matched ? 'true' : undefined}
                    aria-pressed={isPending}
                    aria-label={`${t(spriteNameKey(o.sprite))} ${o.index + 1}`}
                    disabled={!interactive}
                    onClick={() => tapObject(side, o.index, o.sprite)}
                  >
                    <ObjectSprite sprite={o.sprite} tone={o.tone} />
                  </button>
                  {invited === id ? (
                    <span
                      className="ni-hand ni-cmp__objhand"
                      style={{ left: left + size / 2 - 20, top: top + size - 6 }}
                    >
                      <HandPointerIcon />
                    </span>
                  ) : null}
                </span>
              );
            }}
          />
        </div>
      </div>
    );
  };

  const renderChoice = (c: Choice) => (
    <span key={c.id} className="ni-cmp__choice">
      <PickCard
        label={t(c.label)}
        selected={selected === c.id}
        highlighted={lit(c.id)}
        variant="word"
        data-id={c.id}
        disabled={!interactive}
        onPress={() => choose(c.id, () => speakKey(c.label))}
      >
        <span className="ni-cmp__glyph">
          <Glyph kind={c.glyph} />
        </span>
        {textLabels ? <span className="ni-cmp__caption">{t(c.label)}</span> : null}
      </PickCard>
      {hand(c.id, 'ni-cmp__hand ni-cmp__hand--below')}
    </span>
  );

  const renderSymbol = (s: Symbol) => {
    const props = dnd.itemProps(s, { label: t(SYMBOL_KEY[s]) });
    const id = `symbol-${s}`;
    return (
      <span key={s} className="ni-cmp__choice">
        <div
          {...props}
          className={[props.className, 'ni-pick', 'ni-cmp__sym', lit(id) ? 'ni-invite' : '']
            .filter(Boolean)
            .join(' ')}
          data-symbol={s}
          data-chosen={symbol === s ? 'true' : undefined}
        >
          <span className="ni-cmp__glyph">
            <Glyph kind={SYMBOL_GLYPH[s]} />
          </span>
          {symbol === s ? (
            <span className="ni-pick__badge" aria-hidden="true">
              <CheckIcon tone="light" />
            </span>
          ) : null}
        </div>
        {hand(id, 'ni-cmp__hand ni-cmp__hand--below')}
      </span>
    );
  };

  const flightStyle: CSSProperties | undefined = flight
    ? {
        left: flight.moving ? flight.to.left : flight.from.left,
        top: flight.moving ? flight.to.top : flight.from.top,
        width: flight.moving ? flight.to.width : flight.from.width,
        height: flight.moving ? flight.to.height : flight.from.height,
        transitionDuration: `${FLY_MS}ms`,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className="ni-cmp"
      data-tier={tier}
      data-ask={ask}
      data-mode={matchMode ? 'match' : 'sides'}
      data-disabled={disabled ? 'true' : undefined}
    >
      {matchMode ? (
        <div className="ni-cmp__rows" ref={rowsRef}>
          {renderRow('left')}
          {renderRow('right')}
          <svg className="ni-cmp__lines" aria-hidden="true" focusable="false">
            {lines.map((l) => (
              <g key={l.key} className="ni-cmp__line">
                <line x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
                <circle cx={l.x1} cy={l.y1} r="7" />
                <circle cx={l.x2} cy={l.y2} r="7" />
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div className="ni-cmp__stage">
          {renderTray('left')}
          {renderMiddle()}
          {renderTray('right')}
        </div>
      )}

      <div className="ni-cmp__answer">
        <fieldset
          className="ni-cmp__choices"
          aria-label={t('ui.widget.choices')}
          disabled={!interactive}
        >
          {ask === 'symbol' ? SYMBOLS.map(renderSymbol) : choices.map(renderChoice)}
        </fieldset>
        <CheckButton onPress={submit} disabled={!interactive || selected === null} />
      </div>

      {flight ? (
        <div className="ni-cmp__flight" style={flightStyle} aria-hidden="true">
          <Glyph kind={SYMBOL_GLYPH[flight.symbol]} />
        </div>
      ) : null}
    </div>
  );
}

export default CompareWidget;
