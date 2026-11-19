import type { ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { filled, paint } from '../core/paint';
import { Highlight } from '../core/Shading';
import {
  Awning,
  Barrel,
  Bunting,
  Bush,
  Chimney,
  Cone,
  Crate,
  Deck,
  Dome,
  Door,
  type DrawProps,
  Flag,
  Flowers,
  Gable,
  Glow,
  Ground,
  Icon,
  Lantern,
  levelOf,
  loop,
  Post,
  Railing,
  ShedRoof,
  Site,
  Smoke,
  Sparkle,
  Star,
  stroke,
  Tree,
  Wall,
  Window,
} from './parts';

// Workshops on land (05 §4): Road Crew, Lantern Grove, Brick Factory, Garden Terraces, Bakery,
// Market, Builder's Yard, Weigh Station & Lookout, Rhythm Orchard and Puzzle Tower.

/** A stack of grey road stones (W1 produces road stones). */
function StonePile({ x, y, rows = 3 }: { x: number; y: number; rows?: number }) {
  const stones: [number, number][] = [];
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let i = 0; i < n; i++) stones.push([x + (i - (n - 1) / 2) * 17, y - r * 9]);
  }
  return (
    <g data-part="stones">
      {stones.map(([sx, sy]) => (
        <g key={`${sx},${sy}`}>
          <ellipse cx={sx} cy={sy - 4} rx={9} ry={6} {...filled('pebble', 2.5)} />
          <path d={`M${sx - 5} ${sy - 6}q3 -3 7 -2`} {...stroke('cloud', 2)} opacity={0.8} />
        </g>
      ))}
    </g>
  );
}

function Cone3({ x, y }: { x: number; y: number }) {
  return (
    <g data-part="cone">
      <rect x={x - 9} y={y - 3} width={18} height={4} rx={1.5} {...filled('coral-deep', 1.8)} />
      <path
        d={`M${x - 6} ${y - 3}L${x - 1.5} ${y - 22}H${x + 1.5}L${x + 6} ${y - 3}Z`}
        {...filled('coral', 2.2)}
      />
      <path d={`M${x - 4} ${y - 10}H${x + 4}`} {...stroke('cloud', 3)} />
    </g>
  );
}

/** Road Crew (W1): a tool shed, stacks of road stones, a wheelbarrow and cones; a crane at the top. */
export function RoadCrew({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) return <Site w={52} h={32} cx={-14} foot={[2, 1]} icon={<Icon kind="stone" />} />;
  return (
    <g>
      <Ground w={lv === 1 ? 170 : 196} y={-6} ry={9} />
      {lv === 3 ? (
        <g data-part="crane">
          <path d="M58 -12L64 -150M82 -12L68 -150" {...stroke('wood-deep', 6)} />
          <path d="M58 -12L64 -150M82 -12L68 -150" {...stroke('wood', 3.5)} />
          <path
            d="M60 -40L80 -60M62 -80L78 -100M64 -118L74 -134M80 -40L60 -60M78 -80L62 -100"
            {...stroke('wood-deep', 2)}
          />
          <path d="M70 -150L-4 -132" {...stroke('wood-deep', 6)} />
          <path d="M70 -150L-4 -132" {...stroke('sunshine', 3.5)} />
          <path d="M2 -133V-96" {...stroke('ink-soft', 1.8)} />
          <ellipse cx={2} cy={-90} rx={10} ry={6.5} {...filled('pebble', 2.5)} />
          <Flag x={66} y={-152} h={20} fill="coral" />
        </g>
      ) : null}
      {lv >= 2 ? (
        <g data-part="stone-store">
          <Post x={-24} y={-12} h={46} w={5} />
          <Post x={28} y={-12} h={38} w={5} />
          <ShedRoof x={-28} y={-54} w={58} rise={10} fill="coral" />
          <StonePile x={2} y={-12} rows={3} />
        </g>
      ) : null}
      <Wall x={-94} y={-14} w={64} h={44} fill="wood" texture="siding" />
      <ShedRoof x={-94} y={-58} w={64} rise={14} fill="sunshine" wall="wood" />
      <Door x={-76} y={-14} w={16} h={26} fill="sea-deep" />
      <Window x={-48} y={-38} w={13} lit={lit} />
      {lv >= 2 ? (
        <g>
          <Awning x={-90} y={-44} w={30} h={9} stripe="coral" />
          <Flag x={-88} y={-72} h={24} fill="sea" />
        </g>
      ) : null}
      <path d="M-26 -12l-4 -26M-22 -12l2 -24" {...stroke('wood-deep', 2.5)} />
      <path d="M-34 -40l6 3l-2 4l-6 -3Z" {...filled('pebble', 1.8)} />
      {lv === 1 ? <StonePile x={2} y={-10} rows={2} /> : null}
      {/* Wheelbarrow of stones. */}
      <g data-part="wheelbarrow" transform={lv >= 2 ? 'translate(8 4)' : undefined}>
        <path d="M14 -24H42L36 -12H18Z" {...filled('sea')} />
        <ellipse cx={22} cy={-26} rx={5} ry={3.5} {...filled('pebble', 1.8)} />
        <ellipse cx={32} cy={-27} rx={5} ry={3.5} {...filled('pebble', 1.8)} />
        <path d="M18 -12L12 -4M42 -22L52 -16" {...stroke('wood-deep', 2.5)} />
        <circle cx={30} cy={-8} r={5} {...filled('ink-soft', 2)} />
      </g>
      <Cone3 x={68} y={-4} />
      <Cone3 x={88} y={-4} />
      {lv === 3 ? (
        <g>
          <Bunting x1={-30} y1={-62} x2={60} y2={-68} sag={5} n={8} />
          <Lantern x={-30} y={-48} hang={8} lit={lit} s={0.8} />
        </g>
      ) : null}
    </g>
  );
}

const LANTERN_FILLS: readonly PaletteColor[] = ['sunshine', 'coral', 'sun', 'sea'];

function lanterns(points: [number, number][], lit: boolean, s = 1): ReactNode {
  return points.map(([x, y], i) => (
    <Lantern
      key={`${x},${y}`}
      x={x}
      y={y}
      hang={9}
      lit={lit}
      s={s}
      delay={i * 0.7}
      fill={LANTERN_FILLS[i % LANTERN_FILLS.length]}
    />
  ));
}

