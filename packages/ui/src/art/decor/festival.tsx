import type { PaletteColor } from '../../tokens/tokens';
import { filled, OUTLINE_OF, paint } from '../core/paint';
import {
  bumpyBlob,
  type DecorDef,
  decor,
  G1,
  Glow,
  Ground,
  Loop,
  quadAt,
  Shine,
  scallopFan,
  Twinkle,
} from './kit';

/*
 * Festival decor (05 §7): earned at festivals, and the rainbow arch revealed by the Storm Watch
 * co-op event. Lanterns are lit at sunset.
 */

const f = (n: number) => Number(n.toFixed(2));

type LanternShape = 'round' | 'tall' | 'drum';

/** A paper lantern hanging from (x, y). Lit: it glows warm and its ribs keep their colour. */
function PaperLantern({
  x,
  y,
  cord,
  color,
  lit,
  shape = 'round',
  delay = 0,
}: {
  x: number;
  y: number;
  cord: number;
  color: PaletteColor;
  lit: boolean;
  shape?: LanternShape;
  delay?: number;
}) {
  const ry = shape === 'tall' ? 14 : shape === 'drum' ? 9 : 11;
  const rx = shape === 'tall' ? 8.5 : shape === 'drum' ? 11 : 10;
  const cy = cord + 4 + ry;
  const edge = OUTLINE_OF[color];
  return (
    <g transform={`translate(${x} ${y})`}>
      <Loop kind="sway" origin="50% 0%" delay={delay}>
        {lit ? <Glow x={0} y={cy} r={rx * 2.4} /> : null}
        <path
          d={`M0 0v${cord + 2}`}
          stroke={paint('ink')}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <rect
          x={-4.5}
          y={cord}
          width={9}
          height={4.5}
          rx={1.5}
          fill={paint('ink-soft')}
          stroke={paint('ink')}
          strokeWidth={1.4}
        />
        <ellipse
          cx={0}
          cy={cy}
          rx={rx}
          ry={ry}
          fill={paint(lit ? 'sunshine-light' : color)}
          stroke={paint(edge)}
          strokeWidth={2.2}
        />
        <path
          d={`M0 ${cy - ry}V${cy + ry}M${-rx * 0.55} ${cy - ry * 0.83}q${-rx * 0.4} ${ry * 0.83} 0 ${ry * 1.66}M${rx * 0.55} ${cy - ry * 0.83}q${rx * 0.4} ${ry * 0.83} 0 ${ry * 1.66}`}
          fill="none"
          stroke={paint(lit ? color : edge)}
          strokeWidth={1.5}
          opacity={0.85}
        />
        {lit ? (
          <ellipse
            cx={0}
            cy={cy}
            rx={rx * 0.38}
            ry={ry * 0.42}
            fill={paint('cloud')}
            opacity={0.9}
          />
        ) : null}
        {lit ? null : (
          <path
            d={`M${-rx * 0.6} ${cy - ry * 0.25}q${rx * 0.1} ${-ry * 0.45} ${rx * 0.45} ${-ry * 0.6}`}
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
        )}
        <rect
          x={-4.5}
          y={cy + ry - 1.5}
          width={9}
          height={4}
          rx={1.5}
          fill={paint('ink-soft')}
          stroke={paint('ink')}
          strokeWidth={1.4}
        />
        <path
          d={`M0 ${cy + ry + 2.5}v6`}
          stroke={paint(lit ? 'coral' : edge)}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </Loop>
    </g>
  );
}

function WoodPole({ x, top, cap = 'sunshine' }: { x: number; top: number; cap?: PaletteColor }) {
  return (
    <g>
      <Ground rx={8} x={x} />
      <rect x={x - 3.5} y={top} width={7} height={G1 + 3 - top} rx={3} {...filled('wood', 2.2)} />
      <circle cx={x} cy={top - 2} r={4.5} {...filled(cap, 2)} />
    </g>
  );
}

const LANTERN_COLORS: PaletteColor[] = ['coral', 'sunshine', 'sea', 'sun', 'coral'];

