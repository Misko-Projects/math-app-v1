// 03 §9.4 property test over every fixture template (the five reference generators and the 11
// fixture formats). Seeds: CONTENT_PROPERTY_N (PR CI 100, nightly 500), else 50 for local runs.

import { describe, expect, it } from 'vitest';
import { propertyN, runTemplateProperties } from '../src/testing/properties';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const n = propertyN(50);
/**
 * Per-case timeout. A case draws n seeds through the generator and checker, and the heaviest
 * (PUZ.04.t2's cage grids at CI's 100 seeds) passed 5000 ms on a busy runner (PR #138). The work
 * and its checks are unchanged; only the wall-clock limit is generous.
 */
const CASE_TIMEOUT_MS = 60_000;

describe(`03 §9.4 property test (${n} seeds per template)`, () => {
  it('covers the 53 fixture templates', () => {
    expect(fixture.templates.length).toBeGreaterThanOrEqual(53);
  });

  for (const t of fixture.templates) {
    it(`${t.id} (${t.generator} → ${t.format})`, () => {
      loadFixture();
      const report = runTemplateProperties(t, { n });
      expect(report.failures).toEqual([]);
      expect(report.targeting.rate).toBeGreaterThanOrEqual(0.9);
    }, CASE_TIMEOUT_MS);
  }
});
