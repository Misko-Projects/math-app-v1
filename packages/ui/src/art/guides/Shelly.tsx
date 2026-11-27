import type { ReactNode } from 'react';
import {
  Bead,
  BeadEye,
  ClosedEye,
  circle,
  ellipse,
  FELT,
  hexagon,
  Piece,
  roundRect,
  SewButton,
  Shadowed,
  Stitch,
  scallopEllipse,
  Thread,
} from './felt';
import type { GuideMood } from './types';

/*
 * Shelly the turtle (a guide, 05 §1): a plush sea turtle in a sailor cap and a mustard
 * neckerchief, drawn from the Felt & Stitch mockup turtle. Every mood lives in this one file, so a
 * redraw (for example from a photo of the toy) is one file.
 */

const B = '#9DB58B'; // limbs and body
const HL = '#B8CCA3'; // head
const SCUTE = '#86A681';

/** Shelly's design box (art units): every mood, cap and raised arms included. */
export const SHELLY_BOX = { x: -112, y: -188, w: 248, h: 324 } as const;

const arm = (tx: number, ty: number, rot: number, ry = 27) => (
  <Piece
    d={ellipse(0, 0, 13.5, ry)}
    fill={B}
    lift="fs"
    puff
    transform={`translate(${tx},${ty}) rotate(${rot})`}
  />
);

/** The near arm (viewer's right) in each mood. */
function NearArm({ mood }: { mood: GuideMood }) {
  switch (mood) {
    case 'point':
      return arm(80, -28, 48, 36);
    case 'talk':
      return arm(74, -40, 28, 35);
    case 'cheer':
      return arm(72, -42, 34, 34);
    case 'think':
      return arm(36, -16, -24, 30);
    default:
      return arm(52, 34, -26, 30);
  }
}

/** The far arm (viewer's left): a hand on the hip, or up in a cheer. */
function FarArm({ mood }: { mood: GuideMood }) {
  return mood === 'cheer' ? arm(-72, -30, -44, 32) : arm(-40, 30, -38);
}

function Face({ mood }: { mood: GuideMood }) {
  const cheeks = (
    <>
      <Piece d={circle(-30, -64, 9.5)} fill={FELT.blush} lift="a" />
      <Piece d={circle(46, -64, 9.5)} fill={FELT.blush} lift="a" />
    </>
  );
  const nose = (
    <>
      <circle cx={4} cy={-73} r={1.4} fill={FELT.sageD} />
      <circle cx={12} cy={-73} r={1.4} fill={FELT.sageD} />
    </>
  );
  const openMouth = (
    <>
      <Shadowed>
        <path d="M-7,-66Q8,-60 23,-66Q21,-47 8,-47Q-5,-47 -7,-66z" fill={FELT.mouth} />
      </Shadowed>
      <ellipse cx={8} cy={-52} rx={6.5} ry={3.6} fill={FELT.blush} />
      <Thread d="M-10,-68l3.4,2.4M26,-68l-3.4,2.4" width={2.2} />
    </>
  );
  if (mood === 'cheer') {
    return (
      <>
        {cheeks}
        <ClosedEye cx={-15} cy={-84} r={9} />
        <ClosedEye cx={31} cy={-84} r={9} />
        {nose}
        <Shadowed>
          <path d="M-9,-66Q8,-58 25,-66Q23,-44 8,-44Q-7,-44 -9,-66z" fill={FELT.mouth} />
        </Shadowed>
        <ellipse cx={8} cy={-50} rx={7} ry={4} fill={FELT.blush} />
      </>
    );
  }
  const look: [number, number] = mood === 'think' ? [-2.4, -3.2] : [2.6, 0.4];
  return (
    <>
      {cheeks}
      <BeadEye cx={-15} cy={-86} r={12} look={look} big />
      <BeadEye cx={31} cy={-86} r={12} look={look} big />
      <Thread
        d={
          mood === 'think'
            ? 'M-28,-108q8,-9 18,-6M22,-113q9,-3 18,3'
            : 'M-27,-106q8,-7 17,-3M22,-111q9,-6 18,0'
        }
        color={FELT.sageD}
        width={2.8}
      />
      {nose}
      {mood === 'talk' || mood === 'point' ? (
        openMouth
      ) : mood === 'think' ? (
        <Thread d="M2,-58q6,-4 12,0" width={2.4} />
      ) : (
        <Thread d="M-6,-64q14,11 28,0" width={2.6} />
      )}
    </>
  );
}

function Cap() {
  return (
    <g transform="translate(4,-138) rotate(-13)">
      <Piece d="M-24,2L-40,16L-30,20z" fill={FELT.denimD} lift="a" k={1.5} />
      <Piece d="M-29,0C-36,-34 36,-38 31,-2z" fill={FELT.cream} lift="fs" k={3} puff />
      <Piece d={roundRect(-33, -5, 68, 14, 7)} fill={FELT.denim} lift="a" />
      <Stitch d="M-26,2h54" color="#B9CBE0" width={1.7} dash="4.4 4" halo={false} />
      <SewButton cx={2} cy={-26} r={5.5} thread={FELT.denimD} />
    </g>
  );
}

