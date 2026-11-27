import type { ReactNode } from 'react';
import {
  Bead,
  BeadEye,
  ClosedEye,
  circle,
  ellipse,
  FELT,
  Piece,
  roundRect,
  SewButton,
  Shadowed,
  Stitch,
  Thread,
} from './felt';
import type { GuideMood } from './types';

/*
 * The bunny guide whose name is 22 (05 §1): a plush bunny in denim dungarees with a mended,
 * patched ear, drawn from the Felt & Stitch mockup bunny. Nothing on the bunny is a numeral: the
 * name lives on the name tag beside it (GuideNameTag). Every mood lives in this one file, so a
 * redraw (for example from a photo of the toy) is one file.
 */

const F = FELT.fur;
const EAR = '#EDB79E';

/** The bunny's design box (art units): every mood, ears and thought beads included. */
export const BUNNY_BOX = { x: -82, y: -168, w: 164, h: 252 } as const;

function Ear({ x, y, rot, patch = false }: { x: number; y: number; rot: number; patch?: boolean }) {
  const t = `translate(${x},${y}) rotate(${rot})`;
  return (
    <>
      <Piece d={ellipse(0, 0, 13, 37)} fill={F} lift="fs" puff transform={t} />
      <Piece d={ellipse(0, 2, 6.5, 26)} fill={EAR} lift="a" transform={t} />
      {patch && (
        <g transform={t}>
          <Piece d={roundRect(-8, -30, 15, 14, 3)} fill={FELT.must} lift="a" />
          <Thread
            d="M-5,-27l3,3M4,-27l-3,3M-5,-20l3,-3M4,-20l-3,-3"
            color={FELT.mustD}
            width={1.2}
          />
        </g>
      )}
    </>
  );
}

function Ears({ mood }: { mood: GuideMood }) {
  if (mood === 'think') {
    return (
      <>
        <Ear x={-17} y={-116} rot={-8} patch />
        <Ear x={36} y={-92} rot={62} />
      </>
    );
  }
  if (mood === 'cheer') {
    return (
      <>
        <Ear x={-15} y={-122} rot={-3} patch />
        <Ear x={15} y={-122} rot={3} />
      </>
    );
  }
  return (
    <>
      <Ear x={-19} y={-116} rot={-12} patch />
      <Ear x={19} y={-116} rot={12} />
    </>
  );
}

const arm = (tx: number, ty: number, rot: number, ry = 24) => (
  <Piece
    d={ellipse(0, 0, 10.5, ry)}
    fill={F}
    lift="fs"
    puff
    transform={`translate(${tx},${ty}) rotate(${rot})`}
  />
);

function Arms({ mood }: { mood: GuideMood }) {
  switch (mood) {
    case 'cheer':
      return (
        <>
          {arm(-40, -12, -150, 25)}
          {arm(40, -12, 150, 25)}
        </>
      );
    case 'think':
      return (
        <>
          {arm(-36, 16, 16)}
          {arm(26, -6, -152, 22)}
        </>
      );
    case 'point':
      return (
        <>
          {arm(-37, 14, 22)}
          {arm(46, -4, -122, 25)}
        </>
      );
    case 'talk':
      return (
        <>
          {arm(-37, 14, 22)}
          {arm(44, 0, -140, 24)}
        </>
      );
    default:
      return (
        <>
          {arm(-37, 14, 22)}
          {arm(37, 14, -22)}
        </>
      );
  }
}

