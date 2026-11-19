import type { ReactNode } from 'react';
import type { PaletteColor } from '../../tokens/tokens';
import { OUTLINE_OF, paint } from '../core/paint';
import type { PaletteFills, PebblingPose, PebblingSpecies } from './pebbling';

/** The outline shade of a fill. */
const OUTLINE = (fill: PaletteColor): PaletteColor => OUTLINE_OF[fill];

import {
  Cheeks,
  Eye,
  Eyes,
  fillOf,
  Loop,
  type LoopTiming,
  type LoopToken,
  Pivot,
  Shine,
  Smile,
  Tube,
} from './parts';

/**
 * Pebbling bodies (05 §5): one silhouette per species, all in the same 220 × 200 design box with the
 * ground at y ≈ 188, the same eyes, cheeks, outline weight and top-left light. Each body carries a
 * "slot" (the ten-frame, or a family's clock, coin or fraction shell) on its shell or back.
 */

export interface BodyProps {
  c: PaletteFills;
  pose: PebblingPose;
  /** What the shell carries, drawn centred on (0, 0). */
  slot?: ReactNode;
  /** Seconds: desynchronises blinks and swings in a group. */
  delay: number;
  /** Body variant for the family species (Half-Crab's round shell, the Coin Clam open). */
  variant?: 'round' | 'open';
}

interface LimbPose {
  angle: number;
  loop?: { token: LoopToken } & LoopTiming;
}

/** How a limb sits in a pose: raised and swinging in a cheer, the right one waving in a wave. */
function limb(pose: PebblingPose, side: 'l' | 'r', up: number, delay: number, rest = 0): LimbPose {
  if (pose === 'cheer') {
    return {
      angle: up,
      loop: { token: 'wave-claw', duration: 0.9, delay: delay - (side === 'l' ? 0.45 : 0) },
    };
  }
  if (pose === 'wave' && side === 'r') {
    return { angle: up, loop: { token: 'wave-claw', duration: 1.1, delay } };
  }
  return { angle: rest };
}

function rad(deg: number) {
  return (deg * Math.PI) / 180;
}

function r1(v: number) {
  return Math.round(v * 10) / 10;
}

