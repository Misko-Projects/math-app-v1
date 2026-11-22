// Storybook-only narration text: the real `ui.*` lines from packages/content/narration/ui.yaml,
// so stories show (and play functions assert) the same words the app will speak. The app resolves
// keys through the compiled narration.json instead (02 §5.5).
import commonYaml from '../../content/narration/common.yaml?raw';
import numbersYaml from '../../content/narration/numbers.yaml?raw';
import uiYaml from '../../content/narration/ui.yaml?raw';
import type { NarrationTextResolver } from '../src/preferences/UiProvider';

/** Parses the flat `key:` / `  text: "…"` subset of the narration YAML format (03 §8.2). */
export function parseNarrationText(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key: string | null = null;
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    const keyMatch = /^([a-z]+(?:\.[A-Za-z0-9-]+)+):\s*$/.exec(line);
    if (keyMatch) {
      key = keyMatch[1] ?? null;
      continue;
    }
    const textMatch = /^\s+text:\s*(.+)$/.exec(line);
    if (key && textMatch?.[1]) {
      const value = textMatch[1].trim();
      out[key] =
        value.startsWith('"') && value.endsWith('"')
          ? (JSON.parse(value) as string)
          : value.startsWith("'") && value.endsWith("'")
            ? value.slice(1, -1).replace(/''/g, "'")
            : value;
    }
  }
  return out;
}

// Shared words (shape, unit, noun and word.* names; generator bin labels) so widget stories show
// the words a child hears; ui.yaml wins on a clash.
const texts = {
  ...parseNarrationText(numbersYaml),
  ...parseNarrationText(commonYaml),
  ...parseNarrationText(uiYaml),
};

/** Story fixtures for keys outside ui.yaml (e.g. a resident's request line in a bubble story). */
const storyTexts: Record<string, string> = {
  'res.shelly.hello': 'Hello! Can you help me fix my boat?',
  'req.dock.needs-planks': 'I need 4 planks for my boat!',
  'game.pip.welcome': "Welcome back! Let's build something today.",
  'ui.story.sheet': 'Your treasure chest',
  'ui.story.answer': 'Your answer',
};

export const storyNarrationText: NarrationTextResolver = (key, vars) => {
  const text = texts[key] ?? storyTexts[key];
  if (text === undefined) return undefined;
  // Typed slots (03 §8.4) display as the app shows them: `cents` 25¢, `dollars` $1.25.
  return text.replace(/\{(\w+)(?:\|(\w+)[^}]*)?\}/g, (m, name: string, type?: string) => {
    if (!vars || !(name in vars)) return m;
    const v = vars[name];
    if (type === 'cents' && typeof v === 'number') return `${v}¢`;
    if (type === 'dollars' && typeof v === 'number') return `$${(v / 100).toFixed(2)}`;
    return String(v);
  });
};
