// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSayAgain } from './sayAgain';

const never = () => false;

describe('sayAgain', () => {
  it('says nothing more when the speaker was not pressed', async () => {
    const again = createSayAgain<string>();
    const said: string[] = [];
    await again.drain(async (line) => said.push(line), never);
    expect(said).toEqual([]);
  });

  it('repeats the line that was on screen at the press, not the one that came after', async () => {
    // The demo takes a turn over: the invitation is still in the bubble while the widget is
    // rebuilt, and the demo's own line follows.
    const again = createSayAgain<string>();
    const said: string[] = [];
    again.ask('How many are there?');
    // ...the next line is on screen by the time the lesson pauses.
    await again.drain(async (line) => said.push(line), never);
    expect(said).toEqual(['How many are there?']);
  });

  it('a hand-over of two lines: a press during the second repeats the second, once', async () => {
    const again = createSayAgain<string>();
    const said: string[] = [];
    const say = async (line: string, pressDuring = false) => {
      said.push(line);
      if (pressDuring) again.ask(line);
    };
    for (const [line, press] of [
      ['Put one more in.', false],
      ['Now count them all.', true],
    ] as const) {
      await say(line, press);
      await again.drain((l) => say(l), never);
    }
    expect(said).toEqual(['Put one more in.', 'Now count them all.', 'Now count them all.']);
  });

  it('a press made while a line is said again is honoured too', async () => {
    const again = createSayAgain<string>();
    let said = 0;
    again.ask('a');
    await again.drain(async (line) => {
      said += 1;
      if (said === 1) again.ask(line);
    }, never);
    expect(said).toBe(2);
  });

  it('a press from the part before is dropped when a new part starts', async () => {
    const again = createSayAgain<string>();
    const said: string[] = [];
    again.ask('a');
    again.reset();
    await again.drain(async (line) => said.push(line), never);
    expect(said).toEqual([]);
  });

  it('says nothing on a screen that has moved on', async () => {
    const again = createSayAgain<string>();
    const said: string[] = [];
    again.ask('a');
    await again.drain(
      async (line) => said.push(line),
      () => true,
    );
    expect(said).toEqual([]);
  });
});
