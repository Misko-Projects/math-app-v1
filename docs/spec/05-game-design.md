# 05: Game design: Number Island

## 1. Fantasy and tone

Two siblings wash up on a tiny sandbar with **Pip**, a cheerful puffin ferry captain. The island grows into a busy, cozy town as they do math in its workshops. Island critters called **Pebblings** move in, ask for help, and become friends. The tone is warm, gently funny and never scary. Even storms are cozy ("let's batten down together!").

**Originality rule:** do not imitate existing IP. In particular, Pebblings must not resemble Numberblocks (stacked blocks with faces) or DragonBox Nooms. Use sea and shore critters with pebble-filled shells. No characters, names, art or music from existing games or shows.

## 2. Core loop (one session ≈ 10–20 min)

```
Open app → pick profile (avatar tap + picture password)
 → Island: Pip greets by name; 2–3 residents show request bubbles (from the session planner, 04 §6.3)
 → Child picks a request (autonomy) → walks/boats to that workshop
 → Workshop: 2–4 min of math-mechanic play; every correct action visibly PRODUCES material
 → Materials parade to the Storehouse; resident cheers
 → Build moment: place or upgrade something, or decorate (capped, see §8)
 → Next request … → Sunset wind-down: Pip recaps what you learned (spoken), Pebblings wave goodbye
```

**First problem within 10 s:** on a returning session, the recommended request is pre-highlighted. One tap goes straight into the workshop, with the walk skipped or playing over the loading time.

## 3. The island

- **Map:** a gently tilted top-down island on a 12 × 8 plot grid, layered sea with parallax, day/sunset lighting. It starts as a sandbar (3 plots) and expands in rings as projects complete. Coordinates exist in data from day one; they become a math mechanic in later grades.
- **Numbered Road:** a winding path whose stepping stones are numbered 1→20 at first, extended by Road Crew (§4) to 100, then 1,000 (counting by tens and hundreds). Moving along it always counts aloud (the Siegler & Ramani linear-board effect). The road is the island's spine, and buildings sit beside numbered stones.
- **Storehouse:** shows each material as countable piles, arranged in ten-frames (K) or base-ten bundles (G1+). Inventory is a math display, never a bare number for K.
- **Shared island:** both siblings play on one island. Each child's avatar appears. Each has their own requests and workshop progress; materials go to the family Storehouse, tagged by who made them (shown with tiny avatar badges, never as a score).

## 4. Workshops (v1)

Each workshop is a building with one mini-game hosting specific item formats (02 §5.2), themed around what it produces. **The math action is the production action**: no separate quiz screen. Every workshop uses shared widgets from `packages/ui` with workshop theming.

