# v1 build issues

Each issue starts with an HTML comment header holding its `key`, `labels` and `depends` fields. `docs/build/publish_issues.py` parses this file, creates the issues in dependency order, replaces each `{{KEY}}` with the real `#number`, and attaches every issue as a sub-issue of the epic. Titles are the `##` headings.

Conventions for every issue (each body also repeats them via the template footer):
- The specs in `docs/spec/` are the source of truth, and each issue cites its sections.
- Follow `AGENTS.md`, the issue workflow, and the definition of done in 09 §5.
- Reference issues as `Refs #N` in commits and PRs.
- **Narration ownership:** every issue that adds child-facing UI authors its own narration keys, in `packages/content/narration/ui.yaml` (`ui.*`) or `game.yaml` (`game.*`, `req.*`, `res.*`) (03 §4.1).
- **Owner verification:** checks that need real hardware, the owner's ears or an outside party are never acceptance criteria. List them under "Owner verification" in the PR (09 §5).

<!-- issue key=EPIC labels=epic,v1 depends= -->
## Epic: Number Island v1, playable locally

Build v1 of Number Island as specified in `docs/spec/`: an adaptive, game-based K–3 math app (schema ready for K–12) that the kids can play daily on Android tablets and desktop browsers, against a locally running server.

**Done when** every member issue below is delivered, the golden E2E journeys in 09 §3 pass, and `pnpm dev` gives a complete, delightful experience (01 §v1 scope). Deployment to Cloudflare is out of scope; it gets prepared but is not executed.

Dependency graph and waves: `docs/build/plan.md`.

## Sub-Issues
{{MEMBERS}}

<!-- issue key=F01 labels=v1,area:infra depends= -->
## Scaffold monorepo, shared contracts, tooling and CI

Set up the workspace that every other issue builds in, including **every shared type**.

**Spec:** 02 §1–§3, §4, §5 (all, including §5.8), §7; 08 §6; 09 §1–§2.

**Scope**
- pnpm 10 workspace with Node 24 (`.nvmrc`, `packageManager`): `apps/web`, `apps/api`, `packages/{shared,content,engine,ui}`, `tools/{narration,content-check}`, `e2e/`, with TS project references, strict config and path aliases.
- `packages/shared`: **every type in 02 §5.1–§5.8 and the types 03 references** (03 §1, §5.1, §5.2, §6.1), with Zod schemas: ids (uuidv7), `EventEnvelope`, `EventPayloads` for every event type, content types, items/responses, GameData, settings (with `withSettingDefaults`), AvatarSpec, learner/projection types, API DTO stubs (08 §2). Types only; behaviour comes later.
- `apps/web`: React 19 + Vite + Tailwind v4 + React Router 7 "hello island" page; `vite-plugin-pwa` wired with an empty precache; Andika and Baloo 2 via @fontsource.
- `apps/api`: Hono on Workers with `wrangler.jsonc` (D1 binding, vars from 08 §6), `GET /api/health`, and `@cloudflare/vitest-pool-workers` set up.
- Every command in 09 §1 (with `verify` in the 09 §1 order), as working stubs where the feature doesn't exist yet. These include `dev` (Vite + wrangler with the `/api` proxy), `dev:lan`, `dev:https`, `preview:full`, `content:sample`, `narration:audition`, `ai:smoke`, `visual:update`, and `secrets:link` (reads `${MATH_APP_SECRETS:-~/.config/math-app-v1/secrets.env}`, writes `apps/api/.dev.vars`, and never fails when the file is missing).
- Biome config. Import-boundary lint for the 02 §2 direction (`shared ← content ← engine ← ui ← web`; `shared, engine ← api`). Vitest workspace. Playwright config with Chromium desktop plus an Android-tablet emulation project. Storybook in `packages/ui`.
- GitHub Actions `ci.yml`: required jobs `verify`, `e2e`, `bundle-size`; non-required `visual` (pinned Playwright Docker image) and `nightly` (`schedule:`) per 09 §2. The bundle-size script reads its budgets from a JSON file.
- `AGENTS.md` (update the commands section with the real commands), `CLAUDE.md` pointing to AGENTS.md, `LICENSE` (MIT), a `LICENSES-ASSETS.md` stub (fonts listed; later issues append), `.gitignore` (including `.dev.vars`).

**Acceptance criteria**
- [ ] A fresh clone passes `pnpm i && pnpm verify && pnpm e2e` locally and in CI.
- [ ] `pnpm dev` serves the web app, and `/api/health` returns JSON through the proxy.
- [ ] Every type in 02 §5 (including all `EventPayloads`) exists in `packages/shared` with a Zod schema, and a test round-trips a sample of each event type.
- [ ] The boundary lint fails if `packages/engine` imports React or `window`, or if `packages/content` imports `packages/engine`.
- [ ] The CI checks `verify`, `e2e` and `bundle-size` run and pass on the PR; `visual` and `nightly` exist.
- [ ] `docs/spec/02-architecture.md` is updated if any contract shape had to change.

<!-- issue key=C01 labels=v1,area:content depends=F01 -->
## Content pipeline: YAML compiler, compiler validators, fixtures, game data, narration manifest

