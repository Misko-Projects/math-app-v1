import { filled, paint } from '../core/paint';
import { type DecorDef, decor, G1, Ground, Line, Loop, Shine, scallopFan, Twinkle } from './kit';

/* Beach finds (05 §7 surprise gifts and "Pip found something!"): umbrella, castle, pool, sign, kite. */

const f = (n: number) => Number(n.toFixed(2));

const beachUmbrella = decor([1, 1], -120, -16, 'beach', () => {
  const apex = { x: -4, y: -110 };
  const n = 6;
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const x = -46 + (i * 84) / n;
    const u = (x - apex.x) / 42;
    return { x: f(x), y: f(-80 + 7 * (1 - u * u)) };
  });
  const s = f((84 / n / 2) * 1.08);
  const outline = `M${apex.x} ${apex.y}L${pts[0]?.x} ${pts[0]?.y}${pts
    .slice(1)
    .map((p) => `A${s} ${s} 0 0 0 ${p.x} ${p.y}`)
    .join('')}Z`;
  return (
    <g>
      <ellipse cx={-6} cy={G1 - 4} rx={40} ry={10} fill={paint('ink')} opacity={0.1} />
      <Ground rx={8} x={8} />
      <path d="M8 -26L-4 -104" stroke={paint('wood-deep')} strokeWidth={6} strokeLinecap="round" />
      <path d="M8 -26L-4 -104" stroke={paint('paper')} strokeWidth={2.6} strokeLinecap="round" />
      {pts.slice(0, -1).map((p, i) => {
        const q = pts[i + 1] as { x: number; y: number };
        return (
          <path
            key={`${p.x},${p.y}`}
            d={`M${apex.x} ${apex.y}L${p.x} ${p.y}A${s} ${s} 0 0 0 ${q.x} ${q.y}Z`}
            fill={paint(i % 2 ? 'paper' : 'coral')}
            stroke={paint('coral-deep')}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        );
      })}
      <path
        d="M-30 -86q8-14 22-22"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.45}
      />
      <path
        d={outline}
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={2.8}
        strokeLinejoin="round"
      />
      <circle cx={apex.x} cy={apex.y - 2} r={3.6} {...filled('sunshine', 2)} />
      <g>
        <Ground rx={11} x={30} y={-24} ry={3.5} />
        <path d="M21 -40h18l-3 15h-12z" {...filled('sea', 2.2)} />
        <path
          d="M21 -40h18l-3 15h-12z"
          fill="none"
          stroke={paint('sea-dark')}
          strokeWidth={2.2}
          strokeLinejoin="round"
        />
        <path d="M22 -40q8-12 16 0" fill="none" stroke={paint('sea-dark')} strokeWidth={1.8} />
        <path d="M24 -33h12" stroke={paint('sunshine')} strokeWidth={2.4} />
      </g>
    </g>
  );
});

/** A closed outline with a crenellated (castle) top between x0 and x1. */
function battlement(x0: number, x1: number, top: number, bottom: number, n: number) {
  const step = (x1 - x0) / (2 * n - 1);
  let d = `M${x0} ${bottom}V${top}`;
  for (let i = 0; i < 2 * n - 1; i++) {
    const x = f(x0 + (i + 1) * step);
    d += i % 2 === 0 ? `H${x}` : `V${top}H${x}`;
    if (i % 2 === 0 && i < 2 * n - 2) d += `V${top + 5}`;
  }
  return `${d}V${bottom}Z`;
}

