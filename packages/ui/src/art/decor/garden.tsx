import { filled, paint } from '../core/paint';
import {
  Blossom,
  bumpyBlob,
  type DecorDef,
  decor,
  G1,
  Glow,
  Ground,
  groundY,
  LightPool,
  Line,
  Loop,
  Post,
  quadAt,
  Shine,
  Stem,
  scallopFan,
  Twinkle,
} from './kit';

/*
 * Island and garden decor (05 §6: flowers, lamps, flags, paths, fountains), earned through projects
 * and building levels. Drawn in scene units around the footprint's bottom-centre (see kit.tsx).
 */

const shellBench = decor([1, 1], -84, -18, 'island', () => {
  const fan = scallopFan(0, -48, 31, 7);
  return (
    <g>
      <Ground rx={36} />
      <path d={fan.d} {...filled('sun')} />
      {fan.ribs.map((d) => (
        <Line key={d} d={d} color="sun-deep" width={2.2} />
      ))}
      <Shine d="M-22 -60q5-11 15-15" width={3} opacity={0.55} />
      <rect x={-30} y={-44} width={6} height={19} rx={2.5} {...filled('wood', 2.5)} />
      <rect x={24} y={-44} width={6} height={19} rx={2.5} {...filled('wood', 2.5)} />
      <rect x={-36} y={-45} width={72} height={8} rx={3.5} {...filled('wood-deep', 2.5)} />
      <rect x={-36} y={-52} width={72} height={9} rx={3.5} {...filled('wood', 2.5)} />
      <Line d="M-30 -47.5h60" color="wood-deep" width={1.6} opacity={0.6} />
      <Shine d="M-31 -50h18" width={2.2} opacity={0.6} />
    </g>
  );
});

const flowerPot = decor([1, 1], -92, -18, 'island', () => (
  <g>
    <Ground rx={20} />
    <Stem x={-8} y={-52} h={22} lean={-6} />
    <Stem x={8} y={-52} h={26} lean={5} />
    <Stem x={0} y={-52} h={34} lean={0} />
    <path d={bumpyBlob(0, -56, 17, 8, 7, 1.15)} {...filled('leaf', 2.2)} />
    <Blossom x={-14} y={-76} r={9} petal="coral" />
    <Blossom x={13} y={-80} r={9} petal="cloud" />
    <Blossom x={0} y={-86} r={9.5} petal="sun" />
    <path d="M-15 -51h30l-4 24h-22z" {...filled('coral')} />
    <path d="M-15 -51h30l-1 6h-28z" fill={paint('coral-deep')} opacity={0.35} />
    <rect x={-19} y={-57} width={38} height={8} rx={3} {...filled('coral')} />
    <Shine d="M-15 -54.5h12" width={2.4} opacity={0.6} />
    <Shine d="M-10 -42l1.5 10" width={2.6} opacity={0.5} />
  </g>
));

function Tulip({
  x,
  y,
  h,
  color,
}: {
  x: number;
  y: number;
  h: number;
  color: 'coral' | 'sunshine' | 'sun' | 'cloud';
}) {
  const top = y - h;
  return (
    <g>
      <path
        d={`M${x} ${y}V${top + 6}`}
        stroke={paint('leaf-deep')}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <path d={`M${x} ${y - 2}q-9 -6 -8 -16q7 5 8 14z`} {...filled('leaf', 1.6)} />
      <path
        d={`M${x - 6.5} ${top - 4}q0 11 6.5 11q6.5 0 6.5 -11l-3.2 3.5l-3.3 -5.5l-3.3 5.5z`}
        {...filled(color, 2)}
      />
      <path
        d={`M${x - 3.5} ${top - 1}q0 4 2 5.5`}
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={1.8}
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  );
}