**Spec:** 03 §2, §4, §8, §9 (compiler checks), §9.5; 02 §5.1, §5.5, §5.8.

**Scope**
- The YAML → JSON compiler (`pnpm content:build`) in `packages/content`, using the schemas from `packages/shared`. It produces `dist/{skills,templates,misconceptions,narration,graph,standards,contexts,game,manifest}.json` and `contentVersion` (03 §9.1).
- `pnpm content:validate` with the **compiler checks** V01–V12, V16–V21, V23, V24 and V26. V20 is gated by `graph.yaml: coverageGrades` (03 §9.2). The engine checks are skipped with a notice until {{E01}} adds `tools/content-check`.
- The standards code lists (`standards/*.txt`, `wi-exceptions.yaml`); `narration/wordlist-k1.txt`, `wordlist-2.txt` and `denylist.txt`; an `outlines.yaml` stub; `narration/ui.yaml` and `narration/game.yaml` skeletons.
- `numberClips` in `packages/shared/src/narration/` (03 §8.3, full ±1,000,000 range) with table tests.
- The fixture content set exactly as in 03 §9.5 (`coverageGrades: []`), plus fixture game data (a few buildings, residents, materials) in `packages/content/game/`.

**Acceptance criteria**
- [ ] Invalid fixtures (cycle, dangling prerequisite, missing narration, an uncovered code in a covered grade) fail validation with clear messages; tests cover each compiler rule.
- [ ] The fixture content builds deterministically (V24: same input, byte-identical output).
- [ ] `content:validate` runs in `pnpm verify` and passes on the fixture set.

<!-- issue key=E01 labels=v1,area:engine depends=C01 -->
## Engine core: RNG, generator registry, item generation, checking, targeting, content-check

**Spec:** 02 §5.2, §7; 03 §5, §9.2–§9.5; 04 §2.2, §2.4.

**Scope**
- A seeded RNG (`engine/rng.ts`), the `GeneratorId` registry, `generateItem`, `checkResponse` with misconception (buggy-rule) matching, `detectProcessMisconceptions`, hint ladders, difficulty features, and the parameter search toward a target difficulty.
- **Exactly the five reference generators** in 03 §9.5: `count.set`, `count.sequence`, `subitize.flash`, `bond.parts`, `addsub.facts`.
- The format state models (03 §6.3) and per-format widget Zod schemas (03 §9.4 step 3) for the **11 fixture formats** in 03 §9.5.
- `tools/content-check`: V13–V15, V22, V25 and `template-stats.json`, plus `pnpm content:sample` (prints 3 rendered items per strand). Also the engine hooks in 03 §9.3, and the property-test harness (`CONTENT_PROPERTY_N`; 100 on PRs, 500 nightly).

**Acceptance criteria**
- [ ] No `Math.random` or `Date.now` in the engine (lint rule).
- [ ] Each reference generator passes the 03 §9.4 property test; targeting lands within ±0.5 logit of the target in ≥ 90% of seeds when feasible.
- [ ] The full `content:validate` (compiler + engine checks) passes on the fixture set.
- [ ] Misconception matchers for the fixture misconceptions, unit-tested.
- [ ] The documented API and how to add a generator are in `packages/engine/README.md`.

<!-- issue key=E02 labels=v1,area:engine depends=E01 -->
## Learner model and projections: Elo rating, mastery ladder, FIRe-lite memory, folds

**Spec:** 04 §2–§4, §7; 02 §4.3, §5.3, §5.8.

**Scope:**
- The `LearnerModel` `elo-fire-v1`: context weights (04 §2.3), mastery status rules (including gateway, fluency, test-out, demotion and overrides), memory intervals with implicit credit, failure propagation, review compression and transfer probes.
- Deterministic incremental folds: `foldSkillStates` (including the placement prior from `placement.completed`), `foldInventory` (clamps at 0; buildings never un-built), `foldIsland`, `foldCollection` and `foldGoals`. They use the 02 §5.8 types, with the fixture subset of `GameData` from {{C01}}.
- Parameters in `engine/src/params.ts`.
- Dashboard-derived signals (04 §7) as pure functions.

**Acceptance criteria**
- [ ] Table-driven unit tests for every formula and status rule.
- [ ] Property tests: fold order-independence, incremental equals full fold, inventory clamped at 0, and buildings never un-built.
- [ ] A golden replay test from a recorded fixture log (≥ 2,000 synthetic events).

<!-- issue key=E03 labels=v1,area:engine depends=E02 -->
## Placement, session planner, in-session adaptation and simulated-learner harness

**Spec:** 04 §5, §6, §8; 02 §5.4, §5.8.

**Scope**
- A placement runner: priors, probe selection, BKT-style update, propagation, stop rules, assumed flags, mini-placement per strand, and `placement.completed` output with resume.
- `planSession`: budgets with the G1/G3 column rule, new-skill scoring, review compression, requests bound to family-wide workshop capabilities with `reward.materials`/`decor`, and the Practice Pier fallback.
- `targetDifficulty`.
- `adaptNext`, exactly per the 02 §5.8 `AdaptInput`/`AdaptDecision` types: retry and hint ladder, show-solution, tier step-down, prerequisite probe, frustration handling, misconception trigger, and wind-down.
- The simulated-learner harness `pnpm test:sim`, reporting the 04 §8 metrics. It runs on the fixture graph now and switches automatically to the full compiled graph when available.