/** Lantern Grove (W2): trees hung with paper lanterns; at sunset every lantern glows. */
export function LanternGrove({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site
        w={60}
        h={30}
        y={-30}
        roof="none"
        icon={<Icon kind="lantern" />}
        foot={[2, 2]}
        behind={<Tree x={-60} y={-40} r={22} trunk={22} />}
      />
    );
  return (
    <g>
      <Ground w={190} y={-14} ry={14} />
      {lv >= 2 ? (
        <Tree x={0} y={-60} r={lv === 3 ? 44 : 32} trunk={lv === 3 ? 34 : 30} delay={1.4}>
          {lanterns(
            lv === 3
              ? [
                  [-34, -118],
                  [-12, -104],
                  [14, -106],
                  [36, -120],
                ]
              : [
                  [-20, -108],
                  [18, -110],
                ],
            lit,
          )}
        </Tree>
      ) : null}
      {lv === 3 ? (
        <g data-part="treehouse">
          <rect x={-26} y={-150} width={52} height={7} rx={2} {...filled('wood')} />
          <Wall x={-16} y={-150} w={32} h={22} fill="sand-deep" texture="planks" />
          <Gable cx={0} y={-172} w={32} h={16} fill="coral" overhang={5} />
          <Window x={0} y={-161} w={10} lit={lit} shape="round" />
          <Flag x={0} y={-188} h={16} w={14} fill="sunshine" />
          <Railing x1={-26} x2={-18} y={-150} h={8} step={8} />
        </g>
      ) : null}
      <Tree x={-58} y={-34} r={30} trunk={28} delay={0}>
        {lanterns(
          [
            [-80, -64],
            [-58, -54],
            [-36, -66],
          ],
          lit,
        )}
      </Tree>
      <Tree x={58} y={-38} r={28} trunk={28} fill="leaf" delay={2.2}>
        {lanterns(
          [
            [38, -68],
            [60, -58],
            [80, -70],
          ],
          lit,
        )}
      </Tree>
      {/* A string of lanterns between the trees. */}
      <path d="M-40 -82Q0 -62 40 -84" {...stroke('wood-deep', 1.8)} />
      {lanterns(
        [
          [-20, -66],
          [0, -62],
          [20, -67],
        ],
        lit,
        0.85,
      )}
      {/* The lantern-maker's little cart. */}
      <g data-part="cart">
        <rect x={-24} y={-26} width={48} height={14} rx={3} {...filled('sea')} />
        <path d="M-20 -26V-46M20 -26V-46" {...stroke('wood-deep', 2.5)} />
        <Awning x={-26} y={-44} w={52} h={9} stripe="coral" />
        <circle cx={-14} cy={-8} r={5} {...filled('ink-soft', 2)} />
        <circle cx={14} cy={-8} r={5} {...filled('ink-soft', 2)} />
        <Lantern x={-10} y={-32} hang={0.1} lit={lit} s={0.7} fill="coral" />
        <Lantern x={2} y={-32} hang={0.1} lit={lit} s={0.7} delay={0.4} />
        <Lantern x={13} y={-32} hang={0.1} lit={lit} s={0.7} fill="sea" delay={0.9} />
      </g>
      {lv >= 2 ? (
        <g>
          <Post x={-86} y={-8} h={34} w={4} />
          <path d="M-86 -42h8" {...stroke('wood-deep', 2.5)} />
          <Lantern x={-78} y={-32} hang={8} lit={lit} delay={2} />
          <Flowers x={36} y={-8} n={4} gap={8} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Bunting x1={-84} y1={-92} x2={-30} y2={-136} sag={4} n={5} />
          <Bunting x1={30} y1={-136} x2={84} y2={-94} sag={4} n={5} />
        </g>
      ) : null}
    </g>
  );
}

/** A rod of ten bricks (W5: ten units fuse into a rod), standing on a little pallet. */
function BrickRod({ x, y }: { x: number; y: number }) {
  return (
    <g data-part="brick-rod">
      {Array.from({ length: 10 }, (_, i) => y - 4.2 * (i + 1)).map((by) => (
        <rect key={by} x={x - 6} y={by} width={12} height={4.2} rx={1} {...filled('coral', 1.4)} />
      ))}
      <rect x={x - 9} y={y} width={18} height={4} rx={1} {...filled('wood', 1.8)} />
    </g>
  );
}

