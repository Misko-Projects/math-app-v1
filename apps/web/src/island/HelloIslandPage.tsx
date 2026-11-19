import { useNavigate } from 'react-router';
import { HoldToOpen } from '@/parent/HoldToOpen';
import type { GateHeldState } from '@/parent/ParentGateScreen';
import { IslandScene } from './IslandScene';

/**
 * Scaffold home ("hello island"), the child home until the Profile Picker and the island hub
 * replace it. The only child-facing copy is the title. Child screens show no network status
 * (06 §8); the small parent-gate entry sits in the corner (06 §2).
 */
export function HelloIslandPage() {
  const navigate = useNavigate();
  return (
    <div className="relative h-dvh min-h-[600px] w-full">
      <main className="absolute inset-0">
        <IslandScene
          className="absolute inset-0 size-full"
          title="A sunny little island with palm trees, a workshop hut and friendly shore critters."
        />
        <div className="relative flex justify-center px-6 pt-[clamp(1.5rem,7vh,4.5rem)]">
          <h1 className="motion-entrance animate-rise text-center font-display text-[clamp(3.5rem,8.2vw,7.5rem)] font-extrabold leading-[0.95] tracking-tight text-ink [text-shadow:0_3px_0_#fff,0_7px_0_rgb(38_70_83/0.16)]">
            Number Island
          </h1>
        </div>
      </main>
      <footer className="absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))]">
        <HoldToOpen
          onOpen={() =>
            navigate('/parent', { state: { gateHeldAt: Date.now() } satisfies GateHeldState })
          }
        />
      </footer>
    </div>
  );
}