| # | Workshop | Unlock | Strands | Formats hosted | Produces | The math is the action |
|---|---|---|---|---|---|---|
| W1 | **Road Crew** (Numbered Road) | start | CNT, CMP | `hundred-chart`, `number-line-jump`, `tap-count`, `order` | road stones | Lay the next stones by counting on/back, filling missing numbers, and hopping by 1s, 2s, 5s, 10s. The road physically extends. |
| W2 | **Lantern Grove** | start | SUB, CNT | `dot-flash`, `tap-count`, `make-set`, `numeral-pick` | light | Fireflies blink in groups. Catch them by tapping the lantern with the matching number, or gather exactly N into a jar. Lanterns light up homes. |
| W3 | **Ten-Boat Dock** | 1st home built | CPS, ADD | `tenframe-fill`, `number-bond`, `rekenrek`, `number-pad` | planks | The Ten-Boat only sails with exactly 10 Pebblings aboard: combine groups (7 + 3), split crews, make ten to cross. Each sailing brings back planks. |
| W4 | **Treasure Beach** | road ≥ 20 | CMP, PV (rounding) | `number-line-place`, `compare`, `order` | gems | A crab buried treasure "at 37". Tap where it is on the beach line; the dig shows hot/cold closeness. Compare chests (more/less, <, =, >). |
| W5 | **Brick Factory** | CPS.04 practiced | PV, MDA | `base-ten-build`, `base-ten-trade`, `expanded-form`, `number-pad` | bricks | 10 clay units fuse into a rod and 10 rods into a pallet. Fill orders like "346 bricks", trade a rod for 10 units to "borrow", ship add/subtract orders. |
| W6 | **Garden Terraces** | MUL.02 ready | MUL, MEA(area) | `array-build`, `equal-groups`, `area-tiles` | produce | Plant arrays ("4 rows of 6"), split a bed with a fence (7×8 = 7×5 + 7×3), count by groups, tile garden plots for area. |
| W7 | **Bakery** | FRA.01 ready or MUL.05 ready | FRA, MUL (division) | `fraction-cut`, `fraction-pick`, `fraction-line`, `equal-share` | bread | Slice pies fairly for guests, share loaves equally among Pebbling families (the seagull gets leftovers = remainder), place fractions on the counter's measuring line. |
| W8 | **Market** | MON.01 ready | MON, ADD/MDA (story) | `coin-pay`, `coin-count`, `make-change`, `story-problem` | coins | Run a stall: pay exact amounts, count the till, make change for customers. Story problems come from customers. |
| W9 | **Clock Tower & Ferry** | TIM.01 ready | TIM | `clock-set`, `clock-read` | ferry tickets | Set the tower clock for ferry departures, read arrival times, work out how long until the ferry. **The ferry brings new residents** (tickets → arrivals). |
| W10 | **Builder's Yard** | GEO.01 ready | GEO, MEA | `shape-compose`, `shape-sort`, `measure-length`, `compare-length`, `perimeter-walk` | glass & beams | Fill window outlines with shapes, sort tiles by attributes, measure beams with unit blocks then a ruler, walk fence perimeters. |
| W11 | **Weigh Station & Lookout** | ALG.01 ready | ALG, DAT | `balance`, `pattern-extend`, `bar-graph-read`, `bar-graph-build` | rope & flags | Keep the cargo scale level (= means "the same as", `__ = 3 + 4`), extend bead-rope patterns, survey Pebblings and build bar graphs at the Lookout. |
| W12 | **Rhythm Orchard** | any fact-fluency skill practiced | ADD, MUL (fact strands) | `number-pad`, `numeral-pick` | fruit | Fruit ripens to a gentle beat and answering a fact picks it. Per-fact adaptive pacing. A "beat your best" ghost appears for G1+ only if `timedChallenges` is on. Never a fail state. |
| W13 | **Puzzle Tower** | G1+ or any child after 10 mastered skills | PUZ + any | `puzzle-grid`, `balance`, `story-problem` | star shards (rare decor) | Optional "spicy" challenges: mini KenKen, magic squares, missing-number puzzles, a 24-style game, Hidato paths. Challenge is the reward. |
| — | **Practice Pier** | start | any | **all formats** | any requested material | The fallback host (04 §6.3): a plain pier where Pip brings crates of tasks. Used only when no themed workshop hosts a needed format. |

**Road Crew and the road.** A Road Crew request that makes at least one stone lays the road's next stone with one of them at its parade, for the same cost as the island's "Lay the next stone" (one stone; 02 §5.6). The request's other stones go to the Storehouse, where buildings need them, and the island's button stays for laying more.

**Workshop design rules**
1. **Remove-the-math test:** if the math were removed, the workshop would not function.
2. **Feedback is diegetic first:** the boat tips when unbalanced, the brick doesn't fuse, the pie slices look unequal. Narration explains next.
3. **Celebrate the product:** each correct action yields a visible, countable product (a plank, a brick) that flies to a tray. At the end of a request the tray parades to the Storehouse.
4. **CPA inside the workshop:** a workshop renders the item's `tier`: concrete (draggable objects), pictorial (drawn), or abstract (symbols with a number pad). Same theme throughout.
5. **Lessons in-world:** a skill's first appearance plays its worked example as Pip demonstrating in the workshop, then a faded example, then hands over (03 §6).
6. **Exit anytime:** a big "home" button returns to the island with whatever was produced so far.
7. **Unlocks are family-wide:** a workshop unlocked or built by either child is available to both. The `Unlock` column uses `UnlockRule` (02 §5.8), with skill rules satisfied when *any* child reaches them.
8. **Data, not code:** buildings, recipes, residents, decor and unlock rules are `GameData` in `packages/content/game/*.yaml` (02 §5.8), authored by U02.

