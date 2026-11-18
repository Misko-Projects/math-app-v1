# v1 build issues

Each issue starts with an HTML comment header holding its `key`, `labels` and `depends` fields. `docs/build/publish_issues.py` parses this file, creates the issues in dependency order, replaces each `{{KEY}}` with the real `#number`, and attaches every issue as a sub-issue of the epic. Titles are the `##` headings.

Conventions for every issue (each body also repeats them via the template footer):
- The specs in `docs/spec/` are the source of truth, and each issue cites its sections.
- Follow `AGENTS.md`, the issue workflow, and the definition of done in 09 §5.
- Reference issues as `Refs #N` in commits and PRs.

<!-- issue key=EPIC labels=epic,v1 depends= -->
## Epic: Number Island v1, playable locally

Build v1 of Number Island as specified in `docs/spec/`: an adaptive, game-based K–3 math app (schema ready for K–12) that the kids can play daily on Android tablets and desktop browsers, against a locally running server.

**Done when** every member issue below is delivered, the golden E2E journeys in 09 §3 pass, and `pnpm dev` gives a complete, delightful experience (01 §v1 scope). Deployment to Cloudflare is out of scope; it gets prepared but is not executed.

Dependency graph and waves: `docs/build/plan.md`.

## Sub-Issues
{{MEMBERS}}

<!-- issue key=F01 labels=v1,area:infra depends= -->
## Scaffold monorepo, shared contracts, tooling and CI

Set up the workspace that every other issue builds in.

**Spec:** 02 §1–§3, §4.1–§4.2, §5 (types only), §7; 08 §6; 09 §1–§2.

**Scope**
- pnpm 10 workspace with Node 24 (`.nvmrc`, `packageManager`): `apps/web`, `apps/api`, `packages/{shared,content,engine,ui}`, `tools/narration`, `e2e/`, with TS project references, strict config and path aliases.
- `packages/shared`: ids (uuidv7), the `EventEnvelope` and all event payload types with Zod schemas (02 §4.2), API DTO schema stubs (08 §2), and the contract types from 02 §5 exported as types (implementations come later).
- `apps/web`: React 19 + Vite + Tailwind v4 + React Router 7 "hello island" page; `vite-plugin-pwa` wired with an empty precache; Andika and Baloo 2 via @fontsource.
- `apps/api`: Hono on Workers with `wrangler.jsonc` (D1 binding, vars from 08 §6), `GET /api/health`, and `@cloudflare/vitest-pool-workers` set up.
- Every command in 09 §1, as working stubs where the feature doesn't exist yet: `dev` (Vite + wrangler with the `/api` proxy), `dev:lan`, `dev:https`, `preview:full`, `secrets:link` (reads `${MATH_APP_SECRETS:-~/.config/math-app-v1/secrets.env}`, writes `apps/api/.dev.vars`, and never fails when the file is missing).
- Biome config. Import-boundary lint (02 §2 dependency direction). Vitest workspace. Playwright config with Chromium desktop plus an Android-tablet emulation project. Storybook in `packages/ui`.
- GitHub Actions `ci.yml` with jobs `verify`, `e2e` and `bundle-size` (09 §2). The bundle-size script reads its budgets from a JSON file.
- `AGENTS.md` (update the existing one with the real commands), `CLAUDE.md` pointing to AGENTS.md, `LICENSE` (MIT), `.gitignore` (including `.dev.vars`).

**Acceptance criteria**
- [ ] A fresh clone passes `pnpm i && pnpm verify && pnpm e2e` locally and in CI.
- [ ] `pnpm dev` serves the web app, and `/api/health` returns JSON through the proxy.
- [ ] The boundary lint fails if `packages/engine` imports React or `window`.
- [ ] The CI checks `verify`, `e2e` and `bundle-size` run and pass on the PR.
- [ ] `docs/spec/02-architecture.md` is updated if any contract shape had to change.

<!-- issue key=C01 labels=v1,area:content depends=F01 -->
## Content pipeline: schemas, YAML compiler, validator, narration manifest

**Spec:** 03 (all schema sections, §8–§9), 02 §5.1.