const lanternString = decor(
  [2, 1],
  -116,
  -16,
  'festival',
  ({ lit }) => {
    const a = { x: -86, y: -96 };
    const c = { x: 0, y: -50 };
    const b = { x: 86, y: -96 };
    const ts = [0.17, 0.33, 0.5, 0.67, 0.83];
    return (
      <g>
        <WoodPole x={-86} top={-102} />
        <WoodPole x={86} top={-102} />
        <path
          d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
          fill="none"
          stroke={paint('ink')}
          strokeWidth={1.8}
        />
        {ts.map((t, i) => {
          const p = quadAt(a, c, b, t);
          return (
            <PaperLantern
              key={t}
              x={p.x}
              y={p.y}
              cord={4 + (i % 2) * 5}
              color={LANTERN_COLORS[i] ?? 'coral'}
              lit={lit}
              shape={i === 2 ? 'tall' : 'round'}
              delay={i * 0.7}
            />
          );
        })}
      </g>
    );
  },
  true,
);

const PENNANTS: PaletteColor[] = ['coral', 'sunshine', 'sea', 'leaf-light', 'sun', 'sky', 'coral'];

const bunting = decor(
  [2, 1],
  -112,
  -16,
  'festival',
  () => {
    const a = { x: -88, y: -98 };
    const c = { x: 0, y: -52 };
    const b = { x: 88, y: -98 };
    return (
      <g>
        <WoodPole x={-88} top={-104} cap="coral" />
        <WoodPole x={88} top={-104} cap="coral" />
        <path
          d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
          fill="none"
          stroke={paint('ink')}
          strokeWidth={1.8}
        />
        {PENNANTS.map((color, i) => {
          const t = (i + 1) / (PENNANTS.length + 1);
          const p = quadAt(a, c, b, t);
          const angle = f((Math.atan2(-p.nx, p.ny) * 180) / Math.PI);
          return (
            <g key={`${color}${t}`} transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
              <Loop kind="flutter" origin="50% 0%" delay={i * 0.35}>
                <path d="M-9 0h18l-9 19z" {...filled(color, 2)} />
                <path
                  d="M-5 3h6"
                  stroke={paint('cloud')}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  opacity={0.6}
                />
              </Loop>
            </g>
          );
        })}
      </g>
    );
  },
  true,
);

const RAINBOW: PaletteColor[] = ['coral', 'sun', 'sunshine', 'leaf-light', 'sky'];

function annulus(cx: number, cy: number, r1: number, r2: number) {
  return `M${cx - r1} ${cy}A${r1} ${r1} 0 0 1 ${cx + r1} ${cy}H${cx + r2}A${r2} ${r2} 0 0 0 ${cx - r2} ${cy}Z`;
}

const rainbowArch = decor(
  [2, 1],
  -132,
  -14,
  'festival',
  () => {
    const cy = -36;
    const band = 9;
    const outer = 82;
    return (
      <g>
        <Ground rx={30} x={-62} />
        <Ground rx={30} x={62} />
        {RAINBOW.map((color, i) => (
          <path
            key={color}
            d={annulus(0, cy, outer - i * band, outer - (i + 1) * band)}
            {...filled(color, 1.6)}
          />
        ))}
        <path
          d={`M${-outer} ${cy}A${outer} ${outer} 0 0 1 ${outer} ${cy}`}
          fill="none"
          stroke={paint('coral-deep')}
          strokeWidth={2.6}
        />
        <path
          d={`M${-(outer - 5 * band)} ${cy}A${outer - 5 * band} ${outer - 5 * band} 0 0 1 ${outer - 5 * band} ${cy}`}
          fill="none"
          stroke={paint('sea-deep')}
          strokeWidth={2.4}
        />
        <path
          d={`M${f(-Math.cos(0.55) * 77)} ${f(cy - Math.sin(0.55) * 77)}A77 77 0 0 1 ${f(-Math.cos(1.15) * 77)} ${f(cy - Math.sin(1.15) * 77)}`}
          fill="none"
          stroke={paint('cloud')}
          strokeWidth={2.6}
          strokeLinecap="round"
          opacity={0.6}
        />
        {[-62, 62].map((x) => (
          <g key={x}>
            <path d={bumpyBlob(x, -38, 30, 13, 8, 1.1)} {...filled('cloud', 2.6)} />
            <path
              d={`M${x - 22} -32q22 9 44 0`}
              fill="none"
              stroke={paint('pebble-deep')}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.6}
            />
          </g>
        ))}
        <Twinkle x={-50} y={-110} r={6} className="motion-loop art-loop art-glint" />
        <Twinkle x={56} y={-100} r={5} className="motion-loop art-loop art-glint" delay={-1.8} />
        <Twinkle x={6} y={-128} r={4.5} className="motion-loop art-loop art-glint" delay={-3.6} />
      </g>
    );
  },
  true,
);