const tulipPatch = decor([1, 1], -78, -14, 'island', () => (
  <g>
    <path d="M-40 -30c0-8 18-13 40-13s40 5 40 13s-18 12-40 12s-40-4-40-12z" {...filled('wood')} />
    <path
      d="M-33 -31c0-5 15-8 33-8s33 3 33 8s-15 8-33 8s-33-3-33-8z"
      fill={paint('wood-deep')}
      opacity={0.35}
    />
    <Tulip x={-22} y={-36} h={28} color="coral" />
    <Tulip x={0} y={-38} h={34} color="sunshine" />
    <Tulip x={22} y={-36} h={29} color="sun" />
    <Tulip x={-11} y={-27} h={24} color="sunshine" />
    <Tulip x={12} y={-27} h={25} color="coral" />
  </g>
));

const daisyPatch = decor([1, 1], -70, -14, 'island', () => {
  const daisies: [number, number, number][] = [
    [-24, -42, 7],
    [-6, -52, 7.5],
    [14, -47, 7],
    [28, -36, 6.5],
    [-14, -31, 6.5],
    [6, -31, 7],
  ];
  return (
    <g>
      <path d={bumpyBlob(0, -32, 40, 13, 11, 1.05)} {...filled('leaf', 2.4)} />
      <path
        d="M-30 -28q12 6 30 6t30-6"
        fill="none"
        stroke={paint('leaf-deep')}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.6}
      />
      {daisies.map(([x, y, r]) => (
        <g key={`${x},${y}`}>
          <path
            d={`M${x} ${y + r}v${-y - 30 - r > 0 ? 4 : 6}`}
            stroke={paint('leaf-deep')}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Blossom x={x} y={y} r={r} petal="cloud" />
        </g>
      ))}
    </g>
  );
});