**Scope:** Zod schemas for Skill, ItemTemplate, Misconception, LessonSpec and narration in `packages/content`. A YAML → JSON compiler (`pnpm content:build`) producing `dist/{skills,templates,misconceptions,narration,graph}.json` plus a content hash (`contentVersion`). `pnpm content:validate` runs every validator check in 03 §9 (DAG, references, coverage rules, narration completeness, gateway representation rule, and a generator-registered check through a hook the engine provides). A seed fixture content set (≈ 15 skills across CNT/SUB/CPS/ADD) for downstream development and tests. Narration manifest format with number-word composition (03 §8).

**Acceptance criteria**
- [ ] Schemas match 02 §5.1 exactly; types are exported for engine, ui and web.
- [ ] Invalid fixtures (cycle, dangling prerequisite, missing narration) fail validation with clear messages; tests cover each rule.
- [ ] The fixture content builds deterministically (same input, same hash).
- [ ] `content:validate` runs in `pnpm verify`.

<!-- issue key=E01 labels=v1,area:engine depends=C01 -->
## Engine core: RNG, generator registry, item generation, checking, difficulty targeting

**Spec:** 02 §5.2, §7; 03 §5; 04 §2.2, §2.4.

**Scope:** a seeded RNG (`engine/rng.ts`), the `GeneratorId` registry, `generateItem`, `checkResponse` with misconception (buggy-rule) matching, hint ladders, difficulty feature computation, and the parameter search toward a target difficulty. Reference generators for `number-pad` (add/sub facts), `tap-count`, `tenframe-fill`, `number-line-place`, `compare` and `base-ten-build`, covering the fixture content. Expose the `generatorRegistered` hook to the content validator. Implement the "generate 500 items per template" property-test harness that content issues reuse.

**Acceptance criteria**
- [ ] No `Math.random` or `Date.now` in the engine (lint rule).
- [ ] Each reference generator: property tests for answer validity, constraint satisfaction and finite difficulty; targeting lands within ±0.5 logit of the target in ≥ 90% of seeds when feasible.
- [ ] Misconception matchers for the fixture misconceptions, unit-tested.
- [ ] The documented API and how to add a generator are in `packages/engine/README.md`.

<!-- issue key=E02 labels=v1,area:engine depends=E01 -->
## Learner model and projections: Elo rating, mastery ladder, FIRe-lite memory, folds

**Spec:** 04 §2–§4, §7; 02 §4.3, §5.3.

**Scope:** `LearnerModel` `elo-fire-v1`, mastery status rules (including gateway, fluency, test-out, demotion, overrides), memory intervals with implicit credit, failure propagation, review compression and transfer probes. Deterministic incremental folds: `foldSkillStates`, `foldInventory`, `foldIsland`, `foldCollection`, `foldGoals` (the island and collection folds take game data as input; use fixture game data). Parameters live in `engine/src/params.ts`. Dashboard-derived signals (04 §7) as pure functions.

**Acceptance criteria**
- [ ] Table-driven unit tests for every formula and status rule.
- [ ] Property tests: fold order-independence, incremental equals full fold, inventory never negative.
- [ ] A golden replay test from a recorded fixture log (≥ 2,000 synthetic events).

<!-- issue key=E03 labels=v1,area:engine depends=E02 -->
## Placement, session planner, in-session adaptation and simulated-learner harness

**Spec:** 04 §5, §6, §8; 02 §5.4.

**Scope:** a placement runner (priors, probe selection, BKT-style update, propagation, stop rules, assumed flags, mini-placement per strand); `planSession` (budgets, new-skill scoring, review compression, requests bound to workshop capabilities, Practice Pier fallback); `adaptNext` (retry and hint ladder, tier step-down, prerequisite probe, frustration handling, misconception trigger, wind-down). The simulated-learner harness `pnpm test:sim` reports the 04 §8 metrics. It runs on the fixture graph now; add a test that switches to the full compiled graph when `packages/content/dist` contains it.

**Acceptance criteria**
- [ ] The 04 §8 simulation thresholds pass on the fixture graph (and on the full graph once the curriculum issues land, via the auto-switching test).
- [ ] Planner invariants hold under property tests (budgets, ≤ 3 in a row, every request hostable).
- [ ] Placement runs in ≤ the item budgets for simulated K and G2 profiles.