/** Brick Factory (W5): a domed kiln with a tall chimney and rods of ten bricks; a shed joins. */
export function BrickFactory({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site w={70} h={40} cx={20} y={-36} roof="dome" icon={<Icon kind="brick" />} foot={[2, 2]} />
    );
  const yb = -36;
  const rods = lv === 1 ? [-44, -26] : lv === 2 ? [-80, -62, -44, -26] : [-84, -66, -48];
  return (
    <g>
      <Ground w={196} y={-14} ry={14} />
      {lv >= 2 ? (
        <g>
          <Wall x={-96} y={yb} w={64} h={lv === 3 ? 74 : 44} fill="sand" texture="siding" />
          <Gable cx={-64} y={yb - (lv === 3 ? 74 : 44)} w={64} h={28} fill="sea" />
          <Window x={-80} y={yb - 24} w={13} lit={lit} />
          <Window x={-50} y={yb - 24} w={13} lit={lit} />
          {lv === 3 ? <Window x={-64} y={yb - 56} w={14} lit={lit} shape="round" /> : null}
          <rect x={-34} y={yb - 22} width={30} height={5} rx={2} {...filled('ink-soft', 2)} />
          <rect x={-30} y={yb - 29} width={8} height={7} rx={1} {...filled('coral', 1.5)} />
          <rect x={-18} y={yb - 29} width={8} height={7} rx={1} {...filled('coral', 1.5)} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Chimney x={64} y={yb - 18} w={13} h={88} fill="coral" />
          <Flag x={-64} y={yb - 102} h={22} fill="sunshine" />
        </g>
      ) : null}
      <Chimney x={42} y={yb - 40} w={14} h={lv === 1 ? 52 : 70} fill="coral" />
      <path d={`M-6 ${yb}C-6 ${yb - 74} 86 ${yb - 74} 86 ${yb}Z`} {...filled('coral')} />
      <path
        d={`M0 ${yb - 14}H80M4 ${yb - 28}H76M14 ${yb - 42}H66M28 ${yb - 52}H52M20 ${yb - 14}V${yb - 28}M60 ${yb - 14}V${yb - 28}M40 ${yb - 28}V${yb - 42}M30 ${yb}V${yb - 14}M50 ${yb}V${yb - 14}`}
        {...stroke('coral-deep', 1.6)}
        opacity={0.6}
      />
      <Highlight d={`M6 ${yb - 18}Q8 ${yb - 46} 30 ${yb - 52}Q14 ${yb - 40} 12 ${yb - 18}Z`} />
      {/* The kiln mouth always glows warm; at sunset it casts a halo. */}
      {lit ? <Glow x={40} y={yb - 12} r={18} /> : null}
      <path
        d={`M26 ${yb}V${yb - 14}A14 14 0 0 1 54 ${yb - 14}V${yb}Z`}
        {...filled('sunshine-light')}
        stroke={paint('coral-deep')}
      />
      <path
        d={`M32 ${yb}Q30 ${yb - 12} 38 ${yb - 18}Q36 ${yb - 8} 42 ${yb - 12}Q44 ${yb - 4} 48 ${yb - 14}Q52 ${yb - 6} 48 ${yb}Z`}
        {...filled('sun', 2)}
      />
      {rods.map((x) => (
        <BrickRod key={x} x={x} y={-8} />
      ))}
      {lv === 1 ? (
        <g data-part="clay">
          <path d="M-98 -8Q-96 -34 -78 -36Q-60 -34 -58 -8Z" {...filled('wood')} />
          <path d="M-90 -20Q-86 -30 -78 -31" {...stroke('cloud', 3)} opacity={0.4} />
          <path d="M-64 -8L-70 -40" {...stroke('wood-deep', 5)} />
          <path d="M-64 -8L-70 -40" {...stroke('wood', 2.6)} />
          <path d="M-76 -44l10 -2l-1 10l-8 1Z" {...filled('pebble', 2)} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g data-part="brick-flat">
          <rect x={-14} y={-26} width={44} height={14} rx={2} {...filled('coral')} />
          <path
            d="M-10 -26V-12M-6 -26V-12M-2 -26V-12M2 -26V-12M6 -26V-12M10 -26V-12M14 -26V-12M18 -26V-12M22 -26V-12M26 -26V-12"
            {...stroke('coral-deep', 1.2)}
            opacity={0.7}
          />
          <rect x={-16} y={-12} width={48} height={4} rx={1} {...filled('wood', 1.8)} />
          <Bunting x1={-96} y1={yb - 74} x2={42} y2={yb - 108} sag={5} n={8} />
        </g>
      ) : null}
      <rect x={60} y={-22} width={30} height={5} rx={2} {...filled('wood', 2)} />
      <rect x={63} y={-28} width={24} height={6} rx={1.5} {...filled('coral', 1.8)} />
      {lv === 3 ? <Smoke x={70} y={yb - 116} delay={1.2} /> : null}
      <Smoke x={49} y={yb - (lv === 1 ? 102 : 120)} />
    </g>
  );
}

/** One terrace bed: a plank retaining wall with a row of plants on top (planted arrays, W6). */
function Terrace({
  x1,
  x2,
  y,
  crop,
  n,
}: {
  x1: number;
  x2: number;
  y: number;
  crop: 'sprout' | 'cabbage' | 'tomato';
  n: number;
}) {
  const step = (x2 - x1 - 16) / (n - 1);
  const plants = Array.from({ length: n }, (_, i) => x1 + 8 + i * step);
  return (
    <g data-part="terrace">
      <rect x={x1} y={y - 18} width={x2 - x1} height={8} rx={3} {...filled('wood-deep')} />
      {plants.map((px) =>
        crop === 'cabbage' ? (
          <g key={px}>
            <circle cx={px} cy={y - 20} r={6} {...filled('leaf-light', 2)} />
            <path d={`M${px - 3} ${y - 21}q3 -3 6 0`} {...stroke('leaf-deep', 1.5)} />
          </g>
        ) : crop === 'tomato' ? (
          <g key={px}>
            <path d={`M${px} ${y - 16}V${y - 34}`} {...stroke('wood', 2)} />
            <path
              d={`M${px} ${y - 22}q-7 -2 -7 -8q6 0 7 6q1 -8 8 -9q0 7 -8 9`}
              {...filled('leaf', 1.6)}
            />
            <circle cx={px - 4} cy={y - 20} r={3} {...filled('coral', 1.4)} />
            <circle cx={px + 4} cy={y - 26} r={3} {...filled('coral', 1.4)} />
          </g>
        ) : (
          <path
            key={px}
            d={`M${px} ${y - 17}V${y - 22}q-6 -1 -6 -6q6 0 6 6q1 -7 7 -7q0 6 -7 7`}
            {...filled('leaf', 1.6)}
          />
        ),
      )}
      <rect x={x1} y={y - 12} width={x2 - x1} height={12} rx={2} {...filled('wood')} />
      <path
        d={Array.from(
          { length: Math.floor((x2 - x1) / 20) },
          (_, i) => `M${x1 + 20 * (i + 1)} ${y - 10}V${y - 2}`,
        ).join('')}
        {...stroke('wood-deep', 1.5)}
        opacity={0.6}
      />
    </g>
  );
}

