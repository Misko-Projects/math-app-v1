import type { PaletteColor } from '../../tokens/tokens';
import { filled, paint } from '../core/paint';
import {
  bumpyBlob,
  type DecorDef,
  decor,
  Glow,
  Ground,
  LightPool,
  Post,
  Shine,
  Twinkle,
} from './kit';

/* Puzzle Tower star decor (05 §4 W13: star shards buy rare decor): the island's rarest pieces. */

const f = (n: number) => Number(n.toFixed(2));

function starPoints(cx: number, cy: number, r: number, inner: number, rot: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : inner;
    return [f(cx + Math.cos(a) * rr), f(cy + Math.sin(a) * rr)] as [number, number];
  });
}

/** A faceted star, lit from the top-left. */
function FacetStar({ cx, cy, r, rot = -8 }: { cx: number; cy: number; r: number; rot?: number }) {
  const pts = starPoints(cx, cy, r, r * 0.46, rot);
  const lit = [9, 0, 1, 2, 7, 8];
  return (
    <g>
      {pts.map((p, i) => {
        const q = pts[(i + 1) % 10] as [number, number];
        return (
          <path
            key={p.join()}
            d={`M${cx} ${cy}L${p.join(' ')}L${q.join(' ')}Z`}
            fill={paint(lit.includes(i) ? 'sunshine-light' : 'sunshine')}
            stroke={paint('sunshine-deep')}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        );
      })}
      <path
        d={`M${pts.map((p) => p.join(' ')).join('L')}Z`}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={2.8}
        strokeLinejoin="round"
      />
    </g>
  );
}

const MOSAIC: PaletteColor[] = [
  'shallows',
  'sky',
  'sea',
  'leaf-light',
  'sky-light',
  'shallows',
  'sunshine-light',
  'sky',
];

