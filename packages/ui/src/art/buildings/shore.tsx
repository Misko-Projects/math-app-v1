import { filled, paint } from '../core/paint';
import { Highlight } from '../core/Shading';
import {
  Awning,
  Bunting,
  Cone,
  Crate,
  Deck,
  Door,
  type DrawProps,
  Flag,
  Gable,
  Ground,
  Icon,
  Lantern,
  levelOf,
  loop,
  Palm,
  Post,
  Railing,
  Site,
  Smoke,
  Sparkle,
  stroke,
  Wall,
  Water,
  Window,
} from './parts';

// Shore workshops (05 §4): the Ten-Boat Dock (W3), Treasure Beach (W4), the Clock Tower & Ferry
// (W9) and the Practice Pier.

/**
 * The Ten-Boat: a round-bottomed boat with exactly ten seats in two groups of five (the ten-frame
 * grouping), bobbing on the water. Seats are cloud cushions with ink outlines (contrast.ts).
 */
function TenBoat({
  x,
  y,
  mast,
  sail,
  lit,
}: {
  x: number;
  y: number;
  mast: boolean;
  sail: boolean;
  lit: boolean;
}) {
  const bob = loop('bob', { delay: -1.2 });
  const seats = [-42, -33.6, -25.2, -16.8, -8.4, 8.4, 16.8, 25.2, 33.6, 42];
  return (
    <g data-part="ten-boat" className={bob.className} style={bob.style}>
      {mast ? (
        <g>
          <path d={`M${x} ${y - 24}V${y - 84}`} {...stroke('wood-deep', 3.5)} />
          {sail ? (
            <path
              d={`M${x + 3} ${y - 80}Q${x + 30} ${y - 58} ${x + 34} ${y - 30}H${x + 3}Z`}
              {...filled('cloud')}
            />
          ) : null}
          <Flag x={x} y={y - 80} h={8} w={16} fill="sunshine" />
        </g>
      ) : null}
      <path
        d={`M${x - 52} ${y - 26}H${x + 52}Q${x + 48} ${y - 6} ${x + 30} ${y - 3}H${x - 32}Q${x - 50} ${y - 6} ${x - 52} ${y - 26}Z`}
        {...filled('coral')}
      />
      <path d={`M${x - 48} ${y - 15}H${x + 48}`} {...stroke('cloud', 3)} opacity={0.85} />
      <Highlight d={`M${x - 46} ${y - 23}H${x - 10}Q${x - 30} ${y - 19} ${x - 44} ${y - 19}Z`} />
      {seats.map((dx) => (
        <circle
          key={dx}
          cx={x + dx}
          cy={y - 29}
          r={3.9}
          fill={paint('cloud')}
          stroke={paint('ink')}
          strokeWidth={2}
          data-part="seat"
        />
      ))}
      {lit ? <Lantern x={x + 50} y={y - 40} hang={8} lit={lit} s={0.8} /> : null}
    </g>
  );
}