/** Garden Terraces (W6): stepped beds planted in rows, a potting shed, then a greenhouse. */
export function GardenTerraces({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site
        w={50}
        h={30}
        cx={50}
        y={-40}
        icon={<Icon kind="sprout" />}
        foot={[2, 2]}
        flip
        front={<Terrace x1={-96} x2={-4} y={-8} crop="sprout" n={5} />}
      />
    );
  const shed = (x: number, base: number) => (
    <g data-part="potting-shed">
      <Wall x={x} y={base} w={36} h={28} fill="paper" texture="siding" />
      <Gable cx={x + 18} y={base - 28} w={36} h={18} fill="leaf-deep" overhang={5} />
      <Door x={x + 18} y={base} w={12} h={18} fill="wood" />
    </g>
  );
  return (
    <g>
      <Ground w={196} y={-6} ry={12} />
      {lv >= 2 ? <Terrace x1={-72} x2={lv === 3 ? 16 : 30} y={-74} crop="tomato" n={5} /> : null}
      {lv === 3 ? shed(-68, -92) : null}
      {lv === 3 ? (
        <g data-part="windmill">
          <path d="M-50 -136V-150" {...stroke('wood-deep', 3)} />
          <g className="motion-loop art-loop art-spin">
            {[0, 90, 180, 270].map((a) => (
              <path
                key={a}
                d="M-50 -151L-46 -163Q-50 -166 -54 -163Z"
                transform={`rotate(${a} -50 -151)`}
                {...filled(a % 180 === 0 ? 'coral' : 'cloud', 1.8)}
              />
            ))}
          </g>
          <circle cx={-50} cy={-151} r={2.6} {...filled('sunshine', 1.5)} />
        </g>
      ) : null}
      <Terrace x1={-84} x2={84} y={-40} crop="cabbage" n={8} />
      {lv === 3 ? (
        <g data-part="greenhouse">
          {lit ? <Glow x={56} y={-80} r={16} /> : null}
          <path
            d="M26 -58V-88L56 -108L86 -88V-58Z"
            fill={paint(lit ? 'sunshine-light' : 'sky-light')}
            stroke={paint('sea-deep')}
            strokeWidth={3}
            strokeLinejoin="round"
          />
          <path
            d="M26 -88H86M41 -58V-98M56 -58V-108M71 -58V-98M26 -73H86"
            {...stroke('sea-deep', 2)}
          />
          <path d="M31 -84l8 -6" {...stroke('cloud', 3)} />
          <circle cx={48} cy={-64} r={4} {...filled('leaf', 1.6)} />
          <circle cx={64} cy={-65} r={4} {...filled('coral', 1.6)} />
        </g>
      ) : (
        shed(46, -58)
      )}
      <Terrace x1={-96} x2={96} y={-8} crop="sprout" n={10} />
      {lv >= 2 ? <Flag x={78} y={-58} h={30} fill="sunshine" /> : null}
      {lv === 3 ? <Bunting x1={-32} y1={-112} x2={56} y2={-108} sag={4} n={6} /> : null}
    </g>
  );
}

/** Bakery (W7): a cosy shop with an awning, a loaf sign and a smoking chimney; then an oven. */
export function Bakery({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) return <Site w={80} h={36} cx={-14} icon={<Icon kind="bread" />} foot={[2, 1]} />;
  const eave = lv === 3 ? -82 : -54;
  return (
    <g>
      <Ground w={lv === 1 ? 160 : 196} y={-6} ry={9} />
      {lv >= 2 ? (
        <g data-part="oven">
          <Chimney x={70} y={-42} w={10} h={16} fill="coral" />
          <Dome cx={62} y={-12} w={46} h={30} fill="coral" />
          <path
            d="M50 -24H74M44 -16H80M58 -24V-16M66 -32V-24"
            {...stroke('coral-deep', 1.5)}
            opacity={0.6}
          />
          {lit ? <Glow x={62} y={-18} r={12} /> : null}
          <path
            d="M53 -12V-18A9 9 0 0 1 71 -18V-12Z"
            {...filled('sunshine-light')}
            stroke={paint('coral-deep')}
          />
          <path d="M57 -12q2 -8 5 -4q2 -6 5 4Z" {...filled('sun', 1.6)} />
        </g>
      ) : null}
      <Wall x={-60} y={-12} w={88} h={42} fill="paper" texture="siding" />
      {lv === 3 ? (
        <g>
          <Wall x={-52} y={-54} w={72} h={28} fill="paper" texture="siding" />
          <Window x={-34} y={-68} w={13} lit={lit} />
          <Window x={2} y={-68} w={13} lit={lit} />
          <rect x={-42} y={-60} width={16} height={5} rx={2} {...filled('wood', 1.8)} />
          <rect x={-6} y={-60} width={16} height={5} rx={2} {...filled('wood', 1.8)} />
          <Flowers x={-40} y={-60} n={2} gap={6} />
          <Flowers x={-4} y={-60} n={2} gap={6} />
        </g>
      ) : null}
      <Chimney x={-4} y={eave - 12} w={12} h={18} fill="pebble" />
      <Gable cx={-16} y={eave} w={lv === 3 ? 76 : 88} h={32} fill="sun" />
      {lv === 3 ? (
        <g data-part="loaf-topper">
          <path d="M-16 -112V-120" {...stroke('wood-deep', 3)} />
          <path d="M-34 -118Q-36 -138 -16 -138Q4 -138 2 -118Z" {...filled('sun')} />
          <path d="M-26 -132l4 6M-18 -134l4 6M-10 -132l4 6" {...stroke('sun-deep', 2)} />
        </g>
      ) : null}
      {/* Display window with loaves, under a striped awning. */}
      <rect
        x={-54}
        y={-38}
        width={40}
        height={20}
        rx={2}
        fill={paint(lit ? 'sunshine-light' : 'sky-light')}
        stroke={paint('wood-deep')}
        strokeWidth={2.5}
      />
      {lit ? (
        <rect
          x={-60}
          y={-44}
          width={52}
          height={32}
          rx={8}
          fill={paint('sunshine-light')}
          opacity={0.4}
        />
      ) : null}
      <path
        d="M-50 -20Q-50 -28 -42 -28Q-34 -28 -34 -20ZM-32 -20Q-32 -27 -25 -27Q-18 -27 -18 -20Z"
        {...filled('sun', 2)}
      />
      <Awning x={-58} y={-38} w={48} h={10} stripe="coral" />
      <Door x={10} y={-12} w={16} h={26} fill="sea" />
      <path d="M28 -42H42M38 -42V-38" {...stroke('wood-deep', 2.5)} />
      <g data-part="loaf-sign" {...loop('sway', { origin: '50% 0%', delay: -0.6 })}>
        <path d="M38 -38V-34" {...stroke('wood-deep', 1.6)} />
        <path d="M28 -22Q26 -34 38 -34Q50 -34 48 -22Z" {...filled('sun')} />
        <path d="M33 -30l2 4M38 -31l2 4M43 -30l2 4" {...stroke('sun-deep', 1.6)} />
      </g>
      {lv >= 2 ? (
        <g data-part="pie-table">
          <rect x={-90} y={-24} width={26} height={4} rx={1.5} {...filled('wood', 2)} />
          <path d="M-86 -20V-8M-68 -20V-8" {...stroke('wood-deep', 2.5)} />
          <path d="M-88 -24Q-77 -34 -66 -24Z" {...filled('sunshine', 2)} />
          <path d="M-82 -27l3 -2M-76 -29l3 -1" {...stroke('sunshine-deep', 1.4)} />
        </g>
      ) : null}
      {lv === 3 ? <Bunting x1={-62} y1={-50} x2={30} y2={-50} sag={4} n={8} /> : null}
      <Smoke x={2} y={eave - 36} />
      {lv >= 2 ? <Smoke x={75} y={-64} delay={2} /> : null}
    </g>
  );
}

