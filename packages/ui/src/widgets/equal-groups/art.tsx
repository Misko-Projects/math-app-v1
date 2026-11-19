import type { SpriteId } from '@number-island/shared';
import type { ReactElement } from 'react';
import { ObjectSprite } from '../kit';
import { CHROME, type ChromeEdges } from './layout';

/**
 * Equal-groups art (05 §11): cozy flat vector islands in the token palette, 3 px outlines in the
 * fill's darker shade, one soft highlight and a contact shadow. Containers are drawn at their real
 * pixel size (no stretching), so rims, ropes and handles keep their shape at every size. All art
 * is decorative (aria-hidden); the controls around it carry the names.
 */

export type ContainerKind = 'raft' | 'basket' | 'plate' | 'nest';

interface Box {
  w: number;
  h: number;
  /** The rim round the contents (layout.ts `chromeAt`): thinner for small sprites. */
  chrome?: ChromeEdges;
}

const SHADOW = 'rgb(38 70 83 / 0.16)';
const HIGHLIGHT = 'rgb(255 255 255 / 0.55)';

/** The light floor the contents sit on: inside the rim, CHROME minus an 8 px margin. */
function floor({ w, h, chrome = CHROME }: Box) {
  const m = Math.min(10, Math.round(chrome.x * 0.4));
  return {
    x: chrome.x - m,
    y: chrome.top - m,
    w: w - 2 * (chrome.x - m),
    h: h - chrome.top - chrome.bottom + 2 * m,
  };
}

function Raft({ w, h, chrome }: Box) {
  const f = floor({ w, h, chrome });
  // Logs run top to bottom; two rope lashings cross them.
  const logW = 30;
  const logs = Math.max(3, Math.round((w - 8) / logW));
  const step = (w - 8) / logs;
  const top = 6;
  const bottom = h - 12;
  return (
    <>
      <ellipse cx={w / 2} cy={h - 7} rx={w / 2 - 6} ry={6} fill="var(--color-shallows)" />
      <path
        d={`M10 ${h - 9}q${(w - 20) / 4} -6 ${(w - 20) / 2} 0t${(w - 20) / 2} 0`}
        stroke="var(--color-sea)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {Array.from({ length: logs }, (_, i) => {
        const x = 4 + i * step;
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: logs are positional
            key={i}
            x={x + 1}
            y={top + (i % 2) * 3}
            width={step - 2}
            height={bottom - top - (i % 2) * 3}
            rx={Math.min(12, step / 2 - 1)}
            fill="var(--color-wood)"
            stroke="var(--color-wood-deep)"
            strokeWidth="3"
          />
        );
      })}
      <rect
        x={f.x}
        y={f.y}
        width={f.w}
        height={f.h}
        rx={16}
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path
        d={`M${f.x + 14} ${f.y + 6}h${Math.max(0, f.w * 0.3)}`}
        stroke={HIGHLIGHT}
        strokeWidth="4"
        strokeLinecap="round"
      />
      {[f.y - 2, f.y + f.h + 2].map((y) => (
        <g key={y}>
          <path
            d={`M4 ${y}H${w - 4}`}
            stroke="var(--color-sand-deep)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d={`M4 ${y}H${w - 4}`}
            stroke="var(--color-wood-deep)"
            strokeWidth="1.5"
            strokeDasharray="3 7"
            strokeLinecap="round"
          />
        </g>
      ))}
    </>
  );
}

