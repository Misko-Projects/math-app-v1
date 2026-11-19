import type { ArtProps } from '../core/ArtSvg';
import { ArtSvg } from '../core/ArtSvg';
import { paint } from '../core/paint';
import { fillOf, Loop, Pivot, Tube } from './parts';

/**
 * Glim (07 §7, 06 §6): the small lantern-robot who voices every AI-originated line. Clearly a
 * friendly machine, never a person: a lantern body with a warm glow, a handle and an antenna, a
 * screen for a face with light-bar eyes, bolts, and no nose, mouth or hair. It hovers on a glow.
 */
export type GlimState = 'idle' | 'talk' | 'appear' | 'think';
export const GLIM_STATES: readonly GlimState[] = ['idle', 'talk', 'appear', 'think'];

export interface GlimProps extends ArtProps {
  state?: GlimState;
}

export const GLIM_W = 180;
export const GLIM_H = 224;

const EYE = 'shallows';

function ScreenFace({ state }: { state: GlimState }) {
  if (state === 'appear') {
    // Happy chevron eyes: "hello!"
    return (
      <g
        fill="none"
        stroke={paint(EYE)}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        data-part="screen-eyes"
      >
        <path d="M70 110L78 101L86 110" />
        <path d="M94 110L102 101L110 110" />
      </g>
    );
  }
  const lookUp = state === 'think';
  return (
    <g data-part="screen-eyes">
      <Loop token="blink" delay={-1.3}>
        <rect
          x={lookUp ? 70 : 72}
          y={lookUp ? 94 : 98}
          width={12}
          height={lookUp ? 13 : 18}
          rx={6}
          fill={paint(EYE)}
        />
        <rect
          x={lookUp ? 94 : 96}
          y={lookUp ? 94 : 98}
          width={12}
          height={lookUp ? 13 : 18}
          rx={6}
          fill={paint(EYE)}
        />
      </Loop>
      {state === 'talk' ? (
        <g data-part="voice-bars">
          {[0, 1, 2, 3, 4].map((i) => (
            <Loop key={i} token="shimmer" duration={0.7} delay={-i * 0.17}>
              <rect
                x={74 + i * 7}
                y={[124, 121, 119, 121, 124][i]}
                width={4}
                height={[6, 12, 16, 12, 6][i]}
                rx={2}
                fill={paint(EYE)}
              />
            </Loop>
          ))}
        </g>
      ) : null}
      {state === 'think' ? (
        <g data-part="thinking-dots">
          {[0, 1, 2].map((i) => (
            <Loop key={i} token="shimmer" duration={1.2} delay={-i * 0.4}>
              <circle cx={78 + i * 12} cy={124} r={3.6} fill={paint(EYE)} />
            </Loop>
          ))}
        </g>
      ) : null}
    </g>
  );
}

