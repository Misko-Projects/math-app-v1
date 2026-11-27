import type { ReactNode } from 'react';
import { createContext, useContext, useId } from 'react';
import grainUrl from '../../tokens/felt-grain.webp';

/*
 * The felt kit the guides are sewn from (05 §11, Felt & Stitch): cut felt pieces with the baked
 * grain of slice 1 laid over their colour, a thickness rim and a soft lift, running stitches set
 * in evenly from an edge, button-bead eyes and sewn buttons. Built like the art-direction mockup
 * (felt-r2), so a guide drawn here stands beside the mockup turtle.
 *
 * Every SVG that uses the kit renders one <FeltDefs> and wraps its parts in <FeltScope>, so two
 * guides on one screen never share (or clash on) a filter id.
 */

export const FELT = {
  cream: '#F6EEDB',
  must: '#E2A62A',
  mustD: '#B9821B',
  terra: '#C5633D',
  sage: '#93A888',
  sageD: '#5C7A5B',
  denim: '#3F5E8A',
  denimD: '#2B4467',
  blush: '#F0AC98',
  kraftD: '#A5855B',
  ink: '#3A2D29',
  fur: '#D9BE97',
  mouth: '#5E2A35',
} as const;

const Scope = createContext('felt');

/** The id prefix of the nearest <FeltDefs>. */
function useScope(): string {
  return useContext(Scope);
}

const url = (scope: string, name: string) => `url(#${scope}-${name})`;

/** Lift filters: shadow colour, blur, offset, opacity, contact shadow and rim (felt-r2 recipe). */
function LiftFilter({
  id,
  blur,
  dx,
  dy,
  op,
  rim,
  contact = true,
  cop = 0.36,
}: {
  id: string;
  blur: number;
  dx: number;
  dy: number;
  op: number;
  rim: [number, number];
  contact?: boolean;
  cop?: number;
}) {
  const sh = '#4A2A12';
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="165%" colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="s1" />
      <feOffset in="s1" dx={dx} dy={dy} result="s1o" />
      <feFlood floodColor={sh} floodOpacity={op} />
      <feComposite in2="s1o" operator="in" result="shA" />
      {contact && (
        <>
          <feGaussianBlur in="SourceAlpha" stdDeviation={1.3} result="s2" />
          <feOffset in="s2" dx={0.9} dy={1.8} result="s2o" />
          <feFlood floodColor={sh} floodOpacity={cop} />
          <feComposite in2="s2o" operator="in" result="shB" />
        </>
      )}
      <feGaussianBlur in="SourceAlpha" stdDeviation={rim[0] * 0.8} result="a" />
      <feOffset in="a" dx={-rim[0]} dy={-rim[1]} result="a1" />
      <feComposite in="SourceAlpha" in2="a1" operator="out" result="r1" />
      <feFlood floodColor="#2b1a12" floodOpacity={0.3} />
      <feComposite in2="r1" operator="in" result="rimD" />
      <feOffset in="a" dx={rim[0]} dy={rim[1]} result="a2" />
      <feComposite in="SourceAlpha" in2="a2" operator="out" result="r2" />
      <feFlood floodColor="#fff6e2" floodOpacity={0.42} />
      <feComposite in2="r2" operator="in" result="rimL" />
      <feMerge>
        <feMergeNode in="shA" />
        {contact && <feMergeNode in="shB" />}
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="rimD" />
        <feMergeNode in="rimL" />
      </feMerge>
    </filter>
  );
}

/**
 * The filters and fills of one SVG: `f` a big piece's lift, `fs` a small piece's, `a` an
 * appliqué sewn flat onto another piece, `s` a bead's tiny shadow; `grain` the slice-1 tile,
 * `puff` the soft fullness of a stuffed piece (light on the upper left, a little shade at the rim).
 */
