// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSayAgain } from './sayAgain';

describe('sayAgain', () => {
  it('says nothing more when the speaker was not pressed', async () => {
    const again = createSayAgain();
    let said = 0;
    await again.drain(
      async () => {
        said += 1;
      },
      () => false,
    );
    expect(said).toBe(0);
  });

  it('says the line once for a press, and again for a press made while it is said', async () => {
    const again = createSayAgain();
    let said = 0;
    again.ask();
    again.ask();
    await again.drain(
      async () => {
        said += 1;
        if (said === 1) again.ask();
      },
      () => false,
    );
    expect(said).toBe(2);
  });

  it('a press from the part before is dropped when a new part starts', async () => {
    const again = createSayAgain();
    let said = 0;
    again.ask();
    again.reset();
    await again.drain(
      async () => {
        said += 1;
      },
      () => false,
    );
    expect(said).toBe(0);
  });

  it('says nothing on a screen that has moved on', async () => {
    const again = createSayAgain();
    let said = 0;
    again.ask();
    await again.drain(
      async () => {
        said += 1;
      },
      () => true,
    );
    expect(said).toBe(0);
  });
});
