// "Hear it again" while a lesson is playing by itself (03 §6.2: a replay repeats the current
// step). The press is kept until the line on screen has been said, then that line is said once
// more before the lesson moves on. Every part of a lesson that plays without the child (a demo
// step, the hand-over of a turn, the demo taking a turn over) drains it the same way.

export interface SayAgain {
  /** The child pressed the speaker. */
  ask(): void;
  /** A new part starts: a press from the part before is not for this one. */
  reset(): void;
  /** Says the line again for each press made so far, and for any made while it is said. */
  drain(say: () => Promise<unknown>, stale: () => boolean): Promise<void>;
}

export function createSayAgain(): SayAgain {
  let asked = false;
  return {
    ask() {
      asked = true;
    },
    reset() {
      asked = false;
    },
    async drain(say, stale) {
      while (asked && !stale()) {
        asked = false;
        await say();
      }
    },
  };
}
