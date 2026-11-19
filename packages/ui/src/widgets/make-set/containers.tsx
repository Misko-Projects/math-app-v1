import type { ReactNode } from 'react';
import type { ConfigFor } from '../types';

/**
 * Container art for make-set (05 §11: cozy flat vector, a 3 px outline in a darker shade of the
 * fill, one soft highlight, a contact shadow; all original). Each drawing fills a `w × h` box in CSS
 * px behind the container's ten-frame slots, so the slots and objects sit on the boat's deck, the
 * raft's logs, inside the basket, the jar or the open shell. `closed` adds the end-state touch
 * (`close-container`): a sail for the boat and raft, a lid for the basket and jar, the shell's top.
 * Decorative only (aria-hidden): the drop target around it carries the name.
 */

export type ContainerKind = Exclude<ConfigFor<'make-set'>['container'], 'hands'>;

/** Space around the slot grid, per container (px): where the art shows. */
export const CONTAINER_PAD: Readonly<
  Record<ContainerKind, { top: number; right: number; bottom: number; left: number }>
> = {
  boat: { top: 22, right: 70, bottom: 64, left: 30 },
  raft: { top: 26, right: 30, bottom: 46, left: 30 },
  basket: { top: 44, right: 30, bottom: 40, left: 30 },
  jar: { top: 56, right: 30, bottom: 30, left: 30 },
  shell: { top: 60, right: 50, bottom: 60, left: 50 },
};

/**
 * The space around the slot grid in the tight frame chrome (short areas): only the boat's shrinks,
 * and only as far as keeps the frames ≥ 8 px inside its hull. The hull's top is at y 10 (top 18);
 * at the frames' bottom (h - 40, the deck line) the stern curves in to x 22 (left 32) and the bow
 * to w - 64 (right 74), and the hull's bottom is at h - 26 (14 px below the frames).
 */
export const CONTAINER_PAD_TIGHT: typeof CONTAINER_PAD = {
  ...CONTAINER_PAD,
  boat: { top: 18, right: 74, bottom: 40, left: 32 },
};

const INK = 'var(--color-ink)';
const HIGHLIGHT = 'rgb(255 255 255 / 0.55)';

/**
 * The strip of water under the boat and the raft: a wavy top `depth` px above the bottom (eight
 * waves of `amp`), with round ends and a 2 px inset, so its outline closes softly inside the box.
 */
function waterPath(w: number, h: number, depth: number, amp: number) {
  const top = h - depth;
  const tall = depth - 2;
  const r = tall / 2;
  const x0 = r + 2;
  const step = (w - 2 * x0) / 8;
  const waves = ` t ${step} 0`.repeat(7);
  return `M${x0} ${top} q ${step / 2} ${-amp} ${step} 0${waves} a ${r} ${r} 0 0 1 0 ${tall} H ${x0} a ${r} ${r} 0 0 1 0 ${-tall} Z`;
}

