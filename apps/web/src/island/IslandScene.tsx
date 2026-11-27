// Hello-island scene: original cozy flat-vector art (05 §11). Soft rounded shapes, 2–3 px outlines in
// a darker shade of the fill, one soft highlight, contact shadows, gentle sky and sea washes only.
// Idle loops (waves, smoke, flag, blinking) carry `motion-loop` so reduced motion turns them off.
//
// Art components move to packages/ui/art with the art-kit issue; this is the scaffold's page.
// viewBox is 1600×1000 (1.6:1, the tablet 1280×800 and desktop 1440×900 aspect).

import type { ReactNode } from 'react';

const OUTLINE = { strokeWidth: 4, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

function Cloud({ x, y, scale, delay }: { x: number; y: number; scale: number; delay: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="motion-loop animate-cloud" style={{ animationDelay: delay }}>
        <path
          d="M-6 44 C-50 44 -48 2 -10 2 C-6 -30 44 -42 64 -12 C80 -34 128 -24 124 8 C156 8 160 44 128 44 Z"
          className="fill-cloud stroke-[#cfe4ea]"
          {...OUTLINE}
        />
        <path
          d="M4 36 C40 40 96 40 126 36"
          className="fill-none stroke-[#e2eff3]"
          strokeWidth={6}
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

function Bird({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 0 q11 -11 22 0 q11 -11 22 0"
      className="fill-none stroke-ink-soft"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function Wave({ x, y, w = 1, delay = '0s' }: { x: number; y: number; w?: number; delay?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${w} 1)`}>
      <path
        className="motion-loop animate-bob fill-none stroke-foam"
        style={{ animationDelay: delay }}
        d="M0 0 q16 -12 32 0 t32 0 t32 0"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </g>
  );
}

function Frond({
  rotate,
  mirror = false,
  len = 1,
}: {
  rotate: number;
  mirror?: boolean;
  len?: number;
}) {
  return (
    <g transform={`${mirror ? 'scale(-1 1) ' : ''}rotate(${rotate}) scale(${len})`}>
      <path
        d="M0 0 C34 -40 98 -40 140 10 C120 2 108 0 96 4 C80 -8 60 -10 44 -4 C30 -10 14 -8 0 0 Z"
        className="fill-leaf stroke-leaf-deep"
        {...OUTLINE}
        strokeWidth={3.5}
      />
      <path
        d="M6 -2 C46 -26 96 -22 128 4"
        className="fill-none stroke-leaf-deep"
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.6}
      />
    </g>
  );
}

function Palm({
  trunk,
  crown,
  scale = 1,
  delay = '0s',
}: {
  trunk: string;
  crown: { x: number; y: number };
  scale?: number;
  delay?: string;
}) {
  return (
    <g>
      <path
        d={trunk}
        className="fill-none stroke-wood-deep"
        strokeWidth={30}
        strokeLinecap="round"
      />
      <path d={trunk} className="fill-none stroke-wood" strokeWidth={22} strokeLinecap="round" />
      <path
        d={trunk}
        className="fill-none stroke-wood-deep"
        strokeWidth={22}
        strokeDasharray="3 24"
        opacity={0.55}
      />
      <g transform={`translate(${crown.x} ${crown.y}) scale(${scale})`}>
        <g className="motion-loop animate-sway scene-part-base" style={{ animationDelay: delay }}>
          <Frond rotate={-78} len={0.8} />
          <Frond rotate={-78} len={0.8} mirror />
          <Frond rotate={-30} />
          <Frond rotate={-30} mirror />
          <Frond rotate={8} len={0.95} />
          <Frond rotate={8} len={0.95} mirror />
          <Frond rotate={40} len={0.8} />
          <Frond rotate={40} len={0.8} mirror />
          <circle
            cx={-10}
            cy={10}
            r={11}
            className="fill-wood-deep stroke-[#6e4424]"
            strokeWidth={3}
          />
          <circle
            cx={10}
            cy={12}
            r={11}
            className="fill-wood-deep stroke-[#6e4424]"
            strokeWidth={3}
          />
          <circle
            cx={0}
            cy={24}
            r={10}
            className="fill-wood-deep stroke-[#6e4424]"
            strokeWidth={3}
          />
        </g>
      </g>
    </g>
  );
}

function Eye({ cx, cy, r = 3.4 }: { cx: number; cy: number; r?: number }) {
  return (
    <g className="motion-loop animate-blink scene-part">
      <circle cx={cx} cy={cy} r={r} className="fill-ink" />
      <circle cx={cx + r * 0.35} cy={cy - r * 0.4} r={r * 0.35} className="fill-cloud" />
    </g>
  );
}

/** Pebbles in a 2 × 5 frame (05 §5): the first `lit` glow, the rest are plain stones. */
function PebbleFrame({
  lit,
  x,
  y,
  gap = 15,
  r = 5.5,
}: {
  lit: number;
  x: number;
  y: number;
  gap?: number;
  r?: number;
}) {
  const pebbles: ReactNode[] = [];
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;
    const on = i < lit;
    pebbles.push(
      <circle
        key={i}
        cx={x + col * gap}
        cy={y + row * gap}
        r={r}
        className={on ? 'fill-sunshine stroke-sunshine-deep' : 'fill-pebble stroke-pebble-deep'}
        strokeWidth={2}
      />,
    );
  }
  return <g>{pebbles}</g>;
}

/** A shell-backed shore critter whose shell carries a ten-frame of pebbles. */
function ShellCritter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={4} cy={4} rx={70} ry={10} className="fill-sand-deep" opacity={0.45} />
      {/* feet */}
      <ellipse
        cx={-36}
        cy={0}
        rx={12}
        ry={8}
        className="fill-[#9ad1b4] stroke-[#5f9e80]"
        {...OUTLINE}
        strokeWidth={3}
      />
      <ellipse
        cx={34}
        cy={0}
        rx={12}
        ry={8}
        className="fill-[#9ad1b4] stroke-[#5f9e80]"
        {...OUTLINE}
        strokeWidth={3}
      />
      {/* head */}
      <g transform="translate(70 -22)">
        <circle r={20} className="fill-[#9ad1b4] stroke-[#5f9e80]" {...OUTLINE} strokeWidth={3} />
        <Eye cx={5} cy={-5} />
        <circle cx={10} cy={6} r={4.5} className="fill-coral" opacity={0.4} />
        <path
          d="M-2 7 q5 5 10 1"
          className="fill-none stroke-ink"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </g>
      {/* shell */}
      <path
        d="M-62 -4 C-62 -66 62 -66 62 -4 Q62 4 54 4 L-54 4 Q-62 4 -62 -4 Z"
        className="fill-wood stroke-wood-deep"
        {...OUTLINE}
      />
      <path
        d="M-46 -30 C-38 -48 -14 -54 4 -54"
        className="fill-none stroke-[#e0ac7c]"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <rect
        x={-44}
        y={-40}
        width={88}
        height={36}
        rx={12}
        className="fill-[#a8703f] stroke-wood-deep"
        strokeWidth={2.5}
      />
      <PebbleFrame lit={7} x={-30} y={-30} />
    </g>
  );
}

/** A small round crab-like critter with a row of pebbles on its back, waving hello. */
function CrabCritter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={0} cy={8} rx={52} ry={9} className="fill-sand-deep" opacity={0.45} />
      {[-30, -20, 20, 30].map((lx) => (
        <path
          key={lx}
          d={`M${lx} 0 q${lx > 0 ? 10 : -10} 2 ${lx > 0 ? 12 : -12} 8`}
          className="fill-none stroke-coral-deep"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      {/* waving claws */}
      <g transform="translate(-40 -26)">
        <g className="motion-loop animate-wave-claw scene-part-base">
          <path
            d="M8 22 L0 4"
            className="stroke-coral-deep"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <path
            d="M-10 -2 C-14 -18 6 -22 10 -8 L2 -6 Z"
            className="fill-coral stroke-coral-deep"
            {...OUTLINE}
            strokeWidth={3}
          />
        </g>
      </g>
      <g transform="translate(40 -26)">
        <path d="M-8 22 L0 4" className="stroke-coral-deep" strokeWidth={4} strokeLinecap="round" />
        <path
          d="M10 -2 C14 -18 -6 -22 -10 -8 L-2 -6 Z"
          className="fill-coral stroke-coral-deep"
          {...OUTLINE}
          strokeWidth={3}
        />
      </g>
      {/* eye stalks */}
      <path
        d="M-10 -22 v-14 M10 -22 v-14"
        className="stroke-coral-deep"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle cx={-10} cy={-38} r={7} className="fill-cloud stroke-coral-deep" strokeWidth={2.5} />
      <circle cx={10} cy={-38} r={7} className="fill-cloud stroke-coral-deep" strokeWidth={2.5} />
      <Eye cx={-9} cy={-38} r={3} />
      <Eye cx={11} cy={-38} r={3} />
      {/* body */}
      <path
        d="M-38 0 C-40 -26 40 -26 38 0 Q36 6 28 6 L-28 6 Q-36 6 -38 0 Z"
        className="fill-coral stroke-coral-deep"
        {...OUTLINE}
      />
      <path
        d="M-26 -10 C-20 -17 -8 -19 2 -19"
        className="fill-none stroke-[#f29a82]"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          cx={-22 + i * 11}
          cy={-6}
          r={4.2}
          className={
            i < 3 ? 'fill-sunshine stroke-sunshine-deep' : 'fill-pebble stroke-pebble-deep'
          }
          strokeWidth={1.8}
        />
      ))}
      <path
        d="M-5 0 q5 4 10 0"
        className="fill-none stroke-ink"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  );
}

/** A snail-ish shore critter with a swirl shell. */
function SnailCritter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx={4} cy={6} rx={46} ry={8} className="fill-sand-deep" opacity={0.45} />
      <path
        d="M-40 4 C-40 -6 -20 -8 10 -8 C30 -8 36 -30 44 -30 C54 -30 54 -14 50 -4 C46 4 40 6 30 6 L-36 6 Q-40 6 -40 4 Z"
        className="fill-[#a9d4e2] stroke-[#5d9db1]"
        {...OUTLINE}
        strokeWidth={3}
      />
      <path
        d="M40 -28 l-4 -16 M48 -28 l4 -15"
        className="stroke-[#5d9db1]"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={36} cy={-46} r={4} className="fill-ink" />
      <circle cx={52} cy={-45} r={4} className="fill-ink" />
      <circle cx={49} cy={-18} r={3.6} className="fill-coral" opacity={0.45} />
      <circle cx={-8} cy={-26} r={26} className="fill-sun stroke-sun-deep" {...OUTLINE} />
      <path
        d="M-8 -26 m0 -4 a4 4 0 1 1 -4 6 a9 9 0 1 1 13 9 a15 15 0 1 1 -21 -14"
        className="fill-none stroke-sun-deep"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <path
        d="M-26 -38 C-22 -46 -14 -50 -6 -50"
        className="fill-none stroke-[#f8c294]"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </g>
  );
}

function Workshop() {
  return (
    <g>
      {/* chimney (behind the roof) */}
      <rect
        x={902}
        y={458}
        width={30}
        height={60}
        rx={5}
        className="fill-pebble stroke-pebble-deep"
        {...OUTLINE}
      />
      <rect
        x={897}
        y={452}
        width={40}
        height={14}
        rx={5}
        className="fill-pebble stroke-pebble-deep"
        {...OUTLINE}
        strokeWidth={3.5}
      />
      {/* smoke */}
      {['0s', '1.5s', '3s'].map((d) => (
        <g key={d} transform="translate(917 440)">
          <circle
            r={13}
            className="motion-loop animate-smoke scene-part fill-cloud"
            style={{ animationDelay: d }}
            opacity={0}
          />
        </g>
      ))}
      {/* contact shadow + walls */}
      <ellipse cx={855} cy={652} rx={112} ry={11} className="fill-leaf-deep" opacity={0.45} />
      <rect
        x={770}
        y={528}
        width={170}
        height={122}
        rx={14}
        className="fill-wood stroke-wood-deep"
        {...OUTLINE}
      />
      {[560, 590, 620].map((py) => (
        <path
          key={py}
          d={`M778 ${py} H932`}
          className="stroke-wood-deep"
          strokeWidth={2.5}
          opacity={0.3}
        />
      ))}
      {/* roof */}
      <path
        d="M746 536 L852 450 Q855 447 858 450 L964 536 Q970 548 956 549 L754 549 Q740 548 746 536 Z"
        className="fill-coral stroke-coral-deep"
        {...OUTLINE}
      />
      <path
        d="M772 532 L852 467"
        className="stroke-[#f2967f]"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path d="M758 548 H952" className="stroke-coral-deep" strokeWidth={4} strokeLinecap="round" />
      {/* flag */}
      <path d="M855 449 V404" className="stroke-wood-deep" strokeWidth={4} strokeLinecap="round" />
      <g transform="translate(855 404)">
        <path
          className="motion-loop animate-flutter scene-part-left fill-sunshine stroke-sunshine-deep"
          d="M0 0 L42 11 L0 24 Z"
          {...OUTLINE}
          strokeWidth={3}
        />
      </g>
      {/* sign: a plus and three pebbles (a workshop where numbers are made) */}
      <rect
        x={823}
        y={556}
        width={64}
        height={28}
        rx={9}
        className="fill-sand stroke-wood-deep"
        strokeWidth={3}
      />
      <path
        d="M842 563 v14 M835 570 h14"
        className="stroke-coral-deep"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {[860, 870, 880].map((cx) => (
        <circle
          key={cx}
          cx={cx - 2}
          cy={570}
          r={3.6}
          className="fill-sunshine stroke-sunshine-deep"
          strokeWidth={1.6}
        />
      ))}
      {/* door */}
      <path
        d="M831 649 V612 A24 24 0 0 1 879 612 V649 Z"
        className="fill-wood-deep stroke-[#6e4424]"
        {...OUTLINE}
        strokeWidth={3.5}
      />
      <circle cx={869} cy={626} r={3.6} className="fill-sunshine" />
      {/* windows, warmly lit */}
      {[798, 912].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={606} r={17} className="fill-sunshine stroke-wood-deep" {...OUTLINE} />
          <path
            d={`M${cx - 15} 606 H${cx + 15} M${cx} 591 V621`}
            className="stroke-wood-deep"
            strokeWidth={3}
          />
          <circle
            cx={cx}
            cy={606}
            r={13}
            className="motion-loop animate-shimmer fill-cloud"
            opacity={0.25}
          />
        </g>
      ))}
    </g>
  );
}

function Ferry() {
  return (
    <g transform="translate(1330 584)">
      <g className="motion-loop animate-bob-slow">
        <path d="M24 -26 V-56" className="stroke-ink-soft" strokeWidth={3} strokeLinecap="round" />
        <path d="M24 -56 L46 -50 L24 -44 Z" className="fill-coral" />
        <rect
          x={-10}
          y={-30}
          width={46}
          height={22}
          rx={6}
          className="fill-cloud stroke-[#b8cfd6]"
          strokeWidth={3}
        />
        <circle cx={4} cy={-19} r={4} className="fill-sky stroke-[#8fb6c2]" strokeWidth={2} />
        <circle cx={20} cy={-19} r={4} className="fill-sky stroke-[#8fb6c2]" strokeWidth={2} />
        <path
          d="M-40 -8 H70 Q62 12 40 14 H-20 Q-36 12 -40 -8 Z"
          className="fill-coral stroke-coral-deep"
          {...OUTLINE}
          strokeWidth={3}
        />
        <path
          d="M-32 0 H62"
          className="stroke-cloud"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.8}
        />
      </g>
    </g>
  );
}

function Pier() {
  return (
    <g>
      {[1222, 1296, 1370, 1440].map((px) => (
        <g key={px}>
          <rect
            x={px - 7}
            y={738}
            width={14}
            height={58}
            rx={5}
            className="fill-wood-deep stroke-[#6e4424]"
            strokeWidth={3}
          />
          <ellipse
            cx={px}
            cy={796}
            rx={20}
            ry={5}
            className="motion-loop animate-shimmer fill-none stroke-foam"
            strokeWidth={3}
          />
        </g>
      ))}
      <rect
        x={1186}
        y={724}
        width={274}
        height={18}
        rx={6}
        className="fill-wood stroke-wood-deep"
        {...OUTLINE}
      />
      {[1226, 1266, 1306, 1346, 1386, 1426].map((lx) => (
        <path
          key={lx}
          d={`M${lx} 727 V739`}
          className="stroke-wood-deep"
          strokeWidth={2.5}
          opacity={0.5}
        />
      ))}
      {/* little rowboat tied at the end */}
      <path
        d="M1440 744 C1456 770 1470 782 1480 792"
        className="fill-none stroke-wood-deep"
        strokeWidth={2.5}
        strokeDasharray="5 4"
      />
      <g transform="translate(1520 808)">
        <g className="motion-loop animate-bob" style={{ animationDelay: '-2s' }}>
          <path
            d="M-62 -10 H62 Q54 16 28 20 H-28 Q-54 16 -62 -10 Z"
            className="fill-sunshine stroke-sunshine-deep"
            {...OUTLINE}
          />
          <path
            d="M-54 -2 H54"
            className="stroke-cloud"
            strokeWidth={4}
            strokeLinecap="round"
            opacity={0.85}
          />
          <path
            d="M-40 -12 L-16 -30"
            className="stroke-wood-deep"
            strokeWidth={5}
            strokeLinecap="round"
          />
        </g>
      </g>
    </g>
  );
}

export function IslandScene({ className, title }: { className?: string; title: string }) {
  return (
    <svg
      // `ni-art` pins the legacy art palette (theme.css) until the island is redrawn in felt.
      className={className ? `ni-art ${className}` : 'ni-art'}
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMidYMax slice"
      role="img"
      aria-labelledby="island-scene-title"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title id="island-scene-title">{title}</title>
      <defs>
        <linearGradient id="sky-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-sky)" />
          <stop offset="0.62" stopColor="var(--color-sky-light)" />
          <stop offset="1" stopColor="var(--color-horizon)" />
        </linearGradient>
        <linearGradient id="sea-wash" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#63bdb1" />
          <stop offset="0.45" stopColor="var(--color-sea)" />
          <stop offset="1" stopColor="var(--color-sea-deep)" />
        </linearGradient>
      </defs>

      {/* sky */}
      <rect width="1600" height="580" fill="url(#sky-wash)" />
      <g transform="translate(1390 168)">
        <circle r={112} className="motion-loop animate-shimmer fill-horizon" />
        <circle r={66} className="fill-sunshine stroke-sunshine-deep" strokeWidth={4} />
        <path
          d="M-30 -30 A42 42 0 0 1 10 -50"
          className="fill-none stroke-[#f3d98f]"
          strokeWidth={8}
          strokeLinecap="round"
        />
      </g>
      <Cloud x={150} y={150} scale={1.25} delay="0s" />
      <Cloud x={1400} y={336} scale={0.7} delay="-6s" />
      <Cloud x={760} y={318} scale={0.62} delay="-11s" />
      <Cloud x={1130} y={372} scale={0.5} delay="-3s" />
      <Bird x={300} y={292} />
      <Bird x={350} y={268} s={0.8} />
      <Bird x={1240} y={240} s={0.7} />

      {/* sea */}
      <rect y="560" width="1600" height="440" fill="url(#sea-wash)" />
      <path d="M0 560 H1600" className="stroke-[#8fd0c6]" strokeWidth={3} />
      {/* a far-off island */}
      <path
        d="M70 563 C120 528 230 516 330 563 Z"
        className="fill-[#82b9a4] stroke-[#6aa08b]"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d="M200 536 C204 520 210 510 216 502"
        className="fill-none stroke-[#6aa08b]"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d="M216 502 c-14 -4 -24 2 -28 8 M216 502 c12 -6 24 -2 28 4 M216 502 c-2 -10 4 -16 10 -18"
        className="fill-none stroke-[#6aa08b]"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Ferry />
      <Wave x={110} y={630} delay="-1s" />
      <Wave x={1450} y={628} w={0.8} delay="-2.5s" />
      <Wave x={240} y={700} w={1.1} delay="-3s" />
      <Wave x={1240} y={668} w={0.7} delay="-0.5s" />

      {/* island: shallows, foam ring, wet sand, dry sand */}
      <ellipse cx={800} cy={752} rx={590} ry={118} className="fill-shallows" opacity={0.7} />
      <ellipse
        cx={800}
        cy={760}
        rx={540}
        ry={78}
        className="motion-loop animate-shimmer fill-none stroke-foam"
        strokeWidth={6}
        strokeDasharray="44 28"
        strokeLinecap="round"
      />
      <path
        d="M330 752 C330 702 450 652 600 637 C700 624 760 602 860 604 C1000 607 1090 637 1180 667 C1250 692 1290 732 1260 764 C1225 802 1060 817 820 817 C580 817 400 807 350 787 C330 777 330 764 330 752 Z"
        className="fill-sand-shadow stroke-sand-deep"
        {...OUTLINE}
      />
      <path
        d="M330 740 C330 690 450 640 600 625 C700 612 760 590 860 592 C1000 595 1090 625 1180 655 C1250 680 1290 720 1260 752 C1225 790 1060 802 820 802 C580 802 400 794 350 775 C330 765 330 752 330 740 Z"
        className="fill-sand stroke-sand-deep"
        {...OUTLINE}
      />
      <ellipse cx={520} cy={690} rx={120} ry={22} className="fill-[#fbf1dc]" opacity={0.8} />

      {/* grassy rise */}
      <path
        d="M470 652 C500 602 600 577 700 572 C800 562 900 557 990 582 C1050 599 1072 632 1040 652 C960 670 560 674 470 652 Z"
        className="fill-leaf stroke-leaf-deep"
        {...OUTLINE}
      />
      <path
        d="M540 616 C590 594 660 584 720 582"
        className="fill-none stroke-leaf-light"
        strokeWidth={10}
        strokeLinecap="round"
      />
      {[
        [520, 640],
        [640, 600],
        [980, 610],
        [1010, 636],
      ].map(([gx, gy]) => (
        <path
          key={`${gx}-${gy}`}
          d={`M${gx} ${gy} l-4 -12 M${gx} ${gy} l4 -14 M${gx} ${gy} l10 -9`}
          className="stroke-leaf-deep"
          strokeWidth={3}
          strokeLinecap="round"
        />
      ))}

      <Palm trunk="M592 648 C588 566 566 478 540 414" crown={{ x: 540, y: 408 }} />
      <Workshop />
      <Palm
        trunk="M1112 690 C1120 626 1140 566 1166 512"
        crown={{ x: 1166, y: 506 }}
        scale={0.82}
        delay="-2s"
      />

      {/* stepping-stone path from the door to the shore */}
      {[
        [858, 670, 15],
        [846, 694, 16],
        [840, 720, 17],
        [846, 748, 18],
        [862, 776, 19],
      ].map(([sx, sy, rx]) => (
        <ellipse
          key={sy}
          cx={sx}
          cy={sy}
          rx={rx}
          ry={(rx ?? 16) * 0.42}
          className="fill-pebble stroke-pebble-deep"
          strokeWidth={3}
        />
      ))}

      {/* beach details */}
      <g transform="translate(572 770) rotate(-12)">
        <path
          d="M0 -18 L5 -6 L18 -6 L8 2 L12 15 L0 7 L-12 15 L-8 2 L-18 -6 L-5 -6 Z"
          className="fill-sun stroke-sun-deep"
          {...OUTLINE}
          strokeWidth={3}
        />
      </g>
      <g transform="translate(958 780)">
        <path
          d="M-12 4 C-12 -12 12 -12 12 4 Z"
          className="fill-[#f6c9b8] stroke-coral-deep"
          {...OUTLINE}
          strokeWidth={2.5}
        />
        <path
          d="M-5 3 L-3 -6 M0 3 V-8 M5 3 L3 -6"
          className="stroke-coral-deep"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>

      {/* residents */}
      <ShellCritter x={694} y={748} />
      <SnailCritter x={1036} y={736} />
      <CrabCritter x={452} y={760} />

      <Pier />

      {/* foreground waves */}
      <Wave x={120} y={880} w={1.2} delay="-1.5s" />
      <Wave x={430} y={930} delay="-4s" />
      <Wave x={760} y={895} w={1.3} delay="-2s" />
      <Wave x={1060} y={940} delay="-0.8s" />
      <Wave x={1330} y={890} w={1.1} delay="-3.2s" />
      <Wave x={30} y={975} w={0.9} delay="-2.6s" />
      <Wave x={1480} y={968} w={0.9} delay="-1.2s" />
    </svg>
  );
}