export function FeltDefs({ children }: { children: ReactNode }) {
  const scope = `felt${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Scope.Provider value={scope}>
      <defs>
        <LiftFilter id={`${scope}-f`} blur={6} dx={4} dy={8} op={0.27} rim={[1.6, 2.4]} />
        <LiftFilter
          id={`${scope}-fs`}
          blur={2.6}
          dx={2}
          dy={3.6}
          op={0.3}
          cop={0.3}
          rim={[1.1, 1.6]}
        />
        <LiftFilter
          id={`${scope}-a`}
          blur={1.3}
          dx={1}
          dy={1.8}
          op={0.42}
          rim={[0.9, 1.3]}
          contact={false}
        />
        <filter
          id={`${scope}-s`}
          x="-60%"
          y="-60%"
          width="220%"
          height="240%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceAlpha" stdDeviation={1.1} result="s" />
          <feOffset in="s" dx={0.9} dy={1.6} result="so" />
          <feFlood floodColor="#2a1608" floodOpacity={0.45} />
          <feComposite in2="so" operator="in" result="sh" />
          <feMerge>
            <feMergeNode in="sh" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id={`${scope}-grain`} width={120} height={120} patternUnits="userSpaceOnUse">
          <image href={grainUrl} width={120} height={120} />
        </pattern>
        <radialGradient id={`${scope}-puff`} cx={0.36} cy={0.28} r={0.8}>
          <stop offset={0} stopColor="#fff" stopOpacity={0.24} />
          <stop offset={0.55} stopColor="#fff" stopOpacity={0} />
          <stop offset={0.8} stopColor="#2a1208" stopOpacity={0} />
          <stop offset={1} stopColor="#2a1208" stopOpacity={0.16} />
        </radialGradient>
      </defs>
      {children}
    </Scope.Provider>
  );
}

export type Lift = 'f' | 'fs' | 'a';

/**
 * A felt piece: the path in its colour, the grain laid over it (soft-light, so the colour stays
 * the token's), the puff on stuffed pieces, all under one lift. `k` > 0 rounds the outline out by
 * k (a same-colour stroke), so a stitch drawn along `d` sits k inside the edge.
 */
export function Piece({
  d,
  fill,
  lift = 'f',
  puff = false,
  k = 0,
  transform,
}: {
  d: string;
  fill: string;
  lift?: Lift;
  puff?: boolean;
  k?: number;
  transform?: string;
}) {
  const scope = useScope();
  const stroke = k ? { strokeWidth: 2 * k, strokeLinejoin: 'round' as const } : {};
  const paint = (p: string) => ({ fill: p, ...(k ? { stroke: p } : {}) });
  return (
    <g filter={url(scope, lift)}>
      <path d={d} transform={transform} {...paint(fill)} {...stroke} />
      <path
        d={d}
        transform={transform}
        {...paint(url(scope, 'grain'))}
        {...stroke}
        style={{ mixBlendMode: 'overlay' }}
        opacity={0.75}
      />
      {puff && <path d={d} transform={transform} {...paint(url(scope, 'puff'))} {...stroke} />}
    </g>
  );
}

/** A running stitch: a dashed thread with its pressed-in shadow (felt-r2 `S`). */
export function Stitch({
  d,
  color = FELT.cream,
  width = 2.2,
  dash = '6.5 5.5',
  halo = true,
  opacity = 1,
  transform,
}: {
  d: string;
  color?: string;
  width?: number;
  dash?: string;
  halo?: boolean;
  opacity?: number;
  transform?: string;
}) {
  return (
    <g
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      strokeWidth={width}
      transform={transform}
    >
      {halo && <path d={d} stroke="#2a1a10" opacity={0.3} transform="translate(0.6 1)" />}
      <path d={d} stroke={color} opacity={opacity} />
    </g>
  );
}

/** A sewn thread line (a smile, a brow, a toe): solid, round-ended. */
export function Thread({
  d,
  color = FELT.ink,
  width = 2.4,
}: {
  d: string;
  color?: string;
  width?: number;
}) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** A glossy button-bead eye; `look` moves the bead, `big` adds the ring and second glint. */
export function BeadEye({
  cx,
  cy,
  r,
  look = [0, 0],
  big = false,
}: {
  cx: number;
  cy: number;
  r: number;
  look?: [number, number];
  big?: boolean;
}) {
  const scope = useScope();
  const x = cx + look[0];
  const y = cy + look[1];
  return (
    <g>
      <g filter={url(scope, 's')}>
        <circle cx={x} cy={y} r={r} fill="#2B2220" />
      </g>
      {big && (
        <circle cx={x} cy={y} r={r * 0.68} fill="none" stroke="#5a4944" strokeWidth={r * 0.1} />
      )}
      <circle cx={x - r * 0.32} cy={y - r * 0.36} r={r * 0.3} fill="#fff" />
      {big && <circle cx={x + r * 0.3} cy={y + r * 0.34} r={r * 0.13} fill="#fff" opacity={0.6} />}
    </g>
  );
}

/** A happy closed eye: a sewn arc. */
export function ClosedEye({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return <Thread d={`M${cx - r},${cy + r * 0.2}q${r},${-r * 1.25} ${2 * r},0`} width={r * 0.42} />;
}

/** A four-hole sewing button with its cross of thread. */
export function SewButton({
  cx,
  cy,
  r,
  fill = FELT.must,
  rim = FELT.mustD,
  thread = FELT.cream,
}: {
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  rim?: string;
  thread?: string;
}) {
  const scope = useScope();
  const h = r * 0.25;
  return (
    <g>
      <g filter={url(scope, 's')}>
        <circle cx={cx} cy={cy} r={r} fill={fill} />
      </g>
      <circle cx={cx} cy={cy} r={r * 0.72} fill="none" stroke={rim} strokeWidth={r * 0.09} />
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sy) => (
          <circle key={`${sx}${sy}`} cx={cx + sx * h} cy={cy + sy * h} r={r * 0.1} fill="#3a2410" />
        )),
      )}
      <Thread
        d={`M${cx - h},${cy - h}L${cx + h},${cy + h}M${cx + h},${cy - h}L${cx - h},${cy + h}`}
        color={thread}
        width={r * 0.13}
      />
    </g>
  );
}

/** Anything with a bead's tiny shadow (an open mouth, a nose). */
export function Shadowed({ children }: { children: ReactNode }) {
  const scope = useScope();
  return <g filter={url(scope, 's')}>{children}</g>;
}

/** A small bead with the tiny shadow (a nostril dot, a thought bubble). */
export function Bead({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const scope = useScope();
  return (
    <g filter={url(scope, 's')}>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
    </g>
  );
}

// ---------------------------------------------------------------- geometry (felt-r2 helpers)

const f1 = (v: number) => {
  const s = v.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
};

/** An ellipse as one path (so a stitch can follow it). */
export function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f1(cx - rx)},${f1(cy)}a${f1(rx)},${f1(ry)} 0 1 0 ${f1(2 * rx)},0a${f1(rx)},${f1(ry)} 0 1 0 ${f1(-2 * rx)},0z`;
}