function Basket({ w, h, chrome }: Box) {
  const f = floor({ w, h, chrome });
  const bodyTop = f.y - 4;
  const bottom = h - 8;
  const inset = Math.min(18, w * 0.06);
  const body = `M6 ${bodyTop}H${w - 6}L${w - 6 - inset} ${bottom - 10}Q${w - 8 - inset} ${bottom} ${w - 20 - inset} ${bottom}H${20 + inset}Q${8 + inset} ${bottom} ${6 + inset} ${bottom - 10}Z`;
  const weaveRows = Math.max(2, Math.floor((bottom - bodyTop) / 16));
  return (
    <>
      <ellipse cx={w / 2} cy={h - 5} rx={w / 2 - 14} ry={5} fill={SHADOW} />
      <path
        d={`M${w * 0.22} ${bodyTop + 2}C${w * 0.24} 2 ${w * 0.76} 2 ${w * 0.78} ${bodyTop + 2}`}
        stroke="var(--color-wood-deep)"
        strokeWidth="9"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M${w * 0.22} ${bodyTop + 2}C${w * 0.24} 2 ${w * 0.76} 2 ${w * 0.78} ${bodyTop + 2}`}
        stroke="var(--color-wood)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={body}
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {Array.from({ length: weaveRows }, (_, i) => {
        const y = bodyTop + ((i + 1) * (bottom - bodyTop)) / (weaveRows + 1);
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: weave rows are positional
            key={i}
            d={`M12 ${y}H${w - 12}`}
            stroke="var(--color-sun-deep)"
            strokeWidth="2"
            strokeDasharray="10 6"
            strokeDashoffset={i % 2 === 0 ? 0 : 8}
            opacity="0.7"
          />
        );
      })}
      <rect
        x={f.x}
        y={f.y}
        width={f.w}
        height={f.h}
        rx={18}
        fill="var(--color-paper)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
      />
      <path
        d={`M${f.x + 16} ${f.y + 7}h${Math.max(0, f.w * 0.28)}`}
        stroke="var(--color-sunshine-light)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect
        x={4}
        y={bodyTop - 4}
        width={w - 8}
        height={10}
        rx={5}
        fill="var(--color-sun)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
      />
    </>
  );
}

function Plate({ w, h, chrome }: Box) {
  const f = floor({ w, h, chrome });
  const r = Math.min(h, w) / 2.4;
  return (
    <>
      <rect x={10} y={h - 18} width={w - 20} height={12} rx={6} fill={SHADOW} />
      <rect
        x={4}
        y={4}
        width={w - 8}
        height={h - 14}
        rx={r}
        fill="var(--color-cloud)"
        stroke="var(--color-sea-deep)"
        strokeWidth="3"
      />
      <rect
        x={f.x - 2}
        y={f.y - 2}
        width={f.w + 4}
        height={f.h + 4}
        rx={Math.max(14, r - 12)}
        fill="var(--color-sky-light)"
        stroke="var(--color-sky)"
        strokeWidth="3"
      />
      <rect
        x={f.x - 2}
        y={f.y - 2}
        width={f.w + 4}
        height={f.h + 4}
        rx={Math.max(14, r - 12)}
        fill="none"
        stroke="var(--color-sea)"
        strokeWidth="2"
        strokeDasharray="2 9"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d={`M${r * 0.7} 12h${Math.max(0, w * 0.22)}`}
        stroke="var(--color-sky-light)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  );
}

function Nest({ w, h, chrome }: Box) {
  const f = floor({ w, h, chrome });
  const rx = w / 2 - 4;
  const ry = h / 2 - 6;
  const cx = w / 2;
  const cy = h / 2 - 2;
  // Twigs: short strokes around the rim, alternating two wood shades.
  const twigs = Math.max(14, Math.round((w + h) / 14));
  return (
    <>
      <ellipse cx={cx} cy={h - 6} rx={w / 2 - 12} ry={5} fill={SHADOW} />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      {Array.from({ length: twigs }, (_, i) => {
        const a = (i / twigs) * Math.PI * 2;
        const x1 = cx + Math.cos(a) * (rx - 4);
        const y1 = cy + Math.sin(a) * (ry - 4);
        const x2 = cx + Math.cos(a + 0.35) * (rx - 12);
        const y2 = cy + Math.sin(a + 0.35) * (ry - 10);
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: twigs are positional
            key={i}
            d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`}
            stroke={i % 2 === 0 ? 'var(--color-wood-deep)' : 'var(--color-sand-deep)'}
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      })}
      <rect
        x={f.x}
        y={f.y}
        width={f.w}
        height={f.h}
        rx={Math.min(f.h / 2, 40)}
        fill="var(--color-sand)"
        stroke="var(--color-wood-deep)"
        strokeWidth="3"
      />
      <path
        d={`M${f.x + 18} ${f.y + 7}h${Math.max(0, f.w * 0.25)}`}
        stroke={HIGHLIGHT}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  );
}

const CONTAINERS: Record<ContainerKind, (b: Box) => ReactElement> = {
  raft: Raft,
  basket: Basket,
  plate: Plate,
  nest: Nest,
};