function Face({ mood }: { mood: GuideMood }) {
  if (mood === 'cheer') {
    const rays = [-150, -120, -60, -30]
      .map((a) => {
        const c = Math.cos((a * Math.PI) / 180);
        const s = Math.sin((a * Math.PI) / 180);
        return `M${(62 * c).toFixed(1)},${(-60 + 62 * s).toFixed(1)}L${(74 * c).toFixed(1)},${(-60 + 74 * s).toFixed(1)}`;
      })
      .join('');
    return (
      <>
        <ClosedEye cx={-15} cy={-57} r={6} />
        <ClosedEye cx={15} cy={-57} r={6} />
        <Shadowed>
          <path d="M-8,-36Q0,-33 8,-36Q7,-25 0,-25Q-7,-25 -8,-36z" fill={FELT.mouth} />
        </Shadowed>
        <ellipse cx={0} cy={-28} rx={3.6} ry={2} fill={FELT.blush} />
        <Thread d={rays} color={FELT.must} width={3} />
      </>
    );
  }
  if (mood === 'think') {
    return (
      <>
        <BeadEye cx={-15} cy={-58} r={6.6} look={[-1.6, -1.8]} big />
        <BeadEye cx={15} cy={-58} r={6.6} look={[-1.6, -1.8]} big />
        <Thread d="M-23,-70l12,-2M9,-74q7,-4 13,1" color="#8E7450" width={2.2} />
        <Thread d="M-1,-34q5,2.5 8,-1" width={2} />
        <Bead cx={-34} cy={-108} r={3} fill={FELT.cream} />
        <Bead cx={-44} cy={-122} r={4.2} fill={FELT.cream} />
        <Bead cx={-54} cy={-140} r={5.6} fill={FELT.cream} />
      </>
    );
  }
  const talking = mood === 'talk' || mood === 'point';
  return (
    <>
      <BeadEye cx={-15} cy={-58} r={6.6} look={[0.6, 0.5]} big />
      <BeadEye cx={15} cy={-58} r={6.6} look={[0.6, 0.5]} big />
      {talking ? (
        <Shadowed>
          <path d="M-6,-36Q0,-34 6,-36Q5,-28 0,-28Q-5,-28 -6,-36z" fill={FELT.mouth} />
        </Shadowed>
      ) : (
        <Thread d="M-7,-36Q-3.5,-31 0,-36Q3.5,-31 7,-36" width={2} />
      )}
    </>
  );
}

/** The bunny in one mood, in art units (draw it inside <FeltDefs>). */
export function Bunny22Figure({ mood }: { mood: GuideMood }): ReactNode {
  return (
    <g data-mood={mood}>
      <Ears mood={mood} />
      {/* feet with cream pads */}
      <Piece d={ellipse(-17, 62, 17, 10.5)} fill={F} lift="fs" />
      <Piece d={ellipse(17, 62, 17, 10.5)} fill={F} lift="fs" />
      <Piece d={ellipse(-17, 63, 9, 5)} fill={FELT.cream} lift="a" />
      <Piece d={ellipse(17, 63, 9, 5)} fill={FELT.cream} lift="a" />
      {/* body and dungarees with straps and buttons */}
      <Piece d={ellipse(0, 22, 34, 40)} fill={F} lift="fs" puff />
      <Piece d="M-24,12Q0,6 24,12L27,44Q0,62 -27,44z" fill={FELT.denim} lift="a" k={2} />
      <Stitch
        d="M-20,15Q0,10 20,15L22,42Q0,56 -22,42z"
        color="#B9CBE0"
        width={1.6}
        dash="4.2 3.8"
        halo={false}
      />
      <Thread d="M-17,10L-13,-8M17,10L13,-8" color={FELT.denim} width={6} />
      <SewButton cx={-15} cy={16} r={4.2} thread={FELT.denimD} />
      <SewButton cx={15} cy={16} r={4.2} thread={FELT.denimD} />
      <Arms mood={mood} />
      {/* head with its seam, muzzle, cheeks and nose */}
      <Piece d={circle(0, -52, 41)} fill={F} puff />
      <Stitch d="M0,-90V-70" color="#B89C74" width={1.8} dash="4 3.6" halo={false} />
      <Piece d={ellipse(0, -39, 17, 12.5)} fill={FELT.cream} lift="a" />
      <Piece d={circle(-27, -43, 6.4)} fill={FELT.blush} lift="a" />
      <Piece d={circle(27, -43, 6.4)} fill={FELT.blush} lift="a" />
      <Shadowed>
        <path
          d="M-4.6,-47.5h9.2l-4.6,5.4z"
          fill={FELT.terra}
          stroke={FELT.terra}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      </Shadowed>
      <Face mood={mood} />
    </g>
  );
}