const paperLanterns = decor(
  [1, 1],
  -120,
  -16,
  'festival',
  ({ lit }) => (
    <g>
      <WoodPole x={-38} top={-104} cap="coral" />
      <WoodPole x={38} top={-104} cap="coral" />
      <rect x={-44} y={-104} width={88} height={7} rx={3.5} {...filled('wood', 2.2)} />
      <path d="M-40 -100.5h80" stroke={paint('wood-deep')} strokeWidth={1.4} opacity={0.5} />
      <PaperLantern x={-20} y={-97} cord={6} color="coral" lit={lit} shape="round" delay={0} />
      <PaperLantern x={2} y={-97} cord={18} color="sunshine" lit={lit} shape="tall" delay={1.1} />
      <PaperLantern x={23} y={-97} cord={8} color="sea" lit={lit} shape="drum" delay={2.2} />
    </g>
  ),
  true,
);

const festivalDrum = decor([1, 1], -104, -16, 'festival', () => {
  const body = 'M-24 -82C-31 -71 -31 -58 -24 -47H24C31 -58 31 -71 24 -82Z';
  return (
    <g>
      <Ground rx={30} />
      <path
        d="M-24 -24L14 -60M24 -24L-14 -60"
        stroke={paint('wood-deep')}
        strokeWidth={7.5}
        strokeLinecap="round"
      />
      <path
        d="M-24 -24L14 -60M24 -24L-14 -60"
        stroke={paint('wood')}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <path d={body} {...filled('coral', 2.6)} />
      <path
        d="M14 -82h10c7 11 7 24 0 35h-10c5-11 5-24 0-35z"
        fill={paint('coral-deep')}
        opacity={0.45}
      />
      <path d="M-28.5 -74h57M-28.5 -55h57" stroke={paint('sunshine')} strokeWidth={4} />
      <path
        d="M-28.5 -74h57M-28.5 -55h57"
        stroke={paint('sunshine-deep')}
        strokeWidth={4}
        strokeDasharray="0.1 7"
        strokeLinecap="round"
      />
      <path
        d="M0 -71.5l2.6 5.2l5.8.8l-4.2 4.1l1 5.7l-5.2-2.7l-5.2 2.7l1-5.7l-4.2-4.1l5.8-.8z"
        fill={paint('sunshine-light')}
        stroke={paint('coral-deep')}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Shine d="M-21 -78q-5 10-1 26" width={2.6} opacity={0.5} />
      <path
        d={body}
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <ellipse cx={0} cy={-82} rx={24} ry={7} {...filled('paper', 2.4)} />
      <ellipse
        cx={0}
        cy={-82}
        rx={24}
        ry={7}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={2.4}
      />
      <ellipse
        cx={0}
        cy={-82}
        rx={10}
        ry={3}
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={1.6}
      />
      <path
        d="M-22 -96L8 -83M22 -98L-4 -84"
        stroke={paint('wood-deep')}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d="M-22 -96L8 -83M22 -98L-4 -84"
        stroke={paint('wood')}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx={-22} cy={-96} r={4} {...filled('sunshine', 2)} />
      <circle cx={22} cy={-98} r={4} {...filled('sunshine', 2)} />
    </g>
  );
});