/** A container drawn at `w` × `h` px. `ghost` draws only a dashed outline (the next raft's place). */
export function ContainerArt({
  kind,
  w,
  h,
  chrome,
  ghost = false,
}: {
  kind: ContainerKind;
  w: number;
  h: number;
  chrome?: ChromeEdges;
  ghost?: boolean;
}) {
  const Draw = CONTAINERS[kind];
  return (
    <svg
      className="ni-egw__art"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
      data-container={kind}
    >
      {ghost ? (
        <rect
          x={4}
          y={4}
          width={w - 8}
          height={h - 8}
          rx={26}
          fill="rgb(255 250 240 / 0.55)"
          stroke="var(--color-ink-soft)"
          strokeWidth="3"
          strokeDasharray="12 10"
          strokeLinecap="round"
        />
      ) : (
        <Draw w={w} h={h} chrome={chrome} />
      )}
    </svg>
  );
}

/** A small container picture for the add button's icon. */
export function AddIcon({ kind }: { kind: ContainerKind }) {
  const Draw = CONTAINERS[kind];
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true" focusable="false">
      <g transform="translate(6 40) scale(0.9)">
        <svg width="120" height="80" viewBox="0 0 160 106" aria-hidden="true" focusable="false">
          <Draw w={160} h={106} />
        </svg>
      </g>
      <circle
        cx="86"
        cy="32"
        r="24"
        fill="var(--color-leaf)"
        stroke="var(--color-leaf-dark)"
        strokeWidth="4"
      />
      <path
        d="M86 20v24M74 32h24"
        stroke="var(--color-cloud)"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "On each raft": one small container with a sprite on it (the task chip's picture). */
export function TaskIcon({ kind, sprite }: { kind: ContainerKind; sprite: SpriteId }) {
  const Draw = CONTAINERS[kind];
  return (
    <span className="ni-egw__taskart">
      <svg viewBox="0 0 96 76" width="100%" height="100%" aria-hidden="true" focusable="false">
        <Draw w={96} h={76} />
      </svg>
      <span className="ni-egw__taskartsprite">
        <ObjectSprite sprite={sprite} />
      </span>
    </span>
  );
}

/** The answer region's picture: a pencil writing on a card. */
export function AnswerIcon() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true" focusable="false">
      <rect
        x="5"
        y="10"
        width="30"
        height="30"
        rx="7"
        fill="var(--color-cloud)"
        stroke="var(--color-ink)"
        strokeWidth="3"
      />
      <path d="M12 31h14" stroke="var(--color-pebble-deep)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M24 30l3-9 15-15 6 6-15 15Z"
        fill="var(--color-sunshine)"
        stroke="var(--color-sun-deep)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M24 30l3-9 6 6Z" fill="var(--color-ink)" />
    </svg>
  );
}

/** The bottomless bucket the supply hands sprites out of when the total is the unknown. */
export function BucketArt() {
  return (
    <svg
      className="ni-egw__bucket"
      viewBox="0 0 120 100"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="60" cy="94" rx="40" ry="5" fill={SHADOW} />
      <path
        d="M22 34C22 6 98 6 98 34"
        stroke="var(--color-ink-soft)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14 36h92l-10 50a8 8 0 0 1-8 6H32a8 8 0 0 1-8-6Z"
        fill="var(--color-sea)"
        stroke="var(--color-sea-dark)"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M20 58h80" stroke="var(--color-sea-dark)" strokeWidth="3" opacity="0.45" />
      <ellipse
        cx="60"
        cy="36"
        rx="47"
        ry="9"
        fill="var(--color-sea-dark)"
        stroke="var(--color-sea-dark)"
        strokeWidth="3"
      />
      <path d="M28 66c2 8 4 14 7 18" stroke={HIGHLIGHT} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** A hand-drawn lasso ring around one group (demo `circle-group`). */
export function LassoArt({ w, h }: Box) {
  const x0 = 6;
  const y0 = 6;
  const x1 = w - 6;
  const y1 = h - 6;
  const mx = w / 2;
  const my = h / 2;
  // One wobbly loop that overshoots where it started, like a quick crayon circle.
  const d = [
    `M${mx - w * 0.12} ${y0 + 4}`,
    `C${x1 - w * 0.08} ${y0 - 2} ${x1 + 2} ${my - h * 0.3} ${x1 - 2} ${my}`,
    `S${mx + w * 0.2} ${y1 + 2} ${mx} ${y1 - 2}`,
    `S${x0 - 2} ${my + h * 0.25} ${x0 + 2} ${my}`,
    `S${mx - w * 0.2} ${y0 + 6} ${mx + w * 0.1} ${y0 + 10}`,
  ].join('');
  return (
    <svg
      className="ni-egw__lasso"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={d}
        pathLength={1}
        fill="none"
        stroke="var(--color-coral-deep)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
