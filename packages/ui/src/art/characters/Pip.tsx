import type { ReactNode } from 'react';
import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { ContactShadow } from '../core/Shading';
import { Cheeks, Eyes, fillOf, Hop, Loop, Pivot, Shine } from './parts';

/**
 * Pip (05 §1, §10): the cheerful puffin ferry captain who guides the children. A chunky, round
 * puffin in a white captain's cap with an anchor badge and a striped sea-teal neckerchief.
 */
export type PipPose = 'idle' | 'talk' | 'point' | 'cheer' | 'think';
export const PIP_POSES: readonly PipPose[] = ['idle', 'talk', 'point', 'cheer', 'think'];

export interface PipProps extends ArtProps {
  pose?: PipPose;
  /** Which way Pip points in the `point` pose (Pip's wing reaches that side of the picture). */
  direction?: 'left' | 'right';
}

/**
 * Pip's design box. Pip stands in 0–220 × 0–264; the box adds room on both sides for a pointing
 * wing (with its nudge) and above for a cheer hop, so no pose ever leaves the picture.
 */
export const PIP_X = -40;
export const PIP_Y = -18;
export const PIP_W = 300;
export const PIP_H = 282;

/** Pip's wing, drawn from the shoulder, hanging down at rest. */
function Wing() {
  return (
    <g>
      <path d="M-12 -4C-22 26 -14 58 2 70C16 58 20 26 12 -4Z" {...fillOf('ink-soft')} />
      <path
        d="M-6 8C-10 26 -6 44 2 54"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.25}
      />
    </g>
  );
}

/** A nudge along a direction (degrees, 0 = up), so a pointing wing pokes the way it points. */
function Nudge({
  deg,
  x,
  y,
  children,
}: {
  deg: number;
  x: number;
  y: number;
  children: ReactNode;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <Hop amp={1.4} duration={1.1}>
        <g transform={`rotate(${-deg}) translate(${-x} ${-y})`}>{children}</g>
      </Hop>
    </g>
  );
}

/**
 * The puffin's big striped beak, seen from the front: a sunshine ridge at the base, a sun band and
 * a coral tip. The lower beak drops open to talk (chattering) and in a cheer.
 */
function Beak({ talking, open }: { talking: boolean; open: boolean }) {
  return (
    <g data-part="beak">
      {/* The open mouth, hidden behind the lower beak until it drops. */}
      <path d="M92 134Q110 142 128 134L114 158H106Z" fill={paint('ink')} />
      <ellipse cx={110} cy={146} rx={8} ry={4} fill={paint('coral')} />
      <g transform={open ? 'translate(0 9)' : undefined}>
        <Loop token="bob" on={talking} duration={0.46}>
          <path
            d="M92 136Q110 144 128 136Q121 150 114 158Q110 162 106 158Q99 150 92 136Z"
            {...fillOf('coral', 2.5)}
          />
          <path
            d="M104 154Q110 158 116 154"
            fill="none"
            stroke={paint('sun')}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </Loop>
      </g>
      <path
        d="M84 103C98 94 122 94 136 103C144 109 141 122 130 136C120 146 100 146 90 136C79 122 76 109 84 103Z"
        {...fillOf('coral', 2.5)}
      />
      <path
        d="M84 109Q110 94 136 109"
        fill="none"
        stroke={paint('sunshine')}
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d="M88 120Q110 109 132 120"
        fill="none"
        stroke={paint('sun')}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <ellipse cx={97} cy={128} rx={5} ry={2.6} fill={paint('cloud')} opacity={0.55} />
    </g>
  );
}

