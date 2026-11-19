import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import * as GlimStories from './Glim.stories';
import * as PebblingStories from './Pebblings.stories';
import * as PipStories from './Pip.stories';
import { expectPaneTidy } from './storyChecks';

/**
 * Test only (never in the sidebar, docs or visual captures): every character gallery page drawn in
 * a 944 px pane, the room a 1024 px Storybook canvas leaves inside the stage's padding (review
 * s_30013473fe6d #1). Each page wraps or shrinks its drawings there: none spills out of the pane or
 * overlaps another.
 */
const meta = {
  title: 'Art Gallery/Characters/Narrow Panes',
  tags: ['!dev', '!autodocs', '!visual'],
  parameters: { controls: { disable: true }, ui: { stage: 'flush' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The width left inside the stage padding of a 1024 px canvas. */
const PANE = 944;

/** A gallery story: only its render is used (every gallery page renders without args). */
interface Source {
  render?: unknown;
}

function Panes({ pages }: { pages: { name: string; render?: unknown }[] }) {
  return (
    <div style={{ display: 'grid', gap: 48 }}>
      {pages.map((p) => (
        <section key={p.name} data-pane={p.name} style={{ width: PANE }}>
          {(p.render as () => ReactNode)()}
        </section>
      ))}
    </div>
  );
}

function paneStory(pages: Record<string, Source>): Story {
  const list = Object.entries(pages).map(([name, s]) => ({ name, render: s.render }));
  return {
    render: () => <Panes pages={list} />,
    play: async ({ canvasElement }) => {
      const panes = [...canvasElement.querySelectorAll<HTMLElement>('section[data-pane]')];
      if (panes.length !== list.length) throw new Error(`expected ${list.length} panes`);
      for (const pane of panes) await expectPaneTidy(pane);
    },
  };
}

/** The species pages, 0 to 10 and the teens. */
export const SpeciesAndNumbers: Story = paneStory({
  SpeciesShore: PebblingStories.SpeciesShore,
  SpeciesSea: PebblingStories.SpeciesSea,
  NumbersToTen: PebblingStories.NumbersToTen,
  NumbersTeens: PebblingStories.NumbersTeens,
});

/** The families: Ten Turtles, the Hundred Whale, and the fractions, clocks and coins. */
export const Families: Story = paneStory({
  TenTurtles: PebblingStories.TenTurtles,
  HundredWhale: PebblingStories.HundredWhale,
  FractionsClocksCoins: PebblingStories.FractionsClocksCoins,
});

/** Pip, Glim and the cast pages, and the colour-vision check. */
export const CastAndColourVision: Story = paneStory({
  PipPoses: PipStories.Poses,
  GlimStates: GlimStories.States,
  IdleCast: PebblingStories.IdleCast,
  ReducedMotion: PebblingStories.ReducedMotion,
  ColourVision: PebblingStories.ColourVision,
});