## 5. Pebblings (residents and collection)

- **Look:** small shore critters (crab, turtle, snail, hermit crab, starfish, seal pup, puffin chick…) whose shell or back holds pebbles in a **2 × 5 ten-frame layout**. A Pebbling's number is shown by its lit pebbles (5-grouping visible). Numbers above 10 are families riding together: a Ten Turtle carries a full ten-shell, and teens are a Ten Turtle plus a small friend. Later: Hundred Whale, Half-Crab (fractions), Clockfish (time), Coin Clams (money).
- **Personalities:** each has a name, a likes/dislikes line, a home preference, and 3–6 narration lines (requests, thanks, idle chatter).
- **Arrival:** building a home (or ferry tickets from W9) brings a new resident. They then make requests tied to their workshop affinity.
- **Collection Book:** a page per Pebbling with a portrait, number, home, and "favourite math" note. v1 has **≥ 40 Pebblings**: 0–20 individuals, Ten Turtle, families to 100, and special ones per strand. Collection grows from **building and helping**, never from random draws.
- **Buddy:** at character creation each child picks a Pebbling buddy who follows their avatar and stars in their lessons.

## 6. Building, materials and projects

- **Recipes** use small, countable costs for K (≤ 10 of each, shown as ten-frame icons) and larger, base-ten-displayed costs for G2 ("needs 34 planks"). Reading a recipe is itself light math.
- **Placement:** tap a highlighted plot, then the building pops in with a short construction animation (avatar and buddy hammering, ≤ 6 s, skippable).
- **Upgrades:** buildings have 3 levels. Levels unlock new decor and new residents, not new math gates (math gating comes from the skill graph).
- **Shared projects:** large builds (Lighthouse, Bridge to East Beach, Festival Stage) need materials from **both** children's workshops. A progress picture shows each child's contributions as their avatar badges stacking up, with no numbers compared.
- **Decor:** flowers, lamps, flags, paths, fountains; earned through projects, festivals, gifts and Puzzle Tower stars. Decorating time is capped (§8).

## 7. Motivation systems (healthy by design)

| System | Design | Guardrails |
|---|---|---|
| Visible growth | The island grows; the road extends; residents multiply | Driven by math produced, not time spent |
| Collection | Pebblings, decor, avatar outfits | Earned by building and helping; never random or purchasable |
| Weekly goal | "Help 6 Pebblings this week": a jar fills with shells | Accumulates only; never resets mid-week; never lost |
| Festivals | Every ~7 days of play (or a mastery milestone): a festival scene plus a mixed-review **"Storm Watch"** co-op event (both kids contribute) that reveals a rainbow decor | No timer for K; can't fail. The storm passes when items are done. |
| Personal bests | Rhythm Orchard ghost, Puzzle Tower stars | Self-comparison only; opt-in timing; never sibling vs. sibling |
| Surprise gifts | Parent leaves a wrapped gift (decor plus an optional typed message, read aloud on-device via `sayText`); random "Pip found something!" moments | Unexpected, not contingent per problem |
| Real-world milestones | Parent-defined ("When the Lighthouse is built: pancake breakfast!") shown as a treasure chest card | Parent-controlled |
| Mastery moments | When a skill reaches `mastered`: the buddy gets a badge and Pip announces "You've really got this now!" | Informational praise ("you made a ten first!"), never "you're smart" |

**Hard nos** (see research 03 §3.5): no ads, purchases, loot boxes, lives, game-over, negative points, streak loss, FOMO timers, guilt notifications, or leaderboards.

## 8. Pacing and math density

- **Non-math time cap:** building, decorating and walking outside workshops ≤ 25% of session time. After the cap, decor mode shows "Decorating is open after your next request!", and Pip points to a request. The parent may allow a free-build period after the session's math budget is complete.
- **Session length:** from settings (04 §6.1). At the budget, the child finishes the current item, the request ends with its parade, and the sunset wind-down starts (04 §6.4). There is no further overrun.
- **Math density** is measured per session (04 §7) and shown to the parent.

## 9. Character (avatar)

