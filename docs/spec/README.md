# Build specification: Number Island v1

These documents are the source of truth for building v1. Every implementation issue links to the sections it delivers. When an issue and a spec disagree, the spec wins. Change the spec in the same PR, with a reason.

| Doc | What it decides |
|---|---|
| [01-product.md](01-product.md) | Vision, users, v1 scope, non-goals, success criteria, glossary |
| [02-architecture.md](02-architecture.md) | Stack, repo layout, runtime topology, **shared TypeScript contracts**, event log, data model |
| [03-curriculum.md](03-curriculum.md) | Strands, the K–3 skill catalog, YAML schemas, item templates and generators, misconceptions, standards tags |
| [04-learning-engine.md](04-learning-engine.md) | Learner model, mastery ladder, spaced review, placement, session planner (exact algorithms and parameters) |
| [05-game-design.md](05-game-design.md) | Number Island world, core loop, workshops, Pebblings, building, rewards, siblings, avatar, art and audio direction |
| [06-ux-and-accessibility.md](06-ux-and-accessibility.md) | Screens and flows, touch and audio rules, parent area, accessibility, device targets, performance budgets |
| [07-ai-services.md](07-ai-services.md) | AI feedback, TTS narration, photo-to-avatar, provider abstraction, safety, fallbacks, cost controls |
| [08-backend-sync-privacy.md](08-backend-sync-privacy.md) | API, auth, device pairing, sync, self-hosting, privacy and data retention |
| [09-quality.md](09-quality.md) | Test strategy, CI, definition of done, UI evidence, playtest protocol |

Background research is in [`../research/`](../research/). The build breakdown and orchestrator prompt are in [`../build/`](../build/).

## Decision record (locked 2026-11-17)

| # | Decision | Choice |
|---|---|---|
| D1 | Game frame | **Number Island**: a shared sibling island; workshops are the math mini-games; Pebbling residents |
| D2 | First content scope | **K–3** skill graph (~250–320 skills). The schema supports K–12. |
| D3 | Standards | CCSS-M codes as primary tags plus **Wisconsin Standards for Mathematics (2021)** alias tags. WI 2021 is a revision of CCSS with the same K–8 structure. |
| D4 | Adaptive engine | Elo-style skill rating, rule-based mastery gate, and a FIRe-lite spaced-review scheduler behind a swappable `LearnerModel` |
| D5 | Answer input | Number pad plus manipulatives (constructed response). Multiple choice only for diagnostic distractors. |
| D6 | Client | TypeScript web app: React 19 + Vite + PWA. DOM/SVG UI; PixiJS only for particle-heavy mini-games |
| D7 | Backend | Hono on Cloudflare Workers + D1 (Drizzle). **Run locally with `wrangler dev`**; deploy later. |
| D8 | Devices | **New Amazon Alexa / Kids Tablets (Android 16, Google Play, Chrome)** plus desktop browsers. Fire OS is no longer a target. |
| D9 | Narration | **Gemini TTS (`gemini-3.8-flash-tts`), pre-rendered at build time only**, with a swappable renderer (Kokoro local fallback). **No cloud TTS at runtime**: AI lines use the pre-rendered phrase bank, or on-device Web Speech. Google's terms bar Gemini from runtime use in apps for under-18s (07 §0). |
| D10 | AI | **No chat. Runtime AI never uses Gemini.** Feedback and parent summaries use **OpenAI `gpt-6.2-sol`, falling back automatically to `gpt-6.1-sol` if 6.2 isn't available to the account**, with no personal data sent. Photo → avatar uses **Claude** vision. Provider and model per feature are config (07 §1). Runtime AI generates personalised feedback and diagnoses errors (correctness stays in code), maps a photo to avatar attributes, and writes parent summaries. All of it goes through a server-side provider abstraction with deterministic fallbacks. See 07 for provider and policy constraints. |
| D11 | Siblings | One shared island with co-op projects; only personal bests, never head-to-head |
| D12 | Audience and licence | Family-first, **open source (MIT)**, self-hosted by each family with its own API keys. No public hosted instance. |
| D13 | Character | Attribute-based avatar creator from day one, plus "make me from a photo" in the parent-gated area: Claude vision maps the photo to creator attributes. No AI-generated likeness images: provider policies bar it for minors (07 §4). |
