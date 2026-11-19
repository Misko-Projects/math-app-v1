import type { ReactNode } from 'react';
import { filled, paint } from '../core/paint';
import { Highlight } from '../core/Shading';
import {
  Awning,
  Bunting,
  Chimney,
  Deck,
  Dome,
  Door,
  type DrawProps,
  Flag,
  Gable,
  Glow,
  Ground,
  Icon,
  Lantern,
  levelOf,
  Post,
  Railing,
  Rock,
  Site,
  Smoke,
  Sparkle,
  Star,
  stroke,
  Wall,
  Water,
  Window,
} from './parts';

// Shared projects (05 §6): the Lighthouse, the Bridge to East Beach and the Festival Stage.

/** Lighthouse: a striped tower on the rocks; it grows taller, gains a keeper's cottage and beams. */
export function Lighthouse({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0) {
    return (
      <Site
        w={48}
        h={96}
        y={-40}
        roof="tower"
        icon={<Icon kind="light" />}
        foot={[2, 2]}
        behind={
          <g>
            <Rock x={-56} y={-26} w={40} h={22} />
            <Rock x={60} y={-24} w={34} h={18} />
          </g>
        }
      />
    );
  }
  const yb = -40;
  const top = lv === 1 ? -156 : lv === 2 ? -196 : -226;
  const half = (y: number) => 27 - ((yb - y) / (yb - top)) * 8;
  const bands: ReactNode[] = [];
  const step = (yb - top) / (lv === 1 ? 4 : 6);
  for (let i = 0; i < (lv === 1 ? 4 : 6); i++) {
    const y0 = yb - i * step;
    const y1 = y0 - step;
    bands.push(
      <path
        key={i}
        d={`M${-half(y0)} ${y0}L${-half(y1)} ${y1}H${half(y1)}L${half(y0)} ${y0}Z`}
        fill={paint(i % 2 === 0 ? 'cloud' : 'coral')}
      />,
    );
  }
  const room = top - 6;
  return (
    <g>
      <Ground w={150} y={-12} ry={11} />
      {lit ? (
        <g data-part="beams" opacity={0.55}>
          <path
            d={`M-4 ${room - 14}L-104 ${room - 46}L-104 ${room + 14}Z`}
            fill={paint('sunshine-light')}
          />
          <path
            d={`M4 ${room - 14}L104 ${room - 46}L104 ${room + 14}Z`}
            fill={paint('sunshine-light')}
          />
        </g>
      ) : null}
      {lv >= 2 ? (
        <g>
          <Wall x={-94} y={-24} w={44} h={30} fill="paper" texture="siding" />
          <Chimney x={-64} y={-62} w={9} h={12} fill="pebble" />
          <Gable cx={-72} y={-54} w={44} h={24} fill="sea" />
          <Door x={-80} y={-24} w={12} h={18} fill="sea-deep" />
          <Window x={-62} y={-38} w={11} lit={lit} />
        </g>
      ) : null}
      {bands}
      <path
        d={`M${-half(yb)} ${yb}L${-half(top)} ${top}H${half(top)}L${half(yb)} ${yb}Z`}
        fill="none"
        stroke={paint('coral-deep')}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <Highlight
        d={`M${-half(yb) + 5} ${yb - 4}L${-half(top) + 5} ${top + 6}H${-half(top) + 10}L${-half(yb) + 11} ${yb - 4}Z`}
        opacity={0.3}
      />
      <Door x={0} y={yb} w={14} h={22} fill="sea-deep" />
      <Window x={0} y={yb - step * 1.5} w={9} h={12} lit={lit} shape="arch" />
      {lv >= 2 ? <Window x={0} y={yb - step * 3.5} w={9} h={12} lit={lit} shape="arch" /> : null}
      {/* Gallery, lamp room and dome. */}
      <rect
        x={-half(top) - 8}
        y={top - 2}
        width={(half(top) + 8) * 2}
        height={7}
        rx={2}
        {...filled('ink-soft', 2.5)}
      />
      {lv >= 2 ? (
        <Railing
          x1={-half(top) - 6}
          x2={half(top) + 6}
          y={top - 2}
          h={10}
          step={(half(top) + 6) / 2}
        />
      ) : null}
      {lit ? (
        <circle cx={0} cy={room - 12} r={34} fill={paint('sunshine-light')} opacity={0.5} />
      ) : null}
      <rect
        x={-13}
        y={room - 24}
        width={26}
        height={22}
        rx={3}
        fill={paint(lit ? 'sunshine-light' : 'sky-light')}
        stroke={paint('ink-soft')}
        strokeWidth={2.5}
      />
      <path
        d={`M-4 ${room - 23}V${room - 3}M5 ${room - 23}V${room - 3}`}
        {...stroke('ink-soft', 2)}
      />
      <circle
        cx={0}
        cy={room - 13}
        r={5}
        fill={paint('sunshine')}
        stroke={paint('sunshine-deep')}
        strokeWidth={1.8}
      />
      <Dome cx={0} y={room - 24} w={34} h={16} fill="coral" />
      <circle cx={0} cy={room - 46} r={3.5} {...filled('sunshine', 2)} />
      <Rock x={-38} y={-14} w={34} h={20} />
      <Rock x={44} y={-12} w={30} h={18} />
      <Rock x={20} y={-6} w={18} h={11} />
      {lv === 3 ? (
        <g>
          <Flag x={-half(top) - 6} y={top - 2} h={30} fill="sunshine" />
          <Flag x={half(top) + 6} y={top - 2} h={30} fill="sea" delay={1} />
          <Bunting x1={-72} y1={-78} x2={-half(-112)} y2={-112} sag={4} n={5} />
          {lit ? null : <Sparkle x={18} y={room - 30} s={0.7} />}
        </g>
      ) : null}
      {lv >= 2 ? <Smoke x={-60} y={-78} /> : null}
    </g>
  );
}