**Acceptance criteria**
- [ ] The 04 §8 simulation thresholds pass on the fixture graph.
- [ ] Planner invariants hold under property tests (budgets, ≤ 3 in a row, every request hostable).
- [ ] Placement runs in ≤ the item budgets for simulated K and G2 profiles.

<!-- issue key=U01 labels=v1,area:ui depends=F01 -->
## Design system, interaction primitives, widget registry and Storybook

**Spec:** 06 §4–§7; 05 §11 (tokens, typography); 02 §5.2 (one widget per format); 03 §6.3 (demo mode).

**Scope**
- Design tokens (palette, spacing, radii, motion, z-layers) as CSS variables plus a Tailwind theme.
- Primitives: `BigButton`, `IconButton` (with a spoken label), `SpeechBubble`, `Panel`, `Sheet`, `NumberDisplay`, `ProductTray`, `HomeButton`, `HintButton`, `ReplayButton`.
- Interaction primitives `useDragToTarget` and `useTapToPlace`, with snap logic, tap-only mode and an adjustable snap radius.
- Reduced-motion handling.
- The **widget registry**: `format → component`, with a typed props contract (`config`, `tier`, `disabled`, `onResponse(ResponseValue)`, `onInteract(InteractionEvent)`, and `demo` with `play`/`invite` for lessons). A placeholder widget for unregistered formats.
- Storybook with a CVD-simulation addon and an axe addon.

**Acceptance criteria**
- [ ] Primitives meet the 06 §4 target sizes per age mode; stories cover each state; axe passes.
- [ ] The drag and tap-to-place primitives work by mouse, touch emulation and keyboard (tests).
- [ ] The widget registry contract is documented, and a sample widget proves it end to end.
- [ ] UI evidence attached.

<!-- issue key=U02 labels=v1,area:art depends=U01,C01 -->
## Art kit and game data: island, buildings, the guide, Glim, Pebblings, decor, effects

**Spec:** 05 §1, §3–§6, §9 (buddy), §11; 07 §7 (Glim); 02 §5.8 (GameData).

**Scope**
- An art style guide page in Storybook.
- SVG React components for:
  - island terrain tiles and sea, with parallax layers and day/sunset;
  - the numbered road stones;
  - all 13 workshop buildings, plus the Practice Pier, Storehouse, homes and Lighthouse, each under construction and at levels 1–3;
  - **the guide** (idle, talk, point, cheer, think) and **Glim**, the lantern-robot helper;
  - a **procedural Pebbling generator** (species × colour × number → a critter with a 2×5 ten-frame pebble shell, plus the teens and tens families);
  - a decor set (≥ 30 items);
  - effects (sparkle, confetti, firefly, splash) using Motion, with Pixi only for particles.
- **Game data** in `packages/content/game/*.yaml`, validated against `GameData` and compiled by C01: every building with recipes, levels and unlock rules (05 §4 Unlock column), ≥ 40 named Pebblings (including starter buddies), decor, materials, island rings and road stones, festivals and outfit unlocks.
- Append to `LICENSES-ASSETS.md` if any asset is not original.

**Acceptance criteria**
- [ ] Every component renders in an "Art Gallery" Storybook with state controls; visual snapshots exist (the `visual` job).
- [ ] Game data validates and covers every workshop in 05 §4 and every material in their `produces`.
- [ ] The originality rule in 05 §1 is respected (no likeness to existing IP).
- [ ] The palette and CVD rules hold (05 §11, 06 §7). Reduced motion is respected.
- [ ] UI evidence (gallery screenshots plus a short idle-animation video) attached.

<!-- issue key=U03 labels=v1,area:widgets depends=U01,E01 -->
## Widgets A: number sense formats, plus the Storybook Content Browser

**Spec:** 02 §5.2; 03 §5 (WidgetConfig and state model per format), §6.3, §10.1; 06 §4–§6.

**Formats:** `number-pad`, `tap-count`, `make-set`, `dot-flash`, `numeral-pick`, `compare`, `order`, `tenframe-fill`, `number-bond`, `rekenrek`, `number-line-place`, `number-line-jump`, `hundred-chart`. For formats not in the fixture set (`compare`, `number-line-place`), this issue also owns the format state model and widget Zod schema. The rest come from {{E01}}.

**Also:** the dev-only Storybook **Content Browser** (03 §10.1): pick a template, scrub the seed and target, and see the widget, narration text, hints, answer and difficulty breakdown.

**Acceptance criteria (per widget)**
- [ ] Registered in the widget registry; renders every tier the format supports; supports `demo` mode for lessons.
- [ ] Touch-drag, tap-to-place and keyboard paths all emit the correct `ResponseValue` and an interaction trace (component tests).
- [ ] Tapping objects or numbers speaks names via `AudioManager` (mock in tests).
- [ ] Stories with play functions; axe clean; meets the size rules.
- [ ] UI evidence for all widgets (screenshots plus one interaction video).

<!-- issue key=U04 labels=v1,area:widgets depends=U01,E01 -->
## Widgets B: place value, operations, equality and puzzles

