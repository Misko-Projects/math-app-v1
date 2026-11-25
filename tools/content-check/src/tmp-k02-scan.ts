// Temporary scan (not committed): which templates put hundreds on a base-ten mat, and the largest
// piece counts per template.
import { generateItem, initContent } from '@number-island/engine';
import { readCompiled } from './dist';

const c = readCompiled();
initContent({ templates: c.templates, narration: c.narration, misconceptions: c.misconceptions });
const rows: string[] = [];
for (const t of c.templates) {
  if (t.format !== 'base-ten-trade' && t.format !== 'base-ten-build') continue;
  let inPlay = 0;
  const max = { hundreds: 0, tens: 0, ones: 0 };
  let other = '';
  for (let seed = 1; seed <= 300; seed += 1) {
    const w = generateItem(t, seed).widget as unknown as Record<string, any>;
    let h = false;
    const see = (x?: { hundreds?: number; tens?: number; ones?: number }) => {
      if (!x) return;
      max.hundreds = Math.max(max.hundreds, x.hundreds ?? 0);
      max.tens = Math.max(max.tens, x.tens ?? 0);
      max.ones = Math.max(max.ones, x.ones ?? 0);
      if ((x.hundreds ?? 0) > 0) h = true;
    };
    if (t.format === 'base-ten-trade') {
      see(w.start);
      see(w.regroupTarget);
      see(w.operation?.operand);
      const total =
        w.start.hundreds * 100 +
        w.start.tens * 10 +
        w.start.ones +
        (w.operation?.op === '+'
          ? w.operation.operand.hundreds * 100 + w.operation.operand.tens * 10 + w.operation.operand.ones
          : 0);
      if (total >= 100) h = true;
      other = `${w.goal}${w.operation ? w.operation.op : ''}`;
    } else {
      see(w.prebuilt);
      see(w.exact);
      if (w.pieces.hundreds || w.target >= 100) h = true;
      max.hundreds = Math.max(max.hundreds, Math.floor(w.target / 100));
      other = `${w.mode} pieces.h=${w.pieces.hundreds} limits=${JSON.stringify(w.limits ?? null)} wholeIs=${w.wholeIs}`;
    }
    if (h) inPlay += 1;
  }
  rows.push(`${t.id} ${t.format} ${t.tier}/${t.representation ?? ''} inPlay=${inPlay}/300 max=${max.hundreds}h ${max.tens}t ${max.ones}o ${other}`);
}
console.log(rows.join('\n'));
