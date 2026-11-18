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
| `pnpm test` | Vitest across packages (unit + property + API pool) |
| `pnpm test:sim` | Engine simulated-learner suite (04 §8). It runs in CI on a nightly schedule and on PRs touching `packages/engine` |
| `pnpm content:build` / `pnpm content:validate` | 03 §9 |
| `pnpm e2e` | Playwright (Chromium desktop + Android-tablet emulation) against `pnpm preview:full` |
| `pnpm storybook` | Widgets, avatar, art gallery |
| `pnpm narration:render` | Render missing narration clips (07 §3; `gemini` needs a key, `kokoro` runs locally; never in CI) |
| `pnpm secrets:link` | Writes `apps/api/.dev.vars` from the user-owned secrets file (08 §6) |
| `pnpm verify` | typecheck + lint + test + content:validate + build (what CI runs before e2e) |

## 2. CI (GitHub Actions, `.github/workflows/ci.yml`)

- Triggers: `pull_request` and `push` to `main`.
- Job `verify`: checkout → pnpm setup with cache → `pnpm i --frozen-lockfile` → `pnpm verify`.
- Job `e2e` (needs `verify`): install Playwright Chromium → `pnpm e2e` → upload the report and failure traces as artifacts.
- Job `bundle-size`: build, then assert the 02 §6 budgets with a small script (fails on regression).
- No secrets in CI. Provider calls are mocked. Narration audio is optional in CI: missing clips fall back to Web Speech (stubbed in tests).
- Keep total CI time ≤ 12 min. The check names `verify`, `e2e` and `bundle-size` are stable; PRs are mergeable only when all three pass.

## 3. Test layers

| Layer | Scope | Tooling |
|---|---|---|
| Unit | Engine formulas, generators, folds, schemas, API handlers | Vitest |
| Property | Every generator (500 seeds per template: valid answer, constraints hold, difficulty is finite); fold order-independence; inventory never negative; planner invariants | fast-check |
| Simulation | Placement accuracy, accuracy band, review timing (04 §8) | Vitest + engine sim harness |
| Component | Each widget: render per tier, tap-to-place path, drag path, keyboard path, emits the correct `ResponseValue` | Vitest + Testing Library; Storybook stories with play functions |
| API integration | Routes, sync, auth, AI mocks | `@cloudflare/vitest-pool-workers` |
| E2E | Golden journeys (below) | Playwright, tablet emulation + desktop |
| Visual | Storybook snapshot of every widget and art component in key states | Playwright screenshot comparisons (threshold-based) on Storybook; update snapshots deliberately |
| Accessibility | axe checks on the parent area and the Storybook widget stories | `@axe-core/playwright` |

### Golden E2E journeys (must pass before v1 is called done)

1. **Fresh setup:** parent setup wizard → add 2 children → pair the device.
2. **Child first run (K profile):** character creator → buddy → name island → placement mini-session → first build → wind-down.
3. **Child first run (G2 profile, "above grade"):** placement reaches grade-3 skills.
4. **Returning session:** pick profile → first math interaction within 10 s (measured) → complete a request in 3 different workshops → build → wind-down at the budget.
5. **Mistake path:** wrong answers trigger the hint ladder, tier step-down and a misconception alert visible in the parent dashboard.
6. **Offline:** go offline → play a full request → come online → sync → a second device context sees the island change.
7. **AI on (mocked provider):** feedback line appears and speaks; photo-to-avatar pre-fills the creator; the parent summary renders. **AI off:** everything still works with deterministic feedback.
8. **Parent:** skill map evidence, override, gift → the child sees the gift → opens it.
9. **Backup:** export → wipe local data → import → state restored.

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

## 6. Playtest protocol (end of build; for the parent)

`docs/PLAYTEST.md` is created by the final QA issue: a 3-day script for each child (what to watch for, what to note), how to read the dashboard, and a feedback template the parent can paste into a GitHub issue.