/** A captain's cap: a white crown that flares over its band, a gold cord, a glossy visor and badge. */
function Cap() {
  return (
    <g data-part="cap" transform="rotate(-6 110 50)">
      <path d="M48 46C44 22 76 8 110 8C144 8 176 20 172 46L160 58H60Z" {...fillOf('cloud')} />
      <path
        d="M60 26Q80 14 106 14"
        fill="none"
        stroke={paint('pebble')}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <rect x={58} y={54} width={104} height={15} rx={4} {...fillOf('sea-deep')} />
      <path d="M64 61H156" stroke={paint('sunshine')} strokeWidth={3} strokeLinecap="round" />
      <circle cx={64} cy={61} r={3} {...fillOf('sunshine', 1.5)} />
      <circle cx={156} cy={61} r={3} {...fillOf('sunshine', 1.5)} />
      <path d="M56 68Q110 96 164 68Q110 80 56 68Z" {...fillOf('ink-soft', 2.5)} />
      <path
        d="M78 76Q96 82 112 82"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.35}
      />
      {/* Anchor badge. */}
      <circle cx={110} cy={34} r={12} {...fillOf('sunshine', 2.5)} />
      <g
        fill="none"
        stroke={paint('sea-dark')}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx={110} cy={27} r={2.6} />
        <path d="M110 29.5V42M105 33H115M103.5 37.5Q110 45.5 116.5 37.5" />
      </g>
    </g>
  );
}

function Scarf() {
  return (
    <g data-part="scarf">
      <path d="M150 170Q160 186 160 206L148 204Q148 188 142 176Z" {...fillOf('sea')} />
      <path d="M144 174Q146 194 138 210L128 204Q136 192 134 176Z" {...fillOf('sea')} />
      <path d="M58 158Q110 182 162 158L164 172Q110 198 56 172Z" {...fillOf('sea')} />
      <path
        d="M60 166Q110 189 160 166"
        fill="none"
        stroke={paint('shallows')}
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle cx={145} cy={174} r={8} {...fillOf('sea')} />
    </g>
  );
}

/** Talking: sound arcs beside Pip's head, pulsing gently, so the pose reads as speech at a glance. */
function Speech() {
  return (
    <g data-part="speech">
      {[
        { x: 22, r: 12, d: 0 },
        { x: 10, r: 21, d: -0.25 },
        { x: -2, r: 30, d: -0.5 },
      ].map((a) => (
        <Loop key={a.r} token="pulse-soft" delay={a.d}>
          <path
            d={`M${a.x + a.r * 0.5} ${118 - a.r}Q${a.x - a.r * 0.5} 118 ${a.x + a.r * 0.5} ${118 + a.r}`}
            fill="none"
            stroke={paint('sea-deep')}
            strokeWidth={4.5}
            strokeLinecap="round"
          />
        </Loop>
      ))}
    </g>
  );
}

/** Thought bubbles rising from Pip's head, with a pebble in the big one. */
function Thought() {
  return (
    <g data-part="thought">
      {[
        { x: 176, y: 88, r: 4.5, d: 0 },
        { x: 190, y: 70, r: 7, d: -0.3 },
        { x: 200, y: 40, r: 15, d: -0.6 },
      ].map((b) => (
        <Loop key={b.r} token="pulse-soft" delay={b.d}>
          <circle
            cx={b.x}
            cy={b.y}
            r={b.r}
            fill={paint('cloud')}
            stroke={paint('ink-soft')}
            strokeWidth={2.5}
          />
        </Loop>
      ))}
      <circle
        cx={200}
        cy={40}
        r={6.5}
        fill={paint('sea-deep')}
        stroke={paint('sea-dark')}
        strokeWidth={1.8}
      />
      <circle cx={198} cy={38} r={2} fill={paint('cloud')} opacity={0.8} />
    </g>
  );
}

/**
 * Pip. Idle: a gentle bob, a sway and a blink. Talk: the beak chatters and a wing gestures. Point: a
 * wing reaches out to `direction` and nudges that way, eyes following. Cheer: wings up and a hop.
 * Think: a wing to the chin, a head tilt and thought bubbles.
 */