const sandcastle = decor(
  [1, 1],
  -112,
  -16,
  'beach',
  () => (
    <g>
      <Ground rx={38} />
      <path d={battlement(-27, 27, -54, -26, 5)} {...filled('sand-shadow', 2.4)} />
      <path
        d={battlement(-27, 27, -54, -26, 5)}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      {[-38, 18].map((x) => (
        <g key={x}>
          <path d={`${battlement(x, x + 20, -70, -24, 3)}`} fill={paint('sand-shadow')} />
          <path d={`M${x + 14} -65v41h6v-46h-6z`} fill={paint('sand-deep')} opacity={0.7} />
          <path
            d={battlement(x, x + 20, -70, -24, 3)}
            fill="none"
            stroke={paint('wood-deep')}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path d={`M${x + 7} -44v-6a3 3 0 0 1 6 0v6z`} fill={paint('wood-deep')} opacity={0.75} />
        </g>
      ))}
      <path d={battlement(-12, 12, -84, -24, 3)} fill={paint('sand-shadow')} />
      <path d="M6 -79v55h6v-60h-6z" fill={paint('sand-deep')} opacity={0.7} />
      <path
        d={battlement(-12, 12, -84, -24, 3)}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path d="M-6.5 -24v-11a6.5 6.5 0 0 1 13 0v11z" fill={paint('wood-deep')} opacity={0.8} />
      <circle cx={0} cy={-62} r={3.2} fill={paint('wood-deep')} opacity={0.75} />
      <path
        d="M-24 -36q1 2 3 1M14 -40q1 2 3 1M-6 -66q1 2 3 1"
        fill="none"
        stroke={paint('sand-deep')}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <g transform="translate(-22 -36)">
        <path d={scallopFan(0, 3, 6, 5).d} {...filled('coral', 1.6)} />
      </g>
      <path d="M0 -84v-22" stroke={paint('wood-deep')} strokeWidth={2.6} strokeLinecap="round" />
      <g transform="translate(1 -106)">
        <Loop kind="flutter" origin="0% 50%">
          <path
            d="M0 0l18 5.5l-18 5.5z"
            fill={paint('coral')}
            stroke={paint('ink')}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        </Loop>
      </g>
      <Shine d="M-34 -62v14" width={2.4} opacity={0.6} />
    </g>
  ),
  true,
);

function Rock({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const d = `M${x - w / 2} ${y}c0-${h * 0.8} ${w * 0.2}-${h} ${w / 2}-${h}s${w / 2} ${h * 0.25} ${w / 2} ${h}c0 ${h * 0.35}-${w * 0.25} ${h * 0.45}-${w / 2} ${h * 0.45}s-${w / 2}-${h * 0.1}-${w / 2}-${h * 0.45}z`;
  return (
    <g>
      <path
        d={d}
        fill={paint('pebble')}
        stroke={paint('ink-soft')}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <path
        d={`M${x - w * 0.28} ${y - h * 0.55}q${w * 0.12}-${h * 0.3} ${w * 0.3}-${h * 0.32}`}
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.75}
      />
    </g>
  );
}

function Starfish({ x, y, r, rot = 0 }: { x: number; y: number; r: number; rot?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.45;
    return `${f(x + Math.cos(a) * rr)} ${f(y + Math.sin(a) * rr * 0.75)}`;
  });
  return (
    <g>
      <path
        d={`M${pts.join('L')}Z`}
        fill={paint('coral')}
        stroke={paint('coral-deep')}
        strokeWidth={3.4}
        strokeLinejoin="round"
      />
      <circle cx={x} cy={y} r={1.3} fill={paint('sunshine-light')} />
      <circle cx={x - r * 0.35} cy={y - r * 0.2} r={1} fill={paint('sunshine-light')} />
    </g>
  );
}

const tidePool = decor(
  [1, 1],
  -66,
  -10,
  'beach',
  () => (
    <g>
      <Rock x={-24} y={-50} w={18} h={11} />
      <Rock x={0} y={-56} w={22} h={12} />
      <Rock x={24} y={-51} w={18} h={10} />
      <path
        d="M-40 -34c0-12 18-20 40-20s40 8 40 20s-18 18-40 18s-40-6-40-18z"
        fill={paint('sand-deep')}
        stroke={paint('wood-deep')}
        strokeWidth={2.2}
      />
      <path
        d="M-35 -34c0-9 16-15 35-15s35 6 35 15s-16 14-35 14s-35-5-35-14z"
        fill={paint('shallows')}
        stroke={paint('sea-deep')}
        strokeWidth={2.2}
      />
      <path
        d="M-24 -33c0-6 11-9 24-9s24 3 24 9s-11 9-24 9s-24-3-24-9z"
        fill={paint('sea')}
        opacity={0.35}
      />
      <path
        className="motion-loop art-foam"
        d="M-26 -40q6-3 12 0M8 -27q6-3 12 0"
        fill="none"
        stroke={paint('foam')}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <g transform="translate(-20 -30)">
        <Loop kind="sway" origin="50% 100%">
          <path
            d="M0 0q-4-8 0-14t0-12M5 0q4-7 1-14"
            fill="none"
            stroke={paint('leaf-deep')}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
          <path
            d="M0 0q-4-8 0-14t0-12M5 0q4-7 1-14"
            fill="none"
            stroke={paint('leaf')}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </Loop>
      </g>
      <Starfish x={12} y={-34} r={9} rot={12} />
      <Twinkle x={-6} y={-42} r={4} className="motion-loop art-loop art-glint" />
      <Rock x={-38} y={-24} w={16} h={9} />
      <Rock x={36} y={-22} w={20} h={10} />
      <Rock x={4} y={-14} w={14} h={7} />
    </g>
  ),
  true,
);