**Spec:** as U03.

**Formats:** `base-ten-build`, `base-ten-trade`, `expanded-form`, `array-build`, `equal-groups`, `equal-share`, `area-tiles`, `balance`, `story-problem`, `puzzle-grid`. This issue owns their format state models and widget Zod schemas.

**Acceptance criteria:** the same per-widget criteria as {{U03}}. Base-ten fuse/trade animations are clear at 30 fps. `puzzle-grid` supports mini-KenKen (3×3, 4×4), magic square and missing-number grid variants.

<!-- issue key=U05 labels=v1,area:widgets depends=U01,E01 -->
## Widgets C: fractions, time, money, measurement, geometry, patterns, data

**Spec:** as U03.

**Formats:** `fraction-cut`, `fraction-pick`, `fraction-line`, `clock-set`, `clock-read`, `coin-pay`, `coin-count`, `make-change`, `measure-length`, `compare-length`, `perimeter-walk`, `shape-compose`, `shape-sort`, `pattern-extend`, `bar-graph-read`, `bar-graph-build`. This issue owns their format state models and widget Zod schemas.

**Acceptance criteria:** the same per-widget criteria as {{U03}}. Clock hands are geared (the hour hand moves with the minute hand). Coins are US currency in recognisable, original vector art (no copyrighted imagery), and their values are spoken.

<!-- issue key=A01 labels=v1,area:audio depends=F01,C01 -->
## Audio system: AudioManager, narration stitching, Web Speech fallback, SFX and music

**Spec:** 02 §5.5; 03 §8; 05 §12; 06 §5; 07 §3 (runtime parts).

**Scope**
- An `AudioManager` on Web Audio: unlock on gesture, a ducking bus for voice, SFX and music, and cancel/queue semantics per 06 §5.
- Narration lookup from `narration.json`, with slot tokens and number composition via the shared `numberClips` (full range).
- Clip resolution through `apps/web/public/audio/manifest.json`. A missing manifest or clip is tolerated and falls back to Web Speech per line, with a dev warning.
- `sayPhrases` (phrase-bank clips plus number slots) and `sayText` (on-device Web Speech only, with a distinct Glim voice choice).
- A procedural SFX synth covering every SFX in 05 §12.
- Music playback with loops and crossfade, procedural or CC0, with licences appended to `LICENSES-ASSETS.md`.
- A volume and voice-rate settings model (`FamilySettings`).

**Acceptance criteria**
- [ ] Unit tests with a mocked AudioContext: clip stitching order, cancellation, ducking, fallback (including no manifest).
- [ ] A Storybook "Audio Lab" page plays every SFX, sample narration and the number composer.
- [ ] Works in desktop Chromium and Firefox. Android Chrome behaviour is an owner-verification item.

<!-- issue key=A02 labels=v1,area:audio,area:ai depends=C01,A01 -->
## Narration render pipeline (build-time TTS: Gemini, swappable to Kokoro)

**Spec:** 07 §3; 03 §8; 02 §5.5 (audio manifest).

**Scope**
- `tools/narration` extracts every narration line and number-word clip from the content build.
- A renderer interface with three providers:
  - `gemini` (`gemini-3.8-flash-tts`): interactive calls for < 200 clips, Batch API otherwise, polling up to ~4 h, resumable.
  - `kokoro`: local; the model downloads on first local use and never in CI.
  - `stub`.
- **Default voices:** narrator `Sulafat`, the guide `Puck`, Glim `Achird`, recorded in `narration/voices.yaml`.
- `pnpm narration:audition`.
- Encode to Opus with `ffmpeg-static`.
- Content-hash the clip file names and write `apps/web/public/audio/` plus `manifest.json` (02 §5.5). **Commit the rendered audio** to the repo.
- Idempotent and resumable, with concurrency and a spend cap (`--max-usd`, default 5). `--dry-run` reports counts and estimated cost.

**Acceptance criteria**
- [ ] `pnpm narration:render --dry-run` lists the counts and cost estimate; without a key it exits cleanly with instructions.
- [ ] The stub provider produces a valid manifest that A01 plays (tested in CI).
- [ ] With a key (not in CI), it renders the narration that exists at the time, and the game plays it. Report the actual cost. Without a key, record "live render pending a key".
- [ ] Re-running renders nothing new (idempotent). Changed text renders only the changed clips.

<!-- issue key=K01 labels=v1,area:content depends=C01,E01 -->
## Curriculum K–1: skills, templates, generators, misconceptions, lessons, narration

**Spec:** 03 (catalog tables for the strands below, §4–§8, §10); 04 §3 (mastery inputs).

**Strands and grades:** all K and grade-1 skills in 03: CNT, SUB, CMP, CPS, ADD (K–1, including strategy nodes), PV (grade 1), MEA (K–1), TIM (grade 1), GEO (K–1), ALG (K–1), DAT (K–1), plus the K–1 rows of FRA, MUL and PUZ (03 §3.20).

