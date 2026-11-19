import { filled, paint } from '../core/paint';
import { Highlight } from '../core/Shading';
import {
  Bunting,
  Chimney,
  Crate,
  Deck,
  Dome,
  Door,
  type DrawProps,
  Flag,
  Flowers,
  Gable,
  Ground,
  Icon,
  Lantern,
  levelOf,
  Post,
  Rock,
  ShedRoof,
  Site,
  Smoke,
  Star,
  stroke,
  Wall,
  Window,
} from './parts';

// Homes (05 §5: building a home brings a resident) and the Storehouse (05 §3).

/** Shell Cottage: a cream whelk shell with a pointed spire, round window and a scallop awning. */
export function ShellCottage({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={56} h={34} roof="dome" icon={<Icon kind="shell" />} foot={[1, 1]} />;
  const tip = lv === 3 ? -116 : -94;
  return (
    <g>
      <Ground w={lv === 1 ? 86 : 100} y={-8} />
      {lv >= 2 ? (
        <g>
          <path d="M-47 -10C-52 -36 -36 -44 -22 -38L-22 -10Z" {...filled('pebble')} />
          <path d="M-46 -22Q-38 -30 -26 -26" {...stroke('pebble-deep', 2)} />
          <Window x={-36} y={-26} w={9} lit={lit} shape="round" />
        </g>
      ) : null}
      {/* The spire: a twisted whelk tip with ridges. */}
      <path d={`M-2 -58L15 ${tip}L26 -56Z`} {...filled('pebble')} />
      <path
        d={`M3 -68L22 -70M8 ${(-68 + tip) / 2 - 2}L20 ${(-68 + tip) / 2 - 4}M12 ${tip + 14}L17 ${tip + 12}`}
        {...stroke('pebble-deep', 2)}
      />
      {lv === 3 ? <Window x={16} y={-80} w={8} h={10} lit={lit} shape="arch" /> : null}
      <path d="M-33 -10C-39 -44 -16 -66 6 -64C28 -62 39 -42 33 -10Z" {...filled('pebble')} />
      <path d="M-29 -30Q-4 -40 31 -27M-22 -50Q0 -60 24 -49" {...stroke('pebble-deep', 2.2)} />
      <Highlight d="M-26 -34Q-24 -52 -8 -58Q-18 -48 -20 -34Z" />
      {lv >= 2 ? (
        <g>
          <Chimney x={-24} y={-48} w={9} h={12} fill="coral" />
        </g>
      ) : null}
      <Door x={-7} y={-10} w={16} h={24} fill="sea" />
      <path d="M-20 -36Q-7 -52 6 -36Z" {...filled('coral', 2.5)} />
      <path d="M-7 -37V-46M-13 -37L-12 -44M-1 -37L-2 -44" {...stroke('coral-deep', 1.5)} />
      <Window x={18} y={-32} w={13} lit={lit} shape="round" />
      {lv >= 2 ? (
        <g>
          <Flowers x={22} y={-4} n={3} />
          <Flowers x={-48} y={-4} n={2} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Flag x={15} y={tip + 2} h={22} fill="coral" />
          <Lantern x={-24} y={-30} hang={8} lit={lit} />
        </g>
      ) : null}
      {lv >= 2 ? <Smoke x={-20} y={-66} /> : null}
    </g>
  );
}

/** Driftwood Hut: a plank hut on short stilts with a straw roof, growing a porch and a loft. */
export function DriftwoodHut({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) return <Site w={54} h={32} icon={<Icon kind="house" />} foot={[1, 1]} />;
  const eave = lv === 3 ? -76 : -52;
  return (
    <g>
      <Ground w={lv === 1 ? 84 : 100} y={-7} />
      {[-26, 0, 22, ...(lv >= 2 ? [42] : [])].map((x) => (
        <Post key={x} x={x} y={-6} h={18} w={5} />
      ))}
      <Deck x1={-34} x2={lv >= 2 ? 46 : 30} y={-22} t={6} />
      {lv >= 2 ? (
        <g>
          <Post x={42} y={-22} h={26} w={4} />
          <ShedRoof x={24} y={-46} w={18} rise={6} fill="sunshine" />
          <path d="M28 -24V-36M38 -24V-36" {...stroke('wood-deep', 2)} />
        </g>
      ) : null}
      <Wall x={-28} y={-22} w={52} h={30} fill="sand-deep" texture="planks" />
      {lv === 3 ? (
        <g>
          <Wall x={-22} y={-52} w={40} h={24} fill="sand-deep" texture="planks" />
          <Window x={-2} y={-64} w={11} h={11} lit={lit} />
        </g>
      ) : null}
      <Gable cx={-2} y={eave} w={lv === 3 ? 42 : 52} h={28} fill="sunshine" overhang={8} />
      <path
        d={`M${lv === 3 ? -31 : -36} ${eave + 4}${Array.from({ length: lv === 3 ? 7 : 8 }, () => 'l4 5l4 -5').join('')}`}
        {...stroke('sunshine-deep', 2)}
      />
      <Door x={-11} y={-22} w={13} h={20} fill="wood" />
      <Window x={11} y={-37} w={11} lit={lit} shape="round" />
      <path d="M-34 -6l5 -16M-27 -6l5 -16M-33 -10h6M-31 -16h6" {...stroke('wood-deep', 2.5)} />
      {lv >= 2 ? <Crate x={30} y={-22} s={9} /> : null}
      {lv >= 2 ? <Flag x={-2} y={eave - 26} h={20} fill="sea" /> : null}
      {lv === 3 ? (
        <g>
          <Bunting x1={-34} y1={-50} x2={44} y2={-44} sag={3} n={6} />
          <Lantern x={36} y={-38} hang={6} lit={lit} s={0.8} />
          <Flowers x={-46} y={-2} n={2} />
        </g>
      ) : null}
    </g>
  );
}

/** Burrow House: a grassy mound with a round door, round windows and a chimney pipe. */
export function BurrowHouse({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={56} h={26} roof="dome" icon={<Icon kind="house" />} foot={[1, 1]} />;
  const half = lv === 1 ? 40 : 46;
  return (
    <g>
      <Ground w={half * 2 + 8} y={-7} />
      {lv === 3 ? (
        <g>
          <path d="M-44 -40Q-44 -88 -10 -86Q16 -84 14 -50Z" {...filled('leaf')} />
          <Porthole x={-22} y={-66} r={5.5} lit={lit} />
          <Flag x={-14} y={-86} h={24} fill="sunshine" />
        </g>
      ) : null}
      <path
        d={`M${-half} -8Q${-half - 2} -58 0 -60Q${half + 2} -58 ${half} -8Z`}
        {...filled('leaf')}
      />
      <path
        d={`M${-half + 8} -40Q${-half + 12} -54 -10 -56`}
        {...stroke('leaf-light', 4)}
        opacity={0.9}
      />
      <path d="M-16 -60l2 -6l2 6M10 -60l2 -7l2 7M-30 -52l1 -6l3 5" {...stroke('leaf-deep', 2)} />
      <Chimney x={14} y={-52} w={9} h={14} fill="pebble" />
      <path
        d="M-14 -8V-24A14 14 0 0 1 14 -24V-8"
        fill="none"
        stroke={paint('pebble-deep')}
        strokeWidth={10}
        strokeLinejoin="round"
      />
      <path d="M-14 -8V-24A14 14 0 0 1 14 -24V-8" {...stroke('pebble', 6)} />
      <Door x={0} y={-8} w={22} h={28} fill="coral" />
      <Porthole x={-27} y={-28} r={5.5} lit={lit} />
      {lv >= 2 ? <Porthole x={27} y={-28} r={5.5} lit={lit} /> : null}
      {lv >= 2 ? (
        <g>
          <Flowers x={-44} y={-2} n={3} gap={7} />
          <Flowers x={30} y={-2} n={2} gap={7} />
          <Flowers x={-12} y={-56} n={3} gap={6} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Bunting x1={-14} y1={-108} x2={20} y2={-68} sag={3} n={4} />
          <Lantern x={22} y={-14} hang={6} lit={lit} s={0.8} />
          <Post x={22} y={-2} h={10} w={3} />
        </g>
      ) : null}
      <Smoke x={18} y={-74} />
    </g>
  );
}

/** A porthole: a pebble ring so the window frame reads on any wall (contrast.ts). */
function Porthole({ x, y, r, lit }: { x: number; y: number; r: number; lit: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 3.5} {...filled('pebble', 2)} />
      <Window x={x} y={y} w={r * 2} lit={lit} shape="round" />
    </g>
  );
}

/** Reef House: a rounded coral tower on rocks with portholes and a starfish on top. */
export function ReefHouse({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={48} h={36} roof="dome" icon={<Icon kind="shell" />} foot={[1, 1]} />;
  const top = lv === 3 ? -84 : -66;
  const polyps = [
    [-14, -22],
    [12, -30],
    [-8, -58],
    [15, -52],
    [-16, -40],
  ];
  return (
    <g>
      <Ground w={lv === 1 ? 86 : 100} y={-7} />
      {lv >= 2 ? (
        <g>
          <path d="M18 -10V-38Q18 -50 31 -50Q44 -50 44 -38V-10Z" {...filled('shallows')} />
          <Porthole x={31} y={-32} r={6} lit={lit} />
          <Star x={31} y={-54} r={6} fill="sun" />
        </g>
      ) : null}
      <path
        d={`M-24 -10V${top + 18}Q-24 ${top} 0 ${top}Q24 ${top} 24 ${top + 18}V-10Z`}
        {...filled('coral')}
      />
      {polyps.map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} fill={paint('coral-deep')} opacity={0.55} />
      ))}
      <Highlight d={`M-19 -18V${top + 20}Q-18 ${top + 6} -8 ${top + 4}Q-15 ${top + 14} -15 -18Z`} />
      {lv === 3 ? (
        <g>
          <Dome cx={0} y={top + 2} w={34} h={16} fill="sea" />
          <Porthole x={0} y={top + 24} r={6} lit={lit} />
          <Flag x={0} y={top - 18} h={24} fill="sunshine" />
        </g>
      ) : (
        <Star x={0} y={top - 4} r={9} fill="sun" />
      )}
      <Porthole x={0} y={-42} r={7} lit={lit} />
      <path d="M-12 -10V-24A12 12 0 0 1 12 -24V-10" {...stroke('pebble', 7)} />
      <Door x={0} y={-10} w={16} h={22} fill="sea-deep" />
      <Rock x={-34} y={-4} w={22} h={13} />
      <Rock x={lv >= 2 ? 44 : 32} y={-3} w={16} h={10} />
      <path d="M-40 -8q-4 -10 2 -18q-6 -8 -1 -16" {...stroke('leaf', 3)} />
      {lv >= 2 ? (
        <g>
          <path d="M-46 -8q3 -12 0 -22M-42 -10q4 -8 2 -14" {...stroke('leaf-deep', 2.5)} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <Lantern x={-30} y={-46} hang={8} lit={lit} s={0.85} />
          <path d="M-24 -56H-30" {...stroke('wood-deep', 2)} />
          <Bunting x1={-22} y1={-62} x2={22} y2={-62} sag={3} n={4} />
        </g>
      ) : null}
    </g>
  );
}