/** Ten-Boat Dock (W3): a pier and boathouse with the Ten-Boat; planks pile up as it grows. */
export function TenBoatDock({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) {
    return (
      <Site
        w={60}
        h={34}
        cx={-104}
        y={-14}
        icon={<Icon kind="boat" />}
        foot={[3, 1]}
        noPlot
        behind={
          <g>
            <Water x={-40} y={-50} w={180} h={46} />
            {[-20, 20, 60].map((x) => (
              <Post key={x} x={x} y={-12} h={34} w={6} />
            ))}
            <Deck x1={-60} x2={0} y={-44} t={7} />
          </g>
        }
      />
    );
  }
  const pierEnd = lv === 1 ? 70 : lv === 2 ? 110 : 136;
  const posts: number[] = [];
  for (let x = -36; x <= pierEnd - 6; x += 34) posts.push(x);
  return (
    <g>
      <Ground w={140} y={-8} ry={9} />
      <Water x={-56} y={-52} w={200} h={50} />
      {posts.map((x) => (
        <Post key={x} x={x} y={-10} h={38} w={6} />
      ))}
      <Deck x1={-80} x2={pierEnd} y={-48} t={8} />
      {lv === 3 ? (
        <g>
          <Wall x={-148} y={-14} w={24} h={96} fill="sand" texture="siding" />
          <Gable cx={-136} y={-110} w={24} h={22} fill="sea-deep" overhang={6} />
          <Window x={-136} y={-88} w={10} h={12} lit={lit} shape="arch" />
          <Flag x={-136} y={-132} h={22} fill="coral" />
        </g>
      ) : null}
      <Wall x={-124} y={-14} w={58} h={lv >= 2 ? 50 : 38} fill="paper" texture="siding" />
      <Gable cx={-95} y={lv >= 2 ? -64 : -52} w={58} h={26} fill="sea-deep" />
      <path d="M-112 -14V-30A17 17 0 0 1 -78 -30V-14Z" {...filled('sea-dark')} />
      <path d="M-104 -14V-36M-95 -14V-38M-86 -14V-36" {...stroke('ink', 1.6)} opacity={0.5} />
      {lv >= 2 ? <Window x={-95} y={-50} w={12} lit={lit} shape="round" /> : null}
      {lv >= 2 ? (
        <g>
          <rect x={-60} y={-60} width={30} height={5} rx={2} {...filled('wood', 2)} />
          <rect x={-57} y={-66} width={26} height={5} rx={2} {...filled('wood', 2)} />
          <rect x={-54} y={-72} width={22} height={5} rx={2} {...filled('wood', 2)} />
          <Flag x={pierEnd - 6} y={-48} h={34} fill="sunshine" />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Bunting x1={-66} y1={-76} x2={pierEnd - 6} y2={-80} sag={5} n={9} />
          <Lantern x={-20} y={-62} hang={8} lit={lit} />
          <Post x={-20} y={-48} h={20} w={4} />
          <Lantern x={56} y={-62} hang={8} lit={lit} delay={1} />
          <Post x={56} y={-48} h={20} w={4} />
        </g>
      ) : null}
      <TenBoat x={38} y={-10} mast={lv >= 2} sail={lv === 3} lit={lit && lv === 3} />
    </g>
  );
}

/** A friendly beach crab with a raised claw. */
function Crab({ x, y }: { x: number; y: number }) {
  const wave = {
    className: 'motion-loop art-loop',
    style: { animation: 'var(--animate-wave-claw)', transformOrigin: '0% 100%' },
  };
  return (
    <g data-part="crab">
      <path
        d={`M${x - 8} ${y}l-4 3M${x - 6} ${y + 1}l-3 4M${x + 8} ${y}l4 3M${x + 6} ${y + 1}l3 4`}
        {...stroke('coral-deep', 2)}
      />
      <ellipse cx={x} cy={y - 3} rx={9} ry={6} {...filled('coral', 2.2)} />
      <path
        d={`M${x - 3} ${y - 8}V${y - 12}M${x + 3} ${y - 8}V${y - 12}`}
        {...stroke('coral-deep', 1.8)}
      />
      <circle cx={x - 3} cy={y - 13} r={2} fill={paint('ink')} />
      <circle cx={x + 3} cy={y - 13} r={2} fill={paint('ink')} />
      <path d={`M${x - 3} ${y - 2}q3 2 6 0`} {...stroke('ink', 1.4)} />
      <path d={`M${x - 9} ${y - 4}q-6 -2 -6 -9`} {...stroke('coral-deep', 2)} />
      <path
        className={wave.className}
        style={wave.style}
        d={`M${x + 9} ${y - 5}q5 -2 5 -8l-3 -3l1 5l-4 -4q-2 5 1 7`}
        {...filled('coral', 1.8)}
      />
    </g>
  );
}

