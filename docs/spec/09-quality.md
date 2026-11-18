# 09: Quality, testing and definition of done

## 1. Commands (created by the scaffold issue; kept stable)

| Command | Does |
|---|---|
| `pnpm i` | Install (pnpm 10, Node 24; `.nvmrc` and `packageManager` pinned) |
| `pnpm dev` | Vite + `wrangler dev` with a `/api` proxy |
| `pnpm dev:lan` / `pnpm dev:https` | LAN / self-signed HTTPS for tablet testing |
| `pnpm build` | Content build, then all packages, then the web build |
| `pnpm typecheck` | `tsc -b` across the workspace |
| `pnpm lint` | Biome check |
| `pnpm test` | Vitest across packages (unit + property + component/story + axe on stories + API pool). Property tests use `CONTENT_PROPERTY_N=100` by default |
| `pnpm test:sim` | Engine simulated-learner suite (04 §8). Runs in CI on PRs touching `packages/engine` and in the nightly job |
| `pnpm content:build` / `pnpm content:validate` | 03 §9 |
| `pnpm content:sample [--strand X]` | Prints 3 rendered items per strand (prompt, widget summary, answer, hints, difficulty) for PR review (03 §10.1) |
| `pnpm e2e` | Playwright (Chromium desktop + Android-tablet emulation) against `pnpm preview:full` |
| `pnpm storybook` | Widgets, avatar, art gallery, Content Browser |
| `pnpm narration:render` | Render missing narration clips (07 §3; `gemini` needs a key, `kokoro` runs locally; never in CI) |
| `pnpm narration:audition` | Render the same 5 lines in each candidate voice into `tmp/audition/` (07 §3) |
| `pnpm ai:smoke` | Live AI smoke test with real keys: 20 feedback requests + 1 vision request; prints latency p50/p95 and cost per model (07 §9). Never in CI |
| `pnpm secrets:link` | Writes `apps/api/.dev.vars` from the user-owned secrets file (08 §6) |
| `pnpm verify` | **In this order:** content:build → typecheck → lint → content:validate → test → build (what CI's `verify` job runs) |

## 2. CI (GitHub Actions, `.github/workflows/ci.yml`)

- Triggers: `pull_request`, `push` to `main`, and a nightly `schedule:` (cron) for the `nightly` job.
- **Required jobs** (stable check names; PRs merge only when all three pass):
  - `verify`: checkout → pnpm setup with cache → `pnpm i --frozen-lockfile` → `pnpm verify`. This includes the component, story-play and axe tests (they run inside `pnpm test` via Vitest + Storybook's test runner integration).
  - `e2e` (needs `verify`): install Playwright Chromium → `pnpm e2e` → upload the report and failure traces as artifacts.
  - `bundle-size`: build, then assert the 02 §6 JS budgets (fails on regression). Time to interactive is **reported, not enforced**.
- **Non-required jobs:**
  - `visual`: Storybook visual snapshots compared in the **pinned Playwright Docker image** (`mcr.microsoft.com/playwright:<pinned version>`). Baselines are generated only in that image (`pnpm visual:update` runs it in Docker locally) to avoid OS/font drift.
  - `nightly` (schedule only): `pnpm test:sim` on the full graph, property tests with `CONTENT_PROPERTY_N=500`, and a WebKit E2E smoke test.
- No secrets in CI. Provider calls are mocked. Missing narration clips fall back to Web Speech (stubbed in tests). No model downloads (Kokoro) in CI.
- Keep the required jobs ≤ 20 min wall-clock in total.

## 3. Test layers

| Layer | Scope | Tooling |
|---|---|---|
| Unit | Engine formulas, generators, folds, schemas, API handlers | Vitest |
| Property | Every generator (100 seeds per template on PRs, 500 nightly and in K01/K02 acceptance runs): valid answer, constraints hold, difficulty is finite; fold order-independence; inventory clamped at 0; planner invariants | fast-check |
| Simulation | Placement accuracy, accuracy band, review timing (04 §8) | Vitest + engine sim harness |
| Component | Each widget: render per tier, tap-to-place path, drag path, keyboard path, emits the correct `ResponseValue` | Vitest + Testing Library; Storybook stories with play functions |
| API integration | Routes, sync, auth, AI mocks | `@cloudflare/vitest-pool-workers` |
| E2E | Golden journeys (below) | Playwright, tablet emulation + desktop |
| Visual | Storybook snapshot of every widget and art component in key states | Playwright screenshots in the pinned Docker image (`visual` job, non-required); update snapshots deliberately |
| Accessibility | axe checks on the parent area (in E2E) and the Storybook widget stories (in `verify`) | `@axe-core/playwright`, Storybook a11y |

### Golden E2E journeys (must all pass before v1 is called done)

| # | Journey | First made green by |
|---|---|---|
| 1 | **Fresh setup:** parent setup wizard → add 2 children → pair the device. | W00 |
| 2 | **Child first run (K profile):** character creator → buddy → name island → placement mini-session → first build → wind-down. | OB1 |
| 3 | **Child first run (G2 profile, "above grade"):** placement reaches grade-3 skills. | OB1 |
| 4 | **Returning session:** pick profile → first math interaction within 10 s (measured) → complete a request in 3 different workshops → build → wind-down at the budget. | I01 (using Practice Pier and any merged workshops; Q01 re-checks with themed workshops) |
| 5 | **Mistake path:** wrong answers trigger the hint ladder, tier step-down and a misconception alert visible in the parent dashboard. | P01 |
| 6 | **Offline:** go offline → play a full request → come online → sync → a second device context sees the island change. | Q01 (D01 delivers the sync integration test underneath) |
| 7a | **AI feedback on/off (mocked provider):** the Glim feedback line appears and speaks; the parent summary renders; with AI off, everything still works with deterministic feedback. | AI1 |
| 7b | **Photo to avatar (mocked provider):** the suggestion pre-fills the creator; the child confirms. | AI2 |
| 8 | **Parent ↔ child:** skill map evidence, override, gift → the child sees the gift → opens it. | I02 |
| 9 | **Backup:** export → wipe local data → import → state restored. | P01 |

## 4. UI evidence (every PR that changes visible UI)

- Screenshots at tablet landscape 1280×800 @2x and desktop 1440×900. Add portrait if the layout differs.
- A short (≤ 60 s) 1× speed video for interactions (Playwright video in an evidence script, separate from the regression tests).
- Attach as private session artifacts (the issue workflow's evidence rules) and reference them in the PR description.

## 5. Definition of done (per issue)

- All acceptance criteria in the issue are delivered (or the remainder is explicitly split out as a follow-up).
- `pnpm verify` and `pnpm e2e` pass locally and in CI on the PR head.
- New or changed contracts are reflected in `docs/spec/02-architecture.md` (or the relevant spec) in the same PR.
- Tests cover the new behaviour at the right layer (§3). Generators have property tests. Widgets have stories.
- UI evidence attached for visible changes.
- Cross-model review completed with findings adjudicated.
- No `TODO` without a linked follow-up issue. No skipped tests without a reason and an issue.
- No new runtime dependency without justification in the PR (bundle budget respected).
- Anything that needs real hardware, the owner's ears, or an outside party (Android Chrome audio quirks, Amazon Kids profiles, voice audition, Google's TTS permission) is **not** an acceptance criterion. List it under "Owner verification" in the PR and the final report.

## 6. Playtest protocol (end of build; for the parent)

`docs/PLAYTEST.md` is created by the final QA issue: a 3-day script for each child (what to watch for, what to note), how to read the dashboard, an **owner verification checklist** (tablet install, Kids profile, audio, voice choice), and a feedback template the parent can paste into a GitHub issue.
