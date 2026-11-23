// The time a child spends answering one try (04 §2.3: latency runs from item ready to submit).
// A hint the child asks for stops it while the hint plays, and it runs on afterwards: the time
// spent before the hint still counts.

export interface AnswerTime {
  /** Item ready, or ready again after feedback: a new try starts from zero. */
  start(): void;
  /** Input is off for a while (a hint the child asked for is playing). */
  pause(): void;
  /** Input is on again, for the same try. */
  resume(): void;
  /** The try's answering time so far, in ms. */
  elapsed(): number;
}

export function createAnswerTime(now: () => number): AnswerTime {
  let spent = 0;
  let since: number | null = null;
  const running = () => (since === null ? 0 : now() - since);
  return {
    start() {
      spent = 0;
      since = now();
    },
    pause() {
      spent += running();
      since = null;
    },
    resume() {
      if (since === null) since = now();
    },
    elapsed: () => spent + running(),
  };
}