export function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r);
}

/** A rounded rectangle path. */
export function roundRect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${f1(x + r)},${f1(y)}h${f1(w - 2 * r)}a${f1(r)},${f1(r)} 0 0 1 ${f1(r)},${f1(r)}v${f1(h - 2 * r)}a${f1(r)},${f1(r)} 0 0 1 ${f1(-r)},${f1(r)}h${f1(-(w - 2 * r))}a${f1(r)},${f1(r)} 0 0 1 ${f1(-r)},${f1(-r)}v${f1(-(h - 2 * r))}a${f1(r)},${f1(r)} 0 0 1 ${f1(r)},${f1(-r)}z`;
}

/** An ellipse with a scalloped edge of `k` bumps (a turtle's shell rim). */
export function scallopEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  k: number,
  bulge = 0.6,
): string {
  const pts = Array.from({ length: k }, (_, i) => {
    const a = (2 * Math.PI * i) / k - Math.PI / 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });
  let d = `M${f1(pts[0]![0])},${f1(pts[0]![1])}`;
  for (let i = 1; i <= k; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i % k]!;
    const r = Math.hypot(b[0] - a[0], b[1] - a[1]) * bulge;
    d += `A${f1(r)},${f1(r)} 0 0 1 ${f1(b[0])},${f1(b[1])}`;
  }
  return `${d}z`;
}

/** A regular hexagon (a shell scute). */
export function hexagon(cx: number, cy: number, r: number, rot = 0): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = ((rot + i * 60) * Math.PI) / 180;
    return `${f1(cx + r * Math.cos(a))},${f1(cy + r * Math.sin(a))}`;
  });
  return `M${pts.join('L')}z`;
}