function Frond({
  x,
  y,
  angle,
  len,
  flip = 1,
  back = false,
}: {
  x: number;
  y: number;
  angle: number;
  len: number;
  flip?: 1 | -1;
  back?: boolean;
}) {
  const w = 10;
  const d = 10;
  return (
    <g transform={`translate(${x} ${y}) scale(${flip} 1) rotate(${angle})`}>
      <path
        d={`M0 0C${len * 0.3} ${-w} ${len * 0.7} ${-w * 0.7} ${len} ${d}C${len * 0.68} ${w * 0.15} ${len * 0.3} ${w * 0.5} 0 0Z`}
        {...filled(back ? 'leaf-deep' : 'leaf', 2.2)}
      />
      <path
        d={`M3 0Q${len * 0.55} ${-w * 0.3} ${len - 3} ${d - 1}`}
        fill="none"
        stroke={paint(back ? 'leaf-dark' : 'leaf-deep')}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {[0.35, 0.55, 0.75].map((s) => (
        <path
          key={s}
          d={`M${len * s} ${-w * 0.2 + d * s * s}l-2 ${w * 0.55}`}
          stroke={paint(back ? 'leaf-dark' : 'leaf-deep')}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

const palmTree = decor(
  [1, 1],
  -150,
  -16,
  'island',
  () => {
    const a = { x: 0, y: G1 - 2 };
    const c = { x: -12, y: -70 };
    const b = { x: 6, y: -114 };
    const rings = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => quadAt(a, c, b, t));
    return (
      <g>
        <Ground rx={18} />
        <Loop kind="sway" origin="50% 100%">
          <Frond x={6} y={-114} angle={-60} len={36} back />
          <Frond x={6} y={-114} angle={-60} len={36} flip={-1} back />
          <path
            d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
            fill="none"
            stroke={paint('wood-deep')}
            strokeWidth={13}
            strokeLinecap="round"
          />
          <path
            d={`M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`}
            fill="none"
            stroke={paint('wood')}
            strokeWidth={8}
            strokeLinecap="round"
          />
          {rings.map((r) => (
            <path
              key={r.x}
              d={`M${r.x - r.nx * 4.5} ${r.y - r.ny * 4.5}q${r.ny * 2} ${-r.nx * 2} ${r.nx * 9} ${r.ny * 9}`}
              fill="none"
              stroke={paint('wood-deep')}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          ))}
          <path
            d="M-7 -40q-3 -14 -1 -26"
            fill="none"
            stroke={paint('cloud')}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.5}
          />
          <Frond x={6} y={-114} angle={-22} len={42} />
          <Frond x={6} y={-114} angle={-22} len={42} flip={-1} />
          <circle cx={0} cy={-109} r={5.5} {...filled('wood', 2.2)} />
          <circle cx={11} cy={-108} r={5.5} {...filled('wood', 2.2)} />
          <circle cx={5.5} cy={-104} r={5.5} {...filled('wood', 2.2)} />
          <Frond x={6} y={-115} angle={14} len={40} />
          <Frond x={6} y={-115} angle={14} len={40} flip={-1} />
        </Loop>
      </g>
    );
  },
  true,
);

const roundBush = decor([1, 1], -82, -16, 'island', () => (
  <g>
    <Ground rx={34} />
    <path d={bumpyBlob(0, -50, 34, 26, 10, 1.1)} {...filled('leaf', 2.6)} />
    <path
      d="M-28 -36q28 16 56 0q-6 12-28 13q-22-1-28-13z"
      fill={paint('leaf-deep')}
      opacity={0.45}
    />
    <path d={bumpyBlob(-12, -62, 11, 8, 6, 1.1)} fill={paint('leaf-light')} opacity={0.85} />
    <path
      d="M-2 -66q6-6 13-5M8 -50q6-5 12-3M-22 -46q5-4 11-3"
      fill="none"
      stroke={paint('leaf-deep')}
      strokeWidth={2}
      strokeLinecap="round"
    />
    {[
      [-16, -40],
      [14, -60],
      [20, -42],
      [-4, -52],
    ].map(([x, y]) => (
      <circle key={`${x}`} cx={x} cy={y} r={3.4} {...filled('coral', 1.6)} />
    ))}
  </g>
));

const picketFence = decor([1, 1], -66, -16, 'island', () => {
  const xs = [-40, -24, -8, 8, 24, 40];
  return (
    <g>
      <Ground rx={46} ry={6} />
      <rect x={-46} y={-54} width={92} height={6} rx={3} {...filled('pebble', 2.2)} />
      <rect x={-46} y={-38} width={92} height={6} rx={3} {...filled('pebble', 2.2)} />
      {xs.map((x) => (
        <g key={x}>
          <path d={`M${x - 5.5} -24v-32l5.5-7l5.5 7v32q-5.5 2.5-11 0z`} {...filled('cloud', 2.4)} />
          <path d={`M${x + 2} -56l3.5-2.8v34.3q-1.6 .8-3.5 1z`} fill={paint('pebble')} />
          <path
            d={`M${x - 5.5} -24v-32l5.5-7l5.5 7v32q-5.5 2.5-11 0z`}
            fill="none"
            stroke={paint('ink-soft')}
            strokeWidth={2.2}
            strokeLinejoin="round"
          />
        </g>
      ))}
    </g>
  );
});

function FlatStone({
  x,
  y,
  rx,
  ry,
  tilt = 0,
}: {
  x: number;
  y: number;
  rx: number;
  ry: number;
  tilt?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      <ellipse cx={0} cy={3.5} rx={rx} ry={ry} {...filled('pebble-deep', 2.4)} />
      <ellipse cx={0} cy={0} rx={rx} ry={ry} {...filled('pebble', 2.4)} />
      <path
        d={`M${-rx * 0.6} ${-ry * 0.2}q${rx * 0.25} ${-ry * 0.6} ${rx * 0.6} ${-ry * 0.6}`}
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.75}
      />
    </g>
  );
}

const steppingPath = decor([1, 1], -70, -4, 'island', () => (
  <g>
    <FlatStone x={30} y={-58} rx={12} ry={7} tilt={-6} />
    <FlatStone x={6} y={-47} rx={14} ry={8} tilt={4} />
    <FlatStone x={-16} y={-33} rx={13} ry={7.5} tilt={-4} />
    <FlatStone x={-32} y={-16} rx={14} ry={8} tilt={6} />
    <path
      d="M18 -36q2-5 5-7M22 -35q1-4 3-5M-36 -38q1-4 4-6M40 -42q2-4 4-5"
      fill="none"
      stroke={paint('leaf-deep')}
      strokeWidth={2}
      strokeLinecap="round"
    />
  </g>
));

function Boulder({ d, side, shine }: { d: string; side: string; shine: string }) {
  return (
    <g>
      <path d={d} {...filled('pebble', 2.6)} />
      <path d={side} fill={paint('pebble-deep')} opacity={0.75} />
      <Shine d={shine} width={3} opacity={0.75} />
      <path d={d} fill="none" stroke={paint('ink-soft')} strokeWidth={2.6} strokeLinejoin="round" />
    </g>
  );
}

const rockPile = decor([1, 1], -78, -16, 'island', () => (
  <g>
    <Ground rx={38} />
    <Boulder
      d="M-22 -40c-4-18 6-32 22-32c16 0 26 12 22 30c-2 8-12 12-22 12c-10 0-20-3-22-10z"
      side="M-20 -36c8 6 30 6 42-4c-2 8-12 12-22 12c-10 0-18-3-20-8z"
      shine="M-12 -58q4-8 12-9"
    />
    <path d="M-6 -71q4-6 10-2q4-5 9 0q-9 4-19 2z" {...filled('leaf', 1.8)} />
    <Boulder
      d="M-38 -30c-2-10 4-18 14-18c10 0 16 6 16 16c0 7-7 10-15 10c-8 0-14-2-15-8z"
      side="M-37 -28c6 5 20 6 29-2c-1 6-7 8-14 8c-8 0-13-2-15-6z"
      shine="M-31 -40q3-4 8-5"
    />
    <Boulder
      d="M6 -28c-1-10 6-16 15-16c10 0 17 6 16 15c-1 6-7 9-16 9c-8 0-15-2-15-8z"
      side="M7 -26c6 5 22 5 29-2c-1 5-7 8-15 8c-8 0-13-2-14-6z"
      shine="M12 -38q3-4 8-4"
    />
  </g>
));

const mailbox = decor([1, 1], -92, -16, 'island', () => (
  <g>
    <Ground rx={16} />
    <rect x={-4} y={-58} width={8} height={33} rx={2.5} {...filled('wood', 2.4)} />
    <Line d="M-1.5 -52v20" color="wood-deep" width={1.5} opacity={0.6} />
    <path d="M-22 -56v-16a14 14 0 0 1 28 0v16z" {...filled('sea')} />
    <path d="M-22 -60h28v4h-28z" fill={paint('sea-deep')} opacity={0.5} />
    <path d="M6 -56v-16a14 14 0 0 0-14-14h6a14 14 0 0 1 14 14v16z" {...filled('sea-deep')} />
    <path
      d="M-17 -73q1-7 8-9"
      fill="none"
      stroke={paint('cloud')}
      strokeWidth={2.6}
      strokeLinecap="round"
      opacity={0.7}
    />
    <circle
      cx={-8}
      cy={-66}
      r={2.2}
      fill={paint('sunshine')}
      stroke={paint('sunshine-deep')}
      strokeWidth={1.2}
    />
    <path d="M13 -62v-26" stroke={paint('ink')} strokeWidth={2.6} strokeLinecap="round" />
    <path d="M10 -62h4" stroke={paint('ink')} strokeWidth={3} strokeLinecap="round" />
    <path
      d="M13 -88h12l-3 4.5l3 4.5h-12z"
      fill={paint('coral')}
      stroke={paint('ink')}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  </g>
));

function Lantern({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return (
    <g>
      {lit ? <Glow x={x} y={y + 12} r={30} /> : null}
      <path
        d={`M${x - 11} ${y + 2}l3-8h16l3 8z`}
        fill={paint('ink-soft')}
        stroke={paint('ink')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d={`M${x} ${y - 9}v-4`} stroke={paint('ink')} strokeWidth={2.4} strokeLinecap="round" />
      <circle
        cx={x}
        cy={y - 14}
        r={2.4}
        fill={paint('sunshine')}
        stroke={paint('ink')}
        strokeWidth={1.5}
      />
      <path
        d={`M${x - 8} ${y + 2}h16l-2 20h-12z`}
        fill={paint(lit ? 'sunshine-light' : 'sky-light')}
        stroke={paint('ink')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {lit ? <circle cx={x} cy={y + 12} r={4} fill={paint('cloud')} /> : null}
      <path
        d={`M${x} ${y + 2}v20M${x - 9} ${y + 12}h18`}
        stroke={paint('ink')}
        strokeWidth={1.6}
        opacity={0.8}
      />
      {lit ? null : (
        <path
          d={`M${x - 5} ${y + 5}l2 5`}
          stroke={paint('cloud')}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
      <rect
        x={x - 8}
        y={y + 21}
        width={16}
        height={4}
        rx={1.5}
        fill={paint('ink-soft')}
        stroke={paint('ink')}
        strokeWidth={1.8}
      />
    </g>
  );
}

const lampPost = decor([1, 1], -136, -16, 'island', ({ lit }) => (
  <g>
    <Ground rx={16} />
    {lit ? <LightPool rx={34} /> : null}
    <path
      d="M-10 -24v-6c0-3 3-5 6-5h8c3 0 6 2 6 5v6z"
      fill={paint('ink-soft')}
      stroke={paint('ink')}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Post x={0} top={-100} bottom={-32} w={5.5} />
    <path d="M-6 -98h12" stroke={paint('ink')} strokeWidth={3} strokeLinecap="round" />
    <Lantern x={0} y={-118} lit={lit} />
  </g>
));

const flagPole = decor(
  [1, 1],
  -136,
  -16,
  'island',
  () => (
    <g>
      <Ground rx={16} />
      <path d="M-12 -24v-5c0-3 3-5 6-5h12c3 0 6 2 6 5v5z" {...filled('pebble', 2.2)} />
      <path
        d="M-12 -24v-5c0-3 3-5 6-5h12c3 0 6 2 6 5v5z"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <path d="M-1 -34V-124" stroke={paint('ink')} strokeWidth={4.4} strokeLinecap="round" />
      <path d="M-1 -34V-124" stroke={paint('pebble')} strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={-1} cy={-127} r={4} {...filled('sunshine', 2)} />
      <g transform="translate(1 -122)">
        <Loop kind="flutter" origin="0% 50%">
          <path
            d="M0 0c10-4 22 4 40 0v26c-18 4-30-4-40 0z"
            fill={paint('coral')}
            stroke={paint('ink')}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <path
            d="M20 5.5l2.2 4.6l5 .7l-3.6 3.5l.9 5l-4.5-2.4l-4.5 2.4l.9-5l-3.6-3.5l5-.7z"
            fill={paint('sunshine-light')}
            stroke={paint('ink')}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </Loop>
      </g>
    </g>
  ),
  true,
);

const fountain = decor(
  [2, 2],
  -170,
  -14,
  'island',
  () => {
    const g = groundY([2, 2]);
    return (
      <g>
        <Ground rx={88} y={g + 6} ry={16} />
        <ellipse cx={0} cy={g + 4} rx={82} ry={34} {...filled('pebble-deep', 2.6)} />
        <ellipse
          cx={0}
          cy={g + 4}
          rx={82}
          ry={34}
          fill="none"
          stroke={paint('ink-soft')}
          strokeWidth={2.6}
        />
        <path d={`M-82 ${g + 4}v-10a82 34 0 0 1 164 0v10`} fill={paint('pebble-deep')} />
        <ellipse cx={0} cy={g - 6} rx={82} ry={34} {...filled('pebble', 2.6)} />
        <ellipse cx={0} cy={g - 6} rx={70} ry={26} {...filled('shallows', 2.4)} />
        <ellipse
          cx={0}
          cy={g - 6}
          rx={70}
          ry={26}
          fill="none"
          stroke={paint('sea-deep')}
          strokeWidth={2.2}
        />
        <ellipse
          className="motion-loop art-foam"
          cx={0}
          cy={g - 4}
          rx={52}
          ry={17}
          fill="none"
          stroke={paint('foam')}
          strokeWidth={2.6}
        />
        <ellipse
          className="motion-loop art-foam"
          style={{ animationDelay: '-2s' }}
          cx={0}
          cy={g - 3}
          rx={36}
          ry={11}
          fill="none"
          stroke={paint('foam')}
          strokeWidth={2.2}
        />
        <path d={`M-12 ${g - 4}v-40h24v40c0 4-24 4-24 0z`} {...filled('pebble', 2.4)} />
        <path d={`M4 ${g - 44}h8v40c-2 2-5 3-8 3z`} fill={paint('pebble-deep')} opacity={0.6} />
        <path
          d={`M-12 ${g - 4}v-40h24v40c0 4-24 4-24 0z`}
          fill="none"
          stroke={paint('ink-soft')}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <path d={`M-34 ${g - 48}c0 10 15 16 34 16s34-6 34-16z`} {...filled('pebble-deep', 2.4)} />
        <path
          d={`M-34 ${g - 48}c0 10 15 16 34 16s34-6 34-16`}
          fill="none"
          stroke={paint('ink-soft')}
          strokeWidth={2.4}
        />
        <ellipse cx={0} cy={g - 48} rx={34} ry={10} {...filled('pebble', 2.4)} />
        <ellipse
          cx={0}
          cy={g - 48}
          rx={27}
          ry={6.5}
          fill={paint('shallows')}
          stroke={paint('sea-deep')}
          strokeWidth={2}
        />
        <Line d={`M-30 ${g - 47}q-14 6-18 24M30 ${g - 47}q14 6 18 24`} color="sea-deep" width={6} />
        <Line d={`M-30 ${g - 47}q-14 6-18 24M30 ${g - 47}q14 6 18 24`} color="shallows" width={3} />
        <Line
          d={`M-26 ${g - 46}q-10 8-12 26M26 ${g - 46}q10 8 12 26`}
          color="foam"
          width={2}
          opacity={0.9}
        />
        <path d={`M-4 ${g - 50}v-12a4 4 0 0 1 8 0v12z`} {...filled('pebble', 2)} />
        <Line
          d={`M0 ${g - 66}q-14-16-24 4M0 ${g - 66}q14-16 24 4M0 ${g - 66}v-18`}
          color="sea-deep"
          width={5.5}
        />
        <Line
          d={`M0 ${g - 66}q-14-16-24 4M0 ${g - 66}q14-16 24 4M0 ${g - 66}v-18`}
          color="foam"
          width={2.6}
        />
        <g className="motion-loop art-loop art-hop">
          <circle cx={0} cy={g - 90} r={4} {...filled('foam', 2)} />
          <circle cx={-26} cy={g - 54} r={2.6} {...filled('foam', 1.6)} />
          <circle cx={26} cy={g - 54} r={2.6} {...filled('foam', 1.6)} />
        </g>
        <g className="motion-loop art-loop art-hop" style={{ animationDelay: '-0.9s' }}>
          <circle cx={-50} cy={g - 18} r={3} {...filled('foam', 1.6)} />
          <circle cx={50} cy={g - 18} r={3} {...filled('foam', 1.6)} />
        </g>
        <Twinkle x={-40} y={g - 2} r={5} className="motion-loop art-loop art-glint" />
        <Twinkle x={44} y={g - 12} r={4} className="motion-loop art-loop art-glint" delay={-2.4} />
        <Shine d={`M-64 ${g - 18}q14-14 40-18`} width={3} opacity={0.6} />
      </g>
    );
  },
  true,
);

const birdBath = decor(
  [1, 1],
  -86,
  -16,
  'island',
  () => (
    <g>
      <Ground rx={20} />
      <path d="M-14 -24c0-6 6-8 14-8s14 2 14 8z" {...filled('pebble', 2.4)} />
      <path d="M-6 -30c2-6 2-16 0-22h12c-2 6-2 16 0 22z" {...filled('pebble', 2.4)} />
      <path d="M2 -52h4c-2 6-2 16 0 22h-3z" fill={paint('pebble-deep')} opacity={0.6} />
      <path d="M-26 -58c0 6 12 10 26 10s26-4 26-10z" {...filled('pebble-deep', 2.4)} />
      <ellipse cx={0} cy={-58} rx={26} ry={7.5} {...filled('pebble', 2.4)} />
      <ellipse
        cx={0}
        cy={-58}
        rx={20}
        ry={4.6}
        fill={paint('shallows')}
        stroke={paint('sea-deep')}
        strokeWidth={1.8}
      />
      <path
        className="motion-loop art-foam"
        d="M-10 -58q5-2 10 0"
        fill="none"
        stroke={paint('foam')}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M-26 -58c0 6 12 10 26 10s26-4 26-10"
        fill="none"
        stroke={paint('ink-soft')}
        strokeWidth={2.4}
      />
      <g className="motion-loop art-loop art-hop">
        <path
          d="M10 -62c-2-8 3-14 10-13c4-5 11-3 11 3c4 0 6 2 7 4l-6 1c-1 4-5 7-10 7z"
          {...filled('sunshine', 2)}
        />
        <path
          d="M18 -66q4 4 9 1"
          fill="none"
          stroke={paint('sunshine-deep')}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <path
          d="M36 -70l5-1-5 3z"
          fill={paint('sun')}
          stroke={paint('sun-deep')}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <circle cx={30} cy={-72} r={1.6} fill={paint('ink')} />
        <path
          d="M17 -59v3M22 -59v3"
          stroke={paint('sun-deep')}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <path d="M11 -64l-6-3l5 6z" {...filled('sunshine', 1.4)} />
      </g>
    </g>
  ),
  true,
);

function Sail({ angle }: { angle: number }) {
  return (
    <g transform={`rotate(${angle})`}>
      <path
        d="M2 -44h12v32H2z"
        fill={paint('paper')}
        stroke={paint('wood-deep')}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <path d="M8 -44v32M2 -33.3h12M2 -22.6h12" stroke={paint('wood')} strokeWidth={1.6} />
      <rect x={-2.5} y={-46} width={5} height={42} rx={2.5} {...filled('wood', 2)} />
    </g>
  );
}

const windmill = decor(
  [1, 1],
  -158,
  -16,
  'island',
  () => (
    <g>
      <Ground rx={30} />
      <path d="M-22 -24l7-74h30l7 74z" fill={paint('sand-shadow')} />
      <path d="M6 -98h9l7 74h-11z" fill={paint('sand-deep')} opacity={0.8} />
      <path
        d="M-20 -50h40M-18 -74h36M-6 -62h-12M10 -38h11M4 -86h10"
        stroke={paint('sand-deep')}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <path
        d="M-22 -24l7-74h30l7 74z"
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <path d="M-8 -24v-15a8 8 0 0 1 16 0v15z" {...filled('wood', 2.2)} />
      <path d="M0 -46v21" stroke={paint('wood-deep')} strokeWidth={1.6} />
      <path d="M-20 -96c2-14 10-22 20-22s18 8 20 22z" {...filled('coral', 2.6)} />
      <path
        d="M-14 -104q4-8 10-9"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={2.6}
        strokeLinecap="round"
        opacity={0.6}
      />
      <rect x={-23} y={-99} width={46} height={6} rx={3} {...filled('coral', 2.2)} />
      <g transform="translate(0 -106)">
        <Loop kind="spin">
          <Sail angle={0} />
          <Sail angle={90} />
          <Sail angle={180} />
          <Sail angle={270} />
        </Loop>
      </g>
      <circle cx={0} cy={-106} r={6} {...filled('sunshine', 2.4)} />
      <circle cx={0} cy={-106} r={2} fill={paint('wood-deep')} />
    </g>
  ),
  true,
);

const gardenArch = decor([1, 1], -118, -16, 'island', () => {
  const arch = 'M-34 -26V-72a34 34 0 0 1 68 0V-26';
  const leaves: [number, number][] = [
    [-34, -40],
    [-35, -60],
    [-31, -82],
    [-20, -100],
    [0, -106],
    [20, -100],
    [31, -82],
    [35, -60],
    [34, -40],
  ];
  return (
    <g>
      <Ground rx={42} />
      <path
        d={arch}
        fill="none"
        stroke={paint('wood-deep')}
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path d={arch} fill="none" stroke={paint('cloud')} strokeWidth={5.5} strokeLinecap="round" />
      <path d="M-34 -50h-0.1M34 -50h.1" stroke={paint('wood-deep')} strokeWidth={2} />
      {leaves.map(([x, y], i) => (
        <path
          key={`${x},${y}`}
          d={bumpyBlob(x, y, 9, 7, 5, 1.15)}
          {...filled(i % 2 ? 'leaf' : 'leaf-light', 2)}
        />
      ))}
      <Blossom x={-31} y={-70} r={7} petal="coral" />
      <Blossom x={-12} y={-104} r={7.5} petal="sun" />
      <Blossom x={14} y={-103} r={7} petal="coral" />
      <Blossom x={33} y={-72} r={7} petal="cloud" />
      <Blossom x={-34} y={-48} r={6} petal="cloud" />
      <Blossom x={34} y={-46} r={6} petal="sun" />
    </g>
  );
});

const swingBench = decor(
  [1, 1],
  -116,
  -16,
  'island',
  () => (
    <g>
      <Ground rx={42} />
      <path
        d="M-40 -24l10-70M40 -24l-10-70"
        stroke={paint('wood-deep')}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d="M-40 -24l10-70M40 -24l-10-70"
        stroke={paint('wood')}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M-38 -96c0-10 76-10 76 0z"
        fill={paint('coral')}
        stroke={paint('coral-deep')}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d="M-38 -96h76l-3 7c-5 3-9 3-12 0c-4 3-9 3-12 0c-4 3-9 3-13 0c-4 3-9 3-12 0c-4 3-9 3-12 0c-4 3-8 3-12 0z"
        {...filled('paper', 2.2)}
      />
      <path
        d="M-25 -96v6M-13 -96v6M0 -96v6M13 -96v6M25 -96v6"
        stroke={paint('coral')}
        strokeWidth={5}
      />
      <g transform="translate(0 -88)">
        <Loop kind="sway" origin="50% 0%">
          <path
            d="M-20 0v40M20 0v40"
            stroke={paint('wood-deep')}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <rect x={-25} y={22} width={50} height={8} rx={3} {...filled('wood', 2.2)} />
          <rect x={-25} y={36} width={50} height={7} rx={3} {...filled('wood-deep', 2.2)} />
          <rect x={-25} y={31} width={50} height={8} rx={3} {...filled('wood', 2.2)} />
          <path
            d="M-20 25h14"
            stroke={paint('cloud')}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={0.6}
          />
        </Loop>
      </g>
    </g>
  ),
  true,
);

export const GARDEN_DECOR = {
  'shell-bench': shellBench,
  'flower-pot': flowerPot,
  'tulip-patch': tulipPatch,
  'daisy-patch': daisyPatch,
  'palm-tree': palmTree,
  'round-bush': roundBush,
  'picket-fence': picketFence,
  'stepping-path': steppingPath,
  'rock-pile': rockPile,
  mailbox,
  'lamp-post': lampPost,
  'flag-pole': flagPole,
  fountain,
  'bird-bath': birdBath,
  windmill,
  'garden-arch': gardenArch,
  'swing-bench': swingBench,
} satisfies Record<string, DecorDef>;

export { Lantern };
