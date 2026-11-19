import { paint } from '../core/paint';
import { ContactShadow } from '../core/Shading';
import {
  Cheeks,
  Eyes,
  fillOf,
  frameSize,
  Hop,
  Loop,
  PebbleFrame,
  Pivot,
  Shine,
  Smile,
} from './parts';
import { PALETTE_FILLS, type PebblingPalette, type PebblingPose } from './pebbling';

/** The Hundred Whale's design box (05 §5). */
export const WHALE_W = 420;
export const WHALE_H = 330;

/** Ten ten-frames, two across and five down: a 10 × 10 grid with every 5 and every 10 visible. */
const FRAME_SCALE = 0.74;
const GAP = 6;
const GRID_CX = 196;
const GRID_CY = 180;

export function hundredFramePositions() {
  const { w, h } = frameSize(FRAME_SCALE);
  const gridW = 2 * w + GAP;
  const gridH = 5 * h + 4 * GAP;
  return Array.from({ length: 10 }, (_, f) => ({
    x: GRID_CX - gridW / 2 + w / 2 + (f % 2) * (w + GAP),
    y: GRID_CY - gridH / 2 + h / 2 + Math.floor(f / 2) * (h + GAP),
  }));
}

/**
 * The Hundred Whale: a big, round, gentle whale whose back holds ten ten-frames, filled frame by
 * frame (each frame top row first). `frames` is the lit count of each frame (hundredFrames()).
 */
export function HundredWhaleBody({
  palette,
  pose,
  frames,
}: {
  palette: PebblingPalette;
  pose: PebblingPose;
  frames: number[];
}) {
  const c = PALETTE_FILLS[palette];
  const cheer = pose === 'cheer';
  const flipper =
    pose === 'idle'
      ? { angle: 0 }
      : { angle: -70, loop: { token: 'wave-claw' as const, duration: cheer ? 0.9 : 1.2 } };
  const pos = hundredFramePositions();
  return (
    <g data-critter="whale" data-role="hundred">
      <ContactShadow cx={214} cy={322} rx={184} ry={10} />
      <Hop on={cheer} duration={0.9}>
        <Loop token="bob-slow" on={!cheer}>
          {cheer ? (
            <Loop token="pulse-soft" duration={0.9}>
              <path
                d="M236 34C230 10 212 0 196 2M236 34C238 14 238 2 238 -8M236 34C244 12 262 2 278 4"
                fill="none"
                stroke={paint('sea-deep')}
                strokeWidth={10}
                strokeLinecap="round"
              />
              <path
                d="M236 34C230 10 212 0 196 2M236 34C238 14 238 2 238 -8M236 34C244 12 262 2 278 4"
                fill="none"
                stroke={paint('shallows')}
                strokeWidth={5}
                strokeLinecap="round"
              />
            </Loop>
          ) : null}
          {/* Tail and flukes, behind the body. */}
          <Loop token="sway" duration={3.2}>
            <path
              d="M58 262C30 236 20 180 32 136L4 112C20 98 40 104 46 120C50 100 66 90 84 94L58 134C50 178 62 224 84 246Z"
              {...fillOf(c.body)}
            />
          </Loop>
          <path
            d="M24 300C14 160 80 30 210 30C340 30 404 150 404 260C404 300 380 320 340 320H70C40 320 26 312 24 300Z"
            {...fillOf(c.body)}
          />
          <path
            d="M120 320C200 300 330 290 402 246C404 300 380 320 340 320Z"
            {...fillOf(c.belly, 2.5)}
          />
          <path
            d="M220 314C270 306 330 296 380 276M270 318C310 312 350 302 392 286"
            fill="none"
            stroke={paint(c.deep)}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.45}
          />
          <Shine x={200} y={170} rx={176} ry={136} />
          <g data-part="hundred-grid">
            {pos.map((p, f) => (
              <PebbleFrame
                // biome-ignore lint/suspicious/noArrayIndexKey: frames are positional
                key={f}
                x={p.x}
                y={p.y}
                lit={frames[f] ?? 0}
                bed={c.belly}
                edge={c.deep}
                scale={FRAME_SCALE}
              />
            ))}
          </g>
          <Eyes left={[336, 196]} right={[370, 190]} r={14} edge={c.deep} look={[0.3, 0.15]} />
          <Cheeks left={[322, 226]} right={[390, 216]} color={c.cheek} rx={9} />
          <Smile x={360} y={232} w={24} open={cheer} />
          <Pivot x={270} y={300} angle={flipper.angle} loop={flipper.loop} reach={70}>
            <g transform="rotate(30)">
              <path d="M-14 0C-20 26 -10 48 0 48C12 48 18 26 12 0Z" {...fillOf(c.body)} />
            </g>
          </Pivot>
        </Loop>
      </Hop>
    </g>
  );
}