function Sparkle({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g
        className="motion-loop art-loop art-glint"
        style={{ animationDelay: `${delay}s`, animationDuration: '2.4s' }}
      >
        <path
          d="M0 -10L3 -3L10 0L3 3L0 10L-3 3L-10 0L-3 -3Z"
          fill={paint('sunshine')}
          stroke={paint('ink')}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * Glim. Idle: hovers with a soft glow pulse and blinking light-bar eyes. Talk: voice bars light up
 * and an arm gestures. Appear: pops in with sparkles, happy eyes and a wave (its first hello).
 * Think: eyes look up and three dots pulse.
 */
export function Glim({ state = 'idle', size = 150, title, lighting, ...rest }: GlimProps) {
  const arm =
    state === 'appear'
      ? { angle: 100, loop: { token: 'wave-claw' as const, duration: 0.9 } }
      : state === 'talk'
        ? { angle: 70, loop: { token: 'wave-claw' as const, duration: 1.6 } }
        : { angle: 0 };
  const robot = (
    <Loop token="bob" duration={3.2}>
      {/* Warm lantern glow behind the body. */}
      <Loop token="pulse-soft" duration={2.2}>
        <circle cx={90} cy={112} r={80} fill={paint('sunshine-light')} opacity={0.3} />
        <circle cx={90} cy={112} r={64} fill={paint('sunshine-light')} opacity={0.45} />
        <g stroke={paint('sunshine')} strokeWidth={4} strokeLinecap="round" opacity={0.8}>
          <path d="M14 112H24M156 112H166M28 64L36 70M152 64L144 70M28 160L36 154M152 160L144 154" />
        </g>
      </Loop>
      {/* Handle and antenna. */}
      <Tube d="M78 42C76 22 104 22 102 42" w={5} fill="sea-deep" />
      <Tube d="M116 50L130 24" w={4} fill="sea-deep" />
      <Loop token="pulse-soft" duration={1.2}>
        <circle cx={132} cy={19} r={8} {...fillOf('sunshine')} />
        <circle cx={129.5} cy={16.5} r={2.5} fill={paint('cloud')} opacity={0.8} />
      </Loop>
      {/* Arms. */}
      <Pivot x={40} y={118} angle={0} reach={40}>
        <Tube d="M0 0Q-14 6 -16 22" w={5} fill="sea-deep" />
        <circle cx={-16} cy={26} r={7} {...fillOf('sea')} />
      </Pivot>
      <Pivot x={140} y={118} angle={arm.angle} loop={arm.loop} reach={40} mirror>
        <Tube d="M0 0Q-14 6 -16 22" w={5} fill="sea-deep" />
        <circle cx={-16} cy={26} r={7} {...fillOf('sea')} />
      </Pivot>
      {/* Domed lantern roof. */}
      <path d="M50 70C52 52 70 40 90 40C110 40 128 52 130 70Z" {...fillOf('sea-deep')} />
      <path
        d="M62 58Q70 48 84 46"
        fill="none"
        stroke={paint('shallows')}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.6}
      />
      <rect x={40} y={66} width={100} height={12} rx={6} {...fillOf('sea-deep')} />
      <g fill={paint('shallows')}>
        <circle cx={50} cy={72} r={2.2} />
        <circle cx={130} cy={72} r={2.2} />
      </g>
      {/* Glass lantern body, lit from inside. */}
      <rect x={46} y={76} width={88} height={82} rx={14} {...fillOf('sunshine-light')} />
      <path
        d="M58 86V148"
        stroke={paint('cloud')}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={0.7}
      />
      <rect x={42} y={76} width={10} height={82} rx={5} {...fillOf('sea-deep')} />
      <rect x={128} y={76} width={10} height={82} rx={5} {...fillOf('sea-deep')} />
      {/* The screen face. */}
      <rect
        x={62}
        y={88}
        width={56}
        height={52}
        rx={13}
        fill={paint('ink')}
        stroke={paint('sea-dark')}
        strokeWidth={3}
      />
      <path
        d="M70 95Q74 91 82 91"
        fill="none"
        stroke={paint('cloud')}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.3}
      />
      <g fill={paint('coral')} opacity={0.85}>
        <rect x={66} y={118} width={7} height={4} rx={1} />
        <rect x={107} y={118} width={7} height={4} rx={1} />
      </g>
      <ScreenFace state={state} />
      {/* Base and the little light it hovers on. */}
      <path d="M50 158H130L120 172Q90 178 60 172Z" {...fillOf('sea-deep')} />
      <circle cx={90} cy={166} r={3} fill={paint('shallows')} />
      <Loop token="shimmer" duration={0.9}>
        <path d="M80 178Q90 196 100 178Z" {...fillOf('sunshine', 2.5)} />
      </Loop>
    </Loop>
  );
  return (
    <ArtSvg
      width={GLIM_W}
      height={GLIM_H}
      size={size}
      title={title}
      lighting={lighting}
      rootProps={{ 'data-character': 'glim', 'data-state': state }}
      {...rest}
    >
      <ellipse cx={90} cy={212} rx={40} ry={7} fill={paint('sunshine')} opacity={0.35} />
      {state === 'appear' ? (
        <g
          className="motion-entrance"
          style={{
            animation: 'var(--animate-pop-in)',
            transformBox: 'fill-box',
            transformOrigin: 'center',
          }}
        >
          {robot}
          <Sparkle x={24} y={52} s={1.1} />
          <Sparkle x={160} y={70} s={0.8} delay={-0.8} />
          <Sparkle x={22} y={168} s={0.7} delay={-1.6} />
        </g>
      ) : (
        robot
      )}
    </ArtSvg>
  );
}
