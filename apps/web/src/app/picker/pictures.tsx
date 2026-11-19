// The nine picture-password pictures (06 §2): original, simple flat-vector island things (05 §11:
// soft rounded shapes, outlines in a darker shade of the fill). Each has its own shape and colour,
// so none depends on colour alone, and a narration key that speaks its name.
// viewBox 96×96. `label` is the parent area's name for it (parent copy is inline, 02 §7).

import type { NarrationKey } from '@number-island/shared';
import type { ReactNode } from 'react';

export const PICTURE_IDS = [
  'shell',
  'fish',
  'boat',
  'sun',
  'tree',
  'crab',
  'flower',
  'kite',
  'turtle',
] as const;

export type PictureId = (typeof PICTURE_IDS)[number];

export const isPictureId = (v: string): v is PictureId =>
  (PICTURE_IDS as readonly string[]).includes(v);

const LINE = { strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

function Shell() {
  return (
    <>
      <path
        d="M48 80 21 58C13 46 15 30 28 21c12-9 28-9 40 0 13 9 15 25 7 37Z"
        fill="#f9c3b0"
        stroke="#b9503a"
        strokeWidth={4}
        {...LINE}
      />
      <path
        d="M48 76 26 38M48 76 36 23M48 76V18M48 76 60 23M48 76 70 38"
        fill="none"
        stroke="#d1735c"
        strokeWidth={3.5}
        {...LINE}
      />
      <path d="M37 76h22l-3 9H40Z" fill="#f7a98f" stroke="#b9503a" strokeWidth={4} {...LINE} />
      <path d="M30 28c4-4 9-6 13-6" fill="none" stroke="#fff" strokeWidth={4} {...LINE} />
    </>
  );
}

function Fish() {
  return (
    <>
      <path
        d="M64 48 84 31c-3 11-3 23 0 34Z"
        fill="#2f8fc4"
        stroke="#1b5f86"
        strokeWidth={4}
        {...LINE}
      />
      <path d="M38 32c3-9 14-11 20-3" fill="#2f8fc4" stroke="#1b5f86" strokeWidth={4} {...LINE} />
      <path
        d="M12 48c8-16 26-23 42-17 7 3 12 9 14 17-2 8-7 14-14 17-16 6-34-1-42-17Z"
        fill="#5cb8e6"
        stroke="#1b5f86"
        strokeWidth={4}
        {...LINE}
      />
      <path d="M48 34c4 9 4 19 0 28" fill="none" stroke="#1b5f86" strokeWidth={3.5} {...LINE} />
      <circle cx={28} cy={45} r={6} fill="#fff" stroke="#1b5f86" strokeWidth={2.5} />
      <circle cx={27} cy={45} r={3} fill="#264653" />
      <path d="M19 54c3 2 6 2 9 0" fill="none" stroke="#1b5f86" strokeWidth={3} {...LINE} />
    </>
  );
}

function Boat() {
  return (
    <>
      <path d="M48 16v46" stroke="#8f5a31" strokeWidth={4.5} {...LINE} />
      <path d="M48 12l13 5-13 5Z" fill="#e76f51" stroke="#b9503a" strokeWidth={3} {...LINE} />
      <path d="M53 22v35h25Z" fill="#fffaf0" stroke="#3d6170" strokeWidth={4} {...LINE} />
      <path d="M43 28v29H22Z" fill="#f6d58a" stroke="#c9a245" strokeWidth={4} {...LINE} />
      <path d="M12 62h72l-10 17H24Z" fill="#c98a55" stroke="#8f5a31" strokeWidth={4} {...LINE} />
      <path d="M18 68h60" stroke="#e7b07f" strokeWidth={3.5} {...LINE} />
      <path
        d="M8 87q6-5 12 0t12 0 12 0 12 0 12 0 12 0 12 0"
        fill="none"
        stroke="#2a9d8f"
        strokeWidth={4}
        {...LINE}
      />
    </>
  );
}

function Sun() {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const x1 = 48 + Math.cos(a) * 31;
    const y1 = 48 + Math.sin(a) * 31;
    const x2 = 48 + Math.cos(a) * 41;
    const y2 = 48 + Math.sin(a) * 41;
    return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }).join('');
  return (
    <>
      <path d={rays} stroke="#e08a2e" strokeWidth={6} {...LINE} />
      <circle cx={48} cy={48} r={23} fill="#f6c945" stroke="#c99a2e" strokeWidth={4} />
      <circle cx={40} cy={45} r={3} fill="#264653" />
      <circle cx={56} cy={45} r={3} fill="#264653" />
      <path d="M40 54c5 5 11 5 16 0" fill="none" stroke="#264653" strokeWidth={3.5} {...LINE} />
      <circle cx={35} cy={53} r={3.5} fill="#f4a261" opacity={0.8} />
      <circle cx={61} cy={53} r={3.5} fill="#f4a261" opacity={0.8} />
    </>
  );
}