**Scope**
- Skill YAML, templates, misconceptions, lesson specs and narration for those skills.
- **Ownership rule:** K01 implements **every generator whose "Used by" column (03 §5.6) includes any K–1 skill**, even if grade 2–3 skills also use it. It also creates the shared content files (`narration/common.yaml`, the `misconceptions/*.yaml` area files, and strand files such as `skills/PV.yaml` that span grades), so {{K02}} only appends.
- Replace the 03 §9.5 fixtures with the full catalog entries. Set `graph.yaml: coverageGrades: [K, 1]`.
- Use subagents to parallelise strands. One PR per strand group is fine.

**Acceptance criteria**
- [ ] `pnpm content:validate` passes with the full K–1 catalog from 03 (coverage for K and 1). The skill count matches 03 ±5%.
- [ ] Every template passes the 500-seed property test (`CONTENT_PROPERTY_N=500`, run in the PR description).
- [ ] `pnpm content:sample` output (3 items per strand) pasted in the PR.

<!-- issue key=K02 labels=v1,area:content depends=C01,E01,K01 -->
## Curriculum grades 2–3 plus stretch: skills, templates, generators, misconceptions, lessons, narration

**Spec:** as {{K01}}.

**Strands and grades:** all grade 2–3 skills in 03 (PV, MDA, MUL including division, FRA, DEC, MEA, TIM, MON, DAT, GEO, ALG, PUZ), plus the grade-4 stretch skills and the G6 enrichment skill. Use the "Gr" column in 03 §3. Generators already built by {{K01}} are reused and extended, never duplicated.

**Acceptance criteria**
- [ ] The same as {{K01}} for these strands, with `graph.yaml: coverageGrades: [K, 1, 2, 3]` (plus the grade-4 codes the stretch skills name).
- [ ] `pnpm test:sim` passes the 04 §8 thresholds on the **full compiled graph**.

<!-- issue key=S01 labels=v1,area:api depends=F01 -->
## API: setup, auth, device pairing, sync, export/import, D1 schema

**Spec:** 08 §1–§6, §9; 02 §4.2.

**Scope**
- Drizzle schema and migrations (08 §5).
- Routes: `/setup`, `/auth/*`, `/devices/*`, `/sync`, `/export`, `/import`, `DELETE /children/:id`.
- Rate limiting, and PBKDF2 hashing (≤ 100k iterations).
- Cookies set `Secure` if and only if the request is HTTPS.
- Device tokens; cursor paging; idempotent inserts.
- Clock-skew clamp, storing the original in the envelope's `clientTs`.
- Validation: strict for the envelope and for known-type payloads; unknown types stored opaquely.
- The `child.deleted` tombstone.
- Seed and reset scripts for local dev.

**Acceptance criteria**
- [ ] Every route has integration tests in the Workers pool (08 §9), including sync idempotency, paging across > 1,000 events, an unknown event type relayed unchanged, and login over plain HTTP on a LAN address.
- [ ] A contract test matches the shared schemas.
- [ ] `pnpm dev` with an empty local D1 runs the migrations automatically.

<!-- issue key=D01 labels=v1,area:data depends=E02,S01 -->
## Client data layer: Dexie store, projections cache, sync client, backup

**Spec:** 02 §4.3–§4.4, §5.8; 08 §4.

**Scope**
- The Dexie schema.
- An event store with an append API: validates with the shared schemas and stamps device and family ids and the content version.
- A projection cache that rebuilds when the version changes.
- React hooks: `useSkillStates(childId)`, `useIsland()`, `useInventory()`, `useProfiles()`, `useSettings()` (with defaults).
- A sync client: push/pull loop, backoff, triggers per 08 §4, and never blocks the UI.
- `storage.persist()`.
- Export/import as JSON.
- Tombstone handling.

**Acceptance criteria**
- [ ] Unit tests with `fake-indexeddb`: append/fold/cache, rebuild on version bump, export/import round trip.
- [ ] A sync integration test against the S01 API (Workers pool or local wrangler): two simulated devices converge to an identical island. This underpins golden journey 6.
- [ ] Offline behaviour: queued events survive a reload and sync later.

<!-- issue key=W00 labels=v1,area:app depends=U01,D01,S01,A01 -->
## App shell: routing, profile picker, picture password, parent gate, setup wizard, session lifecycle, PWA

**Spec:** 06 §2–§3 (Profile Picker, Setup Wizard, parent gate), §5, §8; 08 §3; 02 §3.

**Scope**
- Route map (child and parent areas) and providers (audio, data, settings).
- First-run detection and the Setup Wizard, which calls `/setup` and pairs this device. Pairing an additional device by code.
- The Profile Picker with picture passwords, and audio unlock.
- The parent gate (hold + PIN).
- Session lifecycle: start/end events, time budget, wind-down hook, daily cap, quiet hours.
- **The PWA manifest and app icons** (original art).
- A service worker that precaches the shell, the content JSON (fetched as assets, not bundled) and audio, supports offline use, and follows the update-on-next-launch rule.
- A diagnostics page (local errors).