function HangingShell({
  x,
  len,
  kind,
  delay,
}: {
  x: number;
  len: number;
  kind: 'scallop' | 'glass' | 'spiral' | 'star';
  delay: number;
}) {
  return (
    <g transform={`translate(${x} -98)`}>
      <Loop kind="sway" origin="50% 0%" delay={delay}>
        <path
          d={`M0 0v${len}`}
          stroke={paint('ink-soft')}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
        {kind === 'scallop' ? (
          <g transform={`translate(0 ${len + 9}) rotate(180)`}>
            <path d={scallopFan(0, 0, 9, 5).d} {...filled('coral', 2)} />
            {scallopFan(0, 0, 9, 5).ribs.map((d) => (
              <path key={d} d={d} stroke={paint('coral-deep')} strokeWidth={1.3} />
            ))}
          </g>
        ) : null}
        {kind === 'glass' ? (
          <path
            d={`M0 ${len}l7 7l-3 10h-8l-3-10z`}
            fill={paint('shallows')}
            stroke={paint('sea-deep')}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ) : null}
        {kind === 'spiral' ? (
          <g>
            <path d={`M-6 ${len + 4}q6-6 12 0l-4 16h-4z`} {...filled('paper', 2)} />
            <path
              d={`M-3 ${len + 8}q3-3 6 0M-2 ${len + 13}q2-2 4 0`}
              fill="none"
              stroke={paint('sand-deep')}
              strokeWidth={1.4}
            />
            <path
              d={`M-6 ${len + 4}q6-6 12 0l-4 16h-4z`}
              fill="none"
              stroke={paint('wood-deep')}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </g>
        ) : null}
        {kind === 'star' ? (
          <path
            d={`M0 ${len}l2.4 5.4l5.8.6l-4.3 3.9l1.2 5.8l-5.1-3l-5.1 3l1.2-5.8l-4.3-3.9l5.8-.6z`}
            fill={paint('sunshine')}
            stroke={paint('sunshine-deep')}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ) : null}
      </Loop>
    </g>
  );
}

const shellChime = decor(
  [1, 1],
  -116,
  -16,
  'festival',
  () => (
    <g>
      <Ground rx={18} x={-26} />
      <path
        d="M-30 -24c-1-24 2-52 0-80h8c-1 26 2 54 1 80z"
        fill={paint('pebble-deep')}
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M-34 -100c14-6 40-6 66-2c3 1 3 6 0 7c-24-3-48-3-66 2c-3-1-3-6 0-7z"
        fill={paint('pebble-deep')}
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M-26 -94v18M-27 -64v22"
        stroke={paint('pebble')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <HangingShell x={-12} len={20} kind="scallop" delay={0} />
      <HangingShell x={2} len={32} kind="glass" delay={0.8} />
      <HangingShell x={15} len={22} kind="spiral" delay={1.6} />
      <HangingShell x={27} len={14} kind="star" delay={2.4} />
      <path d="M-26 -104v-4" stroke={paint('ink-soft')} strokeWidth={2.4} strokeLinecap="round" />
      <circle
        cx={-26}
        cy={-110}
        r={3.6}
        fill={paint('shallows')}
        stroke={paint('sea-deep')}
        strokeWidth={1.8}
      />
    </g>
  ),
  true,
);

/** A point inside a quad by bilinear interpolation (u across, v down). */
function bilerp(q: readonly [number, number][], u: number, v: number): [number, number] {
  const [a, b, c, d] = q as [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ];
  const top: [number, number] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const bot: [number, number] = [d[0] + (c[0] - d[0]) * u, d[1] + (c[1] - d[1]) * u];
  return [f(top[0] + (bot[0] - top[0]) * v), f(top[1] + (bot[1] - top[1]) * v)];
}

function quadPath(q: readonly [number, number][], u0: number, u1: number, v0: number, v1: number) {
  const p = [bilerp(q, u0, v0), bilerp(q, u1, v0), bilerp(q, u1, v1), bilerp(q, u0, v1)];
  return `M${p.map((x) => x.join(' ')).join('L')}Z`;
}

const picnicBlanket = decor([2, 1], -76, -6, 'festival', () => {
  const q: [number, number][] = [
    [-70, -60],
    [74, -62],
    [86, -14],
    [-84, -12],
  ];
  const n = 8;
  const stripes = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1);
  const blanket = quadPath(q, 0, 1, 0, 1);
  return (
    <g>
      <path d={blanket} transform="translate(0 3)" {...filled('coral-deep', 2.4)} />
      <path d={blanket} fill={paint('coral')} />
      {stripes.map((i) => (
        <path
          key={`u${i}`}
          d={quadPath(q, i / n, (i + 1) / n, 0, 1)}
          fill={paint('paper')}
          opacity={0.5}
        />
      ))}
      {[1, 3].map((i) => (
        <path
          key={`v${i}`}
          d={quadPath(q, 0, 1, i / 5, (i + 1) / 5)}
          fill={paint('paper')}
          opacity={0.5}
        />
      ))}
      <path
        d={blanket}
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <g>
        <ellipse cx={-42} cy={-36} rx={20} ry={5} fill={paint('ink')} opacity={0.15} />
        <path
          d="M-62 -38q20-26 40 0"
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <path
          d="M-62 -38q20-26 40 0"
          fill="none"
          stroke={paint('wood')}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <path d="M-64 -48h44l-4 16h-36z" {...filled('wood', 2.4)} />
        <path
          d="M-60 -42h37M-58 -37h33M-55 -48v16M-46 -48v16M-37 -48v16M-28 -48v16"
          stroke={paint('wood-deep')}
          strokeWidth={1.4}
          opacity={0.7}
        />
        <path d="M-66 -52h48v5h-48z" {...filled('sun', 2.2)} />
        <path
          d="M-66 -52h48v5h-48z"
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
      </g>
      <ellipse cx={10} cy={-34} rx={18} ry={7} {...filled('paper', 2.2)} />
      <ellipse
        cx={10}
        cy={-34}
        rx={18}
        ry={7}
        fill="none"
        stroke={paint('pebble-deep')}
        strokeWidth={2.2}
      />
      <path
        d="M2 -35l16-5l-2 7z"
        fill={paint('sunshine')}
        stroke={paint('sunshine-deep')}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M2 -35l14-4.5" stroke={paint('sun')} strokeWidth={2.4} strokeLinecap="round" />
      {[44, 58].map((x) => (
        <g key={x}>
          <path d={`M${x - 6} -50h12l-2 12h-8z`} {...filled('sky', 2)} />
          <path
            d={`M${x - 6} -50h12l-2 12h-8z`}
            fill="none"
            stroke={paint('sea-deep')}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <ellipse
            cx={x}
            cy={-50}
            rx={6}
            ry={2}
            fill={paint('sky-light')}
            stroke={paint('sea-deep')}
            strokeWidth={1.6}
          />
        </g>
      ))}
      <path
        d="M38 -26c0-6 8-9 12-4c4-5 12-2 12 4c0 6-8 9-12 9s-12-3-12-9z"
        {...filled('coral', 2)}
      />
      <path d="M50 -30q1-5 4-7" stroke={paint('wood-deep')} strokeWidth={2} strokeLinecap="round" />
      <path d="M53 -36q4-3 8-1q-4 3-8 1z" {...filled('leaf', 1.4)} />
    </g>
  );
});