- **Attribute creator:** skin tone (12), face shape (4), hair style (16, including covered/hijab and short/long/curly/coily/braids/locs), hair colour (10 natural + 6 fun), eyes (6 shapes × 8 colours), eyebrows, glasses (6), freckles/beauty marks, outfits (top 12, bottom 8, shoes 6; colours), hats/accessories (unlockable), plus buddy choice. Renders as layered SVG with idle animations (blink, bob, wave, cheer, think) and expressions (happy, proud, curious, oops).
- **Photo option (parent-gated, AI):** "Make my look from a photo": the parent uploads or takes a photo in the parent area. AI maps it to the creator's attributes (07 §4), the result pre-fills the creator, and the child adjusts and confirms. No AI-generated images of the child are made: provider policies bar it for minors. The animated SVG avatar is the likeness. The photo itself is never stored.
- **Where it shows:** the profile picker, walking the island, inside workshops as Pip's helper (hands doing the manipulatives), festivals, and the wind-down.
- **Unlocks:** new outfits and accessories through festivals, projects and the Collection Book, all informational and visible in the creator.

## 10. Child onboarding (first run per child)

1. **Meet Pip** (≤ 30 s, skippable for the second child).
2. **Create your character** (or confirm the photo-based one) and pick a buddy.
3. **Name the island** (first child only; shown later to the sibling as "Welcome to <name> Island!").
4. **Placement adventure** (04 §5): framed as "help Pip sort the shipwrecked cargo". Probes appear as mini scenes using the real widgets (count crates, place a float on the line, fix a 10-boat, read the ferry clock…). It is split across days for K, and every answer is celebrated the same way.
5. **First build:** the first Pebbling home, using materials from placement. The first resident moves in.
6. **Wind-down.**

## 11. Art direction

- **Style:** cozy flat vector with soft rounded shapes, 2–3 px outlines in a darker shade of the fill, one soft highlight and a contact shadow. No gradients beyond gentle sky and sea washes.
- **Palette:** sea teal `#1f7a8c`/`#2a9d8f`, sand `#f4e3c3`, coral `#e76f51`, sunshine `#f4a261`/`#e9c46a`, leaf `#5c9e4f`, night ink `#264653`. Use only colour-blind-safe pairs for anything math-relevant, and never encode an answer in colour alone.
- **Implementation:** all art is **SVG React components** in `packages/ui/art`, parameterised by state (under construction / level 1–3, day/sunset), with CSS/Motion idle animations (smoke, flags, waves, blinking). A Storybook "Art Gallery" shows everything. Particles (fireflies, confetti, sparkles) use Pixi only where many sprites animate at once.
- **Typography:** Baloo 2 for titles and numbers; Andika for any child-facing text (single-storey a and g for early readers). Numerals in math widgets are ≥ 32 px.
- **Optional AI art:** build-time-generated raster backdrops (sea, sky, title card) are allowed only if 07 §6 permits that provider use. SVG remains primary, so the game must look complete without it.

## 12. Audio direction

- **Voices:** a warm, unhurried narrator (instructions, lessons, feedback) and Pip's voice (brighter, playful). Pebblings use short non-verbal chirps plus narrator lines. **Glim** (a lantern-robot helper) voices AI feedback when it is enabled (07 §7). Everything is pre-rendered at build time (07 §3), with number words composed from clips.
- **Music:** gentle island loop, workshop loops (one per workshop family), festival theme and sunset theme. Sources: original procedural/Web Audio compositions or verified CC0 tracks with licences recorded in `LICENSES-ASSETS.md`. Music is off by default during lessons and ducked under narration.
- **SFX:** pebble chime (correct), soft "hmm" wood knock (try again, never a buzzer), fuse/pop, boat horn, firefly twinkle, coin clink, page turn, construction tap. Procedural Web Audio or CC0, recorded in the asset licence file.

## 13. Scaling beyond grade 3 (design only, not v1)

The workshop list extends naturally:
- **G4–5:** multi-digit shipments, decimal Market, fraction equivalence Bakery, coordinate treasure maps.
- **G6–7:** recipe ratios, ferry rates, Market discounts and Bank interest, underwater depth (integers), scale-drawing Builder's Yard.
- **G8+:** conveyor "function machines", Pythagorean bridge spans, reservoir volume, two-ferry systems.

The island becomes a town economy that older kids model with equations. New workshops plug in through the same module contract.
