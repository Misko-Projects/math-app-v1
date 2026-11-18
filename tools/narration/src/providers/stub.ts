// The `stub` provider (07 §3): deterministic blip-then-silence WAVs for tests and CI. Free, offline.
import { stubWav } from '../audio';
import { estimateSeconds } from '../cost';
import type { Renderer } from './types';

export function stubRenderer(): Renderer {
  return {
    provider: 'stub',
    model: 'stub-1',
    async render(requests, ctx) {
      for (const r of requests) {
        // Half the estimated speaking time keeps test output small but proportional to the text.
        const ms = Math.round(estimateSeconds(r.text) * 500);
        await ctx.onResult({ id: r.id, ok: true, wav: stubWav(ms) });
      }
    },
  };
}
