# 01: Product

## Vision

Number Island is a game kids ask to play that quietly makes them strong at math. Two siblings share an island. Every building is a workshop where doing real math is how things get built. The game knows what each child has mastered, teaches the next thing they are ready for, and brings older skills back before they fade. It runs on the family's Android tablets and in any modern browser. It is open source, and each family hosts its own copy.

## Users

| User | Needs |
|---|---|
| **K child (~5–6, advanced, pre-/early reader)** | Everything spoken aloud, big targets, short sessions, warm characters, collecting and building, no failure states |
| **Grade 2 child (~7–8, advanced reader)** | Real challenge, choice, visible mastery, puzzles, "beat my best", and a sense of building something big |
| **Parent (operator)** | Setup in minutes, sees what each kid knows and why, controls time and AI features, trusts that it is safe and private |
| **Future: other families** | Clone the repo, add their own API keys, run locally or deploy to their own Cloudflare account |

## v1 scope: "playable locally, complete experience"

v1 is done when both kids can play daily on a tablet and a laptop against a locally running server, with the full loop working end to end:

1. **Parent setup:** first-run wizard, parent passphrase, add children (name, avatar, grade, birth year), pair devices.
2. **Character creation:** an attribute-based avatar creator, plus "make me from a photo" (parent-gated, AI).
3. **Placement adventure:** game-framed adaptive placement that finds each child's frontier in the K–3 graph.
4. **Number Island:** the island hub with a numbered road, building plots, Pebbling residents with requests, materials, building and decorating, festivals, a collection book, weekly goals and personal bests.
5. **Workshops:** 13 workshop mini-games plus the generic Practice Pier, covering every K–3 strand (see 05 §4).
6. **Learning engine:** skill rating, mastery ladder, spaced and interleaved review, misconception detection and remediation, CPA (concrete–pictorial–abstract) representation tiers with worked examples.
7. **Feedback:** instant deterministic feedback and hints, plus AI-personalised feedback lines spoken via TTS when enabled.
8. **Audio:** every child-facing prompt narrated (pre-rendered at build time, on-device Web Speech fallback), sound effects and music.
9. **Parent dashboard:** a skill map with evidence, misconception alerts, time caps, AI settings, an AI weekly summary, surprise gifts, and backup/export.
10. **Offline and sync:** play offline on any device; progress syncs through the local server when it is reachable.
11. **Content:** the K–3 skill graph (about 250–320 skills) with item generators, misconceptions and narration for all of it.

### Non-goals for v1

- Public hosting, multi-tenant SaaS, billing, or app-store publishing (a Capacitor wrapper comes later).
- Grades 4–8 content. The schema, engine and island are designed for it, but the content is not written in v1.
- Free-form chat with an AI, voice input, or camera use by children.
- Social features beyond one family.
- Cloudflare deployment. Deployment-ready configuration ships, but deploying happens later.

## Success criteria

Measured locally, with no third-party analytics:

| Metric | Target |
|---|---|
| Time from opening the app to the first math interaction (returning child) | ≤ 10 s |
| Math density (share of active session time spent in math interactions) | ≥ 70% |
| Rolling first-try accuracy per child | 80–90% (K: 85–90%) |
| Child-initiated sessions per week (parent-observed) | ≥ 4 in the first month |
| Sessions ending naturally (wind-down) vs. abandoned | ≥ 80% natural |
| Placement time | K ≤ 4 × 5 min; G2 ≤ 3 × 10 min |
| Transfer probes (bare-symbol items on mastered skills) | ≥ 80% correct |

## Principles (non-negotiable)

1. **The math is the game action.** No quizzes between turns. If you remove the math, the game breaks.
2. **Never punish.** No lives, no game-over, no negative points, no countdowns for young kids, no streak loss.
3. **Rewards inform and surprise; they never pay per problem.** Materials are the direct product of the math.
4. **Audio first, text second.** A pre-reader can do everything.
5. **Grade is a label, not a gate.** Kids move through the graph at their own pace.
6. **Mastery means retention.** A skill counts as mastered only after it survives spaced reviews.
7. **Privacy by design.** No third-party analytics or ads. The family's data stays on the family's server. AI calls send the minimum structured data, with no names and no photos stored.
8. **Explainable to parents.** Every mastery claim shows its evidence.

## Glossary

- **Skill:** an atomic, teachable, generator-assessable unit (e.g. `CPS.03` partners of 10).
- **Strand:** a group of related skills (e.g. `CPS` composing/decomposing).
- **Template:** a parametric generator for items of one skill and format.
- **Item:** one generated problem instance (template + seed + params).
- **Format:** the interaction type an item uses (e.g. `tenframe-fill`).
- **Workshop:** an island building whose mini-game presents items of certain formats.
- **Request:** a Pebbling's ask ("we need 23 planks"), which the session planner turns into a playable task.
- **Material:** the product of a workshop's math (planks, bricks, bread…), spent on building.
- **Pebbling:** an island resident whose shell shows a quantity with ten-frame-arranged pebbles.
- **Frontier:** skills whose status is `ready` or `learning`: every prerequisite is at least practiced (or assumed), and the skill itself is not yet practiced (04 §2.3).
- **CPA tier:** concrete (manipulative), pictorial (drawing), or abstract (symbols only).
