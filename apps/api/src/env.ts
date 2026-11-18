// Worker bindings (wrangler.jsonc `vars` + `d1_databases`, plus secrets from `.dev.vars` /
// `wrangler secret`). Secrets are optional: every AI feature degrades gracefully without them
// (07 §0, 08 §6). Never log, echo or return a secret value.

export type AiProviderName = 'openai' | 'anthropic';

export interface Env {
  /** D1 database (08 §5). Local-only state under `.wrangler/` during `wrangler dev`. */
  DB: D1Database;

  // vars (08 §6, 07 §1); wrangler passes them as strings.
  AI_MONTHLY_BUDGET_USD: string;
  AI_FEEDBACK_PROVIDER: string;
  AI_FEEDBACK_MODEL: string;
  AI_FEEDBACK_FALLBACK_MODEL: string;
  AI_SUMMARY_PROVIDER: string;
  AI_SUMMARY_MODEL: string;
  AI_SUMMARY_FALLBACK_MODEL: string;
  AI_VISION_PROVIDER: string;
  AI_VISION_MODEL: string;
  PBKDF2_ITERATIONS: string;

  // secrets (optional; `pnpm secrets:link` writes them to `.dev.vars`).
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
}

export interface AppBindings {
  Bindings: Env;
}

// Types `env` / `exports` from `cloudflare:workers` (used by the Workers-pool tests).
type WorkerEnv = Env;
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
    interface GlobalProps {
      mainModule: typeof import('./index');
    }
  }
}
