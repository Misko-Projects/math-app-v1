import type { WidgetConfig } from '@number-island/shared';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor } from 'storybook/test';
import { type SpyAudio, spyAudio } from '../../test-support/storyHelpers';
import {
  areaBox,
  expectAreaFit,
  expectCountable,
  expectRing,
  goNext,
  inArea,
  namedStory,
  stepButton,
} from '../../test-support/twoStepStory';
import {
  expectNoScroll,
  expectPointerOn,
  expectTraceOrdered,
  findWidget,
  traceOf,
} from '../../test-support/widgetStory';
import { createDemoController, UnsupportedWidgetOpError, type WidgetDemo } from '../demo';
import type { ConfigFor } from '../types';
import type { WidgetHostProps } from '../WidgetHost';

/**
 * `story-problem` (03 §5.5): a story in lines, a scene, a counters board, and the answer on a
 * second step. Every story runs in a workshop's widget area: `landscapeMin` (906 × 373, the
 * smallest) unless its name says tablet (1226 × 493). The configs are the shapes story.addsub
 * builds for ADD.12, ADD.20, ADD.21 and ADD.25.
 */

type Config = ConfigFor<'story-problem'>;

const vars = { who: 'nib', item: 'shell', many: 2 };

/** ADD.20.t3 (kindergarten): 9 shells, 7 given away. */
const takeFrom: Config = {
  format: 'story-problem',
  context: 'beach-shells',
  scene: { kind: 'scene', context: 'beach-shells', sprites: [{ sprite: 'shell', count: 9 }] },
  lines: [
    { key: 'p.story.has', vars: { ...vars, a: 9 } },
    { key: 'p.story.beach-shells.take', vars: { ...vars, b: 7 } },
    { key: 'p.story.q.left', vars },
  ],
  situation: 'take-from/result',
  steps: 1,
  workspace: 'counters',
  blanks: [{ id: 'x', maxDigits: 2 }],
  showText: true,
};
/** ADD.25.t2: three addends, in ten-frames. */
const threeAddends: Config = {
  ...takeFrom,
  context: 'lighthouse-lanterns',
  scene: {
    kind: 'scene',
    context: 'lighthouse-lanterns',
    sprites: [
      { sprite: 'lantern', count: 9 },
      { sprite: 'lantern', count: 2 },
      { sprite: 'lantern', count: 3 },
    ],
  },
  lines: [
    { key: 'p.story.pt.three', vars: { ...vars, item: 'lantern', a: 9, b: 2, c: 3 } },
    { key: 'p.story.q.all', vars: { ...vars, item: 'lantern' } },
  ],
  situation: 'put-together/total',
  workspace: 'ten-frame',
};
/** ADD.21.t2: a compare story with the bar-model workspace. */
const compare: Config = {
  ...takeFrom,
  scene: { kind: 'scene', context: 'beach-shells', sprites: [{ sprite: 'pebble', count: 15 }] },
  lines: [
    { key: 'p.story.cmp.has-other', vars: { ...vars, other: 'pebble', a: 15 } },
    { key: 'p.story.cmp.fewer', vars: { ...vars, other: 'pebble', b: 5 } },
    { key: 'p.story.cmp.q-item', vars: { ...vars, other: 'pebble' } },
  ],
  situation: 'compare/bigger-fewer',
  workspace: 'bar-model',
};
/** ADD.12.t1 and ADD.20.t3, put-together/both: any two parts of 7. */
const both: Config = {
  ...takeFrom,
  scene: { kind: 'scene', context: 'beach-shells', sprites: [{ sprite: 'shell', count: 7 }] },
  lines: [
    { key: 'p.story.pt.total', vars: { ...vars, a: 7 } },
    { key: 'p.story.q.both', vars },
  ],
  situation: 'put-together/both',
  blanks: [
    { id: 'x', maxDigits: 2 },
    { id: 'y', maxDigits: 2 },
  ],
};
/** The longest story.addsub tells: four lines (add-to with three numbers, ADD.25.t2). */
const fourLines: Config = {
  ...takeFrom,
  scene: { kind: 'scene', context: 'beach-shells', sprites: [{ sprite: 'shell', count: 6 }] },
  lines: [
    { key: 'p.story.has', vars: { ...vars, a: 6 } },
    { key: 'p.story.beach-shells.add', vars: { ...vars, b: 6 } },
    { key: 'p.story.beach-shells.add', vars: { ...vars, b: 1 } },
    { key: 'p.story.q.now', vars },
  ],
  situation: 'add-to/result',
  workspace: 'ten-frame',
};