<!-- issue key=U01 labels=v1,area:ui depends=F01 -->
## Design system, interaction primitives, widget registry and Storybook

**Spec:** 06 §4–§7; 05 §11 (tokens, typography); 02 §5.2 (one widget per format).

**Scope:** design tokens (palette, spacing, radii, motion, z-layers) as CSS variables plus Tailwind theme; primitives (`BigButton`, `IconButton` with a spoken label, `SpeechBubble`, `Panel`, `Sheet`, `NumberDisplay`, `ProductTray`, `HomeButton`, `HintButton`, `ReplayButton`); interaction primitives `useDragToTarget`, `useTapToPlace` and snap logic (with a tap-only mode and adjustable snap radius); reduced-motion handling; the **widget registry** (`format → component`, with a typed props contract: `config`, `tier`, `disabled`, `onResponse(ResponseValue)`, `onInteract`, `demo` mode for lessons); a placeholder widget for unregistered formats; Storybook with CVD-simulation and an axe addon.

**Acceptance criteria**
- [ ] Primitives meet 06 §4 target sizes per age mode; stories cover each state; axe passes.
- [ ] The drag and tap-to-place primitives work by mouse, touch emulation and keyboard (tests).
- [ ] The widget registry contract is documented, and a sample widget proves it end to end.
- [ ] UI evidence attached.

<!-- issue key=U02 labels=v1,area:art depends=U01 -->
## Art kit: island, buildings, Pip, Pebblings, decor and effects (SVG)

**Spec:** 05 §1, §3–§6, §11.

**Scope:** an art style guide page in Storybook. SVG React components for: island terrain tiles and sea with parallax layers and day/sunset; the numbered road stones; all 13 workshop buildings plus the Storehouse, homes and Lighthouse, each in under-construction and levels 1–3; **Pip** (idle, talk, point, cheer, think); a **procedural Pebbling generator** (species × colour × number → critter with a 2×5 ten-frame pebble shell; teens and tens families; ≥ 40 named Pebblings defined in game data); a decor set (≥ 30 items); effects (sparkle, confetti, firefly, splash) using Motion, and Pixi only for particles. Game data: `apps/web/src/game/data/{buildings,residents,decor,materials}.ts`.

**Acceptance criteria**
- [ ] Every component renders in an "Art Gallery" Storybook with state controls; visual snapshots exist.
- [ ] The originality rule in 05 §1 is respected (no likeness to existing IP).
- [ ] The palette and CVD rules hold (05 §11, 06 §7). Reduced motion is respected.
- [ ] UI evidence (gallery screenshots plus a short idle-animation video) attached.

<!-- issue key=U03 labels=v1,area:widgets depends=U01,E01 -->
## Widgets A: number sense formats

**Spec:** 02 §5.2; 03 §5 (WidgetConfig per format); 06 §4–§6.

**Formats:** `number-pad`, `tap-count`, `make-set`, `dot-flash`, `numeral-pick`, `compare`, `order`, `tenframe-fill`, `number-bond`, `rekenrek`, `number-line-place`, `number-line-jump`, `hundred-chart`.

**Acceptance criteria (per widget)**
- [ ] Registered in the widget registry; renders every tier the format supports; supports `demo` mode for lessons.
- [ ] Touch-drag, tap-to-place and keyboard paths all emit the correct `ResponseValue` (component tests).
- [ ] Tapping objects or numbers speaks names via `AudioManager` (mock in tests).
- [ ] Stories with play functions; axe clean; meets the size rules.
- [ ] UI evidence for all widgets (screenshots plus one interaction video).

<!-- issue key=U04 labels=v1,area:widgets depends=U01,E01 -->
## Widgets B: place value, operations, equality and puzzles

**Spec:** as U03.

**Formats:** `base-ten-build`, `base-ten-trade`, `expanded-form`, `array-build`, `equal-groups`, `equal-share`, `area-tiles`, `balance`, `story-problem`, `puzzle-grid`.