/** A market stall: a counter of fruit under a striped awning. */
function Stall({
  x,
  y,
  stripe,
  goods,
  w = 56,
}: {
  x: number;
  y: number;
  stripe: PaletteColor;
  goods: PaletteColor[];
  w?: number;
}) {
  const n = Math.floor((w - 12) / 9);
  const gx = x - ((n - 1) * 9) / 2;
  return (
    <g data-part="stall">
      <path
        d={`M${x - w / 2 + 2} ${y}V${y - 52}M${x + w / 2 - 2} ${y}V${y - 52}`}
        {...stroke('wood-deep', 3.5)}
      />
      <Awning x={x - w / 2 - 4} y={y - 46} w={w + 8} h={14} stripe={stripe} />
      {Array.from({ length: n }, (_, i) => ({ cx: gx + i * 9, i })).map(({ cx, i }) => (
        <circle
          key={cx}
          cx={cx}
          cy={y - 24 - (i % 2) * 2}
          r={4.4}
          {...filled(goods[i % goods.length] ?? 'coral', 1.8)}
        />
      ))}
      <rect x={x - w / 2} y={y - 21} width={w} height={21} rx={2} {...filled('wood')} />
      <path
        d={`M${x - w / 2 + 2} ${y - 14}H${x + w / 2 - 2}`}
        {...stroke('wood-deep', 1.6)}
        opacity={0.6}
      />
    </g>
  );
}

function CoinSign({ x, y, h }: { x: number; y: number; h: number }) {
  return (
    <g data-part="coin-sign">
      <Post x={x} y={y} h={h} w={4} />
      <circle cx={x} cy={y - h - 8} r={10} {...filled('sunshine')} />
      <circle
        cx={x}
        cy={y - h - 8}
        r={5.5}
        fill="none"
        stroke={paint('sunshine-deep')}
        strokeWidth={2}
      />
      <path d={`M${x - 5} ${y - h - 13}l3 -2`} {...stroke('cloud', 2)} />
    </g>
  );
}

/** Market (W8): fruit stalls with striped awnings and a gold coin sign; a market hall at the top. */
export function Market({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) return <Site w={60} h={30} icon={<Icon kind="coin" />} foot={[2, 1]} />;
  return (
    <g>
      <Ground w={lv === 1 ? 150 : 196} y={-6} ry={9} />
      {lv === 3 ? (
        <g data-part="hall">
          <Wall x={-72} y={-30} w={144} h={44} fill="sand" texture="siding" />
          <Gable cx={0} y={-74} w={144} h={26} fill="sea" />
          <Wall x={-12} y={-96} w={24} h={16} fill="paper" />
          <Cone cx={0} y={-112} w={28} h={18} fill="sea-deep" overhang={3} />
          <Flag x={0} y={-130} h={16} fill="coral" />
          <Window x={-60} y={-54} w={12} lit={lit} />
          <Window x={60} y={-54} w={12} lit={lit} />
          <Window x={0} y={-104} w={8} lit={lit} shape="round" />
        </g>
      ) : null}
      {lv === 1 ? (
        <g>
          <Stall
            x={-14}
            y={-10}
            w={84}
            stripe="coral"
            goods={['coral', 'sunshine', 'leaf-light', 'coral', 'sun']}
          />
          <Crate x={-94} y={-8} s={14} />
          <Crate x={-80} y={-8} s={14} />
          <Barrel x={42} y={-8} h={16} />
          <CoinSign x={74} y={-6} h={52} />
        </g>
      ) : (
        <g>
          <Stall
            x={-54}
            y={-10}
            w={68}
            stripe="coral"
            goods={['coral', 'sunshine', 'leaf-light', 'coral', 'sun']}
          />
          <Stall
            x={54}
            y={-10}
            w={68}
            stripe="sea"
            goods={['leaf-light', 'sun', 'coral', 'sunshine', 'leaf-light']}
          />
          <CoinSign x={0} y={-6} h={50} />
          <Bunting x1={-84} y1={-60} x2={-24} y2={-60} sag={4} n={5} />
          <Bunting x1={24} y1={-60} x2={84} y2={-60} sag={4} n={5} />
          <Crate x={-12} y={-6} s={11} />
          <Barrel x={14} y={-6} h={13} />
        </g>
      )}
      {lv === 3 ? (
        <g>
          <Lantern x={-82} y={-52} hang={6} lit={lit} s={0.8} />
          <Lantern x={82} y={-52} hang={6} lit={lit} s={0.8} delay={1} />
        </g>
      ) : null}
    </g>
  );
}

