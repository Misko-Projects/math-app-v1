/// <reference types="node" />
import { compileContent } from '@number-island/content';
import { readContentFiles } from '@number-island/content/node';
import { generateItem, initContent } from '@number-island/engine';
import type { GeneratedItem, ItemFormat } from '@number-island/shared';

/**
 * Test helper: every shipped template of a format (null: every template), compiled from the live content sources (the
 * compiler `pnpm content:build` runs) and generated at `seeds` seeds each, at the reference
 * difficulty and at both ends of the scale. A content walk over these covers any template a
 * content issue adds, with no list to keep.
 */
export function shippedItems(format: ItemFormat | null, seeds = 60): GeneratedItem[] {
  const result = compileContent(readContentFiles());
  const content = result.content;
  if (!content) {
    throw new Error(
      `content does not compile:\n${result.diagnostics.map((d) => d.message).join('\n')}`,
    );
  }
  initContent(content);
  const items: GeneratedItem[] = [];
  for (const t of content.templates) {
    if (format !== null && t.format !== format) continue;
    for (let seed = 1; seed <= seeds; seed += 1) {
      items.push(generateItem(t, seed));
      for (const difficulty of [-2, 2]) items.push(generateItem(t, seed, { difficulty }));
    }
  }
  return items;
}