**Acceptance criteria:** same per-widget criteria as {{U03}}. Base-ten fuse/trade animations are clear at 30 fps. `puzzle-grid` supports mini-KenKen (3×3, 4×4), magic square and missing-number grid variants.

<!-- issue key=U05 labels=v1,area:widgets depends=U01,E01 -->
## Widgets C: fractions, time, money, measurement, geometry, patterns, data

**Spec:** as U03.

**Formats:** `fraction-cut`, `fraction-pick`, `fraction-line`, `clock-set`, `clock-read`, `coin-pay`, `coin-count`, `make-change`, `measure-length`, `compare-length`, `perimeter-walk`, `shape-compose`, `shape-sort`, `pattern-extend`, `bar-graph-read`, `bar-graph-build`.

**Acceptance criteria:** same per-widget criteria as {{U03}}. Clock hands are geared (the hour hand moves with the minute hand). Coins are US currency with recognisable, original vector art (no copyrighted imagery), and their values are spoken.

<!-- issue key=A01 labels=v1,area:audio depends=F01,C01 -->
## Audio system: AudioManager, narration stitching, Web Speech fallback, SFX and music

**Spec:** 02 §5.5; 05 §12; 06 §5; 07 §3 (runtime parts).

**Scope:** an `AudioManager` on Web Audio (unlock on gesture, a ducking bus for voice/sfx/music, cancel/queue semantics per 06 §5); narration lookup from `narration.json` with number-word clip composition 0–1000; a Web Speech fallback per missing clip (with a dev warning); `sayPhrases` (phrase-bank clips plus number slots) and `sayText` (on-device Web Speech only, with a distinct Glim voice choice); a procedural SFX synth for every SFX in 05 §12; music playback with loops and crossfade (procedural or CC0, licences recorded in `LICENSES-ASSETS.md`); a volume settings model.

**Acceptance criteria**
- [ ] Unit tests with a mocked AudioContext: clip stitching order, cancellation, ducking, fallback.
- [ ] A Storybook "Audio Lab" page plays every SFX, sample narration and the number composer.
- [ ] Works on Android Chrome (manual note) and desktop browsers.

<!-- issue key=A02 labels=v1,area:audio,area:ai depends=C01,A01 -->
## Narration render pipeline (build-time TTS: Gemini, swappable to Kokoro)

**Spec:** 07 §3; 03 §8.

**Scope:** `tools/narration`: extract every narration line and number-word clip from the content build; a renderer interface with the `gemini` (Batch API, `gemini-3.8-flash-tts`), `kokoro` (local) and `stub` providers; `pnpm narration:audition` (07 §3); render missing clips; encode to Opus (`.ogg`/`.webm`), with an AAC fallback only if 07 requires it; content-hash the clip names; write `apps/web/public/audio/` plus the manifest; idempotent and resumable, with concurrency and a spend cap; `--dry-run` reports counts and estimated cost. A deterministic stub mode for tests.

**Acceptance criteria**
- [ ] `pnpm narration:render --dry-run` lists the counts and cost estimate; without a key it exits cleanly with instructions.
- [ ] With a key (not in CI), it renders the fixture content's narration, and the game plays it. Report the actual cost.
- [ ] Re-running renders nothing new (idempotent). Changed text renders only the changed clips.

<!-- issue key=K01 labels=v1,area:content depends=C01,E01 -->
## Curriculum K–1: skills, templates, generators, misconceptions, lessons, narration

**Spec:** 03 (catalog tables for the strands below); 04 §3 (mastery inputs).

**Strands and grades:** all K and grade-1 skills in 03: CNT, SUB, CMP, CPS, ADD (K–1, including strategy nodes), PV (grade 1), MEA (K–1), TIM (grade 1), GEO (K–1), ALG (K–1), DAT (K–1), plus the K–1 rows of FRA, MUL and PUZ (03 §3.20).

**Scope:** skill YAML; templates (≥ 2 per skill across ≥ 2 formats); any missing generators (with property tests via the E01 harness); misconceptions with detection and remediation; lesson specs (worked → faded → scaffolded); all narration lines. Use subagents to parallelise strands if helpful; one PR per strand group is fine.

