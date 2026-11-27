import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnchorArt } from '../widgets/kit/SceneAnchors';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
const primitives = read('./primitives.css');
const kit = read('../widgets/kit/kit.css');

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(css: string, selector: string): string {
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (sel?.trim() === selector) return body ?? '';
  }
  throw new Error(`no rule ${selector}`);
}

describe('Felt & Stitch rules that must hold', () => {
  it('keeps the Tailwind ring on a felt mat (the stage look-again ring)', () => {
    const body = rule(primitives, '.ni-mat');
    expect(body).toContain('var(--tw-ring-shadow');
    expect(body).toContain('var(--tw-ring-offset-shadow');
  });

  it('draws the pad key invite ring in navy on the wood face (≥ 3:1)', () => {
    expect(rule(kit, '.ni-pad__key.ni-invite')).toMatch(/outline-color:\s*var\(--color-sea-dark\)/);
  });

  it('pins the legacy art palette on scene anchors (Place Relative props)', () => {
    expect(renderToStaticMarkup(AnchorArt({ sprite: 'crate' }))).toMatch(/class="ni-art"/);
  });
});
