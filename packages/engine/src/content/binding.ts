// 03 §5.3 content binding. The engine is initialised once with the compiled content, at startup, by
// the web app, the API and the tests. `generateItem` and `checkResponse` keep their 02 signatures
// and read prompt text, templates and misconception specs from here.

import type {
  ItemTemplate,
  MisconceptionSpec,
  NarrationJson,
  SkillGraph,
  TemplateId,
} from '@number-island/shared';

export type TemplateStats = SkillGraph['templateStats'];

export interface ContentBinding {
  templates: readonly ItemTemplate[] | Readonly<Record<TemplateId, ItemTemplate>>;
  narration: NarrationJson;
  misconceptions: readonly MisconceptionSpec[];
  templateStats?: TemplateStats;
}

interface BoundContent {
  templates: Map<TemplateId, ItemTemplate>;
  narration: NarrationJson;
  misconceptions: MisconceptionSpec[];
  templateStats: TemplateStats;
}

const EMPTY: BoundContent = {
  templates: new Map(),
  narration: {},
  misconceptions: [],
  templateStats: {},
};

let bound: BoundContent = EMPTY;

/** Bind the compiled content (03 §5.3). Calling it again replaces the previous binding. */
export function initContent(c: ContentBinding): void {
  const list = Array.isArray(c.templates)
    ? (c.templates as readonly ItemTemplate[])
    : Object.values(c.templates as Record<TemplateId, ItemTemplate>);
  bound = {
    templates: new Map(list.map((t) => [t.id, t])),
    narration: c.narration,
    misconceptions: [...c.misconceptions],
    templateStats: c.templateStats ?? {},
  };
}

/** Remove the binding (tests). */
export function resetContent(): void {
  bound = EMPTY;
}

export function boundTemplate(id: TemplateId): ItemTemplate | undefined {
  return bound.templates.get(id);
}

export function boundTemplates(): ItemTemplate[] {
  return [...bound.templates.values()];
}

export function boundNarration(): NarrationJson {
  return bound.narration;
}

export function boundMisconceptions(): readonly MisconceptionSpec[] {
  return bound.misconceptions;
}

export function boundTemplateStats(): TemplateStats {
  return bound.templateStats;
}