const meta = {
  title: 'Widgets/Story problem',
  args: {
    config: takeFrom as WidgetConfig,
    tier: 'pictorial',
    disabled: false,
    onResponse: fn(),
    onInteract: fn(),
  },
  parameters: { ui: { audio: spyAudio() } },
  decorators: [namedStory],
  render: inArea('landscapeMin'),
} satisfies Meta<WidgetHostProps>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROOT = '.ni-story';

// ---------- helpers ----------

const q = (root: HTMLElement, sel: string) => root.querySelector(sel) as HTMLElement;
const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const card = (root: HTMLElement) => q(root, '.ni-story__card');
const addButton = (root: HTMLElement) => q(root, '[data-cue="counter-add"] button');
const takeButton = (root: HTMLElement) => q(root, '[data-cue="counter-take"] button');
const onBoard = (root: HTMLElement) => all(root, '.ni-story__counters .ni-story__item').length;
const key = (root: HTMLElement, k: string) => q(root, `.ni-story__entry [data-key="${k}"]`);
const boxes = (root: HTMLElement) => all(root, '.ni-boxentry__box');
const status = (root: HTMLElement) => q(root, '[role="status"]').textContent ?? '';
const audioOf = (parameters: { ui?: { audio?: unknown } }) => parameters.ui?.audio as SpyAudio;
const said = (audio: SpyAudio) => (audio.say.mock.calls as unknown[][]).map((c) => c[0]);
const steps = (args: { onInteract?: unknown }) =>
  traceOf(args.onInteract).map((e) => `${e.t}:${e.target}`);

async function type(root: HTMLElement, n: number) {
  for (const ch of String(n)) await userEvent.click(key(root, ch));
}

/** The story step's controls and parts, for `expectAreaFit`. */
const storyFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => ({
  ageMode,
  story,
  controls: {
    story: [card(root)],
    ...(addButton(root) ? { counters: [takeButton(root), addButton(root)] } : {}),
    next: [stepButton(root, 'next')],
  },
  parts: all(root, '.ni-story__scene, .ni-story__counters'),
  minFill: 0.5,
});

/** The answer step's controls and parts, for `expectAreaFit`. */
const answerFit = (root: HTMLElement, ageMode: 'k' | 'g1-up', story: string) => ({
  ageMode,
  story,
  controls: {
    question: [q(root, '.ni-story__question')],
    boxes: boxes(root),
    'pad keys': all(root, '.ni-story__entry .ni-pad__key'),
    back: [stepButton(root, 'back')],
    check: [stepButton(root, 'check')],
  },
  parts: all(root, '.ni-story__counters'),
  minFill: 0.5,
});

/** Story text is at least 24 px, on every line. */
async function expectTextReadable(root: HTMLElement) {
  for (const el of all(root, '.ni-story__line')) {
    await expect(Number.parseFloat(getComputedStyle(el).fontSize)).toBeGreaterThanOrEqual(24);
  }
}

// ---------- the story step ----------

/** Kindergarten in the smallest area: the story, the nine shells, the board, Next. */
export const StoryKindergarten: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, storyFit(root, 'k', 'story K 906x373 story'));
    await expectTextReadable(root);
    await expectCountable(q(root, '.ni-story__scene'));
    await expect(all(root, '.ni-story__line')).toHaveLength(3);
    // The story is its card's name; the scene says what it shows, never the answer.
    // (Storybook's narration does not spell out names and nouns; the app's does.)
    await expect(card(root)).toHaveAccessibleName(expect.stringMatching(/has 9 .* How many/));
    await expect(q(root, '.ni-story__scene')).toHaveAccessibleName('Look at the picture: 9 Shell');
    // Read aloud when the item opens, from the first line.
    await waitFor(() => expect(said(audioOf(parameters))[0]).toBe('p.story.has'));
  },
};