const driftwoodSign = decor([1, 1], -102, -16, 'beach', () => {
  const shell = scallopFan(-8, -64, 7.5, 5);
  return (
    <g>
      <Ground rx={20} />
      <path
        d="M-4 -24c-1-20 2-50 0-74h8c-1 20 2 52 1 74z"
        fill={paint('pebble-deep')}
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M-1 -90v20M1 -60v24"
        stroke={paint('pebble')}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <path
        d="M-30 -86h46l10 10l-10 10h-46c-3 0-5-2-5-5v-10c0-3 2-5 5-5z"
        fill={paint('pebble')}
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M-26 -81h26M-20 -71h30"
        stroke={paint('pebble-deep')}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <path
        d="M2 -82l7 6l-7 6M10 -82l7 6l-7 6"
        fill="none"
        stroke={paint('ink')}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 -58h-44l-10-9l10-9h44c3 0 5 2 5 5v8c0 3-2 5-5 5z"
        fill={paint('pebble')}
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d={shell.d}
        fill="none"
        stroke={paint('ink')}
        strokeWidth={2}
        strokeLinejoin="round"
        transform="translate(4 -2)"
      />
      {shell.ribs.map((d) => (
        <path
          key={d}
          d={d}
          stroke={paint('ink')}
          strokeWidth={1.4}
          strokeLinecap="round"
          transform="translate(4 -2)"
        />
      ))}
      <path
        d="M-4 -78c-2 1-2 4 0 5M-4 -60c-2 1-2 4 0 5"
        stroke={paint('sand-deep')}
        strokeWidth={2.6}
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(14 -30)">
        <Starfish x={0} y={0} r={7} rot={-8} />
      </g>
    </g>
  );
});

const kiteStand = decor(
  [1, 1],
  -158,
  -16,
  'beach',
  () => {
    const kite = 'M22 -150L41 -126L22 -102L4 -126Z';
    return (
      <g>
        <Ground rx={14} x={-26} />
        <Loop kind="sway" origin="0% 100%">
          <path
            d="M-26 -52C-10 -64 6 -80 22 -102"
            fill="none"
            stroke={paint('ink-soft')}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <path
            d="M22 -102c-2 8 10 10 6 18s8 10 6 18"
            fill="none"
            stroke={paint('ink-soft')}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {[
            [27, -90],
            [32, -74],
          ].map(([x, y], i) => (
            <path
              key={x}
              d={`M${x} ${y}l-6 -4v8zM${x} ${y}l6 -4v8z`}
              fill={paint(i ? 'sea' : 'sunshine')}
              stroke={paint(i ? 'sea-deep' : 'sunshine-deep')}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          ))}
          <path d="M22 -150L4 -126H22Z" fill={paint('coral')} />
          <path d="M22 -150L41 -126H22Z" fill={paint('sunshine')} />
          <path d="M4 -126L22 -102V-126Z" fill={paint('sunshine')} />
          <path d="M41 -126L22 -102V-126Z" fill={paint('coral')} />
          <path d="M22 -150V-102M4 -126H41" stroke={paint('wood-deep')} strokeWidth={2} />
          <path
            d="M10 -128q3-8 9-14"
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={2.4}
            strokeLinecap="round"
            opacity={0.6}
          />
          <path
            d={kite}
            fill="none"
            stroke={paint('wood-deep')}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
        </Loop>
        <rect x={-29} y={-60} width={6} height={36} rx={2.5} {...filled('wood', 2.2)} />
        <circle cx={-26} cy={-52} r={7.5} {...filled('sunshine', 2.2)} />
        <circle
          cx={-26}
          cy={-52}
          r={7.5}
          fill="none"
          stroke={paint('wood-deep')}
          strokeWidth={2.2}
        />
        <Line d="M-26 -58v12M-32 -52h12" color="wood-deep" width={1.8} />
        <circle cx={-26} cy={-52} r={2} fill={paint('wood-deep')} />
      </g>
    );
  },
  true,
);

export const BEACH_DECOR = {
  'beach-umbrella': beachUmbrella,
  sandcastle,
  'tide-pool': tidePool,
  'driftwood-sign': driftwoodSign,
  'kite-stand': kiteStand,
} satisfies Record<string, DecorDef>;

export { Starfish };
