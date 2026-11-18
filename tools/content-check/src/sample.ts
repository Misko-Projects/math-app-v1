// `pnpm content:sample [--strand <STRAND>] [--seed <n>]` (03 §10.1): prints 3 rendered items per
// strand: prompt text, widget summary, answer, hint ladder and difficulty breakdown.

import {
  featureWeight,
  generateItem,
  initContent,
  itemFeatures,
  registry,
  render,
} from '@number-island/engine';
import type { GeneratedItem, ItemTemplate, WidgetConfig } from '@number-island/shared';
import { readCompiled } from './dist';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** A one-line summary of a widget config (the fields that matter, not the layout noise). */
export function widgetSummary(w: WidgetConfig): string {
  const { format, ...rest } = w as WidgetConfig & Record<string, unknown>;
  const fields = Object.entries(rest)
    .filter(([k]) => k !== 'theme')
    .map(([k, v]) => {
      if (v !== null && typeof v === 'object' && 'layoutSeed' in (v as object)) {
        const { layoutSeed: _seed, ...set } = v as Record<string, unknown>;
        return `${k}=${JSON.stringify(set)}`;
      }
      return `${k}=${JSON.stringify(v)}`;
    });
  const line = `${format} ${fields.join(' ')}`;
  return line.length > 240 ? `${line.slice(0, 237)}…` : line;
}

function answerSummary(item: GeneratedItem): string {
  const a = item.answer;
  switch (a.kind) {
    case 'number':
      return `number ${a.value}${a.tolerance ? ` ± ${a.tolerance}` : ''}`;
    case 'numbers':
      return `numbers ${JSON.stringify(a.values)}${a.ordered ? ' (ordered)' : ''}`;
    case 'choice':
      return `choice ${a.id}`;
    case 'placement':
      return `placement ${a.value} ± ${a.tolerance}`;
    case 'state':
      return `state ${a.checker} ${JSON.stringify(a.target)}`;
  }
}

export function describeItem(t: ItemTemplate, item: GeneratedItem): string[] {
  const g = registry.get(t.generator);
  const features = itemFeatures(item, t);
  const terms = Object.entries(features)
    .filter(([, x]) => x !== 0)
    .map(([f, x]) => {
      const w = g ? (featureWeight(t, g, f) ?? 0) : 0;
      return `${f} ${w}×${Number(x.toFixed(3))}`;
    });
  return [
    `${t.id}  ${t.generator} → ${t.format} (${t.tier})  seed ${item.seed}`,
    `  prompt:     ${item.prompt.text}`,
    `  widget:     ${widgetSummary(item.widget)}`,
    `  answer:     ${answerSummary(item)}`,
    ...item.hints.map(
      (h) =>
        `  hint ${h.level}:     ${h.kind}: ${render(h.say, h.vars ?? {})}${h.actions?.length ? `  [${h.actions.map((a) => a.op).join(', ')}]` : ''}${h.overlay ? `  [overlay ${h.overlay.kind}]` : ''}`,
    ),
    `  difficulty: ${item.difficulty.toFixed(2)} = base ${t.difficulty.base}${terms.length ? ` + ${terms.join(' + ')}` : ''}`,
  ];
}

function main(): number {
  const content = readCompiled();
  initContent(content);
  const only = arg('strand');
  const seed = Number(arg('seed') ?? 1);
  const strands = [...new Set(content.skills.map((s) => s.strand))].sort();
  for (const strand of strands) {
    if (only && strand !== only) continue;
    const templates = content.templates.filter((t) => t.skillId.startsWith(`${strand}.`));
    if (templates.length === 0) continue;
    // Spread the three samples across the strand's templates.
    const picks = [0, Math.floor(templates.length / 2), templates.length - 1]
      .map((i) => templates[i] as ItemTemplate)
      .filter((t, i, xs) => xs.indexOf(t) === i);
    console.log(`=== ${strand} (${templates.length} templates) ===`);
    for (const [i, t] of picks.entries()) {
      console.log(describeItem(t, generateItem(t, seed + i)).join('\n'));
      console.log('');
    }
  }
  return 0;
}

process.exitCode = main();