/** The story is read line by line, each marked while it is read; a touch reads it again. */
export const ReadsTheStoryAloud: Story = {
  tags: ['!visual'],
  parameters: { ui: { audio: spyAudio() } },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    const audio = audioOf(parameters);
    await waitFor(() =>
      expect(said(audio)).toEqual(['p.story.has', 'p.story.beach-shells.take', 'p.story.q.left']),
    );
    await waitFor(() => expect(root.querySelector('[data-marked="true"]')).toBeNull());
    await expect(args.onInteract).not.toHaveBeenCalled();
    audio.say.mockClear();
    await userEvent.click(card(root));
    await waitFor(() => expect(said(audio)).toHaveLength(3));
    await expect(steps(args)).toEqual(['tap:story']);
  },
};

/** A line being read is marked: here the reading waits on its first line. */
export const MarksTheLineBeingRead: Story = {
  tags: ['!visual'],
  parameters: {
    ui: {
      // A voice that never finishes its line: the first line stays the one being read.
      audio: { ...spyAudio(), say: fn(() => new Promise<void>(() => {})) },
    },
  },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await waitFor(() => expect(q(root, '[data-line="0"]')).toHaveAttribute('data-marked', 'true'));
    // The child's next step ends the reading.
    await userEvent.click(addButton(root));
    await waitFor(() => expect(root.querySelector('[data-marked="true"]')).toBeNull());
  },
};

/** Three told groups and ten-frames on the board (ADD.25.t2), in the smallest area. */
export const StoryThreeAddends: Story = {
  args: { config: threeAddends },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, storyFit(root, 'g1-up', 'story 906x373 three addends'));
    await expectCountable(q(root, '.ni-story__scene'));
    await expect(q(root, '.ni-story__counters')).toHaveAttribute('data-frames', 'true');
    // The told groups differ by the kit's two tones, in turn.
    await expect(all(root, '.ni-story__scene .ni-story__grid')).toHaveLength(3);
  },
};

/** Four lines, the longest story.addsub tells, in the smallest area. */
export const StoryFourLines: Story = {
  args: { config: fourLines },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, storyFit(root, 'g1-up', 'story 906x373 four lines'));
    await expect(root).not.toHaveAttribute('data-fits');
  },
};

/** On the tablet. */
export const StoryTablet: Story = {
  render: inArea('tablet'),
  args: { config: compare },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expectAreaFit(canvasElement, storyFit(root, 'g1-up', 'story tablet story'));
    await expectCountable(q(root, '.ni-story__scene'));
  },
};

// ---------- the counters board ----------

/** Counters go on and come off by pointer and keyboard; the board is not part of the answer. */
export const CountersOnAndOff: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(takeButton(root)).toHaveAttribute('data-limit', 'true');
    for (let i = 0; i < 3; i += 1) await userEvent.click(addButton(root));
    await expect(onBoard(root)).toBe(3);
    await expect(q(root, '.ni-story__counters')).toHaveAccessibleName('Counters: 3');
    await userEvent.click(takeButton(root));
    await expect(onBoard(root)).toBe(2);
    takeButton(root).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await expect(onBoard(root)).toBe(0);
    await expect(takeButton(root)).toHaveFocus();
    // Nothing to take: said, and in the status line.
    await userEvent.keyboard('{Enter}');
    await expect(said(audioOf(parameters))).toContain('ui.widget.story.note.none');
    await expect(status(root)).toBe('No counters to take away');
    await userEvent.click(addButton(root));
    await expect(status(root)).toBe('');
    await expect(steps(args)).toEqual([
      'tap:counter-add',
      'tap:counter-add',
      'tap:counter-add',
      'undo:counter-take',
      'undo:counter-take',
      'undo:counter-take',
      'undo:counter-take',
      'tap:counter-add',
    ]);
    await expectTraceOrdered(traceOf(args.onInteract));
    await expect(args.onResponse).not.toHaveBeenCalled();
  },
};

/** The board holds twenty: then the add button is dashed and says so. */
export const BoardFull: Story = {
  tags: ['!visual'],
  args: { config: fourLines },
  play: async ({ canvasElement, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 20; i += 1) await userEvent.click(addButton(root));
    await expect(onBoard(root)).toBe(20);
    await expectCountable(q(root, '.ni-story__counters'));
    await expect(addButton(root)).toHaveAttribute('data-limit', 'true');
    await userEvent.click(addButton(root));
    await expect(onBoard(root)).toBe(20);
    await expect(said(audioOf(parameters))).toContain('ui.widget.story.note.full');
    await expect(status(root)).toBe('It is full');
    // Measured without the focus ring the last press left on the button.
    (document.activeElement as HTMLElement | null)?.blur();
    await expectAreaFit(canvasElement, storyFit(root, 'g1-up', 'story 906x373 board full'));
  },
};