**Acceptance criteria**
- [ ] Golden journey 1 (fresh setup) passes.
- [ ] The app installs as a PWA and loads offline in Playwright (service worker test).
- [ ] The parent gate blocks children (it can't be passed by taps alone).
- [ ] UI evidence attached.

<!-- issue key=R01 labels=v1,area:app depends=W00,E03,A01 -->
## TaskRunner, lesson player, feedback flow and Practice Pier

**Spec:** 02 §5.6, §5.8 (`RunnerTask`, `AdaptInput`); 04 §2.3, §6.4; 06 §6; 03 §5.7, §6 (lessons); 05 §4 (Practice Pier).

**Scope**
- The `TaskRunner` implementation. Per item it runs: `targetDifficulty` at presentation → generate → present (answer hidden) → measure latency from item ready → check, plus `detectProcessMisconceptions` → write the attempt event (`partialCredit`, `representation`, context) → update projections → `adaptNext` → hints → misconception triggers → `material.produced` → wind-down (finish the current item, then end the request).
- The lesson player: worked, faded and scaffolded steps drive widgets in demo mode, with narration and `lesson.step` events.
- The deterministic feedback flow: diegetic cue → narration → hint ladder.
- The AI feedback hook (`onAiFeedback`; a no-op until {{AI1}}).
- Math-density timing.
- **Practice Pier**, the generic workshop hosting every registered format, with a dev "content browser" mode to play any skill.

**Acceptance criteria**
- [ ] With fixture content, a full request can be played in Practice Pier, and attempt events and projections update correctly (integration test).
- [ ] The hint ladder, show-solution, tier step-down, prerequisite probe and frustration rules are observable in tests.
- [ ] Math density is recorded per session.
- [ ] UI evidence (video of a request including a mistake path).

<!-- issue key=CH1 labels=v1,area:character depends=W00,U01,U02 -->
## Character: avatar renderer and creator, plus buddy selection

**Spec:** 05 §9; 06 §2 (Character Creator); 02 §5.8 (`AvatarSpec`, `AvatarSuggestion`).

**Scope**
- The avatar option lists (`packages/shared/src/avatar/options.ts`).
- A layered SVG avatar renderer with idle animations and expressions.
- The creator UI: the categories in 05 §9, a random button, live preview, and unlock states from `GameData.outfits`.
- Buddy selection from the starter Pebblings (art from {{U02}}).
- `avatar.updated` events, and avatar use in the Profile Picker.
- An entry point for {{AI2}} to pre-fill an `AvatarSuggestion`.

**Acceptance criteria**
- [ ] Every attribute combination renders without layering glitches (a visual test over a sampled set of 200 random specs).
- [ ] The inclusive options in 05 §9 are present.
- [ ] Creator flows work with tap-only. UI evidence attached.

<!-- issue key=I01 labels=v1,area:island depends=W00,U02,R01,E03 -->
## Island hub: map, numbered road, requests, Storehouse, building, decorate, wind-down

**Spec:** 05 §2–§4 (design rules 7–8), §6, §8; 06 §2 (Island, Build/Decorate, Wind-down); 04 §6.3 (re-planning).

**Scope**
- Island map rendering from `foldIsland`: plots, expansion rings, parallax, day/sunset, and `island.named`.
- The numbered road, with counting-aloud movement and `road.extended`.
- Request bubbles from `planSession`: the recommended request highlighted, ≤ 10 s to the first problem with chunk prefetch, and **re-planning after each request**.
- Family-wide evaluation of `UnlockRule`s.
- Workshop entry and exit transitions.
- The Storehouse display (ten-frame and base-ten piles).
- Building recipes, placement, construction animation and upgrades.
- Decorate mode with the non-math time cap.
- Shared-island rendering of both avatars and the contribution badges.
- The wind-down scene with a spoken recap.
- Workshop registration plumbing (02 §5.6).

**Acceptance criteria**
- [ ] Golden journey 4 passes, using Practice Pier and any merged workshops. The first math interaction is ≤ 10 s, measured in a test.
- [ ] Building consumes materials correctly; the inventory is clamped at 0; the decor cap is enforced.
- [ ] Two children's events render on one island (test with seeded events).
- [ ] UI evidence (screenshots plus video).

<!-- issue key=I02 labels=v1,area:island depends=I01,P01 -->
## Residents, Collection Book, festivals and Storm Watch, weekly goals, gifts and milestones

**Spec:** 05 §5, §7; 02 §5.8 (events).

**Scope**
- Pebbling arrivals (homes and ferry tickets) with personalities and lines.
- The Collection Book, and the buddy following the avatar.
- The weekly goal jar (accumulate-only).
- Festivals plus the co-op **Storm Watch** mixed-review event, run through the `TaskRunner`.
- Gift opening for gifts left in {{P01}} (`gift.left` → the child opens it; the message is read via `sayText`).
- Milestone treasure-chest cards (`milestone.defined` / `milestone.reached`).
- Mastery moments.

**Acceptance criteria**
- [ ] Golden journey 8 passes (parent gift and override → the child sees and opens the gift).
- [ ] Collection progress comes only from building and helping (test).
- [ ] Storm Watch can't fail; it completes when its items are done; both kids' contributions count.
- [ ] Weekly goals never decrease (property test on the fold).
- [ ] UI evidence attached.

<!-- issue key=OB1 labels=v1,area:onboarding depends=I01,CH1,R01,U03,U04,U05,K01,K02 -->
## Child onboarding and placement adventure

**Spec:** 05 §10; 04 §5; 06 §2.

**Scope:** the first-run sequence:
1. Meet the guide.
2. Create the character and pick a buddy.
3. Name the island.
4. The placement adventure: game-framed scenes using the real widgets, split into mini-sessions for K, with an "I haven't learned this" option and a frustration stop.
5. The first build.
6. Wind-down.

Also: per-strand mini-placements on first entry to a strand, and resuming an unfinished placement on a later day (via `placement.probe` / `placement.completed`).

**Acceptance criteria**
- [ ] Golden journeys 2 and 3 pass (K profile; G2 above grade reaches grade-3 skills).
- [ ] Placement respects the item budgets and records `placement.probe`, `placement.completed` and `attempt` events.
- [ ] UI evidence (video of the K first run).

<!-- issue key=WK1 labels=v1,area:workshop depends=I01,R01,U03,K01 -->
## Workshops: Road Crew (W1) and Lantern Grove (W2)

**Spec:** 05 §4 (W1, W2 and the workshop design rules); 02 §5.6.

**Acceptance criteria (each workshop)**
- [ ] Implements the module contract; hosts its formats at every supported tier; passes the remove-the-math test (described in the PR).
- [ ] Every correct action produces visible material; the request-complete parade works; lessons run in-world.
- [ ] Road Crew physically extends the island road (`road.extended`).
- [ ] A Playwright test plays one full request with mixed right and wrong answers.
- [ ] Each workshop chunk is within the bundle budget. UI evidence (screenshots plus video per workshop).

<!-- issue key=WK2 labels=v1,area:workshop depends=I01,R01,U03,K01,K02 -->
## Workshops: Ten-Boat Dock (W3) and Treasure Beach (W4)

**Spec:** 05 §4 (W3, W4).

**Acceptance criteria:** as {{WK1}}, plus: the Ten-Boat only sails at exactly 10 and shows why otherwise; Treasure Beach shows hot/cold closeness for estimation formats, including rounding (K02 skills).

<!-- issue key=WK3 labels=v1,area:workshop depends=I01,R01,U03,U04,K01,K02 -->
## Workshop: Brick Factory (W5)

**Spec:** 05 §4 (W5).

**Acceptance criteria:** as {{WK1}}, plus: the fuse and trade animations make regrouping visible; add/subtract orders with regrouping run at all three tiers.

<!-- issue key=WK4 labels=v1,area:workshop depends=I01,R01,U04,U05,K02 -->
## Workshops: Garden Terraces (W6) and Bakery (W7)

**Spec:** 05 §4 (W6, W7).

**Acceptance criteria:** as {{WK1}}, plus: the fence split shows the distributive strategy; remainders go to the seagull; fractions appear on the counter line.

<!-- issue key=WK5 labels=v1,area:workshop depends=I01,R01,U04,U05,K01,K02 -->
## Workshops: Market (W8) and Clock Tower & Ferry (W9)

**Spec:** 05 §4 (W8, W9).

**Acceptance criteria:** as {{WK1}}, plus: ferry tickets cause resident arrivals (`resident.arrived` with `via: 'ferry'`; {{I02}} renders arrivals once merged); the make-change flow supports counting up; Market story problems use the `story-problem` widget.

<!-- issue key=WK6 labels=v1,area:workshop depends=I01,R01,U04,U05,K01,K02 -->
## Workshops: Builder's Yard (W10) and Weigh Station & Lookout (W11)

**Spec:** 05 §4 (W10, W11).

**Acceptance criteria:** as {{WK1}}, plus: balance items include relational-equals forms (`__ = 3 + 4`, `5 + 2 = __ + 3`); bar graph building surveys island residents; both workshops alternate their two products.

<!-- issue key=WK7 labels=v1,area:workshop depends=I01,R01,U03,U04,K01,K02 -->
## Workshops: Rhythm Orchard (W12) and Puzzle Tower (W13)

**Spec:** 05 §4 (W12, W13); 04 §6.5.

**Acceptance criteria:** as {{WK1}}, plus: per-fact adaptive pacing; no visible timer for K; the personal-best ghost only shows when `timedChallenges` is on (G1+); Puzzle Tower is optional and rewards star shards (decor only).

<!-- issue key=AI1 labels=v1,area:ai depends=S01,R01,A01 -->
## AI services: provider layer (OpenAI + Claude), feedback and error diagnosis, phrase bank, Glim, parent summary, budget

**Spec:** 07 (all except §4); 08 §6, §8.

**Scope**
- A server-side provider abstraction with the providers and models chosen in 07, plus mock providers for tests and CI.
- `POST /ai/feedback`: structured input, JSON output, validation and safety filters, deterministic fallback, cache.
- The Glim helper character with disclosure, and the parent AI log (`aiLog`, 07 §7).
- The feedback **phrase bank**: ≈ 150 `ph.*` phrases in `narration/phrases.yaml`, rendered by {{A02}} when a key exists.
- `POST /ai/parent-summary`, with the deterministic template fallback.
- Usage metering and the monthly budget cap, degrading gracefully.
- Family feature flags.
- Client integration: `TaskRunner` (the 5 s window), `AudioManager.sayPhrases` and `sayText`.
- `pnpm ai:smoke`.
- Implement `OpenAIProvider` (feedback and summary defaults) and `AnthropicProvider` (vision, plus a text alternative) per 07 §1. Verify the OpenAI SDK and model ids on developers.openai.com, and load the `claude-api` skill before writing Claude code.
- Enforce the no-personal-data request builder for OpenAI, with its test (07 §8.0). Child-safety safeguards per 07 §8.
- Model defaults: `gpt-6.2-sol`, with automatic fallback to `gpt-6.1-sol` on model-availability errors (07 §1). A mock-provider test covers the 404/403 fallback path, and `/api/health` reports the effective model. Never use `gpt-6-sol`.

**Acceptance criteria**
- [ ] With mock providers, golden journey 7a passes (AI on and AI off).
- [ ] Output validators reject answer leaks on the first wrong attempt, over-length lines, unknown phrase ids and disallowed content (unit tests with adversarial fixtures).
- [ ] The budget cap blocks calls after the limit, and the UI degrades silently for children.
- [ ] `pnpm ai:smoke` is run with a real key (outside CI) and its latency and cost output is in the PR. Without a key, record "live run pending a key".

<!-- issue key=AI2 labels=v1,area:ai,area:character depends=AI1,CH1,W00 -->
## Photo to avatar ("make me from a photo"): Claude vision → creator attributes

**Spec:** 07 §4; 05 §9; 06 §3 (Character photo); 08 §8; 02 §5.8 (`AvatarSuggestion`).

**Scope**
- The parent-area flow: upload or capture → consent note → vision mapping to an `AvatarSuggestion` → preview → send to the child's creator for confirmation.
- No generated likeness images (07 §0, §4).
- Output restricted to creator option ids, with no sensitive inferences.
- Photos processed in memory and never persisted.

**Acceptance criteria**
- [ ] Golden journey 7b passes with a mock vision provider: the suggestion pre-fills the creator, the child confirms, and an `avatar.updated` event is logged.
- [ ] A privacy test: no photo bytes in any storage or log.
- [ ] UI evidence attached.

<!-- issue key=P01 labels=v1,area:parent depends=W00,D01,E02,S01,R01 -->
## Parent dashboard: overview, skill map and evidence, alerts, settings, gifts, devices

**Spec:** 06 §3; 04 §7; 08 §2; 02 §5.8 (settings, gift and milestone events).

**Scope**
- The dashboard per child.
- An interactive skill map by strand (status icons plus colour).
- A skill evidence drawer with overrides (`skill.override`).
- Misconception alerts with suggested offline activities.
- Settings: every 06 §3 item, the `FamilySettings`/`ChildSettings` fields and the feature flags.
- Leaving gifts (`gift.left`, decor plus an optional typed message) and defining real-world milestones (`milestone.defined`).
- Device management.
- AI summary display (a placeholder until {{AI1}} is merged).
- Export/import UI.

**Acceptance criteria**
- [ ] Golden journeys 5 (alert visible) and 9 (backup) pass.
- [ ] The parent area is axe-clean, with WCAG 2.2 AA spot checks.
- [ ] UI evidence attached.

<!-- issue key=Q02 labels=v1,area:polish depends=WK1,WK2,WK3,WK4,WK5,WK6,WK7,I02,OB1 -->
## Game-feel and consistency pass across island and workshops

**Spec:** 05 (all); 06 §5–§6.

**Scope:**
- Play every workshop and flow end to end on tablet emulation and desktop.
- Unify transitions, celebration timing, sound mix, narration pacing and the buddy's reactions.
- Fix janky animations (30 fps floor).
- Check math density ≥ 70% in scripted sessions, and tune the variety of feedback lines.
- Make sure the first 5 minutes for each child feel magical.
- Record findings, fix them, and file follow-ups for anything larger.

**Acceptance criteria**
- [ ] A before/after video for each workshop family.
- [ ] Scripted session telemetry shows math density ≥ 70% and the first problem ≤ 10 s.
- [ ] No console errors in a 20-minute scripted soak run.

<!-- issue key=Q01 labels=v1,area:qa depends=Q02,AI2,P01,A02 -->
## Final integration and QA: golden journeys, performance, accessibility, narration render, docs

**Spec:** 09 (all); 02 §6; 08 §7.

**Scope:**
- Make all golden E2E journeys (09 §3) pass, **including journey 6 (offline + sync)**, and re-check journey 4 with the themed workshops.
- Measure the bundle and performance budgets on tablet emulation with a 4× CPU throttle and report the TTI numbers.
- An accessibility audit.
- A full K–3 narration render via {{A02}}: with a key, commit the audio and report the cost. Without one, verify the Web Speech fallback covers every line and record "pending a key".
- Docs: README, SELF-HOSTING, DEPLOY (prepared, not executed), PRIVACY and PLAYTEST (including the **owner verification checklist**: tablet install, Kids profile, Android audio, voice audition, Google TTS permission), plus completing LICENSES-ASSETS.
- A final bug bash, with fixes.

**Acceptance criteria**
- [ ] All golden journeys (1–9, including 7a/7b) are green in CI.
- [ ] Bundle budgets met; performance numbers reported.
- [ ] A clean clone plus the README quick start gives a playable game in < 10 minutes.
- [ ] A final demo video (≤ 3 min) of a K session and a G2 session.
