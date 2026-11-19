// Generated items that widget issues build against before their format has a widget (02 §5.9 K1:
// #14 renders shape-compose place-relative at the pictorial tier). Each fixture file is the item a
// live template generates from fixed params, with its worked solution and a correct response, so
// it stays what the engine emits. Re-record with `UPDATE_WIDGET_FIXTURES=1`.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ParamValues } from '@number-island/shared';
import { describe, expect, it } from 'vitest';
import { checkResponse } from '../src/items/check';
import { generateItemFromParams } from '../src/items/generate';
import { itemExampleCorrect, itemSolution } from '../src/items/solution';
import { fixtureTemplate, loadFixture } from './fixture';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const FIXTURES: readonly { file: string; templateId: string; params: ParamValues }[] = [
  {
    file: 'geo05-t3-pictorial.json',
    templateId: 'GEO.05.t3',
    params: { relation: 'above', anchor: 'crate', item: 'crab', scene: 'two' },
  },
];

describe('widget fixtures', () => {
  loadFixture();
  for (const f of FIXTURES) {
    it(`${f.file}: ${f.templateId} still generates it`, () => {
      const t = fixtureTemplate(f.templateId);
      const item = generateItemFromParams(t, f.params);
      const correct = itemExampleCorrect(item, t);
      expect(checkResponse(item, correct).correct).toBe(true);
      const fixture = {
        templateId: f.templateId,
        tier: t.tier,
        params: f.params,
        widget: item.widget,
        answer: item.answer,
        solution: itemSolution(item, t),
        exampleCorrect: correct,
      };
      const path = join(DIR, f.file);
      if (process.env.UPDATE_WIDGET_FIXTURES === '1') {
        writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);
      }
      expect(fixture).toEqual(JSON.parse(readFileSync(path, 'utf8')));
    });
  }
});