// ---------- the answer step ----------

/** Kindergarten in the smallest area: the question, the box and the pad, Back and Check. */
export const AnswerKindergarten: Story = {
  globals: { ageMode: 'k' },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await goNext(root);
    await expectAreaFit(canvasElement, answerFit(root, 'k', 'story K 906x373 answer'));
    await expectTextReadable(root);
    await expect(q(root, '.ni-story__question')).toHaveAccessibleName(
      expect.stringMatching(/^How many .* left\?$/),
    );
    await expect(stepButton(root, 'check')).toBeDisabled();
    await type(root, 2);
    await expect(boxes(root)[0]).toHaveTextContent('2');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2 });
    await expect(steps(args)).toEqual(['tap:next', 'tap:key-2']);
  },
};

/** Grade 1: the counters as built are shown again beside the answer; a digit is taken back. */
export const AnswerWithCounters: Story = {
  args: { config: compare },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 5; i += 1) await userEvent.click(addButton(root));
    await goNext(root);
    await expectAreaFit(canvasElement, answerFit(root, 'g1-up', 'story 906x373 answer'));
    await expect(onBoard(root)).toBe(5);
    await expectCountable(q(root, '.ni-story__counters'));
    // A touch on the question reads it again.
    audioOf(parameters).say.mockClear();
    await userEvent.click(q(root, '.ni-story__question'));
    await waitFor(() => expect(said(audioOf(parameters))).toEqual(['p.story.cmp.q-item']));
    await type(root, 21);
    await userEvent.click(key(root, 'back'));
    await userEvent.click(key(root, '0'));
    await expect(boxes(root)[0]).toHaveTextContent('20');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 20 });
  },
};

/** Back returns to the story with the counters and the typed answer kept. */
export const BackKeepsEverything: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await userEvent.click(addButton(root));
    await goNext(root);
    await type(root, 2);
    await userEvent.click(stepButton(root, 'back'));
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'build'));
    await expect(onBoard(root)).toBe(1);
    await goNext(root);
    await expect(boxes(root)[0]).toHaveTextContent('2');
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2 });
  },
};

/** Both parts asked: two boxes, each with the thing in its tone; any split is sent as parts. */
export const AnswerBothParts: Story = {
  globals: { ageMode: 'k' },
  args: { config: both },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await goNext(root);
    await expectAreaFit(canvasElement, answerFit(root, 'k', 'story K 906x373 both parts'));
    await expect(boxes(root)).toHaveLength(2);
    await expect(boxes(root)[0]).toHaveAccessibleName('First part: ?');
    await type(root, 3);
    await expect(stepButton(root, 'check')).toBeDisabled();
    await userEvent.click(boxes(root)[1] as HTMLElement);
    await type(root, 4);
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({
      kind: 'state',
      value: { parts: [3, 4] },
    });
    await expect(steps(args)).toEqual(['tap:next', 'tap:key-3', 'tap:box-1', 'tap:key-4']);
  },
};

/** Keyboard: Tab to Next, Enter; the pad's keys with Enter; Check with Enter. */
export const Keyboard: Story = {
  tags: ['!visual'],
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    stepButton(root, 'next').focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(root).toHaveAttribute('data-step', 'ask'));
    // Next handed the focus to Back.
    await expect(stepButton(root, 'back')).toHaveFocus();
    key(root, '2').focus();
    await userEvent.keyboard('{Enter}');
    stepButton(root, 'check').focus();
    await userEvent.keyboard('{Enter}');
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2 });
  },
};

/** The answer step on the tablet. */
export const AnswerTablet: Story = {
  render: inArea('tablet'),
  args: { config: threeAddends },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    for (let i = 0; i < 14; i += 1) await userEvent.click(addButton(root));
    await goNext(root);
    await expectAreaFit(canvasElement, answerFit(root, 'g1-up', 'story tablet answer'));
  },
};

// ---------- no input, no text ----------

