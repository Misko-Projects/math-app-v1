// 03 §9.4 property test over every fixture template (the five reference generators and the 11
// fixture formats). Seeds: CONTENT_PROPERTY_N (PR CI 100, nightly 500), else 50 for local runs.

import { describe, expect, it } from 'vitest';
import { propertyN, runTemplateProperties } from '../src/testing/properties';
import { loadFixture } from './fixture';

const fixture = loadFixture();
const n = propertyN(50);

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
    });
  }
});
