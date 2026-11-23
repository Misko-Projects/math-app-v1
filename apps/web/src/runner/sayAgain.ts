// "Hear it again" while a lesson is playing by itself (03 §6.2: a replay repeats the current
// step). The press keeps the line that was on screen when it was made; that line is said once
// more at the next pause, before the lesson moves on. Every part of a lesson that plays without
// the child (a demo step, each line of a turn's hand-over, the demo taking a turn over) drains
// it the same way.

export interface SayAgain<Line> {
  /** The child pressed the speaker while `line` was on screen. */
  ask(line: Line): void;
  /** A new part starts: a press from the part before is not for this one. */
  reset(): void;
  /** Says the line of each press made so far, and of any made while one is said. */
  drain(say: (line: Line) => Promise<unknown>, stale: () => boolean): Promise<void>;
}

export function createSayAgain<Line>(): SayAgain<Line> {
  let asked: { line: Line } | null = null;
  return {
    ask(line) {
      asked = { line };
    },
    reset() {
      asked = null;
    },
    async drain(say, stale) {
      while (asked && !stale()) {
        const { line } = asked;
        asked = null;
        await say(line);
      }
    },
  };
}
