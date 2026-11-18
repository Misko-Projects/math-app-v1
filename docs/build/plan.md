# v1 build plan

There are 34 implementation issues plus an epic. They are defined in [`issues.md`](issues.md) and published by [`publish_issues.py`](publish_issues.py). `python3 docs/build/publish_issues.py --plan` validates the dependency graph and prints the waves below.

## Waves (an issue can start when everything it depends on is merged)

| Wave | Issues | Notes |
|---|---|---|
| 0 | **F01** scaffold | Everything else waits on this. One child, top priority. |
| 1 | C01 content pipeline · S01 API · U01 design system | Three parallel tracks: content, server, UI. |
| 2 | E01 engine core · A01 audio · U02 art kit | |
| 3 | E02 learner model · K01 curriculum K–1 · K02 curriculum 2–3 · U03/U04/U05 widgets · A02 narration pipeline | Widest wave (7). Content and widget issues are large; children should use subagents. |
| 4 | D01 client data · E03 planner/placement | |
| 5 | W00 app shell | Integration hub. |
| 6 | R01 TaskRunner + Practice Pier · CH1 character · P01 parent dashboard | |
| 7 | I01 island hub · AI1 AI services | |
| 8 | WK1–WK7 workshops · I02 residents/festivals · OB1 onboarding · AI2 photo→avatar | Second-widest wave (10). Workshops are independent modules. |
| 9 | Q02 game-feel pass | |
| 10 | Q01 final QA and docs | |

The critical path is F01 → C01 → E01 → E02 → D01 → W00 → R01 → I01 → workshops → Q02 → Q01. Keep it moving first: when capacity is limited, the orchestrator should prioritise critical-path issues over off-path ones in the same wave (U02, A02, CH1, P01, AI1/AI2).

## Coordination rules for parallel work

1. **Contracts first.** F01 lands the type skeletons from 02 §5. Later issues implement them. A PR that must change a contract updates `docs/spec/02-architecture.md` in the same PR, and the orchestrator should avoid running two contract-changing PRs at once.
2. **Registries avoid merge conflicts.** Widgets register in `packages/ui/widgets/registry.ts`, generators in `packages/engine/src/generators/index.ts`, workshops in `apps/web/src/workshops/index.ts`, and content per-strand YAML files. Each registration is one line, so parallel PRs rarely conflict. Rebase on conflicts; don't hand-merge others' logic.
3. **Fixture content** (from C01) unblocks engine, widget and runner work before the full curriculum lands. K01 and K02 replace and extend it without changing schemas.
4. **Workshops never reimplement widgets.** If a workshop needs a widget variation, extend the widget (with stories and tests) in the workshop PR, or file a follow-up.
5. **Secrets:** only A02 and Q01 (narration render), and AI1/AI2 (live smoke tests), use real keys, and only locally. Everything else uses mocks.

## Spend guardrails (AI)

| Use | Cap |
|---|---|
| Narration rendering (Gemini Batch TTS), whole campaign | ≤ $10 (expected ≈ $2–4) |
| Live AI smoke tests (Claude), whole campaign | ≤ $5 |
| Runtime feedback during local playtests | Governed by the app's `AI_MONTHLY_BUDGET_USD` (default $10) |

If a key is missing, the issue still completes with stub or mock providers and records "live run pending a key" in its PR and final report. That is not a blocker.

## Human-only items (outside the campaign)

- Add keys to `~/.config/math-app-v1/secrets.env` (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
- Ask Google whether build-time narration rendering for a children's app is permitted (07 §3). If not, switch to `NARRATION_PROVIDER=kokoro`.
- Pick the narrator and Pip voices from `pnpm narration:audition` output (defaults are used until then).
- Playtest with the kids using `docs/PLAYTEST.md`, then file feedback as issues.
- Deploy to Cloudflare later (`docs/DEPLOY.md`).