/** Bridge to East Beach: a plank bridge, then a stone arch bridge, then lamps and flags. */
export function EastBridge({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  const banks = (
    <g>
      <path d="M-150 -2Q-150 -46 -112 -48Q-96 -26 -100 -2Z" {...filled('sand')} />
      <path d="M150 -2Q150 -46 112 -48Q96 -26 100 -2Z" {...filled('sand')} />
    </g>
  );
  if (lv === 0) {
    return (
      <Site
        w={34}
        h={26}
        cx={-112}
        roof="gable"
        icon={<Icon kind="bridge" />}
        foot={[3, 1]}
        noPlot
        behind={
          <g>
            <Water x={-112} y={-50} w={224} h={46} />
            {banks}
            {[-60, -20, 20, 60].map((x) => (
              <Post key={x} x={x} y={-10} h={36} w={6} />
            ))}
            <Deck x1={-110} x2={-30} y={-44} t={7} />
          </g>
        }
      />
    );
  }
  return (
    <g>
      <Ground w={290} y={-4} ry={8} />
      <Water x={-112} y={-50} w={224} h={46} />
      {banks}
      {lv === 1 ? (
        <g>
          {[-72, -24, 24, 72].map((x) => (
            <Post key={x} x={x} y={-10} h={36} w={7} />
          ))}
          <Deck x1={-124} x2={124} y={-46} t={9} />
          <Railing x1={-120} x2={120} y={-46} h={14} step={30} />
        </g>
      ) : (
        <g>
          <path
            d="M-126 -10V-52H126V-10H100A26 30 0 0 0 48 -10H26A26 30 0 0 0 -26 -10H-48A26 30 0 0 0 -100 -10Z"
            {...filled('pebble')}
          />
          <path
            d="M-120 -40H120M-110 -28H-100M-48 -28H-26M26 -28H48M100 -28H118"
            {...stroke('pebble-deep', 1.8)}
            opacity={0.7}
          />
          <path
            d="M-90 -40V-52M-50 -52V-40M-10 -40V-52M30 -52V-40M70 -40V-52M110 -52V-40"
            {...stroke('pebble-deep', 1.8)}
            opacity={0.7}
          />
          <Highlight d="M-120 -48H-40V-45H-120Z" opacity={0.5} />
          <rect x={-130} y={-60} width={260} height={9} rx={3} {...filled('sand-deep')} />
          <Railing x1={-124} x2={124} y={-60} h={14} step={31} />
        </g>
      )}
      {lv === 3 ? (
        <g>
          {[-124, -40, 40, 124].map((x, i) => (
            <g key={x}>
              <Post x={x} y={-60} h={44} w={5} />
              <path d={`M${x} ${-102}h${x < 0 ? 8 : -8}`} {...stroke('wood-deep', 2.5)} />
              <Lantern x={x + (x < 0 ? 8 : -8)} y={-90} hang={10} lit={lit} delay={i * 0.6} />
            </g>
          ))}
          <Bunting x1={-124} y1={-100} x2={-40} y2={-100} sag={5} n={6} />
          <Bunting x1={-40} y1={-100} x2={40} y2={-100} sag={5} n={6} />
          <Bunting x1={40} y1={-100} x2={124} y2={-100} sag={5} n={6} />
          <Flag x={-142} y={-30} h={70} fill="coral" />
          <Flag x={142} y={-30} h={70} w={-18} fill="sea" delay={1.2} />
        </g>
      ) : null}
    </g>
  );
}

/** Festival Stage: a plank stage with curtains; a striped canopy; then an arch with a star. */
export function FestivalStage({ stage, lit }: DrawProps) {
  const lv = levelOf(stage);
  if (lv === 0)
    return <Site w={150} h={22} y={-26} roof="flat" icon={<Icon kind="star" />} foot={[2, 2]} />;
  const yb = -24;
  const deck = -52;
  const frameTop = lv === 1 ? -126 : -136;
  return (
    <g>
      <Ground w={196} y={-6} ry={12} />
      {/* Back wall and curtains. */}
      <rect
        x={-74}
        y={frameTop}
        width={148}
        height={deck - frameTop}
        rx={4}
        {...filled('sea-deep')}
      />
      <path d={`M-74 ${frameTop + 2}Q-50 ${frameTop + 34} -54 ${deck}H-74Z`} {...filled('coral')} />
      <path d={`M74 ${frameTop + 2}Q50 ${frameTop + 34} 54 ${deck}H74Z`} {...filled('coral')} />
      <path
        d={`M-66 ${frameTop + 12}Q-62 ${deck - 30} -62 ${deck - 2}M66 ${frameTop + 12}Q62 ${deck - 30} 62 ${deck - 2}`}
        {...stroke('coral-deep', 2)}
      />
      {lit ? <Glow x={0} y={(frameTop + deck) / 2} r={20} /> : null}
      <Star x={0} y={(frameTop + deck) / 2} r={14} fill="sunshine" />
      <Post x={-76} y={deck} h={deck - frameTop + 4} w={7} />
      <Post x={76} y={deck} h={deck - frameTop + 4} w={7} />
      <rect x={-84} y={frameTop - 8} width={168} height={9} rx={3} {...filled('wood')} />
      {/* The stage: deck, front skirt with scallops and steps. */}
      <rect x={-86} y={deck} width={172} height={yb - deck} rx={3} {...filled('wood')} />
      <path d={`M-84 ${deck + 10}H84`} {...stroke('wood-deep', 1.6)} opacity={0.6} />
      <Awning x={-82} y={deck + 14} w={164} h={12} stripe="sunshine" />
      <rect x={-30} y={yb - 6} width={60} height={8} rx={2} {...filled('sand-deep', 2.5)} />
      <rect x={-22} y={yb - 0} width={44} height={8} rx={2} {...filled('sand-deep', 2.5)} />
      {lv >= 2 ? (
        <g>
          <Awning x={-92} y={frameTop - 4} w={184} h={18} stripe="coral" />
          <Bunting x1={-74} y1={frameTop + 14} x2={74} y2={frameTop + 14} sag={7} n={10} />
          <Lantern x={-84} y={deck - 16} hang={8} lit={lit} />
          <Lantern x={84} y={deck - 16} hang={8} lit={lit} delay={1} />
          <path d={`M-80 ${deck - 24}h-4M80 ${deck - 24}h4`} {...stroke('wood-deep', 2)} />
        </g>
      ) : null}
      {lv === 3 ? (
        <g>
          <path
            d={`M-88 ${frameTop - 20}Q0 ${frameTop - 70} 88 ${frameTop - 20}V${frameTop - 8}Q0 ${frameTop - 56} -88 ${frameTop - 8}Z`}
            {...filled('sunshine')}
          />
          <Star x={0} y={frameTop - 60} r={16} fill="sunshine" />
          <Sparkle x={-26} y={frameTop - 64} s={0.6} />
          <Sparkle x={28} y={frameTop - 62} s={0.5} delay={2} />
          {[-60, -30, 30, 60].map((x, i) => (
            <Lantern
              key={x}
              x={x}
              y={frameTop - 18 - (Math.abs(x) === 30 ? 16 : 6)}
              hang={6}
              lit={lit}
              s={0.75}
              delay={i * 0.5}
              fill={i % 2 === 0 ? 'coral' : 'sea'}
            />
          ))}
          <Flag x={-92} y={yb} h={yb - frameTop + 30} fill="coral" />
          <Flag x={92} y={yb} h={yb - frameTop + 30} w={-18} fill="sea" delay={1} />
        </g>
      ) : null}
    </g>
  );
}
