// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fixtureContent } from '@/data/store.test-support';
import {
  FIT_EXCEPTIONS,
  FIT_SEED_EXCEPTIONS,
  FIT_VIEWPORTS,
  fitAllowance,
} from './pierFitAllowlist';
import { PIER_EXCLUDED } from './pierRequest';

const graph = fixtureContent().graph;

describe('the pier fit allowlist', () => {
  it('every entry is real content of that widget, listed once, with a reason', () => {
    const seen = new Set<string>();
    for (const [format, entries] of Object.entries(FIT_EXCEPTIONS)) {
      for (const entry of entries) {
        expect(entry.reason.length, format).toBeGreaterThan(20);
        expect(entry.at.length, format).toBeGreaterThan(0);
        for (const id of entry.templates) {
          expect(graph.templates[id]?.format, id).toBe(format);
          expect(seen.has(id), `${id} listed twice`).toBe(false);
          seen.add(id);
        }
      }
    }
  });

  it('every seed exception names real content, a later seed, and a viewport the template must fit at', () => {
    const seen = new Set<string>();
    for (const known of FIT_SEED_EXCEPTIONS) {
      const template = graph.templates[known.template];
      const key = `${known.template}:${known.seed}`;
      expect(template, key).toBeDefined();
      expect(known.seed, key).toBeGreaterThan(1);
      expect(known.reason.length, key).toBeGreaterThan(20);
      expect(seen.has(key), `${key} listed twice`).toBe(false);
      seen.add(key);
      // Where the whole template is let through, a seed needs no entry of its own.
      for (const viewport of known.at) {
        expect(template && fitAllowance(template, viewport), `${key} at ${viewport}`).toBeNull();
      }
    }
  });

  it('lets a template through only at the viewports its entry names', () => {
    const big = graph.templates['PV.09.t1'];
    const pad = Object.values(graph.templates).find((t) => t.format === 'number-pad');
    const balance = Object.values(graph.templates).find((t) => t.format === 'balance');
    if (!big || !pad || !balance) throw new Error('the content lacks the templates this test uses');
    expect(fitAllowance(big, '960x600')?.kind).toBe('misfit');
    expect(fitAllowance(big, '1280x800')).toBeNull();
    for (const viewport of FIT_VIEWPORTS) {
      expect(fitAllowance(pad, viewport)).toBeNull();
      expect(fitAllowance(balance, viewport)).toEqual({ kind: 'no-widget' });
    }
  });

  it('a template the pier leaves out at 1280 × 800 is on the list at that viewport', () => {
    for (const id of Object.keys(PIER_EXCLUDED)) {
      const template = graph.templates[id];
      expect(template && fitAllowance(template, '1280x800')?.kind, id).toBe('misfit');
    }
  });
});
