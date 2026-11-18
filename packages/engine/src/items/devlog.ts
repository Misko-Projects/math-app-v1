// Dev-only diagnostics (03 §5.4 `difficulty.miss`, 03 §5.1 widget bugs). The engine never writes to
// the console itself; the app installs a logger in development.

export type DevEvent =
  | {
      event: 'difficulty.miss';
      templateId: string;
      seed: number;
      target: number;
      difficulty: number;
    }
  | {
      event: 'response.incompatible';
      templateId: string;
      answerKind: string;
      responseKind: string;
    };

let logger: ((e: DevEvent) => void) | null = null;

export function setDevLogger(fn: ((e: DevEvent) => void) | null): void {
  logger = fn;
}

export function devLog(e: DevEvent): void {
  logger?.(e);
}
