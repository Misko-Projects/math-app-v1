# AGENTS.md: working in this repository

Number Island is an adaptive, game-based K–3 math app for kids (the schema covers K–12). It is a TypeScript monorepo: a React PWA plus a Hono API on Cloudflare Workers, run locally with `wrangler dev`.

## Source of truth

- **`docs/spec/` is binding.** Read `docs/spec/README.md` first, then the sections your issue cites. When an issue and a spec disagree, the spec wins. If the spec must change, change it in the same PR and say why.
- **Shared contracts** are in `docs/spec/02-architecture.md` §5 (§5.8 holds the supporting types and every event payload). All cross-package types live in `packages/shared`; never define a parallel type elsewhere. A PR that changes a contract updates that section and every caller in the same PR.
- **Package direction:** `shared ← content ← engine ← ui ← web`; `shared, engine ← api` (02 §2).
- The build breakdown is in `docs/build/` (`plan.md`, `issues.md`). Background research is in `docs/research/` (not binding).

## Commands

The full table is in `docs/spec/09-quality.md` §1. Toolchain: Node 24 (`.nvmrc`) and pnpm 10 (`packageManager`, via `corepack enable`).

```
pnpm i                   # install
pnpm secrets:link        # writes apps/api/.dev.vars from ${MATH_APP_SECRETS:-~/.config/math-app-v1/secrets.env}; safe if missing
pnpm dev                 # web :5173 + api :8787; Vite proxies /api to wrangler dev
pnpm dev:lan             # same, web bound to 0.0.0.0 for a tablet on the home Wi-Fi
pnpm dev:https           # same, self-signed HTTPS (service workers need a secure context)
pnpm preview:full        # build the web app and serve it from the Worker on :8787 (production topology)
pnpm verify              # content:build → typecheck → lint → content:validate → test → build; run before every push
pnpm e2e                 # Playwright: Chromium desktop + Android-tablet emulation, against preview:full
pnpm storybook           # packages/ui Storybook on :6006
pnpm bundle-size         # after `pnpm build`: assert the 02 §6 JS budgets (bundle-budgets.json)
```

Also: `pnpm typecheck` (`tsc -b`), `pnpm lint` (Biome + `scripts/check-boundaries.mjs`, the 02 §2 import-direction lint), `pnpm test` (Vitest projects for every package, including Storybook play functions and axe in headless Chromium and the API in the Workers pool), `pnpm test:sim`, `pnpm content:build|validate|sample`, `pnpm visual` / `pnpm visual:update` (Storybook snapshots; baselines only from the pinned Playwright Docker image), `pnpm narration:render|audition`, `pnpm ai:smoke`. Commands whose feature has not landed yet are working stubs that say which issue delivers them.

Run a single package's tests with `pnpm exec vitest run --project <shared|content|engine|web|api|ui|ui-stories|scripts>`. `pnpm test` and `pnpm e2e` run `pnpm browsers` (`playwright install chromium`) first, which downloads Chromium once. On Linux, Chromium's system libraries are a one-time machine prerequisite: `pnpm exec playwright install-deps chromium` (Playwright elevates the system package-manager step itself; don't run pnpm under sudo). CI uses `playwright install --with-deps chromium`.

## Workflow

- Work happens in **isolated worktrees**, one issue per branch (`feat/issue-<n>-<slug>`). Never edit the primary checkout.
- Follow the `issue-workflow` skill: claim, isolate, implement, test, cross-model review, UI evidence, merge gates, cleanup.
- Reference issues as **`Refs #N`** in commits, PR titles and PR bodies. Never put closing keywords before an issue reference.
- One coherent slice per PR. Large issues may land as several PRs; say which acceptance criteria each delivers.
- Definition of done: `docs/spec/09-quality.md` §5. The required CI checks are `verify`, `e2e` and `bundle-size`.
- You may use in-process subagents to parallelise work inside your issue. Do not start other implementation sessions or pick up unrelated issues.

## Engineering rules

- TypeScript strict. No `any` without a comment explaining why.
- `packages/shared`, `packages/content` and `packages/engine` are pure: no React, DOM or Dexie. The engine also has no `Math.random` or `Date.now`. Randomness comes from the seeded RNG, and time is passed in as a parameter.
- Children's strings live in narration YAML (`packages/content/narration/`), never inline in components. UI issues author their own keys in `narration/ui.yaml` or `narration/game.yaml`.
- Game data (buildings, recipes, residents, decor, unlock rules) lives in `packages/content/game/*.yaml`, not in app code.
- Things that need real hardware, the owner's ears, or an outside party are "owner verification" notes, never acceptance criteria or blockers.
- Each `ItemFormat` has exactly one widget in `packages/ui/widgets`. Workshops theme widgets; they don't reimplement them.
- New runtime dependencies need a justification in the PR and must fit the bundle budgets (02 §6).
- Every generator gets property tests (500 seeds). Every widget gets stories with play functions. Every API route gets Workers-pool tests.

## Privacy and safety (hard rules)

- No third-party analytics, ads, trackers, CDNs, remote fonts or crash reporters. Everything is self-hosted.
- **Gemini is never called at runtime.** It is only used by `tools/narration` at build time. Runtime AI goes through `apps/api/src/ai`: OpenAI for feedback and summaries (never any personal data), Claude for photo → avatar, with deterministic fallbacks. See `docs/spec/07-ai-services.md`.
- Never send names, ids, birth dates or photos-at-rest to any provider. Photos are processed in memory and never stored.
- Children never type to, or talk with, an AI model.
- Secrets live only in `~/.config/math-app-v1/secrets.env` (user-owned) → `apps/api/.dev.vars` (gitignored). Never commit, log or print them. CI has no secrets: mock all providers.

## Content and art rules

- Use original names, characters, art, wording and music only. Pebblings must not resemble Numberblocks or DragonBox Nooms. Do not copy standards text; store codes plus our own wording.
- Record every third-party asset (fonts, CC0 audio) and its licence in `LICENSES-ASSETS.md`.
- Healthy-engagement rules (`docs/spec/05-game-design.md` §7) are non-negotiable: no lives, timers for K, streak loss, purchases or leaderboards.

## UI evidence

Attach screenshots at tablet 1280×800 @2x and desktop 1440×900, plus a short video at 1× speed for interactions (09 §4), as private session artifacts.