function Tree() {
  return (
    <>
      <ellipse cx={50} cy={84} rx={28} ry={6} fill="#f4e3c3" stroke="#d9bb87" strokeWidth={3} />
      <path
        d="M44 84c0-18-3-34 1-50h9c-3 16 0 32 2 50Z"
        fill="#c98a55"
        stroke="#8f5a31"
        strokeWidth={4}
        {...LINE}
      />
      <path d="M46 70h9M46 56h8M46 44h8" stroke="#8f5a31" strokeWidth={3} {...LINE} />
      <g fill="#5c9e4f" stroke="#3f7537" strokeWidth={4} {...LINE}>
        <path d="M50 32C38 17 19 18 10 31c14-4 27-2 40 1Z" />
        <path d="M50 32c12-15 31-14 40-1-14-4-27-2-40 1Z" />
        <path d="M50 32c-14-1-26 9-30 23 10-9 19-16 30-23Z" />
        <path d="M50 32c14-1 26 9 30 23-10-9-19-16-30-23Z" />
        <path d="M50 32c-4-12 0-22 10-27-3 9-6 18-10 27Z" />
      </g>
      <circle cx={45} cy={36} r={4.5} fill="#8f5a31" />
      <circle cx={54} cy={37} r={4.5} fill="#8f5a31" />
    </>
  );
}

function Crab() {
  return (
    <>
      <g stroke="#b9503a" strokeWidth={4} {...LINE} fill="none">
        <path d="M26 64 14 72M28 70l-9 12M70 64l12 8M68 70l9 12" />
        <path d="M40 46 37 30M56 46l3-16" />
      </g>
      <path
        d="M27 52C15 51 8 41 12 30l9 6-1-11c9 0 14 11 11 22Z"
        fill="#e76f51"
        stroke="#b9503a"
        strokeWidth={4}
        {...LINE}
      />
      <path
        d="M69 52c12-1 19-11 15-22l-9 6 1-11c-9 0-14 11-11 22Z"
        fill="#e76f51"
        stroke="#b9503a"
        strokeWidth={4}
        {...LINE}
      />
      <ellipse cx={48} cy={60} rx={25} ry={17} fill="#ef8a6d" stroke="#b9503a" strokeWidth={4} />
      <circle cx={37} cy={28} r={6} fill="#fff" stroke="#b9503a" strokeWidth={2.5} />
      <circle cx={59} cy={28} r={6} fill="#fff" stroke="#b9503a" strokeWidth={2.5} />
      <circle cx={37} cy={28} r={2.8} fill="#264653" />
      <circle cx={59} cy={28} r={2.8} fill="#264653" />
      <path d="M41 63c4 4 10 4 14 0" fill="none" stroke="#264653" strokeWidth={3.5} {...LINE} />
    </>
  );
}

function Flower() {
  const petals = [0, 1, 2, 3, 4].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return { x: 48 + Math.cos(a) * 15, y: 36 + Math.sin(a) * 15 };
  });
  return (
    <>
      <path d="M48 48v38" stroke="#3f7537" strokeWidth={5} {...LINE} />
      <path
        d="M48 74c-3-10-12-14-21-12 3 9 11 14 21 12Z"
        fill="#7dbb6a"
        stroke="#3f7537"
        strokeWidth={3.5}
        {...LINE}
      />
      <path
        d="M48 66c3-10 12-14 21-12-3 9-11 14-21 12Z"
        fill="#7dbb6a"
        stroke="#3f7537"
        strokeWidth={3.5}
        {...LINE}
      />
      {petals.map((p) => (
        <circle
          key={`${p.x.toFixed(1)}-${p.y.toFixed(1)}`}
          cx={p.x}
          cy={p.y}
          r={11}
          fill="#c7a0ea"
          stroke="#7a52a6"
          strokeWidth={4}
        />
      ))}
      <circle cx={48} cy={36} r={9} fill="#f6c945" stroke="#c99a2e" strokeWidth={3.5} />
    </>
  );
}