/**
 * The Storehouse (05 §3): a barn whose yard shows the materials as countable crates in a
 * ten-frame (two rows of five), growing a silo, a wing, a weathervane and flags.
 */
export function Storehouse({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) return <Site w={120} h={56} y={-30} icon={<Icon kind="crate" />} foot={[2, 2]} />;
  const yb = -30;
  const crates: [number, number][] = [];
  const rows = lv === 1 ? 1 : 2;
  for (let r = rows - 1; r >= 0; r--)
    for (let c = 0; c < 5; c++) crates.push([-62 + c * 15, -2 - r * 12]);
  return (
    <g>
      <Ground w={lv === 1 ? 170 : 196} y={-8} ry={12} />
      {lv === 3 ? (
        <g>
          <Wall x={-96} y={yb} w={30} h={40} fill="sand" texture="siding" />
          <ShedRoof
            x={-96}
            y={yb - 40}
            w={30}
            rise={12}
            fill="sunshine"
            wall="sand"
            down="left"
            overhang={4}
          />
          <Window x={-81} y={yb - 20} w={12} lit={lit} />
        </g>
      ) : null}
      {lv >= 2 ? (
        <g>
          <Wall x={54} y={yb} w={34} h={78} fill="pebble" rx={4} />
          <path
            d={`M56 ${yb - 20}H86M56 ${yb - 42}H86M56 ${yb - 64}H86`}
            {...stroke('pebble-deep', 2)}
          />
          <Dome cx={71} y={yb - 78} w={38} h={18} fill="sea" />
          <Window x={71} y={yb - 54} w={10} h={12} lit={lit} shape="arch" />
        </g>
      ) : null}
      <Wall x={-70} y={yb} w={120} h={56} fill="coral-deep" texture="siding" />
      <path
        d={`M-78 ${yb - 54}L-62 ${yb - 84}L-10 ${yb - 100}L42 ${yb - 84}L58 ${yb - 54}Z`}
        {...filled('sea-deep')}
      />
      <path
        d={`M-62 ${yb - 84}L42 ${yb - 84}M-70 ${yb - 70}L50 ${yb - 70}`}
        {...stroke('sea-dark', 2)}
        opacity={0.6}
      />
      <Highlight
        d={`M-70 ${yb - 58}L-58 ${yb - 81}L-20 ${yb - 94}L-56 ${yb - 78}Z`}
        opacity={0.3}
      />
      <Window x={-10} y={yb - 72} w={16} lit={lit} shape="round" frame="paper" />
      <rect x={-34} y={yb - 42} width={48} height={42} rx={2} {...filled('wood')} />
      <path
        d={`M-10 ${yb - 42}V${yb}M-34 ${yb - 42}L-10 ${yb}M-10 ${yb - 42}L-34 ${yb}M-10 ${yb - 42}L14 ${yb}M14 ${yb - 42}L-10 ${yb}`}
        {...stroke('paper', 2.5)}
      />
      <rect
        x={-34}
        y={yb - 42}
        width={48}
        height={42}
        rx={2}
        fill="none"
        stroke={paint('paper')}
        strokeWidth={3}
      />
      <Window x={-54} y={yb - 30} w={13} lit={lit} frame="paper" />
      <Window x={34} y={yb - 30} w={13} lit={lit} frame="paper" />
      {crates.map(([x, y]) => (
        <Crate key={`${x},${y}`} x={x} y={y} s={13} />
      ))}
      {lv >= 2 ? (
        <g>
          <Crate x={30} y={-4} s={14} />
          <Crate x={44} y={-4} s={14} />
          <Crate x={37} y={-18} s={13} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <path d={`M-10 ${yb - 100}V${yb - 118}M-18 ${yb - 112}H-2`} {...stroke('ink', 2.5)} />
          <path d={`M-2 ${yb - 112}l-4 -3v6z`} {...filled('sunshine', 1.5)} />
          <Flag x={71} y={yb - 98} h={24} fill="coral" />
          <Bunting x1={-78} y1={yb - 54} x2={56} y2={yb - 54} sag={5} n={10} />
          <Lantern x={-40} y={yb - 22} hang={6} lit={lit} s={0.8} />
          <Lantern x={20} y={yb - 22} hang={6} lit={lit} s={0.8} delay={1} />
        </g>
      ) : null}
    </g>
  );
}
