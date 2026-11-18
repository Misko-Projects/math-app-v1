import { ApiStatusChip } from '@/app/ApiStatusChip';
import { IslandScene } from './IslandScene';

/**
 * Scaffold home ("hello island"). The only child-facing copy is the title; later issues replace
 * this page with the island hub and move child strings into narration YAML.
 */
export function HelloIslandPage() {
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
        <ApiStatusChip />
      </footer>
    </div>
  );
}