**Acceptance criteria**
- [ ] `pnpm content:validate` passes with the full K–1 catalog from 03; skill count matches 03 ±5%.
- [ ] Every generator passes the 500-seed property test.
- [ ] A spot-check report (in the PR) of 3 rendered items per strand via Practice Pier stories or a Storybook "Content Browser".

<!-- issue key=K02 labels=v1,area:content depends=C01,E01 -->
## Curriculum grades 2–3 plus stretch: skills, templates, generators, misconceptions, lessons, narration

**Spec:** as {{K01}}.

**Strands and grades:** all grade 2–3 skills in 03 (PV, MDA, MUL including division, FRA, DEC, MEA, TIM, MON, DAT, GEO, ALG, PUZ) plus the grade-4 stretch skills and the G6 enrichment skill. Use the "Gr" column in 03 §3 to split ownership with {{K01}}.

**Acceptance criteria:** same as {{K01}} for these strands.

<!-- issue key=S01 labels=v1,area:api depends=F01 -->
## API: setup, auth, device pairing, sync, export/import, D1 schema

**Spec:** 08 §1–§6, §9.

**Scope:** Drizzle schema and migrations (08 §5); routes `/setup`, `/auth/*`, `/devices/*`, `/sync`, `/export`, `/import`, `DELETE /children/:id`; rate limiting; PBKDF2 hashing; device tokens; cursor paging; idempotent inserts; clock-skew clamp; tombstones; Zod validation with `shared` schemas. Seed and reset scripts for local dev.

**Acceptance criteria**
- [ ] Every route has integration tests in the Workers pool (08 §9), including sync idempotency and paging across > 1,000 events.
- [ ] A contract test matches the shared schemas.
- [ ] `pnpm dev` with an empty local D1 runs the migrations automatically.

<!-- issue key=D01 labels=v1,area:data depends=E02,S01 -->
## Client data layer: Dexie store, projections cache, sync client, backup

**Spec:** 02 §4.3–§4.4; 08 §4.

**Scope:** the Dexie schema; an event store with an append API (validates with the shared schemas, stamps device/family ids, content version); a projection cache with rebuild on version change; React hooks (`useSkillStates(childId)`, `useIsland()`, `useInventory()`, `useProfiles()`, `useSettings()`); a sync client (push/pull loop, backoff, triggers per 08 §4, never blocks the UI); `storage.persist()`; export/import JSON; tombstone handling.

**Acceptance criteria**
- [ ] Unit tests with `fake-indexeddb`: append/fold/cache, rebuild on version bump, export/import round trip.
- [ ] Sync integration test against the S01 API in the Workers pool or a local wrangler: two simulated devices converge to an identical island.
- [ ] Offline behaviour: queued events survive a reload and sync later.

<!-- issue key=W00 labels=v1,area:app depends=U01,D01,S01,A01 -->
## App shell: routing, profile picker, picture password, parent gate, setup wizard, session lifecycle, PWA

**Spec:** 06 §2–§3 (Profile Picker, Setup Wizard, parent gate), §5, §8; 08 §3; 02 §3.

**Scope:** route map (child and parent areas); providers (audio, data, settings); first-run detection and the Setup Wizard (calls `/setup`, pairs this device); pairing an additional device by code; the Profile Picker with picture passwords; audio unlock; the parent gate (hold + PIN); session lifecycle (start/end events, time budget, wind-down hook, daily cap, quiet hours); a service worker with precache of shell, content and audio, offline support and the update-on-next-launch rule; a diagnostics page (local errors).