function wedge(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => `${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
  return `M${p(r0, a0)}L${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}

const seaGlassMosaic = decor(
  [1, 1],
  -112,
  -16,
  'stars',
  () => {
    const cx = 0;
    const cy = -72;
    const rings = [
      { r0: 11, r1: 19, n: 8, off: 0 },
      { r0: 20, r1: 28, n: 12, off: 0.13 },
    ];
    const gap = 0.07;
    return (
      <g>
        <Ground rx={28} />
        <path d="M-22 -24v-10c0-3 2-5 5-5h34c3 0 5 2 5 5v10z" {...filled('pebble-deep', 2.4)} />
        <path d="M-18 -39h36l-2-6h-32z" {...filled('pebble', 2.2)} />
        <circle cx={cx} cy={cy} r={33} {...filled('pebble', 2.6)} />
        <circle cx={cx} cy={cy} r={33} fill="none" stroke={paint('ink-soft')} strokeWidth={2.6} />
        <circle cx={cx} cy={cy} r={29} fill={paint('pebble-deep')} opacity={0.55} />
        {rings.flatMap((ring, ri) =>
          Array.from({ length: ring.n }, (_, i) => {
            const a0 = ((i + ring.off) / ring.n) * Math.PI * 2 + gap;
            const a1 = ((i + 1 + ring.off) / ring.n) * Math.PI * 2 - gap;
            const color = MOSAIC[(i * 3 + ri * 5) % MOSAIC.length] ?? 'sky';
            return (
              <path
                key={`${ring.r0}-${a0.toFixed(3)}`}
                d={wedge(cx, cy, ring.r0, ring.r1, a0, a1)}
                fill={paint(color)}
                stroke={paint('sea-deep')}
                strokeWidth={1.2}
                strokeLinejoin="round"
              />
            );
          }),
        )}
        <path
          d={`M${starPoints(cx, cy, 10, 4.6, 0)
            .map((p) => p.join(' '))
            .join('L')}Z`}
          fill={paint('sunshine')}
          stroke={paint('sunshine-deep')}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Shine d="M-22 -86q6-10 16-13" width={2.6} opacity={0.6} />
        <Twinkle x={18} y={-90} r={5} className="motion-loop art-loop art-glint" />
        <Twinkle x={-16} y={-58} r={4} className="motion-loop art-loop art-glint" delay={-2.6} />
      </g>
    );
  },
  true,
);

const starStatue = decor(
  [1, 1],
  -142,
  -16,
  'stars',
  ({ lit }) => (
    <g>
      <Ground rx={30} />
      <path d="M-28 -24v-8c0-2 2-4 4-4h48c2 0 4 2 4 4v8z" {...filled('pebble-deep', 2.4)} />
      <path d="M-24 -36h48l-3-6h-42z" {...filled('pebble', 2.2)} />
      <path d="M-14 -42v-26h28v26z" {...filled('pebble', 2.4)} />
      <path d="M6 -68h8v26h-8z" fill={paint('pebble-deep')} opacity={0.55} />
      <path
        d="M-14 -42v-26h28v26z"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d="M-19 -68v-6h38v6z" {...filled('pebble', 2.2)} />
      <path
        d="M-19 -68v-6h38v6zM-28 -24v-8c0-2 2-4 4-4h48c2 0 4 2 4 4v8z"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d="M-6 -54h12" stroke={paint('pebble-deep')} strokeWidth={2} strokeLinecap="round" />
      {lit ? <Glow x={0} y={-104} r={42} /> : null}
      <FacetStar cx={0} cy={-104} r={30} />
      <Twinkle x={-30} y={-126} r={5.5} className="motion-loop art-loop art-glint" />
      <Twinkle x={32} y={-88} r={4.5} className="motion-loop art-loop art-glint" delay={-2.2} />
    </g>
  ),
  true,
);

function Crystal({
  x,
  y,
  w,
  h,
  lean,
  light,
  dark,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  lean: number;
  light: PaletteColor;
  dark: PaletteColor;
}) {
  const tip = y - h - w * 0.75;
  const outline = `M${x - w / 2} ${y}V${y - h}L${x} ${tip}L${x + w / 2} ${y - h}V${y}Z`;
  return (
    <g transform={`rotate(${lean} ${x} ${y})`}>
      <path d={`M${x - w / 2} ${y}V${y - h}L${x} ${tip}V${y}Z`} fill={paint(light)} />
      <path d={`M${x} ${tip}L${x + w / 2} ${y - h}V${y}H${x}Z`} fill={paint(dark)} />
      <path
        d={`M${x} ${tip}V${y}M${x - w / 2} ${y - h}L${x} ${y - h + w * 0.3}L${x + w / 2} ${y - h}`}
        fill="none"
        stroke={paint('sea-deep')}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      <path
        d={`M${x - w * 0.3} ${y - h * 0.2}V${y - h * 0.8}`}
        stroke={paint('cloud')}
        strokeWidth={2.2}
        strokeLinecap="round"
        opacity={0.75}
      />
      <path
        d={outline}
        fill="none"
        stroke={paint('sea-dark')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
    </g>
  );
}

const crystalTower = decor(
  [1, 1],
  -146,
  -16,
  'stars',
  ({ lit }) => (
    <g>
      <Ground rx={34} />
      {lit ? <Glow x={0} y={-86} r={40} /> : null}
      <Crystal x={-17} y={-34} w={14} h={40} lean={-14} light="sky-light" dark="sky" />
      <Crystal x={18} y={-34} w={15} h={50} lean={13} light="shallows" dark="sea" />
      <Crystal x={0} y={-34} w={20} h={84} lean={0} light="shallows" dark="sea" />
      <Crystal x={-8} y={-30} w={10} h={18} lean={-28} light="sky-light" dark="sky" />
      <Crystal x={11} y={-29} w={9} h={14} lean={30} light="sky-light" dark="sky" />
      <path d={bumpyBlob(0, -30, 32, 8, 9, 1.05)} {...filled('pebble', 2.4)} />
      <path
        d={bumpyBlob(0, -30, 32, 8, 9, 1.05)}
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
      />
      <path
        d="M-22 -28q22 7 44 0"
        fill="none"
        stroke={paint('pebble-deep')}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Twinkle x={-4} y={-128} r={6} className="motion-loop art-loop art-glint" />
      <Twinkle x={28} y={-80} r={4.5} className="motion-loop art-loop art-glint" delay={-1.9} />
      <Twinkle x={-28} y={-70} r={4} className="motion-loop art-loop art-glint" delay={-3.7} />
    </g>
  ),
  true,
);

const telescope = decor(
  [1, 1],
  -118,
  -16,
  'stars',
  () => (
    <g>
      <Ground rx={30} />
      <path
        d="M0 -62L-24 -25M0 -62L24 -25M0 -62L4 -21"
        stroke={paint('wood-deep')}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d="M0 -62L-24 -25M0 -62L24 -25M0 -62L4 -21"
        stroke={paint('wood')}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <g transform="rotate(-32 0 -66)">
        <path
          d="M-36 -69h8v6h-8z"
          fill={paint('ink-soft')}
          stroke={paint('ink')}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d="M-28 -71L30 -76V-56L-28 -61Z" {...filled('sunshine', 2.4)} />
        <path
          d="M-28 -71L30 -76V-56L-28 -61Z"
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        <path d="M-10 -72.6v13.2M12 -74.5v17" stroke={paint('sunshine-deep')} strokeWidth={4} />
        <path
          d="M-24 -68L22 -72"
          stroke={paint('cloud')}
          strokeWidth={2.4}
          strokeLinecap="round"
          opacity={0.65}
        />
        <ellipse
          cx={31}
          cy={-66}
          rx={3.6}
          ry={11}
          fill={paint('sky-light')}
          stroke={paint('wood-deep')}
          strokeWidth={2.4}
        />
      </g>
      <circle
        cx={0}
        cy={-64}
        r={5}
        fill={paint('ink-soft')}
        stroke={paint('ink')}
        strokeWidth={2}
      />
      <Twinkle x={40} y={-108} r={6.5} className="motion-loop art-loop art-glint" />
      <Twinkle x={22} y={-112} r={3.6} className="motion-loop art-loop art-glint" delay={-2.8} />
    </g>
  ),
  true,
);

const moonLamp = decor([1, 1], -130, -16, 'stars', ({ lit }) => {
  const moon = 'M21.5 -100.99A15 15 0 1 0 21.5 -75.01A13.5 13.5 0 0 1 21.5 -100.99Z';
  return (
    <g>
      <Ground rx={16} x={-8} />
      {lit ? <LightPool x={2} rx={34} /> : null}
      <path
        d="M-18 -24v-6c0-3 3-5 6-5h8c3 0 6 2 6 5v6z"
        fill={paint('ink-soft')}
        stroke={paint('ink')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Post x={-8} top={-106} bottom={-34} w={5.5} />
      <path
        d="M-8 -106q0-14 14-14q12 0 12 12"
        fill="none"
        stroke={paint('ink')}
        strokeWidth={5.5}
        strokeLinecap="round"
      />
      <path
        d="M-8 -106q0-14 14-14q12 0 12 12"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      {lit ? <Glow x={14} y={-88} r={32} /> : null}
      <path d="M18 -108v6" stroke={paint('ink')} strokeWidth={1.8} strokeLinecap="round" />
      <path
        d={moon}
        fill={paint(lit ? 'sunshine-light' : 'paper')}
        stroke={paint('sunshine-deep')}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <path
        d="M5 -92q2 2 4 0M6 -82q3 3 6 1"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path
        d="M2 -96q1-5 5-8"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.8}
      />
      <path d="M30 -110v10" stroke={paint('ink')} strokeWidth={1.4} strokeLinecap="round" />
      <path
        d="M30 -99l1.8 3.8l4.2.5l-3.1 2.8l.9 4.1l-3.8-2.1l-3.8 2.1l.9-4.1l-3.1-2.8l4.2-.5z"
        fill={paint(lit ? 'sunshine-light' : 'sunshine')}
        stroke={paint('sunshine-deep')}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </g>
  );
});

export const STAR_DECOR = {
  'sea-glass-mosaic': seaGlassMosaic,
  'star-statue': starStatue,
  'crystal-tower': crystalTower,
  telescope,
  'moon-lamp': moonLamp,
} satisfies Record<string, DecorDef>;