/** Treasure Beach (W4): a beach hut, an X in the sand, a chest, a spade and a crab. */
export function TreasureBeach({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site
        w={50}
        h={30}
        cx={-14}
        foot={[2, 1]}
        icon={<Icon kind="gem" />}
        front={<Crab x={70} y={-4} />}
      />
    );
  const open = lv >= 2;
  return (
    <g>
      <Ground w={190} y={-6} ry={8} />
      <path d="M-96 -4Q-60 -22 10 -20Q80 -22 96 -4Z" {...filled('sand')} />
      {lv === 3 ? (
        <g>
          <Post x={-14} y={-14} h={110} w={6} />
          <path d="M-30 -124H2L-2 -110H-26Z" {...filled('wood')} />
          <path d="M-26 -118H-2" {...stroke('wood-deep', 1.6)} />
          <Flag x={-14} y={-124} h={28} fill="coral" />
          <Bunting x1={-14} y1={-100} x2={72} y2={-62} sag={5} n={6} />
        </g>
      ) : null}
      {lv >= 2 ? <Palm x={70} y={-8} h={lv === 3 ? 66 : 56} /> : null}
      <Wall x={-90} y={-12} w={52} h={36} fill="sand-deep" texture="planks" />
      <Gable cx={-64} y={-48} w={52} h={26} fill="sunshine" overhang={8} />
      <path
        d="M-100 -44l4 5l4 -5l4 5l4 -5l4 5l4 -5l4 5l4 -5l4 5l4 -5l4 5l4 -5l4 5l4 -5l4 5l4 -5"
        {...stroke('sunshine-deep', 2)}
      />
      <Awning x={-86} y={-30} w={30} h={10} stripe="sea" />
      <rect x={-85} y={-28} width={28} height={10} rx={2} {...filled('wood', 2)} />
      <Door x={-48} y={-12} w={12} h={20} fill="sea" />
      {lv >= 2 ? <Flag x={-64} y={-74} h={20} fill="sea" /> : null}
      <path d="M22 -12l16 8M38 -12l-16 8" {...stroke('coral-deep', 4)} />
      {/* The chest: closed and half-buried at level 1, open and full of gems from level 2. */}
      <g data-part="chest">
        {open ? (
          <g>
            <path d="M-16 -30Q-2 -44 12 -30Z" {...filled('wood')} transform="rotate(-18 -16 -30)" />
            <path d="M-12 -24l4 -8l5 6l5 -8l5 8l5 -6l3 8Z" {...filled('sky', 2)} />
            <circle cx={-4} cy={-27} r={3.5} {...filled('coral', 1.6)} />
            <circle cx={6} cy={-27} r={3.5} {...filled('leaf-light', 1.6)} />
          </g>
        ) : (
          <path d="M-16 -26Q-2 -40 12 -26Z" {...filled('wood')} />
        )}
        <rect x={-16} y={-26} width={28} height={16} rx={2} {...filled('wood')} />
        <path d="M-9 -26V-10M5 -26V-10" {...stroke('sunshine-deep', 3)} />
        <rect x={-5} y={-22} width={6} height={6} rx={1} {...filled('sunshine', 1.6)} />
        {open ? null : <path d="M-20 -10Q-2 -16 16 -10Z" {...filled('sand', 2)} />}
      </g>
      {open ? (
        <g>
          <Sparkle x={-10} y={-40} s={0.7} delay={0} />
          <Sparkle x={10} y={-36} s={0.55} delay={1.8} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <path d="M18 -18l6 -10l6 10Z" {...filled('sky', 2)} />
          <path d="M26 -16l5 -8l5 8Z" {...filled('coral', 2)} />
          <Sparkle x={34} y={-32} s={0.6} delay={3} />
          <Lantern x={-36} y={-40} hang={8} lit={lit} s={0.85} />
        </g>
      ) : null}
      <path d="M52 -10L44 -40" {...stroke('wood-deep', 5.5)} />
      <path d="M52 -10L44 -40" {...stroke('wood', 3)} />
      <path d="M46 -8l8 -4l-1 10q-4 3 -8 1Z" transform="translate(4 0)" {...filled('pebble', 2)} />
      <Crab x={lv >= 2 ? 30 : 76} y={-6} />
    </g>
  );
}

/** The clock face (W9): twelve tick marks and two hands, no digits. Ink on cloud (contrast.ts). */
function ClockFace({ x, y, r }: { x: number; y: number; r: number }) {
  const ticks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const r0 = r - (i % 3 === 0 ? 6 : 4);
    const sx = (x + Math.sin(a) * r0).toFixed(2);
    const sy = (y - Math.cos(a) * r0).toFixed(2);
    const ex = (x + Math.sin(a) * (r - 1.8)).toFixed(2);
    const ey = (y - Math.cos(a) * (r - 1.8)).toFixed(2);
    ticks.push(`M${sx} ${sy}L${ex} ${ey}`);
  }
  return (
    <g data-part="clock">
      <circle cx={x} cy={y} r={r + 4} {...filled('sunshine', 2.5)} />
      <circle cx={x} cy={y} r={r} fill={paint('cloud')} stroke={paint('ink')} strokeWidth={2.5} />
      <path d={ticks.join('')} {...stroke('ink', 2)} />
      <path
        d={`M${x} ${y}L${x - r * 0.38} ${y - r * 0.3}M${x} ${y}L${x + r * 0.22} ${y - r * 0.66}`}
        {...stroke('ink', 2.8)}
      />
      <circle cx={x} cy={y} r={2.2} fill={paint('ink')} />
    </g>
  );
}