export function Pip({
  pose = 'idle',
  direction = 'right',
  size = 280,
  title,
  lighting,
  ...rest
}: PipProps) {
  const cheer = pose === 'cheer';
  const point = pose === 'point';
  const think = pose === 'think';
  const toward = direction === 'right' ? 1 : -1;
  const faceShift = point ? toward * 5 : think ? 3 : 0;
  const wing = (side: 'l' | 'r') => {
    const pointing = point && (side === 'r') === (direction === 'right');
    if (cheer)
      return {
        angle: 150,
        loop: { token: 'wave-claw' as const, duration: 0.8, delay: side === 'l' ? -0.4 : 0 },
      };
    if (pointing) return { angle: 92 };
    if (pose === 'talk' && side === 'r')
      return { angle: 46, loop: { token: 'wave-claw' as const, duration: 1.8 } };
    if (think && side === 'r') return { angle: -78 };
    return { angle: 10 };
  };
  const L = wing('l');
  const R = wing('r');
  const wingL = (
    <Pivot x={42} y={146} angle={L.angle} loop={L.loop} reach={90}>
      <Wing />
    </Pivot>
  );
  const wingR = (
    <Pivot x={178} y={146} angle={R.angle} loop={R.loop} mirror reach={90}>
      <Wing />
    </Pivot>
  );
  const pointWing = point ? (direction === 'right' ? 'r' : 'l') : null;
  const nudged = (side: 'l' | 'r', w: ReactNode) =>
    pointWing === side ? (
      <Nudge deg={toward * 90} x={side === 'l' ? 42 : 178} y={146}>
        {w}
      </Nudge>
    ) : (
      w
    );
  return (
    <ArtSvg
      width={PIP_W}
      height={PIP_H}
      originX={PIP_X}
      originY={PIP_Y}
      size={size}
      title={title}
      lighting={lighting}
      rootProps={{
        'data-character': 'pip',
        'data-pose': pose,
        'data-direction': point ? direction : undefined,
      }}
      {...rest}
    >
      <ContactShadow cx={110} cy={254} rx={66} ry={9} />
      <Hop on={cheer} duration={0.8}>
        <Pivot x={110} y={244} reach={280} loop={cheer ? undefined : { token: 'sway' }}>
          <g transform={`translate(-110 -244)${think ? ' rotate(-4 110 200)' : ''}`}>
            <Loop token="bob" on={!cheer} duration={4}>
              {think || point ? null : wingL}
              {think || point ? null : wingR}
              {point ? (pointWing === 'l' ? wingR : wingL) : null}
              {think ? wingL : null}
              {/* Body: ink back, white face and belly. */}
              <path
                d="M110 40C162 40 188 86 188 146C188 208 158 246 110 246C62 246 32 208 32 146C32 86 58 40 110 40Z"
                {...fillOf('ink')}
              />
              <Shine x={110} y={140} rx={78} ry={100} opacity={0.18} />
              <ellipse cx={110} cy={206} rx={52} ry={38} {...fillOf('cloud', 2.5)} />
              <g transform={`translate(${faceShift} 0)`}>
                <path
                  d="M110 66C148 66 168 90 166 118C164 146 142 160 110 160C78 160 56 146 54 118C52 90 72 66 110 66Z"
                  {...fillOf('cloud', 2.5)}
                />
                {/* The puffin's eye streak, sweeping back from each eye. */}
                <path
                  d="M74 100Q66 102 61 108M146 100Q154 102 159 108"
                  fill="none"
                  stroke={paint('pebble-deep')}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <g
                  transform={
                    think ? 'translate(2 -3)' : point ? `translate(${toward * 2} 0)` : undefined
                  }
                >
                  <Eyes left={[86, 96]} right={[134, 96]} r={10.5} sclera={false} />
                </g>
                <Cheeks left={[70, 120]} right={[150, 120]} color="coral" rx={9} />
              </g>
              <Scarf />
              {/* Thinking: the flipper tip tucks under the beak, like a hand on a chin. */}
              {think ? (
                <Pivot x={178} y={146} angle={R.angle} mirror reach={90}>
                  <g transform="scale(0.84)">
                    <Wing />
                  </g>
                </Pivot>
              ) : null}
              <g transform={`translate(${faceShift} 0)`}>
                <Beak talking={pose === 'talk'} open={cheer || pose === 'talk'} />
              </g>
              <Cap />
              {point ? nudged(pointWing ?? 'r', pointWing === 'l' ? wingL : wingR) : null}
            </Loop>
          </g>
        </Pivot>
        {/* Big orange puffin feet, planted in front while the body sways above them. */}
        <path
          d="M60 252Q62 236 84 234Q106 236 108 252Q96 258 84 252Q72 258 60 252Z"
          {...fillOf('sun', 2.5)}
        />
        <path
          d="M112 252Q114 236 136 234Q158 236 160 252Q148 258 136 252Q124 258 112 252Z"
          {...fillOf('sun', 2.5)}
        />
      </Hop>
      {think ? <Thought /> : null}
      {pose === 'talk' ? <Speech /> : null}
    </ArtSvg>
  );
}
