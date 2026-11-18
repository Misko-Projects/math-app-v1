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
  shell: { top: 52, right: 56, bottom: 56, left: 56 },
};

const INK = 'var(--color-ink)';
const HIGHLIGHT = 'rgb(255 255 255 / 0.55)';

function Boat({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  const deckBottom = h - 40;
  return (
    <>
      {/* Water */}
      <path
        d={`M0 ${h - 18} q ${w / 16} -10 ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 V ${h} H 0 Z`}
        fill="var(--color-shallows)"
        stroke="var(--color-sea-deep)"
        strokeWidth="3"
      />
      {/* Hull: the deck the slots sit on, a curved bow on the right. */}
      <path
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
        d={`M0 ${h - 14} q ${w / 16} -9 ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 t ${w / 8} 0 V ${h} H 0 Z`}
        fill="var(--color-shallows)"
        stroke="var(--color-sea-deep)"
        strokeWidth="3"
      />
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

function Shell({ w, h, closed }: { w: number; h: number; closed: boolean }) {
  const ribs = 7;
  return (
    <>
      <ellipse cx={w / 2} cy={h - 4} rx={w * 0.4} ry="6" fill="rgb(38 70 83 / 0.16)" />
      <path
        d={`M${w / 2} ${h - 10} C ${w * 0.1} ${h - 10} 4 ${h * 0.6} 8 ${h * 0.3} Q ${w * 0.25} 2 ${w / 2} 4 Q ${w * 0.75} 2 ${w - 8} ${h * 0.3} C ${w - 4} ${h * 0.6} ${w * 0.9} ${h - 10} ${w / 2} ${h - 10} Z`}
        fill="var(--color-horizon)"
        stroke="var(--color-coral-deep)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {Array.from({ length: ribs }, (_, i) => {
        // Ribs fan out from the hinge and stop inside the shell's edge.
        const a = ((i / (ribs - 1)) * 2 - 1) * (Math.PI / 3);
        const x = w / 2 + Math.sin(a) * (w / 2 - 14) * 0.9;
        const y = h - 14 - Math.cos(a) * (h - 30) * 0.9;
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: ribs are positional art
            key={i}
            d={`M${w / 2} ${h - 14} L ${x} ${y}`}
            stroke="var(--color-coral)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.45"
          />
        );
      })}
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
      <Draw w={width} h={height} closed={closed} />
    </svg>
  );
}

/** A tied bundle of ten (groupsOf 10): a rope band with a knot, drawn over a full ten-frame. */
export function BundleBand({ width, height }: { width: number; height: number }) {
  const y = height / 2;
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
        x="-6"
        y={y - 9}
        width={width + 12}
        height="18"
        rx="9"
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="3"
      />
      <path
        d={`M${width / 2 - 4} ${y} c -18 -22 -34 -4 -18 8 c -14 14 6 22 18 -8 Z`}
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d={`M${width / 2 + 4} ${y} c 18 -22 34 -4 18 8 c 14 14 -6 22 -18 -8 Z`}
        fill="var(--color-sunshine)"
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle
        cx={width / 2}
        cy={y}
        r="8"
        fill="var(--color-sunshine-deep)"
        stroke={INK}
        strokeWidth="3"
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