/** Builder's Yard (W10): a workshop with triangle, circle and square windows, beams and a ruler. */
export function BuildersYard({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={100} h={44} cx={-14} y={-40} icon={<Icon kind="shapes" />} foot={[2, 2]} />;
  const yb = -40;
  const wallH = lv === 3 ? 76 : 46;
  return (
    <g>
      <Ground w={196} y={-12} ry={13} />
      {lv >= 2 ? (
        <g data-part="gantry">
          <path d="M50 -10L60 -110M96 -10L86 -110M56 -108H90" {...stroke('wood-deep', 6)} />
          <path d="M50 -10L60 -110M96 -10L86 -110M56 -108H90" {...stroke('sunshine', 3.5)} />
          <path d="M73 -108V-86" {...stroke('ink-soft', 1.8)} />
          <path
            d="M62 -86H84L73 -66Z"
            fill={paint('sky-light')}
            stroke={paint('sea-deep')}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
          <Flag x={90} y={-110} h={20} fill="coral" />
        </g>
      ) : null}
      <Wall x={-70} y={yb} w={112} h={wallH} fill="sand" texture="siding" />
      <Gable cx={-14} y={yb - wallH} w={112} h={34} fill="sea" />
      {lv === 3 ? (
        <g data-part="rose-window">
          {lit ? (
            <circle cx={-14} cy={yb - 60} r={22} fill={paint('sunshine-light')} opacity={0.5} />
          ) : null}
          <circle
            cx={-14}
            cy={yb - 60}
            r={15}
            fill={paint(lit ? 'sunshine-light' : 'sky-light')}
            stroke={paint('wood-deep')}
            strokeWidth={2.5}
          />
          <path
            d="M-14 -115L-1 -92H-27Z"
            fill={paint('coral')}
            stroke={paint('wood-deep')}
            strokeWidth={2}
            strokeLinejoin="round"
            opacity={0.85}
          />
          <path d="M-29 -100H1M-14 -115V-85" {...stroke('wood-deep', 1.6)} />
        </g>
      ) : null}
      <Window x={-50} y={yb - 22} w={17} h={15} lit={lit} shape="triangle" />
      <Window x={-24} y={yb - 22} w={16} lit={lit} shape="round" />
      <Window x={2} y={yb - 22} w={15} h={15} lit={lit} />
      <Door x={26} y={yb} w={18} h={28} fill="wood" />
      {/* Beams stacked by length, a sawhorse, and a ruler lying in front (W10 measures). */}
      <g data-part="beams">
        <rect x={48} y={-16} width={44} height={6} rx={1.5} {...filled('wood', 2)} />
        <rect x={52} y={-22} width={36} height={6} rx={1.5} {...filled('wood', 2)} />
        <rect x={56} y={-28} width={28} height={6} rx={1.5} {...filled('wood', 2)} />
      </g>
      <path
        d="M-84 -10l4 -16M-70 -10l-4 -16M-54 -10l4 -16M-40 -10l-4 -16"
        {...stroke('wood-deep', 2.5)}
      />
      <rect x={-88} y={-30} width={56} height={6} rx={1.5} {...filled('wood', 2)} />
      <g data-part="ruler">
        <rect x={-36} y={-12} width={70} height={9} rx={1.5} {...filled('sunshine', 2.2)} />
        <path
          d="M-29 -12v4M-22 -12v3M-15 -12v4M-8 -12v3M-1 -12v5M6 -12v3M13 -12v4M20 -12v3M27 -12v4"
          {...stroke('ink', 1.5)}
        />
      </g>
      {lv >= 2 ? (
        <g data-part="glass-rack">
          <path d="M-96 -40V-70" {...stroke('wood-deep', 3)} />
          <rect
            x={-94}
            y={-66}
            width={14}
            height={24}
            rx={1.5}
            fill={paint('sky-light')}
            stroke={paint('sea-deep')}
            strokeWidth={2}
          />
          <circle
            cx={-80}
            cy={-50}
            r={8}
            fill={paint('sky-light')}
            stroke={paint('sea-deep')}
            strokeWidth={2}
          />
        </g>
      ) : null}
      {lv === 3 ? (
        <Bunting x1={-74} y1={yb - wallH + 2} x2={44} y2={yb - wallH + 2} sag={5} n={9} />
      ) : null}
    </g>
  );
}

/** A two-pan balance, level (W11: = means "the same as"). */
function Balance({ x, y, h }: { x: number; y: number; h: number }) {
  const top = y - h;
  return (
    <g data-part="balance">
      <rect x={x - 14} y={y - 6} width={28} height={7} rx={2} {...filled('wood-deep')} />
      <rect x={x - 3.5} y={top} width={7} height={h - 6} rx={2} {...filled('wood')} />
      <path d={`M${x - 44} ${top}H${x + 44}`} {...stroke('ink-soft', 8)} />
      <path d={`M${x - 44} ${top}H${x + 44}`} {...stroke('sunshine-deep', 4.5)} />
      <path
        d={`M${x - 7} ${top + 9}L${x} ${top - 4}L${x + 7} ${top + 9}Z`}
        {...filled('sunshine', 2)}
      />
      {[-44, 44].map((dx) => (
        <g key={dx}>
          <path
            d={`M${x + dx} ${top}L${x + dx - 13} ${top + 30}M${x + dx} ${top}L${x + dx + 13} ${top + 30}`}
            {...stroke('ink-soft', 1.6)}
          />
          <path
            d={`M${x + dx - 17} ${top + 30}H${x + dx + 17}Q${x + dx + 14} ${top + 38} ${x + dx} ${top + 38}Q${x + dx - 14} ${top + 38} ${x + dx - 17} ${top + 30}Z`}
            {...filled('sunshine', 2.5)}
          />
        </g>
      ))}
      <Crate x={x - 51} y={top + 30} s={14} />
      <path d={`M${x + 33} ${top + 30}q0 -10 6 -10q6 0 5 10Z`} {...filled('sand-deep', 2)} />
      <path d={`M${x + 43} ${top + 30}q0 -10 6 -10q6 0 5 10Z`} {...filled('sand-deep', 2)} />
    </g>
  );
}

/** Weigh Station & Lookout (W11): a level balance with cargo and a wooden lookout that grows. */
export function WeighStation({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site w={40} h={60} cx={52} roof="tower" icon={<Icon kind="scale" />} foot={[2, 1]} flip />
    );
  const deck = lv === 1 ? -66 : lv === 2 ? -104 : -136;
  return (
    <g>
      <Ground w={196} y={-6} ry={9} />
      {/* The lookout. */}
      <g data-part="lookout">
        <path d={`M40 -10L48 ${deck}M86 -10L78 ${deck}`} {...stroke('wood-deep', 6.5)} />
        <path d={`M40 -10L48 ${deck}M86 -10L78 ${deck}`} {...stroke('wood', 4)} />
        <path d={`M44 -30L82 ${deck / 2}M82 -30L44 ${deck / 2}`} {...stroke('wood-deep', 2)} />
        {lv >= 2 ? (
          <path
            d={`M46 ${deck / 2}L80 ${deck + 6}M80 ${deck / 2}L46 ${deck + 6}`}
            {...stroke('wood-deep', 2)}
          />
        ) : null}
        <path d={`M30 -10V${deck}M38 -10V${deck}`} {...stroke('wood-deep', 2.2)} />
        <path
          d={Array.from(
            { length: Math.floor(-deck / 10) },
            (_, i) => `M30 ${-14 - i * 10}H38`,
          ).join('')}
          {...stroke('wood-deep', 2)}
        />
        <Deck x1={36} x2={92} y={deck} t={7} />
        <Railing x1={38} x2={90} y={deck} h={12} step={13} />
        {lv >= 2 ? (
          <g>
            <Post x={40} y={deck} h={30} w={4} />
            <Post x={88} y={deck} h={30} w={4} />
            <Gable cx={64} y={deck - 30} w={48} h={20} fill="coral" overhang={6} />
            <Flag x={64} y={deck - 50} h={22} fill="sunshine" />
          </g>
        ) : (
          <Flag x={88} y={deck} h={26} fill="sunshine" />
        )}
        {lv === 3 ? (
          <g>
            <path d={`M56 ${deck - 12}l18 -6`} {...stroke('ink-soft', 5)} />
            <path d={`M56 ${deck - 12}l18 -6`} {...stroke('sunshine-deep', 2.5)} />
            <Lantern x={40} y={deck - 16} hang={4} lit={lit} s={0.8} />
          </g>
        ) : null}
      </g>
      <Balance x={-40} y={-8} h={lv === 1 ? 62 : 66} />
      {lv >= 2 ? (
        <g data-part="bead-rope">
          <path d={`M-84 -76Q-20 -60 42 ${deck + 20}`} {...stroke('wood-deep', 1.6)} />
          {[0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84].map((t, i) => {
            const bx = (1 - t) ** 2 * -84 + 2 * (1 - t) * t * -20 + t ** 2 * 42;
            const by = (1 - t) ** 2 * -76 + 2 * (1 - t) * t * -60 + t ** 2 * (deck + 20);
            return i % 2 === 0 ? (
              <circle key={t} cx={bx} cy={by} r={4} {...filled('coral', 1.8)} />
            ) : (
              <path
                key={t}
                d={`M${bx} ${by - 5}L${bx + 5} ${by + 3.5}H${bx - 5}Z`}
                {...filled('sea', 1.8)}
              />
            );
          })}
          <Post x={-84} y={-6} h={70} w={4} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g data-part="bar-graph">
          <rect x={-98} y={-56} width={34} height={44} rx={3} {...filled('paper', 2.5)} />
          <rect x={-94} y={-30} width={7} height={14} {...filled('sea-deep', 1.6)} />
          <rect x={-84} y={-44} width={7} height={28} {...filled('sunshine', 1.6)} />
          <rect x={-74} y={-36} width={7} height={20} {...filled('coral', 1.6)} />
          <path d="M-90 -12V-4M-72 -12V-4" {...stroke('wood-deep', 3)} />
        </g>
      ) : null}
    </g>
  );
}

/** A drum with a laced shell and two sticks (W12 picks fruit to a gentle beat). */
function Drum({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  const w = 30 * s;
  const h = 22 * s;
  return (
    <g data-part="drum">
      <path
        d={`M${x - w / 2} ${y - h}V${y - 3}Q${x} ${y + 4} ${x + w / 2} ${y - 3}V${y - h}Z`}
        {...filled('coral')}
      />
      <path
        d={`M${x - w / 2 + 2} ${y - h + 4}L${x - w / 4} ${y - 4}L${x} ${y - h + 4}L${x + w / 4} ${y - 4}L${x + w / 2 - 2} ${y - h + 4}`}
        {...stroke('cloud', 2)}
      />
      <ellipse cx={x} cy={y - h} rx={w / 2} ry={5 * s} {...filled('pebble')} />
      <path
        d={`M${x - 4} ${y - h - 2}l-12 -12M${x + 4} ${y - h - 2}l12 -12`}
        {...stroke('wood-deep', 3)}
      />
      <circle cx={x - 16} cy={y - h - 14} r={2.6} {...filled('sunshine', 1.5)} />
      <circle cx={x + 16} cy={y - h - 14} r={2.6} {...filled('sunshine', 1.5)} />
    </g>
  );
}

/** A floating music note that pulses with the beat. */
function Note({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  const l = loop('pulse-soft', { delay: -delay });
  return (
    <g data-part="note" className={l.className} style={l.style}>
      <path
        d={`M${x + 3} ${y}V${y - 13}Q${x + 8} ${y - 11} ${x + 10} ${y - 6}`}
        {...stroke('ink', 2.2)}
      />
      <ellipse
        cx={x}
        cy={y}
        rx={4}
        ry={3}
        fill={paint('ink')}
        transform={`rotate(-20 ${x} ${y})`}
      />
    </g>
  );
}

/** Rhythm Orchard (W12): fruit trees, a drum and music notes; a bandstand at the top. */
export function RhythmOrchard({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return (
      <Site
        w={50}
        h={30}
        cx={30}
        y={-30}
        roof="none"
        icon={<Icon kind="fruit" />}
        foot={[2, 2]}
        behind={<Tree x={-56} y={-50} r={20} trunk={20} />}
      />
    );
  return (
    <g>
      <Ground w={196} y={-12} ry={13} />
      {lv >= 2 ? (
        <g>
          <Tree x={-26} y={-88} r={26} trunk={22} fruit="sun" delay={0.6} />
          <Tree x={26} y={-88} r={26} trunk={22} fruit="coral" delay={1.7} />
        </g>
      ) : null}
      <Tree x={-58} y={-46} r={32} trunk={28} fruit="coral" delay={0} />
      <Tree x={58} y={-46} r={32} trunk={28} fruit="sunshine" delay={1.1} />
      {lv === 1 ? (
        <g>
          <Bush x={-86} y={-8} r={10} />
          <Bush x={86} y={-8} r={10} />
          <Crate x={30} y={-8} s={14} />
          <circle cx={34} cy={-26} r={4} {...filled('coral', 1.6)} />
          <circle cx={40} cy={-25} r={4} {...filled('sunshine', 1.6)} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g data-part="bandstand">
          <rect x={-40} y={-30} width={80} height={9} rx={3} {...filled('wood')} />
          <Post x={-34} y={-30} h={50} w={5} />
          <Post x={34} y={-30} h={50} w={5} />
          <Post x={0} y={-30} h={50} w={4} />
          <Cone cx={0} y={-80} w={86} h={40} fill="coral" />
          <path
            d="M-44 -80Q-33 -72 -22 -80Q-11 -72 0 -80Q11 -72 22 -80Q33 -72 44 -80"
            {...stroke('cloud', 3)}
          />
          <Flag x={0} y={-120} h={22} fill="sunshine" />
          <Lantern x={-30} y={-68} hang={6} lit={lit} s={0.8} />
          <Lantern x={30} y={-68} hang={6} lit={lit} s={0.8} delay={1} />
        </g>
      ) : null}
      <Drum x={lv === 3 ? 0 : -6} y={lv === 3 ? -30 : -14} s={lv === 3 ? 0.9 : 1} />
      {lv >= 2 ? (
        <g data-part="basket">
          <path d="M44 -24H76L72 -8H48Z" {...filled('sand-deep')} />
          <path d="M48 -18H72" {...stroke('wood-deep', 1.5)} />
          <circle cx={52} cy={-27} r={4} {...filled('coral', 1.6)} />
          <circle cx={60} cy={-28} r={4} {...filled('sunshine', 1.6)} />
          <circle cx={68} cy={-27} r={4} {...filled('sun', 1.6)} />
          <path d="M-86 -10V-8" />
          <rect x={-84} y={-22} width={28} height={6} rx={1.5} {...filled('sunshine', 1.8)} />
          <rect x={-82} y={-16} width={24} height={6} rx={1.5} {...filled('coral', 1.8)} />
          <rect x={-80} y={-10} width={20} height={6} rx={1.5} {...filled('sea', 1.8)} />
        </g>
      ) : null}
      <Note x={20} y={lv === 3 ? -98 : -52} />
      <Note x={-30} y={lv === 3 ? -106 : -42} delay={0.8} />
      {lv >= 2 ? <Note x={40} y={lv === 3 ? -120 : -70} delay={0.4} /> : null}
      {lv === 3 ? (
        <g>
          <Bunting x1={-88} y1={-82} x2={-44} y2={-80} sag={3} n={4} />
          <Bunting x1={44} y1={-80} x2={88} y2={-82} sag={3} n={4} />
        </g>
      ) : null}
    </g>
  );
}

/** Puzzle Tower (W13): a tall round stone tower with a star on top; a 3 × 3 magic-square window. */
export function PuzzleTower({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={40} h={100} y={-30} roof="tower" icon={<Icon kind="star" />} foot={[1, 2]} />;
  const yb = -30;
  const top = lv === 1 ? -150 : lv === 2 ? -190 : -206;
  const roofH = lv === 3 ? 52 : 44;
  const starY = top - roofH - 10;
  const starR = lv === 3 ? 16 : 13;
  return (
    <g>
      <Ground w={96} y={-14} ry={10} />
      {lv === 3 ? (
        <g data-part="turret">
          <Wall x={22} y={-24} w={22} h={86} fill="pebble" texture="stone" />
          <Cone cx={33} y={-110} w={22} h={26} fill="sea-deep" overhang={4} />
          <Window x={33} y={-80} w={8} h={11} lit={lit} shape="arch" />
          <Flag x={33} y={-136} h={18} fill="coral" />
        </g>
      ) : null}
      <Wall x={-26} y={yb} w={52} h={yb - top} fill="pebble" texture="stone" rx={5} />
      <Highlight d={`M-21 ${yb - 6}V${top + 8}H-16V${yb - 6}Z`} opacity={0.4} />
      {lv >= 2 ? (
        <g>
          <rect x={-34} y={yb - 92} width={68} height={7} rx={2} {...filled('wood')} />
          <Railing x1={-32} x2={32} y={yb - 92} h={10} step={16} />
        </g>
      ) : null}
      {/* The 3 × 3 window (a magic square), then arch windows climbing round the tower. */}
      <g data-part="grid-window">
        {lit ? (
          <rect
            x={-16}
            y={top + 10}
            width={32}
            height={32}
            rx={6}
            fill={paint('sunshine-light')}
            opacity={0.5}
          />
        ) : null}
        <rect
          x={-12}
          y={top + 14}
          width={24}
          height={24}
          rx={2}
          fill={paint(lit ? 'sunshine-light' : 'sky-light')}
          stroke={paint('wood-deep')}
          strokeWidth={2.5}
        />
        <path
          d={`M-4 ${top + 14}V${top + 38}M4 ${top + 14}V${top + 38}M-12 ${top + 22}H12M-12 ${top + 30}H12`}
          {...stroke('wood-deep', 1.8)}
        />
      </g>
      <Window x={-9} y={yb - 52} w={9} h={13} lit={lit} shape="arch" />
      {lv >= 2 ? <Window x={10} y={yb - 74} w={9} h={13} lit={lit} shape="arch" /> : null}
      {lv === 3 ? <Window x={-10} y={yb - 124} w={9} h={13} lit={lit} shape="arch" /> : null}
      <Door x={0} y={yb} w={16} h={24} fill="sea-deep" />
      <Cone cx={0} y={top} w={60} h={roofH} fill="sea-deep" />
      {lv === 3 ? (
        <g>
          <path
            d={`M-20 ${top + 4}v26l5 -5l5 5v-26M20 ${top + 4}v26l-5 -5l-5 5v-26`}
            {...filled('coral', 2.2)}
          />
        </g>
      ) : null}
      {lit || lv === 3 ? <Glow x={0} y={starY} r={starR + 6} /> : null}
      <Star x={0} y={starY} r={starR} fill="sunshine" />
      <Sparkle x={-starR - 6} y={starY - 6} s={0.55} delay={0.5} />
      {lv >= 2 ? <Sparkle x={starR + 7} y={starY + 4} s={0.45} delay={2.4} /> : null}
    </g>
  );
}