/** The little ferry (W9 brings new residents): a hull, a cabin with portholes and a funnel. */
function Ferry({ x, y, lv, lit }: { x: number; y: number; lv: number; lit: boolean }) {
  const bob = loop('bob', { delay: -2.4 });
  return (
    <g data-part="ferry" className={bob.className} style={bob.style}>
      {lv >= 2 ? (
        <g>
          <rect x={x + 4} y={y - 40} width={8} height={14} rx={1.5} {...filled('coral', 2.2)} />
          <path d={`M${x + 3} ${y - 36}H${x + 13}`} {...stroke('cloud', 2.5)} />
        </g>
      ) : null}
      <rect x={x - 16} y={y - 30} width={26} height={16} rx={4} {...filled('paper')} />
      <circle
        cx={x - 9}
        cy={y - 22}
        r={3}
        fill={paint(lit ? 'sunshine-light' : 'sky-light')}
        stroke={paint('wood-deep')}
        strokeWidth={1.8}
      />
      <circle
        cx={x + 2}
        cy={y - 22}
        r={3}
        fill={paint(lit ? 'sunshine-light' : 'sky-light')}
        stroke={paint('wood-deep')}
        strokeWidth={1.8}
      />
      <path
        d={`M${x - 26} ${y - 16}H${x + 26}Q${x + 23} ${y - 2} ${x + 12} ${y}H${x - 14}Q${x - 24} ${y - 2} ${x - 26} ${y - 16}Z`}
        {...filled('sea-deep')}
      />
      <path d={`M${x - 23} ${y - 10}H${x + 23}`} {...stroke('cloud', 2.5)} />
      {lv === 3 ? <Bunting x1={x - 24} y1={y - 18} x2={x + 6} y2={y - 42} sag={2} n={3} /> : null}
    </g>
  );
}

/** Clock Tower & Ferry (W9): a stone tower with a big clock face, and the ferry at its jetty. */
export function ClockTower({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) {
    return (
      <Site
        w={44}
        h={84}
        y={-40}
        roof="tower"
        icon={<Icon kind="clock" />}
        foot={[1, 2]}
        behind={<Water x={-46} y={-32} w={92} h={26} />}
      />
    );
  }
  const shaftTop = lv === 1 ? -132 : lv === 2 ? -160 : -170;
  const clockY = shaftTop + 26;
  return (
    <g>
      <Ground w={96} y={-36} ry={8} />
      <Wall x={-24} y={-40} w={48} h={-40 - shaftTop} fill="pebble" texture="stone" />
      <Highlight d={`M-20 -46V${shaftTop + 8}H-15V-46Z`} opacity={0.35} />
      <rect x={-28} y={shaftTop - 6} width={56} height={8} rx={2} {...filled('sand-deep', 2.5)} />
      <ClockFace x={0} y={clockY} r={17} />
      <Door x={-8} y={-40} w={14} h={22} fill="wood" />
      <Window x={10} y={-70} w={9} h={12} lit={lit} shape="arch" />
      {lv >= 2 ? <Window x={-10} y={-96} w={9} h={12} lit={lit} shape="arch" /> : null}
      {lv === 1 ? (
        <Cone cx={0} y={shaftTop - 6} w={56} h={36} fill="coral" />
      ) : (
        <g>
          {/* The belfry: an open arch with the bell. */}
          <Wall x={-20} y={shaftTop - 6} w={40} h={30} fill="pebble" />
          <path
            d={`M-12 ${shaftTop - 6}V${shaftTop - 24}A12 12 0 0 1 12 ${shaftTop - 24}V${shaftTop - 6}Z`}
            {...filled('ink-soft')}
          />
          <path
            d={`M-7 ${shaftTop - 12}Q-7 ${shaftTop - 28} 0 ${shaftTop - 28}Q7 ${shaftTop - 28} 7 ${shaftTop - 12}Z`}
            {...filled('sunshine', 2.2)}
          />
          <Cone cx={0} y={shaftTop - 36} w={48} h={lv === 3 ? 56 : 40} fill="coral" />
          <Flag x={0} y={shaftTop - (lv === 3 ? 90 : 74)} h={22} fill="sunshine" />
        </g>
      )}
      {lv === 3 ? (
        <g>
          <path d={`M-30 ${shaftTop + 2}H30`} {...stroke('wood-deep', 3)} />
          <path d={`M-24 ${shaftTop + 2}v30l5 -6l5 6v-30`} {...filled('sea', 2.2)} />
          <path d={`M24 ${shaftTop + 2}v30l-5 -6l-5 6v-30`} {...filled('sea', 2.2)} />
        </g>
      ) : null}
      <Water x={-48} y={-32} w={96} h={28} />
      {lv >= 2 ? <Post x={-38} y={-8} h={26} w={5} /> : null}
      <Ferry x={14} y={-10} lv={lv} lit={lit} />
      {lv >= 2 ? <Smoke x={10} y={-56} /> : null}
    </g>
  );
}