/** Thinking: three cream beads rising from the head. */
function ThoughtBeads() {
  return (
    <>
      <Bead cx={78} cy={-128} r={4} fill={FELT.cream} />
      <Bead cx={90} cy={-146} r={5.6} fill={FELT.cream} />
      <Bead cx={104} cy={-168} r={7.4} fill={FELT.cream} />
    </>
  );
}

/** Cheering: little mustard rays of thread around the head. */
function CheerRays() {
  const rays = [-160, -130, -50, -20]
    .map((a) => {
      const c = Math.cos((a * Math.PI) / 180);
      const s = Math.sin((a * Math.PI) / 180);
      return `M${(8 + 88 * c).toFixed(1)},${(-92 + 88 * s).toFixed(1)}l${(14 * c).toFixed(1)},${(14 * s).toFixed(1)}`;
    })
    .join('');
  return <Thread d={rays} color={FELT.mustD} width={3.4} />;
}

/** Shelly in one mood, in art units (draw it inside <FeltDefs>). */
export function ShellyFigure({ mood }: { mood: GuideMood }): ReactNode {
  const scutes: [number, number, number][] = [
    [-70, -18, 11.5],
    [-80, 28, 12.5],
    [-67, 73, 11.5],
  ];
  return (
    <g data-mood={mood}>
      {/* tail */}
      <Piece d="M-66,90L-97,103L-68,110z" fill={B} lift="fs" k={4} />
      {/* shell with its scalloped rim, rim stitch and scutes */}
      <Piece d={scallopEllipse(-14, 22, 78, 84, 20)} fill={FELT.sageD} />
      <Stitch d={ellipse(-14, 22, 69.5, 75.5)} color="#C9DAB5" dash="5.5 5" />
      {scutes.map(([x, y, r]) => (
        <Piece key={`${x}${y}`} d={hexagon(x, y, r, 30)} fill={SCUTE} lift="a" k={2.5} />
      ))}
      {scutes.map(([x, y, r]) => (
        <Stitch
          key={`s${x}${y}`}
          d={hexagon(x, y, r - 4, 30)}
          color="#DCE8CB"
          width={1.5}
          dash="3.2 3"
          halo={false}
        />
      ))}
      {/* feet: one planted, one stepping out */}
      <Piece d={ellipse(-30, 104, 26, 15)} fill={B} lift="fs" puff />
      <Piece
        d={ellipse(0, 0, 27, 15)}
        fill={B}
        lift="fs"
        puff
        transform="translate(52,100) rotate(-24)"
      />
      <Thread d="M-41,109v6M-31,111v6M54,105l3,6M64,100l3,6" color={FELT.sageD} width={2} />
      {/* body and the cream plastron with its stitched panels */}
      <Piece d={ellipse(10, 28, 56, 62)} fill={B} lift="fs" puff />
      <Piece d={ellipse(14, 37, 40, 45)} fill={FELT.cream} lift="a" />
      <Stitch d={ellipse(14, 37, 34, 39)} color={FELT.kraftD} width={1.9} dash="4.6 4.2" />
      <Thread d="M14,4V72M-16,26Q14,36 44,26M-15,51Q14,61 43,51" color="#D5C29C" width={2} />
      <FarArm mood={mood} />
      {mood !== 'think' && <NearArm mood={mood} />}
      {/* neckerchief with flying tails */}
      <Piece d="M-30,-40L-64,-56L-56,-36z" fill={FELT.mustD} lift="fs" k={2} />
      <Piece d="M-30,-38L-68,-28L-52,-18z" fill={FELT.must} lift="fs" k={2} />
      <Piece d="M-34,-42Q10,-20 56,-42L18,6Q10,13 2,6z" fill={FELT.must} lift="fs" />
      <Stitch d="M-24,-33Q10,-14 46,-33L15,2Q10,6 5,2z" width={1.9} dash="4.6 4.2" />
      <Bead cx={-31} cy={-39} r={6.5} fill={FELT.mustD} />
      {/* head, tilted, with the cap */}
      <g transform="rotate(-6 8 -40)">
        <Piece d={circle(8, -84, 58)} fill={HL} puff />
        <Stitch d={circle(8, -84, 51)} color="#7C996F" width={2} dash="5 4.6" opacity={0.85} />
        <Face mood={mood} />
        <Cap />
      </g>
      {/* the thinking hand rests under the chin, over the neckerchief */}
      {mood === 'think' && <NearArm mood={mood} />}
      {mood === 'think' && <ThoughtBeads />}
      {mood === 'cheer' && <CheerRays />}
    </g>
  );
}