function Kite() {
  return (
    <>
      <path
        d="M48 70c-2 8 8 8 6 15s-8 6-5 10"
        fill="none"
        stroke="#3d6170"
        strokeWidth={3}
        {...LINE}
      />
      <path
        d="M50 80l-8-4 1 8ZM53 80l8-4-1 8Z"
        fill="#e76f51"
        stroke="#b9503a"
        strokeWidth={2.5}
        {...LINE}
      />
      <path d="M48 8 20 38h28Z" fill="#e76f51" />
      <path d="M48 8l28 30H48Z" fill="#f6c945" />
      <path d="M20 38l28 32V38Z" fill="#2a9d8f" />
      <path d="M76 38 48 70V38Z" fill="#8fd3c7" />
      <path d="M48 8 76 38 48 70 20 38Z" fill="none" stroke="#264653" strokeWidth={4} {...LINE} />
      <path d="M48 10v58M22 38h52" stroke="#264653" strokeWidth={2.5} {...LINE} />
    </>
  );
}

function Turtle() {
  return (
    <>
      <g fill="#a8d08d" stroke="#3f7537" strokeWidth={3.5} {...LINE}>
        <ellipse cx={26} cy={66} rx={8} ry={6} />
        <ellipse cx={64} cy={66} rx={8} ry={6} />
        <path d="M14 58 6 62l9 3Z" />
        <circle cx={79} cy={50} r={10} />
      </g>
      <circle cx={82} cy={47} r={2.6} fill="#264653" />
      <path d="M78 55c2 1 5 1 7-1" fill="none" stroke="#3f7537" strokeWidth={2.5} {...LINE} />
      <path
        d="M14 60c0-20 14-32 31-32s30 12 30 32Z"
        fill="#5c9e4f"
        stroke="#2f5a29"
        strokeWidth={4}
        {...LINE}
      />
      <path
        d="M37 38h16l6 10-6 10H37l-6-10Z"
        fill="#7dbb6a"
        stroke="#2f5a29"
        strokeWidth={3}
        {...LINE}
      />
      <path
        d="M37 38 29 32M53 38l7-6M59 48h14M31 48H16M37 58l-5 2M53 58l5 2"
        stroke="#2f5a29"
        strokeWidth={3}
        {...LINE}
      />
      <rect
        x={10}
        y={58}
        width={70}
        height={7}
        rx={3.5}
        fill="#cfe5b8"
        stroke="#2f5a29"
        strokeWidth={3}
      />
    </>
  );
}

const ART: Record<PictureId, () => ReactNode> = {
  shell: Shell,
  fish: Fish,
  boat: Boat,
  sun: Sun,
  tree: Tree,
  crab: Crab,
  flower: Flower,
  kite: Kite,
  turtle: Turtle,
};

export const PICTURES: Record<PictureId, { key: NarrationKey; label: string }> = {
  shell: { key: 'ui.picture.shell', label: 'Shell' },
  fish: { key: 'ui.picture.fish', label: 'Fish' },
  boat: { key: 'ui.picture.boat', label: 'Boat' },
  sun: { key: 'ui.picture.sun', label: 'Sun' },
  tree: { key: 'ui.picture.tree', label: 'Palm tree' },
  crab: { key: 'ui.picture.crab', label: 'Crab' },
  flower: { key: 'ui.picture.flower', label: 'Flower' },
  kite: { key: 'ui.picture.kite', label: 'Kite' },
  turtle: { key: 'ui.picture.turtle', label: 'Turtle' },
};

/** A picture, decorative (the button around it carries the name). */
export function PictureArt({ id, className }: { id: PictureId; className?: string }) {
  const Art = ART[id];
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      aria-hidden="true"
      focusable="false"
      data-picture={id}
    >
      <Art />
    </svg>
  );
}
