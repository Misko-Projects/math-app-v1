// Storybook-only narration text: the real `ui.*` lines from packages/content/narration/ui.yaml,
// so stories show (and play functions assert) the same words the app will speak. The app resolves
// keys through the compiled narration.json instead (02 §5.5).
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

// The clip sets too (noun.*, shape.*, word.*, …: numbers.yaml), which widgets show as labels
// (U05 #14: chart categories are `noun.<id>.many`).
const texts = { ...parseNarrationText(numbersYaml), ...parseNarrationText(uiYaml) };

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
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    vars && name in vars ? String(vars[name]) : m,
  );
};