**Acceptance criteria**
- [ ] E2E journey 1 (fresh setup) passes.
- [ ] The app installs as a PWA and loads offline in Playwright (service worker test).
- [ ] The parent gate blocks children (it can't be passed by taps alone).
- [ ] UI evidence attached.

<!-- issue key=R01 labels=v1,area:app depends=W00,E03,A01 -->
## TaskRunner, lesson player, feedback flow and Practice Pier

**Spec:** 02 §5.6 (`TaskRunner`, `RunnerFeedback`); 04 §6.4; 06 §6; 03 §6 (lessons); 05 §4 (Practice Pier).

**Scope:** the `TaskRunner` implementation (wraps the engine: generate → present → check → log the attempt event → update projections → adapt next → hints → misconception triggers → materials produced → wind-down); the lesson player (worked/faded/scaffolded steps driving widgets in demo mode with narration); the deterministic feedback flow (diegetic cue → narration → hint ladder); an AI feedback hook interface (no-op until {{AI1}}); math-density timing; and **Practice Pier** as the generic workshop hosting every registered format, including a dev "content browser" mode to play any skill.

**Acceptance criteria**
- [ ] With fixture content, a full request can be played in Practice Pier, and attempt events and projections update correctly (integration test).
- [ ] The hint ladder, tier step-down, prerequisite probe and frustration rules are observable in tests.
- [ ] Math density is recorded per session.
- [ ] UI evidence (video of a request including a mistake path).

<!-- issue key=CH1 labels=v1,area:character depends=W00,U01 -->
## Character: avatar renderer and creator, plus buddy selection

**Spec:** 05 §9; 06 §2 (Character Creator).

**Scope:** the `AvatarSpec` schema (in `shared`); a layered SVG avatar renderer with idle animations and expressions; the creator UI (categories in 05 §9, random button, live preview, unlock states); buddy selection from starter Pebblings; `avatar.updated` events; avatar use in the Profile Picker; and an API for {{AI2}} to pre-fill attributes.

**Acceptance criteria**
- [ ] Every attribute combination renders without layering glitches (a visual test over a sampled set of 200 random specs).
- [ ] Inclusive options per 05 §9 are present.
- [ ] Creator flows work with tap-only. UI evidence attached.

<!-- issue key=I01 labels=v1,area:island depends=W00,U02,R01,E03 -->
## Island hub: map, numbered road, requests, Storehouse, building, decorate, wind-down

**Spec:** 05 §2–§3, §6, §8; 06 §2 (Island, Build/Decorate, Wind-down).

**Scope:** island map rendering from `foldIsland` (plots, expansion rings, parallax, day/sunset); the numbered road with counting-aloud movement; request bubbles from `planSession` (recommended highlight, ≤ 10 s to first problem with chunk prefetch); workshop entry/exit transitions; the Storehouse display (ten-frame/base-ten piles); building recipes, placement, construction animation and upgrades; decorate mode with the non-math time cap; shared-island rendering of both avatars and contribution badges; the wind-down scene with a spoken recap; workshop registration plumbing (02 §5.6).

**Acceptance criteria**
- [ ] E2E: a returning session reaches the first math interaction in ≤ 10 s (measured in a test).
- [ ] Building consumes materials correctly; the inventory never goes negative; the decor cap is enforced.
- [ ] Two children's events render on one island (test with seeded events).
- [ ] UI evidence (screenshots plus video).

<!-- issue key=I02 labels=v1,area:island depends=I01 -->
## Residents, Collection Book, festivals and Storm Watch, weekly goals, gifts and milestones

**Spec:** 05 §5, §7.

**Scope:** Pebbling arrivals (homes and ferry tickets), personalities and lines; the Collection Book; buddy follow; the weekly goal jar (accumulate-only); festivals plus the co-op **Storm Watch** mixed-review event via `TaskRunner`; gift opening (parent gifts from {{P01}}, using events defined here); milestone treasure-chest cards; mastery moments.

**Acceptance criteria**
- [ ] Collection progress comes only from building and helping (test).
- [ ] Storm Watch can't fail; it completes when its items are done; both kids' contributions count.
- [ ] Weekly goals never decrease (property test on the fold).
- [ ] UI evidence attached.

<!-- issue key=OB1 labels=v1,area:onboarding depends=I01,CH1,R01,U03,K01 -->
## Child onboarding and placement adventure

**Spec:** 05 §10; 04 §5; 06 §2.

**Scope:** Meet Pip → character → buddy → island naming → the placement adventure (game-framed scenes using real widgets, split into mini-sessions for K, an "I haven't learned this" option, frustration stop) → first build → wind-down; mini-placements per strand on first entry; resuming an unfinished placement on a later day.

**Acceptance criteria**
- [ ] E2E journeys 2 and 3 pass (K profile; G2 above grade reaches grade-3 skills).
- [ ] Placement respects the item budgets and records `placement.probe` and `attempt` events.
- [ ] UI evidence (video of the K first run).

<!-- issue key=WK1 labels=v1,area:workshop depends=I01,R01,U03,K01 -->
## Workshops: Road Crew (W1) and Lantern Grove (W2)

**Spec:** 05 §4 (W1, W2 and the workshop design rules); 02 §5.6.

**Acceptance criteria (each workshop)**
- [ ] Implements the module contract; hosts its formats at every supported tier; passes the remove-the-math test (described in the PR).
- [ ] Every correct action produces visible material; the request-complete parade works; lessons run in-world.
- [ ] Road Crew physically extends the island road (via the island events).
- [ ] Playwright test plays one full request with mixed right and wrong answers.
- [ ] Each workshop chunk is within the bundle budget. UI evidence (screenshots plus video per workshop).

<!-- issue key=WK2 labels=v1,area:workshop depends=I01,R01,U03,K01 -->
## Workshops: Ten-Boat Dock (W3) and Treasure Beach (W4)

**Spec:** 05 §4 (W3, W4).

**Acceptance criteria:** as {{WK1}}, plus: the Ten-Boat only sails at exactly 10 and shows why otherwise; Treasure Beach shows hot/cold closeness for estimation formats.

<!-- issue key=WK3 labels=v1,area:workshop depends=I01,R01,U04,K01,K02 -->
## Workshop: Brick Factory (W5)

**Spec:** 05 §4 (W5).

**Acceptance criteria:** as {{WK1}}, plus: the fuse and trade animations make regrouping visible; add/subtract orders with regrouping run at all three tiers.

<!-- issue key=WK4 labels=v1,area:workshop depends=I01,R01,U04,U05,K02 -->
## Workshops: Garden Terraces (W6) and Bakery (W7)

**Spec:** 05 §4 (W6, W7).

**Acceptance criteria:** as {{WK1}}, plus: the fence split shows the distributive strategy; remainders go to the seagull; fractions appear on the counter line.

<!-- issue key=WK5 labels=v1,area:workshop depends=I01,R01,U05,K01,K02 -->
## Workshops: Market (W8) and Clock Tower & Ferry (W9)

**Spec:** 05 §4 (W8, W9).

**Acceptance criteria:** as {{WK1}}, plus: ferry tickets cause resident arrivals (via {{I02}} events if merged; otherwise a stub event that I02 consumes); the make-change flow supports counting up.

<!-- issue key=WK6 labels=v1,area:workshop depends=I01,R01,U04,U05,K01,K02 -->
## Workshops: Builder's Yard (W10) and Weigh Station & Lookout (W11)

**Spec:** 05 §4 (W10, W11).

**Acceptance criteria:** as {{WK1}}, plus: balance items include relational-equals forms (`__ = 3 + 4`, `5 + 2 = __ + 3`); bar graph building surveys island residents.

<!-- issue key=WK7 labels=v1,area:workshop depends=I01,R01,U03,U04,K01,K02 -->
## Workshops: Rhythm Orchard (W12) and Puzzle Tower (W13)

**Spec:** 05 §4 (W12, W13); 04 §6.5.

**Acceptance criteria:** as {{WK1}}, plus: per-fact adaptive pacing; no visible timer for K; the personal-best ghost only shows when `timedChallenges` is on (G1+); Puzzle Tower is optional and rewards star shards.

<!-- issue key=AI1 labels=v1,area:ai depends=S01,R01,A01 -->
## AI services (Claude): provider layer, feedback and error diagnosis, phrase bank, Glim, parent summary, budget

**Spec:** 07 (all except §4); 08 §6, §8.

**Scope:** server-side provider abstraction with the providers and models chosen in 07; mock providers for tests and CI; `POST /ai/feedback` (structured input, JSON output, validation and safety filters, deterministic fallback, cache); the Glim helper character with disclosure and the parent AI log (07 §7); the feedback phrase bank (≈ 150 phrases in content YAML, rendered by {{A02}}); `POST /ai/parent-summary`; usage metering and the monthly budget cap with graceful degradation; family feature flags; client integration in `TaskRunner` (the 5 s window), `AudioManager.sayPhrases` and `sayText`. Load the `claude-api` skill (TypeScript) before writing provider code. Child-safety safeguards per 07 §8.

**Acceptance criteria**
- [ ] With mock providers, E2E journey 7 passes (AI on and AI off).
- [ ] Output validators reject answer leaks on the first wrong attempt, over-length lines and disallowed content (unit tests with adversarial fixtures).
- [ ] The budget cap blocks calls after the limit and the UI degrades silently for children.
- [ ] A manual live smoke test with a real key (outside CI) is documented in the PR, including the latency and cost observed.

<!-- issue key=AI2 labels=v1,area:ai,area:character depends=AI1,CH1,W00 -->
## Photo to avatar ("make me from a photo"): Claude vision → creator attributes

**Spec:** 07 §4; 05 §9; 06 §3 (Character photo); 08 §8.

**Scope:** the parent-area flow (upload or capture → consent note → vision mapping to `AvatarSpec` attributes → preview → send to the child's creator for confirmation); no generated likeness images (07 §0, §4); output restricted to creator option ids, with no sensitive inferences; photos processed in memory, never persisted (test asserts nothing written to D1, the cache or logs).

**Acceptance criteria**
- [ ] With a mock vision provider, the flow pre-fills the creator; the child confirms; an `avatar.updated` event is logged.
- [ ] A privacy test: no photo bytes in any storage or log.
- [ ] UI evidence attached.

<!-- issue key=P01 labels=v1,area:parent depends=W00,D01,E02,S01 -->
## Parent dashboard: overview, skill map and evidence, alerts, settings, gifts, devices

**Spec:** 06 §3; 04 §7; 08 §2.

**Scope:** the dashboard per child; an interactive skill map by strand (status icons plus colour); a skill evidence drawer with overrides; misconception alerts with suggested offline activities; settings (all 06 §3 items and feature flags); gifts (with `gift.left` events and an optional message spoken by TTS) and real-world milestones; device management; AI summary display (if {{AI1}} is merged; otherwise a placeholder); export/import UI.

**Acceptance criteria**
- [ ] E2E journeys 5 (alert visible), 8 and 9 pass.
- [ ] axe-clean parent area; WCAG 2.2 AA spot checks.
- [ ] UI evidence attached.

<!-- issue key=Q02 labels=v1,area:polish depends=WK1,WK2,WK3,WK4,WK5,WK6,WK7,I02,OB1 -->
## Game-feel and consistency pass across island and workshops

**Spec:** 05 (all); 06 §5–§6.

**Scope:** play every workshop and flow end to end on tablet emulation and desktop; unify transitions, celebration timing, sound mix, narration pacing and the buddy's reactions; fix janky animations (30 fps floor); check math density ≥ 70% in scripted sessions; tune the feedback lines' variety; make sure the first 5 minutes for each child feel magical. Record findings, fix them, and file follow-ups for anything larger.

**Acceptance criteria**
- [ ] A before/after video for each workshop family.
- [ ] Scripted session telemetry shows math density ≥ 70% and the first problem ≤ 10 s.
- [ ] No console errors in a 20-minute scripted soak run.

<!-- issue key=Q01 labels=v1,area:qa depends=Q02,AI2,P01,A02 -->
## Final integration and QA: golden journeys, performance, accessibility, narration render, docs

**Spec:** 09 (all); 02 §6; 08 §7.

**Scope:** make all golden E2E journeys (09 §3) pass; meet the bundle and performance budgets on tablet emulation with 4× CPU throttle; an accessibility audit; a full K–3 narration render via {{A02}} (with a key; report the cost; if no key is available, verify the Web Speech fallback covers everything and file a follow-up); README, SELF-HOSTING, DEPLOY (prepared, not executed), PRIVACY, PLAYTEST and LICENSES-ASSETS docs; a final bug bash with fixes.

**Acceptance criteria**
- [ ] All 9 golden journeys green in CI.
- [ ] Performance budgets met (report numbers).
- [ ] A clean clone plus the README quick start gives a playable game in < 10 minutes.
- [ ] A final demo video (≤ 3 min) of a K session and a G2 session.