/** Practice Pier: a plain pier with crates of tasks, a bollard and a buoy; it gains a shelter. */
export function PracticePier({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) {
    return (
      <Site
        w={44}
        h={30}
        cx={-60}
        y={-12}
        icon={<Icon kind="crate" />}
        foot={[2, 1]}
        noPlot
        behind={
          <g>
            <Water x={-30} y={-46} w={124} h={42} />
            {[0, 30, 60].map((x) => (
              <Post key={x} x={x} y={-8} h={30} w={6} />
            ))}
          </g>
        }
      />
    );
  }
  const end = lv === 1 ? 60 : 90;
  const posts: number[] = [];
  for (let x = -24; x <= end - 4; x += 28) posts.push(x);
  return (
    <g>
      <Ground w={120} y={-6} ry={8} />
      <Water x={-40} y={-48} w={136} h={44} />
      {posts.map((x) => (
        <Post key={x} x={x} y={-8} h={30} w={6} />
      ))}
      <Deck x1={-92} x2={end} y={-36} t={8} />
      {lv === 3 ? (
        <g>
          <Post x={-50} y={-36} h={56} w={5} />
          <Post x={40} y={-36} h={56} w={5} />
          <Gable cx={-5} y={-92} w={96} h={24} fill="sea" />
          <Bunting x1={-50} y1={-88} x2={40} y2={-88} sag={4} n={8} />
          <Lantern x={-50} y={-72} hang={4} lit={lit} />
          <Lantern x={40} y={-72} hang={4} lit={lit} delay={1} />
        </g>
      ) : lv === 2 ? (
        <g>
          <Post x={-44} y={-36} h={40} w={5} />
          <Post x={20} y={-36} h={40} w={5} />
          <Awning x={-52} y={-74} w={80} h={12} stripe="sunshine" />
        </g>
      ) : null}
      <Crate x={-80} y={-36} s={16} />
      <Crate x={-64} y={-36} s={14} />
      {lv >= 2 ? (
        <g>
          <Crate x={-74} y={-52} s={14} />
          <Crate x={-30} y={-36} s={14} fill="sand-deep" />
          <Crate x={-16} y={-36} s={12} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Crate x={-23} y={-50} s={13} fill="sand-deep" />
          <Crate x={-58} y={-50} s={12} />
        </g>
      ) : null}
      <rect x={end - 16} y={-44} width={9} height={9} rx={3} {...filled('ink-soft', 2)} />
      <path d={`M${end - 18} -40h13`} {...stroke('sand-deep', 2.5)} />
      <g data-part="buoy">
        <circle
          cx={lv >= 2 ? 72 : 20}
          cy={-18}
          r={8}
          fill="none"
          stroke={paint('coral-deep')}
          strokeWidth={7}
        />
        <circle
          cx={lv >= 2 ? 72 : 20}
          cy={-18}
          r={8}
          fill="none"
          stroke={paint('coral')}
          strokeWidth={4.4}
          strokeDasharray="6.3 6.3"
        />
        <circle
          cx={lv >= 2 ? 72 : 20}
          cy={-18}
          r={8}
          fill="none"
          stroke={paint('cloud')}
          strokeWidth={4.4}
          strokeDasharray="6.3 6.3"
          strokeDashoffset={6.3}
        />
      </g>
      {lv >= 2 ? <Flag x={end - 2} y={-36} h={34} fill="coral" /> : null}
      <Railing x1={-92} x2={-40} y={-36} h={10} step={26} />
    </g>
  );
}
