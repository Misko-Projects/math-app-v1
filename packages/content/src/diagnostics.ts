// Validation findings (03 §9.2). Every finding names its check id, the file and the YAML path.

export type CheckId =
  | 'V01'
  | 'V02'
  | 'V03'
  | 'V04'
  | 'V05'
  | 'V06'
  | 'V07'
  | 'V08'
  | 'V09'
  | 'V10'
  | 'V11'
  | 'V12'
  | 'V16'
  | 'V17'
  | 'V18'
  | 'V19'
  | 'V20'
  | 'V21'
  | 'V23'
  | 'V24'
  | 'V26';

/** The compiler checks C01 owns; the engine checks (V13–V15, V22, V25) live in tools/content-check. */
export const COMPILER_CHECKS: readonly CheckId[] = [
  'V01',
  'V02',
  'V03',
  'V04',
  'V05',
  'V06',
  'V07',
  'V08',
  'V09',
  'V10',
  'V11',
  'V12',
  'V16',
  'V17',
  'V18',
  'V19',
  'V20',
  'V21',
  'V23',
  'V24',
  'V26',
];

export type Severity = 'error' | 'warn';

export interface Diagnostic {
  check: CheckId;
  severity: Severity;
  /** Content-relative file, e.g. `skills/ADD.yaml`; empty for whole-set findings. */
  file: string;
  /** Path inside the file, e.g. `skills[2].prerequisites[0]`. */
  path: string;
  message: string;
}

export class Diagnostics {
  readonly items: Diagnostic[] = [];

  error(check: CheckId, file: string, path: string, message: string): void {
    this.items.push({ check, severity: 'error', file, path, message });
  }

  warn(check: CheckId, file: string, path: string, message: string): void {
    this.items.push({ check, severity: 'warn', file, path, message });
  }

  get errors(): Diagnostic[] {
    return this.items.filter((d) => d.severity === 'error');
  }

  get warnings(): Diagnostic[] {
    return this.items.filter((d) => d.severity === 'warn');
  }
}

/** Formats a YAML path from Zod-style segments: `['skills', 2, 'id']` → `skills[2].id`. */
export function formatPath(segments: readonly PropertyKey[]): string {
  let out = '';
  for (const s of segments) {
    if (typeof s === 'number') out += `[${s}]`;
    else {
      const key = String(s);
      out += /^[A-Za-z_$][\w$-]*$/.test(key) ? (out ? `.${key}` : key) : `[${JSON.stringify(key)}]`;
    }
  }
  return out;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = [d.file, d.path].filter(Boolean).join(' › ');
  return `${d.severity === 'error' ? 'error' : 'warn '} ${d.check}${where ? ` ${where}` : ''}: ${d.message}`;
}