const starBalloon = decor(
  [1, 1],
  -148,
  -16,
  'festival',
  () => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const a = ((-90 - 8 + i * 36) * Math.PI) / 180;
      const r = i % 2 === 0 ? 24 : 12;
      return `${f(2 + Math.cos(a) * r)} ${f(-116 + Math.sin(a) * r)}`;
    });
    return (
      <g>
        <Ground rx={12} />
        <Loop kind="bob">
          <path
            d="M0 -30C-8 -50 10 -72 2 -95"
            fill="none"
            stroke={paint('ink-soft')}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path d="M-1 -95l3-5l3 5z" {...filled('sunshine', 1.6)} />
          <path
            d={`M${pts.join('L')}Z`}
            fill={paint('sunshine')}
            stroke={paint('sunshine-deep')}
            strokeWidth={6}
            strokeLinejoin="round"
          />
          <path
            d={`M${pts.join('L')}Z`}
            fill={paint('sunshine')}
            stroke={paint('wood-deep')}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path
            d="M-8 -122q4-10 12-11"
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={3.4}
            strokeLinecap="round"
            opacity={0.8}
          />
          <circle cx={-12} cy={-112} r={1.8} fill={paint('cloud')} opacity={0.8} />
        </Loop>
        <path d="M-10 -24c0-8 4-12 10-12s10 4 10 12z" {...filled('pebble', 2.2)} />
        <path
          d="M-10 -24c0-8 4-12 10-12s10 4 10 12z"
          fill="none"
          stroke={paint('ink-soft')}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <path d="M-4 -36l4 3l4-3l-1 5h-6z" {...filled('coral', 1.6)} />
      </g>
    );
  },
  true,
);

export const FESTIVAL_DECOR = {
  'lantern-string': lanternString,
  bunting,
  'rainbow-arch': rainbowArch,
  'paper-lanterns': paperLanterns,
  'festival-drum': festivalDrum,
  'shell-chime': shellChime,
  'picnic-blanket': picnicBlanket,
  'star-balloon': starBalloon,
} satisfies Record<string, DecorDef>;
