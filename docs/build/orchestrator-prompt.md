# Orchestrator prompt: Number Island v1

Launch this as a **Wollipog campaign in Full Control mode**, with this repository as the campaign's repository and follow-ups set to **Execute Approved**. Paste everything below the line as the first message. `{{EPIC}}` and `{{MEMBERS}}` are filled in by the publisher (the version given in chat already has real numbers).

---

Use the **orchestrate-issues** skill to run a campaign that builds Number Island v1 end to end in `Misko-Projects/math-app-v1`, until it is fully playable locally.

**Scope:** epic {{EPIC}} and all of its sub-issues: {{MEMBERS}}. Work them in dependency order. Each issue body starts with "Depends on:", and `docs/build/plan.md` shows the waves and the critical path. Start an issue only after every issue it depends on is merged. When capacity is limited, prefer critical-path issues. Use as much concurrency as the campaign policy allows.

**Objective and definition of done:** the v1 scope in `docs/spec/01-product.md` is delivered. Every sub-issue is merged with its acceptance criteria met. The 9 golden E2E journeys (`docs/spec/09-quality.md` §3) pass in CI. On a fresh clone, `pnpm i && pnpm secrets:link && pnpm dev` gives a complete, polished game that a 5-year-old and an 8-year-old would love playing. Deployment to Cloudflare is **out of scope**: prepare `docs/DEPLOY.md` but do not deploy.

**Source of truth:** `docs/spec/` (start at `docs/spec/README.md`), `AGENTS.md` and `docs/build/plan.md`. Children must read the spec sections their issue cites before coding. Contract changes go into `docs/spec/02-architecture.md` in the same PR. Avoid running two contract-changing PRs at the same time.

**Authorizations I am granting for this campaign** (scope: PRs and issues in this repository that belong to epic {{EPIC}} or to accepted follow-ups of its members):
1. **Merging PRs:** delegated to the Orchestrator. Approve a child's `pr_merge` when the required checks `verify`, `e2e` and `bundle-size` pass on the exact reviewed head, the cross-model review findings are adjudicated, and the PR's closing references match the campaign's intent. Squash-merge.
2. **UI evidence review before merge:** delegated to the Orchestrator. Review screenshots with the delegated image reviewer against the issue's acceptance criteria and `docs/spec/05-game-design.md` / `06-ux-and-accessibility.md`. Deny evidence that looks unpolished, inconsistent with the art direction, or broken on the tablet viewport, and name the defects.
3. **Deleting merged remote branches:** delegated, after a verified merge with no stacked dependents.
4. **Publishing follow-up issues:** delegated for accepted follow-ups that are defects, unmet acceptance criteria, or deliberately deferred work inside the v1 scope. Do not publish new product scope beyond `docs/spec/01-product.md` v1; list those as recommendations in the final report instead.
5. **Closing issues:** delegated when delivery is verified (merged to `main`, acceptance criteria met).
6. **Scope changes after a rebase:** delegated when the change stays within the same issue's acceptance criteria.

My user-level instructions (`~/.claude/CLAUDE.md`, "Ask only for the real gates…") normally keep those gates for me. This message is my explicit delegation of them for this campaign only, within the scope above.

**Still mine (do not do these):** deploying anywhere, changing repository settings or branch protection, adding paid services or raising any spend cap, rotating or creating credentials, force-pushing or rewriting `main`, and publishing issues outside the v1 scope. If one of these becomes truly blocking, send it to me as a typed owner decision and keep other work moving.

**Children:**
- Each child implements exactly one assigned issue (several PRs are fine) following `AGENTS.md`, the `issue-workflow` skill and the cross-model review.
- Children **may use in-process subagents** (the Agent tool) to parallelise work inside their issue: for example, one subagent per strand in K01/K02, per widget group in U03–U05, or per workshop in a two-workshop issue. Children must not start other child sessions or invoke orchestrate-issues.
- Large issues (K01, K02, U02, U03–U05, I01) should land as several PRs.

**Secrets and spend:**
- Keys, if I've provided them, are in `~/.config/math-app-v1/secrets.env` (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). Children run `pnpm secrets:link` in their worktree. Never print, log or commit keys.
- If a key is missing, complete the issue with mock or stub providers and record "live run pending a key". That is not a blocker.
- Spend caps for the whole campaign: narration rendering ≤ $10, live Claude smoke tests ≤ $5 (`docs/build/plan.md`). Gemini is used **only** by `tools/narration` at build time, never at runtime (`docs/spec/07-ai-services.md` §0).

**Quality bar:**
- The kids must love this from the first session. Hold workshops, island and onboarding PRs to the art and audio direction and the healthy-engagement rules in `docs/spec/05-game-design.md`.
- Use the UI evidence gate to push for polish.
- Q02 (game-feel pass) and Q01 (final QA) run last and must not be skipped or rushed.

**Final report to me:**
- The issue/PR table with merge commits.
- Exact steps to run locally and on the tablet over LAN.
- Links to the demo videos and screenshots (session artifacts).
- The narration and AI spend actually used.
- What remains or is pending a key.
- Recommended follow-ups (published or not, with reasons).