function Boat({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  const deckBottom = h - 40;
  return (
    <>
      {/* Water */}
      <path
        d={waterPath(w, h, 18, 10)}
        fill="var(--color-shallows)"
        stroke="var(--color-sea-deep)"
        strokeWidth="3"
      />
      {/* Hull: the deck the slots sit on, a curved bow on the right. */}
      <path
        className="ni-mset__body"
        d={`M8 10 H ${w - 64} Q ${w - 4} 10 ${w - 6} ${deckBottom * 0.45} Q ${w - 20} ${deckBottom} ${w - 90} ${deckBottom + 14} H 52 Q 14 ${deckBottom + 6} 8 ${deckBottom - 26} Z`}
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d={`M22 ${deckBottom - 4} H ${w - 70}`}
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path d={`M24 18 H ${w - 80}`} stroke={HIGHLIGHT} strokeWidth="4" strokeLinecap="round" />
      {/* A round porthole at the bow */}
      <circle
        cx={w - 36}
        cy={deckBottom * 0.42}
        r="11"
        fill="var(--color-sky-light)"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
      />
      {closed ? (
        <g>
          <path d={`M${w - 40} 12 V -64`} stroke="var(--color-wood-deep)" strokeWidth="5" />
          <path
            d={`M${w - 44} -60 L ${w - 44} 4 L ${w - 100} 4 Z`}
            fill="var(--color-cloud)"
            stroke={INK}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d={`M${w - 36} -64 l 26 8 l -26 8 Z`}
            fill="var(--color-coral)"
            stroke="var(--color-coral-deep)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </>
  );
}

function Raft({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  const logs = 5;
  const top = 6;
  const bottom = h - 26;
  const lh = (bottom - top) / logs;
  return (
    <>
      <path
        d={waterPath(w, h, 14, 9)}
        fill="var(--color-shallows)"
        stroke="var(--color-sea-deep)"
        strokeWidth="3"
      />
      <g className="ni-mset__body">
        {Array.from({ length: logs }, (_, i) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: the logs are positional art
            key={i}
            x={i % 2 === 0 ? 4 : 12}
            y={top + i * lh}
            width={w - 16}
            height={lh - 3}
            rx={(lh - 3) / 2}
            fill="var(--color-wood)"
            stroke="var(--color-wood-deep)"
            strokeWidth="3.5"
          />
        ))}
      </g>
      {[0.2, 0.8].map((f) => (
        <path
          key={f}
          d={`M${w * f} ${top - 2} V ${bottom + 2}`}
          stroke="var(--color-sunshine-deep)"
          strokeWidth="8"
          strokeLinecap="round"
        />
      ))}
      {closed ? (
        <g>
          <path d={`M${w / 2} ${top} V -70`} stroke="var(--color-wood-deep)" strokeWidth="5" />
          <path
            d={`M${w / 2 + 4} -66 Q ${w / 2 + 64} -34 ${w / 2 + 4} ${top - 6} Z`}
            fill="var(--color-cloud)"
            stroke={INK}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
      ) : null}
    </>
  );
}

function Basket({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  return (
    <>
      <ellipse cx={w / 2} cy={h - 4} rx={w * 0.42} ry="6" fill="rgb(38 70 83 / 0.16)" />
      {/* Handle */}
      <path
        d={`M${w * 0.2} 34 Q ${w / 2} -30 ${w * 0.8} 34`}
        fill="none"
        stroke="var(--color-wood-deep)"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M${w * 0.2} 34 Q ${w / 2} -30 ${w * 0.8} 34`}
        fill="none"
        stroke="var(--color-wood)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* Woven body */}
      <path
        className="ni-mset__body"
        d={`M6 30 H ${w - 6} L ${w - 22} ${h - 10} Q ${w - 26} ${h - 2} ${w - 40} ${h - 2} H 40 Q 26 ${h - 2} 22 ${h - 10} Z`}
        fill="var(--color-wood)"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {Array.from({ length: Math.max(2, Math.floor((h - 50) / 34)) }, (_, i) => (
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: weave rows are positional art
          key={i}
          d={`M${16 + i} ${64 + i * 34} H ${w - 16 - i}`}
          stroke="var(--color-wood-deep)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
      ))}
      <rect
        x="2"
        y="22"
        width={w - 4}
        height="20"
        rx="10"
        fill="var(--color-sun)"
        stroke="var(--color-wood-deep)"
        strokeWidth="4"
      />
      {closed ? (
        <path
          d={`M10 24 Q ${w / 2} -10 ${w - 10} 24 Z`}
          fill="var(--color-sun)"
          stroke="var(--color-wood-deep)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      ) : null}
    </>
  );
}

function Jar({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  return (
    <>
      <ellipse cx={w / 2} cy={h - 3} rx={w * 0.4} ry="6" fill="rgb(38 70 83 / 0.16)" />
      <path
        className="ni-mset__body"
        d={`M${w * 0.22} 18 H ${w * 0.78} V 42 Q ${w - 4} 50 ${w - 4} 84 V ${h - 30} Q ${w - 4} ${h - 6} ${w - 30} ${h - 6} H 30 Q 4 ${h - 6} 4 ${h - 30} V 84 Q 4 50 ${w * 0.22} 42 Z`}
        fill="var(--color-sky-light)"
        stroke="var(--color-sea-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d={`M22 92 V ${h - 44}`} stroke={HIGHLIGHT} strokeWidth="8" strokeLinecap="round" />
      <rect
        x={w * 0.2}
        y="10"
        width={w * 0.6}
        height="16"
        rx="8"
        fill="var(--color-sky)"
        stroke="var(--color-sea-deep)"
        strokeWidth="4"
      />
      {closed ? (
        <rect
          x={w * 0.17}
          y="-6"
          width={w * 0.66}
          height="26"
          rx="10"
          fill="var(--color-wood)"
          stroke="var(--color-wood-deep)"
          strokeWidth="4"
        />
      ) : null}
    </>
  );
}

/** The open shell's scalloped lip: the valleys sit on this line; the scallops rise above it. */
const SHELL_LIP = 22;
const SHELL_SIDE = 6;
const SHELL_CORNER = 34;

/** x of each valley of the shell's lip (between two scallops), corner to corner. */
function shellValleys(w: number): number[] {
  const from = SHELL_SIDE + SHELL_CORNER;
  const to = w - SHELL_SIDE - SHELL_CORNER;
  const n = Math.max(4, Math.round((to - from) / 64));
  return Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
}

/**
 * The open shell: rounded top corners with a row of scallops between them, straight sides and a
 * wide bowl that narrows to the hinge. The ten-frame (pad 50/60) sits wholly inside the outline,
 * and the ribs are short grooves under the lip that stop well above the frame.
 */
function Shell({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  const x0 = SHELL_SIDE;
  const x1 = w - SHELL_SIDE;
  const lip = SHELL_LIP;
  const valleys = shellValleys(w);
  const seg = (valleys[1] ?? 0) - (valleys[0] ?? 0);
  const scallops = valleys
    .slice(1)
    .map(() => `q ${seg / 2} -16 ${seg} 0`)
    .join(' ');
  const hingeY = h - 8;
  const outline = [
    `M${x0} ${lip + SHELL_CORNER}`,
    `Q ${x0} ${lip} ${x0 + SHELL_CORNER} ${lip}`,
    scallops,
    `Q ${x1} ${lip} ${x1} ${lip + SHELL_CORNER}`,
    `V ${h * 0.5}`,
    `C ${x1} ${h - 6} ${w * 0.8} ${hingeY} ${w / 2} ${hingeY}`,
    `C ${w * 0.2} ${hingeY} ${x0} ${h - 6} ${x0} ${h * 0.5}`,
    'Z',
  ].join(' ');
  const hinge = { x: w / 2, y: h - 14 };
  return (
    <>
      <ellipse cx={w / 2} cy={h - 4} rx={w * 0.4} ry="6" fill="rgb(38 70 83 / 0.16)" />
      <path
        className="ni-mset__outline ni-mset__body"
        d={outline}
        fill="var(--color-horizon)"
        stroke="var(--color-coral-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {valleys.map((vx) => {
        // A groove from the valley towards the hinge, 6–26 px in: it ends above the frame.
        const dx = hinge.x - vx;
        const dy = hinge.y - lip;
        const len = Math.hypot(dx, dy);
        const a = 6 / len;
        const b = 26 / len;
        return (
          <path
            key={vx}
            className="ni-mset__rib"
            d={`M${vx + dx * a} ${lip + dy * a} L ${vx + dx * b} ${lip + dy * b}`}
            stroke="var(--color-coral)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.55"
          />
        );
      })}
      <path
        d={`M${x0 + 16} ${lip + SHELL_CORNER + 6} V ${h * 0.6}`}
        stroke={HIGHLIGHT}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d={`M${w / 2 - 30} ${h - 10} h 60 l 8 10 h -76 Z`}
        fill="var(--color-coral)"
        stroke="var(--color-coral-deep)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {closed ? (
        <path
          d={`M10 ${h * 0.12} Q ${w / 2} -40 ${w - 10} ${h * 0.12} Q ${w / 2} 10 10 ${h * 0.12} Z`}
          fill="var(--color-coral)"
          stroke="var(--color-coral-deep)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      ) : null}
    </>
  );
}

const ART: Readonly<
  Record<ContainerKind, (p: { w: number; h: number; closed: boolean }) => React.ReactElement>
> = {
  boat: Boat,
  raft: Raft,
  basket: Basket,
  jar: Jar,
  shell: Shell,
};

export function ContainerArt({
  kind,
  width,
  height,
  closed,
}: {
  kind: ContainerKind;
  width: number;
  height: number;
  closed: boolean;
}) {
  const Draw = ART[kind];
  return (
    <svg
      className="ni-mset__art"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
      data-container={kind}
      data-closed={closed ? 'true' : undefined}
    >
      <g className="ni-mset__drawn">
        <Draw w={width} h={height} closed={closed} />
      </g>
    </svg>
  );
}

/**
 * A tied bundle of ten (groupsOf 10): a rope band across a full ten-frame, in the gap between its
 * two rows (no thicker than the gap), tied off in a bow just OUTSIDE the frame's right edge: the
 * band crosses the frame's padding and border (`edge`, the frame's padding + border on that side)
 * and the knot and its loops sit fully beyond it, so the bow never covers a slot or the border.
 * `vertical`: the same band down the gap between two columns, the bow under the bottom edge.
 * `bow={false}`: no bow; the band ends inside the frame, 2 px in from both ends (inside the
 * padding, clear of the border), so it reads the same at the top and the bottom (the tied ten
 * beside a frame of ones, one ten-frame at a time).
 */
export function BundleBand({
  width,
  height,
  vertical = false,
  bow = true,
  edge = 20,
}: {
  width: number;
  height: number;
  vertical?: boolean;
  bow?: boolean;
  edge?: number;
}) {
  const along = vertical ? height : width;
  const across = (vertical ? width : height) / 2;
  /** The knot's centre: the knot (8.5 px along it with its outline) starts 12 px past the edge. */
  const knot = along + edge + 12 + 8.5;
  /** Where the band starts and how long it is, along it: to the bow, or symmetric in the frame. */
  const start = bow ? -Math.min(8, edge - 2) : -2;
  const length = bow ? knot - start : along + 4;
  /** (a, c): `a` along the band, `c` across it. */
  const at = (a: number, c: number) => (vertical ? { x: c, y: a } : { x: a, y: c });
  const band = at(start, across - 6);
  return (
    <svg
      className="ni-mset__band"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      <rect
        x={band.x}
        y={band.y}
        width={vertical ? 12 : length}
        height={vertical ? length : 12}
        rx="6"
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="3"
      />
      {(bow ? [-1, 1] : []).map((side) => {
        const c = at(knot, across + side * 15);
        return (
          <ellipse
            key={side}
            className="ni-mset__bow"
            cx={c.x}
            cy={c.y}
            rx={vertical ? 11 : 6}
            ry={vertical ? 6 : 11}
            fill="var(--color-sunshine)"
            stroke={INK}
            strokeWidth="3"
          />
        );
      })}
      {bow ? (
        <circle
          className="ni-mset__bow"
          cx={at(knot, across).x}
          cy={at(knot, across).y}
          r="7"
          fill="var(--color-sunshine-deep)"
          stroke={INK}
          strokeWidth="3"
        />
      ) : null}
    </svg>
  );
}

/** Where the ten objects of a `TenBundle` sit (left, top in px): two columns of five. */
const BUNDLE_SPOTS: readonly [number, number][] = Array.from({ length: 10 }, (_, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  return [4 + col * 48, row * 34] as [number, number];
});

/**
 * A tied ten as ONE bundle (one ten-frame at a time, make-set): ten objects of 40 px (the same
 * drawings as the loose ones) in two columns of five, the rope running down the 8 px gap between
 * the columns and tied in a small bow at the middle, so every object stays in view (the rope and
 * bow cover < 20 % of any object's box). 96 × 176; no cells, no outline: it never reads as a
 * frame. `tied={false}`: the same ten with no rope (a ten still to be bundled).
 */
export function TenBundle({ sprite, tied = true }: { sprite: ReactNode; tied?: boolean }) {
  return (
    <span className="ni-mset__bundle" data-tied={tied ? 'true' : undefined} aria-hidden="true">
      <span className="ni-mset__bundle-ground" />
      {BUNDLE_SPOTS.map(([left, top], i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the bundle's spots are positional
        <span key={i} className="ni-mset__bundle-obj" style={{ left, top }}>
          {sprite}
        </span>
      ))}
      {tied ? <BundleTie /> : null}
    </span>
  );
}

/** The bundle's rope (down the gap between its columns) and its bow, at the middle. */
function BundleTie() {
  const mid = 88;
  return (
    <svg
      className="ni-mset__bundle-tie"
      viewBox="0 0 96 176"
      width="96"
      height="176"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="ni-mset__rope"
        x="45"
        y="-2"
        width="6"
        height="180"
        rx="3"
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="2"
      />
      {[-1, 1].map((side) => (
        <ellipse
          key={side}
          className="ni-mset__bow"
          cx={48 + side * 10}
          cy={mid}
          rx="6"
          ry="5"
          fill="var(--color-sunshine)"
          stroke={INK}
          strokeWidth="2.5"
        />
      ))}
      <circle
        className="ni-mset__bow"
        cx="48"
        cy={mid}
        r="5"
        fill="var(--color-sunshine-deep)"
        stroke={INK}
        strokeWidth="2.5"
      />
    </svg>
  );
}

/** Icon for the "make a ten" button: ten sticks tied with a band. */
export function BundleIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      fill="none"
    >
      {[10, 15, 20, 25, 30, 35].map((x) => (
        <rect
          key={x}
          x={x}
          y="6"
          width="5"
          height="36"
          rx="2.5"
          fill="var(--color-wood)"
          stroke="var(--color-wood-deep)"
          strokeWidth="2"
        />
      ))}
      <rect
        x="6"
        y="20"
        width="36"
        height="9"
        rx="4.5"
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="3"
      />
    </svg>
  );
}