export const Disabled: Story = {
  tags: ['!visual'],
  args: { disabled: true },
  play: async ({ canvasElement, args, parameters }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(card(root)).toBeDisabled();
    await expect(addButton(root)).toBeDisabled();
    await expect(stepButton(root, 'next')).toBeDisabled();
    // Nothing is read over a demonstration or feedback.
    await expect(audioOf(parameters).say).not.toHaveBeenCalled();
    await expect(args.onInteract).not.toHaveBeenCalled();
  },
};

/** `showText: false`: the card is the speaker alone, named "Hear the story". */
export const WithoutText: Story = {
  args: { config: { ...takeFrom, showText: false } },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await expect(all(root, '.ni-story__line')).toHaveLength(0);
    await expect(card(root)).toHaveAccessibleName('Hear the story');
  },
};

// ---------- demo ----------

const demoPlay: WidgetDemo = createDemoController({ strict: true });
/** Demo play, as a worked solution runs: a line, the counters one by one, the answer typed. */
export const DemoPlay: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { demo: demoPlay },
  play: async ({ canvasElement, args }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoPlay.play({ op: 'highlight-line', args: { index: 2 } });
    await expect(q(root, '[data-line="2"]')).toHaveAttribute('data-marked', 'true');
    await demoPlay.play({ op: 'show-scene' });
    await demoPlay.play({ op: 'act-out', args: { sprite: 'shell', count: 9 } });
    await expect(onBoard(root)).toBe(9);
    await demoPlay.play({ op: 'answer', args: { value: 2 } });
    await expect(root).toHaveAttribute('data-step', 'ask');
    await expect(boxes(root)[0]).toHaveTextContent('2');
    await expect(args.onInteract).not.toHaveBeenCalled();
    await waitFor(() => expect(stepButton(root, 'check')).toBeEnabled());
    await userEvent.click(stepButton(root, 'check'));
    await expect(args.onResponse).toHaveBeenCalledWith({ kind: 'number', value: 2 });
  },
};

const demoBar: WidgetDemo = createDemoController({ strict: true });
/** Demo `draw-bar`: a bar of the parts in the scene's place, numerals at 32 px. */
export const DemoDrawBar: Story = {
  tags: ['!visual'],
  globals: { motion: 'reduced' },
  args: { config: compare, demo: demoBar },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    await demoBar.play({ op: 'draw-bar', args: { parts: [15, 5] } });
    const parts = all(root, '.ni-story__part');
    await expect(parts.map((p) => p.textContent)).toEqual(['15', '5']);
    for (const p of parts) {
      await expect(Number.parseFloat(getComputedStyle(p).fontSize)).toBeGreaterThanOrEqual(32);
    }
    await expectNoScroll(areaBox(canvasElement));
  },
};

const demoInvite: WidgetDemo = createDemoController({ strict: true });
/** Demo invites: one ring each, on the add button, the story, Next, then the pad's key. */
export const DemoInvite: Story = {
  tags: ['!visual'],
  args: { demo: demoInvite },
  play: async ({ canvasElement }) => {
    const root = await findWidget(canvasElement, ROOT);
    const hand = () => root.querySelector('.ni-hand') as HTMLElement;
    demoInvite.invite({ op: 'act-out', args: { sprite: 'shell', count: 1 } });
    await expectRing(root, addButton(root));
    await waitFor(() => expect(hand()).not.toBeNull());
    await expectPointerOn(hand(), addButton(root), root);
    await expectNoScroll(areaBox(canvasElement));
    await userEvent.click(addButton(root));
    await expectRing(root, null);
    demoInvite.invite({ op: 'highlight-line', args: { index: 2 } });
    await expectRing(root, card(root));
    demoInvite.invite({ op: 'answer', args: { value: 2 } });
    await expectRing(root, stepButton(root, 'next'));
    await goNext(root);
    demoInvite.invite({ op: 'answer', args: { value: 2 } });
    await expectRing(root, key(root, '2'));
    await userEvent.click(key(root, '2'));
    await expectRing(root, null);
  },
};

const demoUnsupported: WidgetDemo = createDemoController({ strict: true });
/** An op the story doesn't define throws UnsupportedWidgetOpError in development. */
export const DemoUnsupportedOp: Story = {
  tags: ['!visual'],
  args: { demo: demoUnsupported },
  play: async ({ canvasElement }) => {
    await findWidget(canvasElement, ROOT);
    await expect(demoUnsupported.play({ op: 'deal-round' })).rejects.toBeInstanceOf(
      UnsupportedWidgetOpError,
    );
  },
};