/** A closed Catmull-Rom curve through points (soft star and blob outlines). */
export function closedSmooth(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n] as readonly [number, number];
  let d = `M${r1(at(0)[0])} ${r1(at(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

/** A rounded pincer (a circle with a notch) centred on (cx, cy), opening towards `dir` degrees. */
function clawPath(cx: number, cy: number, r: number, dir: number, half = 24) {
  const p = (a: number, k = r) =>
    `${r1(cx + k * Math.cos(rad(a)))} ${r1(cy + k * Math.sin(rad(a)))}`;
  return `M${p(dir, r * 0.18)}L${p(dir - half)}A${r} ${r} 0 1 0 ${p(dir + half)}Z`;
}

/** A crab claw on an arm, drawn from its shoulder at (0, 0), hanging down and out at rest. */
function Claw({ c, r = 17, arm = [-10, 22] }: { c: PaletteFills; r?: number; arm?: number[] }) {
  const [ax = -10, ay = 22] = arm;
  const len = Math.hypot(ax, ay);
  const cx = ax + (ax / len) * r * 0.75;
  const cy = ay + (ay / len) * r * 0.75;
  const dir = (Math.atan2(ay, ax) * 180) / Math.PI;
  return (
    <g>
      <Tube d={`M0 0L${ax} ${ay}`} w={8} fill={c.accent} />
      <path d={clawPath(cx, cy, r, dir)} {...fillOf(c.accent)} />
      <Shine x={cx} y={cy} rx={r} opacity={0.35} />
    </g>
  );
}

/** A chubby flipper or wing from (0, 0), hanging down at rest. */
function Flipper({
  c,
  len = 38,
  w = 15,
  fill,
}: {
  c: PaletteFills;
  len?: number;
  w?: number;
  fill?: PaletteFills['body'];
}) {
  const f = fill ?? c.accent;
  return (
    <path
      d={`M${-w * 0.7} 0C${-w * 1.1} ${len * 0.5} ${-w * 0.5} ${len} 0 ${len}C${w * 0.6} ${len} ${w * 0.9} ${len * 0.5} ${w * 0.6} 0Z`}
      {...fillOf(f)}
    />
  );
}

function Slot({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  if (!children) return null;
  return <g transform={`translate(${x} ${y})`}>{children}</g>;
}

// ---------- crab ----------

function Crab({ c, pose, slot, delay, variant }: BodyProps) {
  const round = variant === 'round';
  const L = limb(pose, 'l', 128, delay);
  const R = limb(pose, 'r', 128, delay);
  const cheer = pose === 'cheer';
  const stalkTop = round ? 30 : 48;
  const stalkBase = round ? 50 : 72;
  return (
    <g>
      {/* Legs, behind the shell. */}
      <Tube d="M60 150Q40 160 36 182" w={7} fill={c.accent} />
      <Tube d="M76 158Q62 170 62 186" w={7} fill={c.accent} />
      <Tube d="M160 150Q180 160 184 182" w={7} fill={c.accent} />
      <Tube d="M144 158Q158 170 158 186" w={7} fill={c.accent} />
      {/* Eye stalks. */}
      <Tube d={`M94 ${stalkBase}L86 ${stalkTop}`} w={7} fill={c.body} />
      <Tube d={`M126 ${stalkBase}L134 ${stalkTop}`} w={7} fill={c.body} />
      <Eyes
        left={[84, stalkTop - 6]}
        right={[136, stalkTop - 6]}
        r={13}
        edge={c.deep}
        look={[0, 0.2]}
        delay={delay}
      />
      {round ? (
        <>
          <circle cx={110} cy={104} r={64} {...fillOf(c.body)} />
          <Shine x={110} y={104} rx={64} />
        </>
      ) : (
        <>
          <path
            d="M28 118C28 72 62 60 110 60C158 60 192 72 192 118C192 150 158 166 110 166C62 166 28 150 28 118Z"
            {...fillOf(c.body)}
          />
          <Shine x={110} y={112} rx={80} ry={52} />
        </>
      )}
      <Slot x={110} y={round ? 96 : 104}>
        {slot}
      </Slot>
      <Cheeks
        left={[round ? 70 : 58, round ? 150 : 146]}
        right={[round ? 150 : 162, round ? 150 : 146]}
        color={c.cheek}
      />
      <Smile x={110} y={round ? 152 : 146} w={round ? 14 : 16} open={cheer} />
      <Pivot x={32} y={112} angle={L.angle} loop={L.loop}>
        <Claw c={c} />
      </Pivot>
      <Pivot x={188} y={112} angle={R.angle} loop={R.loop} mirror>
        <Claw c={c} />
      </Pivot>
    </g>
  );
}

// ---------- hermit crab ----------

function HermitCrab({ c, pose, slot, delay }: BodyProps) {
  const L = limb(pose, 'l', 120, delay);
  const R = limb(pose, 'r', 150, delay, 10);
  return (
    <g>
      {/* The borrowed spiral shell, spire up and to the right. */}
      {/* The spire: three whorls, smaller towards the tip. */}
      <circle cx={194} cy={20} r={8} {...fillOf(c.body)} />
      <circle cx={186} cy={38} r={14} {...fillOf(c.body)} />
      <circle cx={172} cy={62} r={21} {...fillOf(c.body)} />
      <path
        d="M180 30Q190 36 200 26M164 48Q178 56 192 44"
        fill="none"
        stroke={paint(c.deep)}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.6}
      />
      <path
        d="M70 164C50 130 58 78 108 64C150 52 200 70 204 112C208 148 182 166 140 166Z"
        {...fillOf(c.body)}
      />
      <Shine x={134} y={112} rx={70} ry={52} />
      <Slot x={134} y={114}>
        {slot}
      </Slot>
      {/* The crab, peeking out of the opening. */}
      <Tube d="M40 170L30 186" w={6} fill={c.accent} />
      <Tube d="M62 172L70 188" w={6} fill={c.accent} />
      <Tube d="M44 132L36 100" w={6} fill={c.accent} />
      <Tube d="M62 130L68 98" w={6} fill={c.accent} />
      <path
        d="M22 156C22 134 36 124 52 124C70 124 84 136 82 156C80 174 66 180 52 180C36 180 22 172 22 156Z"
        {...fillOf(c.accent)}
      />
      <Shine x={52} y={152} rx={30} ry={28} opacity={0.35} />
      <Eyes
        left={[34, 92]}
        right={[70, 90]}
        r={11}
        edge={OUTLINE(c.accent)}
        look={[0.2, 0.2]}
        delay={delay}
      />
      <Cheeks left={[34, 158]} right={[70, 158]} color={c.cheek} rx={6} />
      <Smile x={52} y={154} w={13} open={pose === 'cheer'} />
      <Pivot x={26} y={150} angle={L.angle} loop={L.loop}>
        <Claw c={c} r={13} arm={[-8, 16]} />
      </Pivot>
      <Pivot x={78} y={160} angle={R.angle} loop={R.loop} mirror>
        <Claw c={c} r={13} arm={[-6, 16]} />
      </Pivot>
    </g>
  );
}

// ---------- turtle ----------

function Leg({ c, h = 30 }: { c: PaletteFills; h?: number }) {
  return (
    <path
      d={`M-12 -6C-14 ${h * 0.6} -10 ${h} 0 ${h}C10 ${h} 14 ${h * 0.6} 12 -6Z`}
      {...fillOf(c.accent)}
    />
  );
}

function Turtle({ c, pose, slot, delay }: BodyProps) {
  const front = limb(pose, 'r', -118, delay);
  const back = pose === 'cheer' ? limb(pose, 'l', -40, delay) : { angle: 0 };
  return (
    <g>
      {/* Far legs and tail. */}
      <g opacity={0.92}>
        <Pivot x={78} y={150}>
          <Leg c={c} h={34} />
        </Pivot>
        <Pivot
          x={162}
          y={150}
          angle={pose === 'cheer' ? front.angle * 0.7 : 0}
          loop={pose === 'cheer' ? front.loop : undefined}
        >
          <Leg c={c} h={34} />
        </Pivot>
      </g>
      <path d="M36 146Q14 150 10 138Q24 134 40 136Z" {...fillOf(c.accent)} />
      {/* Neck under the shell. */}
      <Tube d="M160 132Q176 124 182 108" w={24} fill={c.accent} />
      {/* Shell dome and rim. */}
      <path d="M26 146C26 82 62 44 104 44C146 44 182 82 182 146Z" {...fillOf(c.body)} />
      <Shine x={104} y={104} rx={74} ry={58} />
      <path d="M20 146H188Q188 160 174 160H34Q20 160 20 146Z" {...fillOf(c.accent)} />
      <path
        d="M44 153H52M70 153H78M96 153H104M122 153H130M148 153H156"
        stroke={paint(OUTLINE(c.accent))}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.55}
      />
      <Slot x={104} y={106}>
        {slot}
      </Slot>
      {/* Near legs. */}
      <Pivot x={60} y={154} angle={back.angle} loop={back.loop}>
        <Leg c={c} />
      </Pivot>
      <Pivot x={146} y={154} angle={front.angle} loop={front.loop}>
        <Leg c={c} />
      </Pivot>
      {/* Head. */}
      <circle cx={186} cy={98} r={26} {...fillOf(c.accent)} />
      <Shine x={186} y={98} rx={26} opacity={0.35} />
      <Eyes
        left={[175, 92]}
        right={[199, 90]}
        r={10.5}
        edge={OUTLINE(c.accent)}
        look={[0.3, 0.1]}
        delay={delay}
      />
      <Cheeks left={[170, 108]} right={[206, 106]} color={c.cheek} rx={5} />
      <Smile x={190} y={110} w={12} open={pose === 'cheer'} />
    </g>
  );
}

// ---------- snail ----------

function Stalk({ c, len = 40, delay }: { c: PaletteFills; len?: number; delay: number }) {
  return (
    <g>
      <Tube d={`M0 0L0 ${-len}`} w={6} fill={c.accent} />
      <Loop token="blink" delay={delay}>
        <Eye x={0} y={-len - 6} r={11} edge={OUTLINE(c.accent)} look={[0.15, 0.2]} />
      </Loop>
    </g>
  );
}

function Snail({ c, pose, slot, delay }: BodyProps) {
  const cheer = pose === 'cheer';
  const L = cheer ? limb(pose, 'l', -16, delay) : { angle: -10 };
  const R = limb(pose, 'r', 34, delay, 10);
  return (
    <g>
      <Pivot x={178} y={108} angle={L.angle} loop={L.loop}>
        <Stalk c={c} len={38} delay={delay} />
      </Pivot>
      <Pivot x={198} y={110} angle={R.angle} loop={R.loop}>
        <Stalk c={c} len={36} delay={delay} />
      </Pivot>
      {/* The foot and head, one soft body. */}
      <path
        d="M12 186C12 172 26 166 44 166L150 166C160 166 160 152 160 134C160 112 172 100 188 100C204 100 214 114 214 134C214 158 208 176 208 186Z"
        {...fillOf(c.accent)}
      />
      <Shine x={188} y={128} rx={26} ry={28} opacity={0.3} />
      <Cheeks left={[176, 140]} right={[208, 138]} color={c.cheek} rx={5.5} />
      <Smile x={193} y={142} w={13} open={cheer} />
      {/* The spiral shell on its back. */}
      <ellipse cx={98} cy={110} rx={80} ry={64} {...fillOf(c.body)} />
      {/* The whorl: a spiral line winding round the pebble bed and curling in at the left. */}
      <path
        d="M44 150C26 128 26 92 50 70C78 46 132 46 158 72C180 96 176 134 150 156C124 174 74 172 54 150C42 136 40 120 44 110"
        fill="none"
        stroke={paint(c.deep)}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.55}
      />
      <Shine x={98} y={110} rx={80} ry={64} />
      <Slot x={98} y={110}>
        {slot}
      </Slot>
    </g>
  );
}

// ---------- starfish ----------

const STAR_C = { x: 110, y: 106 };

function starBody(): string {
  // The top point and two feet are part of the body; the arms are separate so they can wave.
  const pts: [number, number][] = [];
  // Each point has narrow shoulders either side of its tip, so it reads as a star arm, not a lobe.
  const spec: [number, number][] = [
    [-103, 80],
    [-90, 102],
    [-77, 80],
    [-54, 66],
    [-18, 64],
    [18, 70],
    [43, 82],
    [54, 100],
    [65, 82],
    [90, 70],
    [115, 82],
    [126, 100],
    [137, 82],
    [162, 70],
    [198, 64],
    [234, 66],
  ];
  for (const [a, r] of spec) {
    pts.push([STAR_C.x + r * Math.cos(rad(a)), STAR_C.y + r * Math.sin(rad(a))]);
  }
  return closedSmooth(pts);
}

const STAR_BODY = starBody();

function StarArm({ c }: { c: PaletteFills }) {
  // Pointing along +x from its root, rounded at the tip.
  return (
    <g>
      <path
        d="M-6 -24C20 -22 40 -14 52 -6C58 -2 56 6 50 8C38 12 16 18 -6 24Z"
        {...fillOf(c.body)}
      />
      <circle cx={38} cy={-2} r={3} fill={paint(c.accent)} />
      <circle cx={24} cy={4} r={2.4} fill={paint(c.accent)} />
    </g>
  );
}

function Starfish({ c, pose, slot, delay }: BodyProps) {
  const L = limb(pose, 'l', 64, delay);
  const R = limb(pose, 'r', 64, delay);
  const armAt = (a: number) =>
    [STAR_C.x + 54 * Math.cos(rad(a)), STAR_C.y + 54 * Math.sin(rad(a))] as const;
  const [lx, ly] = armAt(198);
  const [rx, ry] = armAt(-18);
  return (
    <g>
      <Pivot x={lx} y={ly} angle={L.angle} loop={L.loop}>
        <g transform="rotate(198)">
          <StarArm c={c} />
        </g>
      </Pivot>
      <Pivot x={rx} y={ry} angle={R.angle} loop={R.loop} mirror>
        <g transform="rotate(198)">
          <StarArm c={c} />
        </g>
      </Pivot>
      <path d={STAR_BODY} {...fillOf(c.body)} />
      <Shine x={STAR_C.x} y={STAR_C.y - 6} rx={70} ry={72} />
      {[
        [110, 22],
        [100, 36],
        [120, 38],
        [66, 168],
        [154, 168],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3} fill={paint(c.accent)} />
      ))}
      <Eyes left={[92, 60]} right={[128, 60]} r={11} edge={c.deep} look={[0, 0.2]} delay={delay} />
      <Cheeks left={[76, 78]} right={[144, 78]} color={c.cheek} rx={6.5} />
      <Smile x={110} y={77} w={13} open={pose === 'cheer'} />
      <Slot x={110} y={122}>
        {slot}
      </Slot>
    </g>
  );
}

// ---------- seal pup ----------

function Seal({ c, pose, slot, delay }: BodyProps) {
  const F = limb(pose, 'r', -112, delay, 0);
  const cheer = pose === 'cheer';
  return (
    <g>
      {/* Tail flippers. */}
      <path d="M40 170C26 158 10 160 6 174C18 178 30 182 42 180Z" {...fillOf(c.accent)} />
      <path d="M38 178C24 178 12 186 12 190C26 192 36 190 44 184Z" {...fillOf(c.accent)} />
      {/* Body. */}
      <path
        d="M24 180C12 142 34 102 86 98C118 95 146 100 164 116C184 134 190 162 180 182Z"
        {...fillOf(c.body)}
      />
      <path d="M48 182C80 170 140 168 182 176L180 182Z" {...fillOf(c.belly)} />
      <Shine x={100} y={140} rx={78} ry={44} />
      <Slot x={96} y={138}>
        {slot}
      </Slot>
      {/* Head. */}
      <circle cx={174} cy={74} r={38} {...fillOf(c.body)} />
      <Shine x={174} y={74} rx={38} />
      <ellipse cx={180} cy={94} rx={20} ry={13} {...fillOf(c.belly, 2.5)} />
      <ellipse cx={180} cy={87} rx={6.5} ry={4.5} fill={paint('ink')} />
      <path
        d="M176 99Q180 103 184 99"
        fill="none"
        stroke={paint('ink')}
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {cheer ? <Smile x={180} y={100} w={10} open /> : null}
      <g fill={paint(c.deep)}>
        <circle cx={168} cy={94} r={1.6} />
        <circle cx={166} cy={99} r={1.6} />
        <circle cx={192} cy={94} r={1.6} />
        <circle cx={194} cy={99} r={1.6} />
      </g>
      <Eyes
        left={[160, 66]}
        right={[196, 64]}
        r={10.5}
        edge={c.deep}
        look={[0.1, 0.25]}
        delay={delay}
      />
      <Cheeks left={[150, 86]} right={[206, 84]} color={c.cheek} rx={5.5} />
      {/* Front flipper. */}
      <Pivot x={164} y={160} angle={F.angle} loop={F.loop}>
        <g transform="rotate(-20)">
          <Flipper c={c} len={30} w={13} />
        </g>
      </Pivot>
    </g>
  );
}

// ---------- puffin chick ----------

/** A fluffy outline: an ellipse with soft bumps. */
function fluff(cx: number, cy: number, rx: number, ry: number, n = 22, bump = 4) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const k = i % 2 === 0 ? 1 : 1 - bump / Math.min(rx, ry);
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
  }
  return closedSmooth(pts);
}

const CHICK_BODY = fluff(110, 112, 86, 76);

function Puffin({ c, pose, slot, delay }: BodyProps) {
  const L = limb(pose, 'l', 120, delay, 12);
  const R = limb(pose, 'r', 120, delay, 12);
  return (
    <g>
      <path d="M78 178L70 190H96L92 178Z" {...fillOf('sun')} />
      <path d="M128 178L124 190H150L142 178Z" {...fillOf('sun')} />
      <Pivot x={30} y={104} angle={L.angle} loop={L.loop}>
        <Flipper c={c} len={40} w={14} fill={c.body} />
      </Pivot>
      <Pivot x={190} y={104} angle={R.angle} loop={R.loop} mirror>
        <Flipper c={c} len={40} w={14} fill={c.body} />
      </Pivot>
      <path d="M100 40C96 26 104 20 110 30C114 18 124 22 120 40Z" {...fillOf(c.body)} />
      <path d={CHICK_BODY} {...fillOf(c.body)} />
      <Shine x={110} y={108} rx={86} ry={76} />
      <Eyes left={[88, 68]} right={[132, 68]} r={11} edge={c.deep} look={[0, 0.2]} delay={delay} />
      <Cheeks left={[70, 86]} right={[150, 86]} color={c.cheek} rx={6.5} />
      {/* A tiny chick beak (Pip's is the big striped one). */}
      <path
        d={pose === 'cheer' ? 'M100 80H120L110 92Z M102 88H118L110 98Z' : 'M100 80H120L110 94Z'}
        {...fillOf('sunshine', 2.5)}
      />
      <Slot x={110} y={130}>
        {slot}
      </Slot>
    </g>
  );
}

// ---------- seahorse ----------

function Seahorse({ c, pose, slot, delay }: BodyProps) {
  const F = limb(pose, 'r', -70, delay, 0);
  const back = limb(pose, 'l', 30, delay, 0);
  return (
    <g>
      {/* The tail curls forward under the belly into a spiral. */}
      <Tube
        d="M64 168C50 188 70 200 90 197C108 194 110 176 97 173C88 171 85 181 92 185"
        w={14}
        fill={c.body}
      />
      {/* A small back fin, fluttering. */}
      <Pivot x={30} y={116} angle={back.angle} loop={back.loop ?? { token: 'flutter', delay }}>
        <path d="M4 -17C-12 -21 -21 -7 -19 3C-17 13 -7 18 4 16Z" {...fillOf(c.accent)} />
        <path
          d="M0 -9L-12 -8M0 3L-14 5"
          stroke={paint(OUTLINE(c.accent))}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Pivot>
      {/* An upright S: the back, a round belly pushing forward, the neck curving up. */}
      <path
        d="M104 58C62 62 24 96 28 132C32 164 64 180 104 180C150 180 184 158 184 124C184 96 166 80 148 72Z"
        {...fillOf(c.body)}
      />
      <Shine x={104} y={124} rx={78} ry={56} />
      {/* Ridges down the back. */}
      <path
        d="M60 76L52 70M42 96L33 92M33 120L24 119M36 146L27 150"
        stroke={paint(c.deep)}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d="M150 166L158 160M162 156L170 150M172 142L178 136"
        stroke={paint(c.deep)}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.55}
      />
      {/* A horse-like head in one shape, tapering into the tube snout; a little crown on top. */}
      <path d="M118 24L120 8L130 18L137 4L145 20Z" {...fillOf(c.accent, 2.5)} />
      <path
        d="M100 54C94 32 112 16 134 20C152 23 162 38 162 50L186 60C196 64 196 80 184 80L156 76C146 84 124 86 110 76C104 70 102 62 100 54Z"
        {...fillOf(c.body)}
      />
      <Shine x={128} y={50} rx={30} ry={28} />
      <Eyes
        left={[122, 44]}
        right={[147, 45]}
        r={11}
        edge={c.deep}
        look={[0.4, 0.1]}
        delay={delay}
      />
      <Cheeks left={[114, 64]} right={[150, 66]} color={c.cheek} rx={5.5} />
      <Smile x={185} y={70} w={8} open={pose === 'cheer'} />
      <Slot x={106} y={128}>
        {slot}
      </Slot>
      <Pivot x={166} y={96} angle={F.angle} loop={F.loop}>
        <path d="M0 -6C14 -10 24 -2 22 8C20 16 8 16 0 8Z" {...fillOf(c.accent)} />
      </Pivot>
    </g>
  );
}

// ---------- whale ----------

function Spout({ delay }: { delay: number }) {
  return (
    <Loop token="pulse-soft" delay={delay} duration={0.9}>
      <path
        d="M152 52C150 36 140 26 128 26M152 52C152 34 152 22 152 14M152 52C154 36 164 26 176 26"
        fill="none"
        stroke={paint('sea-deep')}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d="M152 52C150 36 140 26 128 26M152 52C152 34 152 22 152 14M152 52C154 36 164 26 176 26"
        fill="none"
        stroke={paint('shallows')}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </Loop>
  );
}

function Whale({ c, pose, slot, delay }: BodyProps) {
  const F = limb(pose, 'r', -100, delay, 0);
  const cheer = pose === 'cheer';
  return (
    <g>
      {cheer ? <Spout delay={delay} /> : null}
      {/* Tail and flukes. */}
      <path
        d="M40 140C22 128 16 104 22 86L4 72C14 64 26 68 30 78C32 66 42 60 52 62L36 88C34 104 40 120 52 130Z"
        {...fillOf(c.body)}
      />
      <path
        d="M20 152C14 96 54 58 112 58C170 58 210 96 210 140C210 172 184 184 150 184H56C34 184 22 172 20 152Z"
        {...fillOf(c.body)}
      />
      <path
        d="M70 184C110 174 172 168 208 150C206 172 184 184 150 184Z"
        {...fillOf(c.belly, 2.5)}
      />
      <path
        d="M120 180C146 176 172 170 196 160M150 182C168 178 186 172 202 164"
        fill="none"
        stroke={paint(c.deep)}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Shine x={112} y={118} rx={92} ry={62} />
      <Slot x={104} y={108}>
        {slot}
      </Slot>
      <Eyes
        left={[177, 116]}
        right={[198, 112]}
        r={10}
        edge={c.deep}
        look={[0.3, 0.15]}
        delay={delay}
      />
      <Cheeks left={[176, 136]} right={[204, 130]} color={c.cheek} rx={5} />
      <Smile x={192} y={140} w={14} open={cheer} />
      <Pivot x={132} y={168} angle={F.angle} loop={F.loop}>
        <g transform="rotate(30)">
          <Flipper c={c} len={28} w={12} fill={c.body} />
        </g>
      </Pivot>
    </g>
  );
}

// ---------- clockfish ----------

function Clockfish({ c, pose, slot, delay }: BodyProps) {
  const F = limb(pose, 'r', -80, delay, 0);
  return (
    <g>
      <Loop token="sway" delay={delay} duration={2.4}>
        <path d="M34 108L6 76C0 96 0 120 6 140Z" {...fillOf(c.accent)} />
      </Loop>
      <path d="M58 60C68 36 102 30 120 50Z" {...fillOf(c.accent)} />
      {/* The winding crown of a pocket watch. */}
      <circle
        cx={146}
        cy={34}
        r={7}
        fill="none"
        stroke={paint(OUTLINE(c.accent))}
        strokeWidth={6}
      />
      <circle cx={146} cy={34} r={7} fill="none" stroke={paint(c.accent)} strokeWidth={2.5} />
      <rect x={139} y={38} width={14} height={14} rx={3} {...fillOf(c.accent, 2.5)} />
      <ellipse cx={110} cy={110} rx={88} ry={62} {...fillOf(c.body)} />
      <Shine x={110} y={110} rx={88} ry={62} />
      <Slot x={96} y={112}>
        {slot}
      </Slot>
      <Eyes
        left={[163, 92]}
        right={[184, 95]}
        r={10}
        edge={c.deep}
        look={[0.35, 0.1]}
        delay={delay}
      />
      <Cheeks left={[160, 114]} right={[190, 116]} color={c.cheek} rx={5} />
      <Smile x={180} y={120} w={11} open={pose === 'cheer'} />
      <Pivot x={150} y={140} angle={F.angle} loop={F.loop}>
        <path d="M0 -4C10 2 18 14 14 24C6 26 -2 16 -4 6Z" {...fillOf(c.accent)} />
      </Pivot>
    </g>
  );
}

// ---------- clam ----------

/** A scallop-edged fan (the clam's lid) on a base line at `base`, `h` tall, with its ribs. */
function scallop(base: number, h: number, rx = 92) {
  const pts: [number, number][] = [];
  const ribs: string[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const a = rad(180 + (i * 180) / steps);
    const k = i % 2 === 0 ? 1 : 0.94;
    pts.push([110 + rx * k * Math.cos(a), base + h * k * Math.sin(a)]);
    if (i % 2 === 0 && i > 0 && i < steps) {
      ribs.push(
        `M${r1(110 + rx * 0.93 * Math.cos(a))} ${r1(base + h * 0.93 * Math.sin(a))}L${r1(110 + rx * 0.7 * Math.cos(a))} ${r1(base + h * 0.7 * Math.sin(a))}`,
      );
    }
  }
  pts.push([170, base + 10], [110, base + 14], [50, base + 10]);
  return { d: closedSmooth(pts), ribs: ribs.join('') };
}

const CLAM_LID = scallop(142, 100);
const CLAM_OPEN_LID = scallop(132, 112, 90);

function Clam({ c, pose, slot, delay, variant }: BodyProps) {
  const open = variant === 'open';
  const cheer = pose === 'cheer';
  const L = limb(pose, 'l', 100, delay);
  const R = limb(pose, 'r', 100, delay);
  const lower = (
    <>
      <path
        d="M22 138C28 176 70 190 110 190C150 190 192 176 198 138Q110 156 22 138Z"
        {...fillOf(c.body)}
      />
      <path
        d="M60 172Q110 186 160 172"
        fill="none"
        stroke={paint(c.deep)}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.45}
      />
      <Eyes
        left={[86, 160]}
        right={[134, 160]}
        r={10}
        edge={c.deep}
        look={[0, 0.2]}
        delay={delay}
      />
      <Cheeks left={[68, 170]} right={[152, 170]} color={c.cheek} rx={6} />
      <Smile x={110} y={170} w={12} open={cheer} />
    </>
  );
  if (open) {
    return (
      <g>
        {/* Open wide: the lid stands behind, its pearly inside showing. */}
        <path d={CLAM_OPEN_LID.d} {...fillOf(c.body)} />
        <path
          d="M40 128C38 78 70 40 110 40C150 40 182 78 180 128Q110 118 40 128Z"
          fill={paint(c.belly)}
        />
        <path
          d="M40 128C38 78 70 40 110 40C150 40 182 78 180 128Q110 118 40 128Z"
          fill={paint(c.accent)}
          opacity={0.45}
        />
        <path
          d={CLAM_OPEN_LID.ribs}
          stroke={paint(c.deep)}
          strokeWidth={2.5}
          strokeLinecap="round"
          opacity={0.5}
        />
        <Slot x={110} y={98}>
          {slot}
        </Slot>
        {lower}
      </g>
    );
  }
  // The lid stays shut and level in every pose, so the ten-frame on it always reads straight;
  // the clam cheers and waves with the little feet that peek out from under its shell.
  return (
    <g>
      <Pivot x={34} y={158} angle={L.angle} loop={L.loop} reach={50}>
        <g transform="rotate(40)">
          <Flipper c={c} len={30} w={11} />
        </g>
      </Pivot>
      <Pivot x={186} y={158} angle={R.angle} loop={R.loop} mirror reach={50}>
        <g transform="rotate(40)">
          <Flipper c={c} len={30} w={11} />
        </g>
      </Pivot>
      <path d="M30 140Q110 160 190 140L190 150Q110 166 30 150Z" fill={paint('ink-soft')} />
      {lower}
      <path d={CLAM_LID.d} {...fillOf(c.body)} />
      <path
        d={CLAM_LID.ribs}
        stroke={paint(c.deep)}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.6}
      />
      <Shine x={110} y={100} rx={86} ry={56} />
      <Slot x={110} y={100}>
        {slot}
      </Slot>
    </g>
  );
}

export const SPECIES_BODY: Readonly<Record<PebblingSpecies, (p: BodyProps) => ReactNode>> = {
  crab: Crab,
  'hermit-crab': HermitCrab,
  turtle: Turtle,
  snail: Snail,
  starfish: Starfish,
  seal: Seal,
  puffin: Puffin,
  seahorse: Seahorse,
  whale: Whale,
  clockfish: Clockfish,
  clam: Clam,
};

/** Contact-shadow half-widths per species (the shadow stays on the ground while the body moves). */
export const SHADOW_RX: Readonly<Record<PebblingSpecies, number>> = {
  crab: 80,
  'hermit-crab': 84,
  turtle: 86,
  snail: 96,
  starfish: 70,
  seal: 90,
  puffin: 66,
  seahorse: 50,
  whale: 92,
  clockfish: 62,
  clam: 84,
};
