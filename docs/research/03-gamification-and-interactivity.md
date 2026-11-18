# 03 — Gamification, Engagement, and Interactive Mechanics for Math Learning

**Scope:** What makes kids' math apps engaging *and* effective; research on game-based learning;
gamification mechanics for ages 5–10 (scaling to ~14); interactive mechanics per math concept;
touch-tablet UX for young children; three candidate "game frames" and a recommendation.

**Target users:** an advanced kindergartner (~5–6) and an advanced 2nd grader (~7–8), playing on an
Amazon Fire tablet (touch) and in a web browser. The app must be a real game *and* a real learning tool.

**Evidence caveat:** Many effectiveness claims for commercial apps come from the vendors. This
document marks vendor-sourced, advocacy-sourced, and independent/peer-reviewed evidence where it
matters. Figures marked "(unverified)" were found only in secondary sources.

---

## 0. TL;DR — the ten design rules this research supports

1. **Put the math in the core mechanic (intrinsic integration).** When the action that wins the
   game is itself the math, kids learn more and play far longer. In Habgood & Ainsworth's
   *Zombie Division* study, children given free choice played the intrinsic version about 7x longer
   than the extrinsic one. Avoid "answer a quiz to get a turn at the real game"
   ("chocolate-covered broccoli", Prodigy-style).
2. **Measure and protect "math density"**, the share of active time spent on math interactions.
   Fairplay's (advocacy, vendor-disputed) count of Prodigy was 4 math problems against 16 membership
   ads in 19 minutes. Target ≥70% of active time on math, and the first problem within 10 seconds
   of opening the app.
3. **Tune for success.** Engagement peaks at high success rates. Lomas et al. found engagement
   highest near ~90% success in a number-line game. Wilson et al.'s "85% rule" is a theoretical
   optimum for learning. Aim for **~80–90% first-try accuracy**, adapted per child.
4. **Design for the three SDT needs.** *Autonomy* (choice of activity, path, and decoration),
   *competence* (visible mastery, "just-right" challenge), and *relatedness* (sibling co-op, parent
   involvement, characters who care). These needs predict enjoyment and continued play.
5. **Make rewards informational, not controlling.** Expected, contingent, tangible rewards undermine
   intrinsic motivation. Verbal/informational feedback and unexpected rewards do not (Deci, Koestner
   & Ryan 1999). Give cosmetics and new *abilities*, not "pay per problem".
6. **Use virtual manipulatives as the input device** (ten frames, number lines, base-ten blocks,
   fraction bars, area models, balance scales, algebra tiles). They have moderate positive effects
   (~0.3 SD). Use *concreteness fading*: concrete → pictorial → symbolic, as DragonBox does.
7. **Linear number paths everywhere.** Linear numbered board games improve preschoolers' number
   sense. Circular boards with the same numbers do not (Siegler & Ramani). Number-line estimation
   correlates r ≈ .44 with overall math competence. A world map *can be* a number line.
8. **Interleave and space review.** Interleaved practice beat blocked practice, 61% vs 38% on a
   delayed test (d = 0.83, RCT). Math Academy shows that spaced review across a knowledge graph
   works at scale for older or advanced kids.
9. **Healthy engagement only.** No ads, loot boxes, paid currencies, FOMO timers, guilt
   notifications, or "lives" lost for mistakes. Streaks must be forgiving: weekly goals, automatic
   freezes, no shaming. Radesky et al. found manipulative design in apps used by nearly all young
   children in their sample. Don't be one of those apps.
10. **Touch UX for 5-year-olds:** ≥2 cm × 2 cm targets, audio-first instructions, tap-to-place as an
    alternative to dragging, snap-to-target, no penalty for mis-drops, no timers by default,
    10–20 minute sessions with a natural ending ritual.

**Recommended frame:** **"Number Island", a shared build-your-own island** (Concept B below). Each
building is a workshop whose mini-game is an intrinsically integrated math mechanic. Number-creature
residents give quests and serve as collectibles. The island map is itself a numbered linear path.
This frame scales from K (count, compose ten) to grade 8 (area, ratios, budgets, coordinate grids,
linear functions as "machines"). It supports sibling co-op at different difficulty levels, and it
offers autonomy without monetized loops.

---

## 1. Landscape of existing kids' math apps

### 1.1 Summary table

| App | Grades | Core loop | Evidence on learning | Emulate | Avoid |
|---|---|---|---|---|---|
| **Prodigy Math** | 1–8 | Fantasy RPG: wander, meet monster, turn-based battle in which each spell requires answering a multiple-choice math question; collect pets/gear; membership unlocks more | Weak/contested. FTC complaint (2021) says learning claims lack substantiation. Fairplay counted 16 membership ads vs 4 math problems in 19 min | Kid appeal of RPG + pets; adaptive placement test that starts a grade below | Extrinsic integration (math as a toll gate); low math density; membership upsell to kids; pay-to-win; social shopping pressure |
| **DragonBox Algebra 5+/12+** | K–8 (algebra) | Puzzle: isolate the "box" card on one side of a 2-pan board; cards gradually become variables and numbers | Mixed but real. Large RCTs (Grade 7, n > 3,600, AERA Open 2023) show gains, mostly conceptual. Transfer to paper is contested; one study found more engagement but lower gains than textbook practice | Intrinsic integration; concreteness fading; rules taught by play, not text | Treating "kids solved it in an hour" as mastery; check transfer |
| **Kahoot! Numbers / Big Numbers (DragonBox)** | PreK–4 | *Numbers*: "Nooms" (creatures 1–10) stack, combine, split. *Big Numbers*: gather and regroup resources to build a world for Nooms | Common Sense: fun, builds number sense. Early stages of Big Numbers are slow | Numbers *are* creatures; composing/decomposing is the core verb; place-value regrouping as world-building economy | Slow early pacing; subscription friction |
| **Khan Academy Kids** | PreK–2 | Guided learning path with characters (Kodi bear and friends) across math, literacy, SEL; library of activities | Small RCT (n ≈ 50) showed literacy gains (ES ≈ 0.72). Math impact not separately established | Free, no ads; warm characters; audio-first; parent report | Breadth over depth; not math-specific |
| **Moose Math (Duck Duck Moose / Khan)** | PreK–1 | Do math activities (juice shop, lost & found, etc.) → earn items → build and decorate "Moose Town" | No rigorous study found; widely recommended | **Town-building as reward** for 4–7-year-olds; report card; free, no ads | Building is a reward for math rather than done *with* math |
| **Zearn** | K–8 | Teacher-paced digital lessons (video/interactive with manipulatives) + "Tower of Power" fluency/mastery checks | **Strongest independent evidence**: RAND RCT (~10,000 students, grades 3–5) gave Tier 1 "Strong" on Evidence for ESSA; +0.07 SD on STAAR (confirmatory), +0.11 SD on MAP (exploratory) | Visual-model progression; mastery check before moving on | Not a game; little autonomy; assumes classroom |
| **DreamBox** | K–8 | Adaptive lessons built on virtual manipulatives; engine examines *how* a child solves (strategy) | Harvard CEPR (~3,000 students, grades 3–5): more usage correlated with larger gains. Authors call the causal evidence "encouraging but mixed"; most students under-used it | Manipulatives as input; strategy-aware adaptivity | Low intrinsic pull: students did not reach recommended usage |
| **Todo Math (Enuma)** | PreK–2 | Daily missions across 700+ activities; tracing numbers, counting, ten frames, clocks, money | Enuma's Kitkit School co-won the Global Learning XPRIZE (2019). No independent Todo Math study found | Accessibility-first design; short daily "missions"; varied activity types | — |
| **Beast Academy Online (AoPS)** | 1–5 | Comic-book lessons (monster characters) → puzzle-heavy problems → challenge/"star" problems; spiral review | Commissioned evaluations (Utah UEPC 2025, WestEd). Strong reputation with advanced kids. Reviewers say it is hard for struggling learners | **Best fit for "advanced" kids**: puzzles, multi-step reasoning, humor; challenge is the reward | Text-heavy for pre-readers |
| **Synthesis Tutor** | K–5 | AI voice tutor guiding kids through interactive manipulative-based lessons; asks kids to explain thinking | Company-reported only | Voice-led, manipulative-based, "explain why" prompts | Unverified claims; price |
| **Math Academy** | ~4–college | Diagnostic → knowledge-graph-driven lessons and spaced reviews (FIRe); XP ≈ 1 minute of focused work; leagues | Strong anecdotal reports from advanced learners; developer documents the method in detail | **Model for scaling to 11–14 advanced kids**: honest XP-as-effort, spaced repetition over prerequisite graph, no fluff | Austere; not suitable for K |
| **SplashLearn** | PreK–5 | Adaptive game-like practice; earn coins for avatars/pets; parent subscription | Vendor claims; mixed reviews on billing | Broad K–5 skill map | Subscription pressure; mostly extrinsic wrappers on drills |
| **Reflex Math** | 2–8 | Adaptive fact-fluency mini-games; green "fluency light" fills; tokens for avatar/store | One RCT (Title I, n ≈ 150) improved fluency. An independent study found fluency gains but no STAR Math gains. Vendor data large but correlational | Short daily sessions; automaticity tracking per fact; "green light" daily completion | Token store as main motivator; fluency ≠ understanding |
| **Times Tables Rock Stars** | 2–6 | Timed multiplication "gigs"; "Rock Status" title based on speed; coins → avatar; class-vs-class "battles" | No formal studies (2024 academic critique). Vendor data show answer times falling ~9 s → ~4 s | Speed as *self-improvement* title; team events | Public speed competition can drive anxiety; leaderboards discourage slower kids |
| **Duolingo Math** | ~1–adult | Bite-sized lessons in the Duolingo app; XP, streaks, leagues | Reviews: polished but shallow/easy. No efficacy data found | Very short lessons; polish; celebration animations | Streak anxiety; shallow content |
| **Kahoot!** (quiz platform) | all | Teacher-hosted timed quizzes with leaderboard and music | Literature review (Wang & Tahir 2020): positive effects on engagement and some learning outcomes, mostly classroom and short-term | Energy, music, live sibling/family "show" moments | Speed-dominated scoring; extrinsic |

### 1.2 Notes on key apps

**Prodigy: the cautionary example.** Kids walk a fantasy world, encounter monsters, and in
turn-based battles must answer math questions to cast spells. Pets ("Epics") are collectible; the
monthly "Mythical Epics" are tied to Plus/Ultra memberships
([Prodigy Mythical Epics](https://www.prodigygame.com/mythical-epics);
[Prodigy membership](https://prodigygame.com/membership)). The adaptive placement test starts a
grade below the selected grade and works up
([Prodigy parents' guide](https://prodigygame.com/blog/parents-guide-to-prodigy)). That part is
worth copying.

In 2021, 22 groups led by the Campaign for a Commercial-Free Childhood (now Fairplay) filed an FTC
complaint ([EdWeek](https://www.edweek.org/technology/popular-interactive-math-game-prodigy-is-target-of-complaint-to-federal-trade-commission/2021/02);
[Axios](https://www.axios.com/2021/02/19/prodigy-math-game-ftc-complaint);
[complaint PDF](https://fairplayforkids.org/wp-content/uploads/2021/02/Prodigy_Complaint_Feb21.pdf)).
Fairplay's "7 reasons" page ([fairplayforkids.org](https://fairplayforkids.org/?p=26304)) makes
these claims:
- 16 membership ads vs 4 math problems in 19 minutes.
- Math disconnected from the story. Fairplay suggests math should drive the story, for example
  computing the planks needed to cross a ravine.
- A shopping-mall hub with friends' purchases displayed.
- Members advance faster (pay-to-win).
- An estimate, based on Prodigy's own research, of ~888 questions (12+ focused hours) per +1 point
  on a standardized test.

Prodigy disputes these claims. A parent writing in *The Argument* reported under 30 seconds of math
in ~10 minutes of play
([The Argument](https://www.theargumentmag.com/p/homework-shouldnt-be-all-fun-and)). The lesson for
us: a game that kids love is not enough if the math is a toll booth on the way to the fun part.

**DragonBox: intrinsic integration done right, with caveats.** The algebra games teach "isolate the
box" with picture cards that gradually become symbols. Evidence: a 2023 AERA Open study of 3,600+
grade 7 students found higher post-test scores for *From Here to There* and *DragonBox 12+* vs active
control ([DOAJ record](https://doaj.org/article/28d05a10d8ea487f80d0c3b6811e3e9d);
[project summary](https://sites.google.com/view/from-here-to-there/research-findings_1/summary-of-findings)).
Other studies show conceptual but not procedural gains. Transfer is contested: a 2017 classroom
study compared DragonBox to an ITS with paper tests, and grade 8 students showed higher engagement
but lower learning than textbook practice. Vendor claims such as "83% learn algebra basics in an
hour" are not peer-reviewed ([Kahoot/DragonBox blog](https://kahoot.com/blog/2023/02/27/dragonbox-algebra-mitigated-learning-loss/)).
Takeaway: intrinsic mechanics need **explicit bridging to standard notation**, through concreteness
fading and "now write it the grown-up way" moments.

**Kahoot! Numbers / Big Numbers by DragonBox.** "Nooms" are creatures representing 1–10 that kids
stack, combine, and split. Number decomposition *is* the play
([Common Sense: Numbers](https://www.commonsensemedia.org/app-reviews/dragonbox-numbers)).
*Big Numbers* (grades 1–4) wraps place value and regrouping in building a world for Nooms. Common
Sense finds it fun and motivating but slow in early stages
([Common Sense: Big Numbers](https://www.commonsensemedia.org/app-reviews/kahoot-big-numbers-dragonbox);
[Common Sense Education](https://www.commonsense.org/education/reviews/kahoot-big-numbers-dragonbox)).
**This is the closest existing analogue to our recommended frame.**

**Khan Academy Kids.** Free, no ads, no subscriptions, COPPA-compliant, ages 2–8, content up to
~2nd grade ([App Store](https://apps.apple.com/app/khan-academy-kids-learning/id1378467217);
[Common Sense](https://www.commonsensemedia.org/app-reviews/khan-academy-kids)). A UMass Amherst
RCT (~50 low-income preschoolers, 10 weeks) found early-literacy gains (34th → 47th percentile;
ES ≈ .72) ([UMass](https://www.umass.edu/news/article/new-educational-app-shows-promise);
[EdWeek](https://www.edweek.org/leadership/khan-app-boosted-early-literacy-parent-teaching-in-small-trial/2020/05)).
No separate math efficacy result was found.

**Moose Math.** Kids complete math activities to earn items, then build and decorate Moose Town.
It includes a parent/teacher report card and is free with no ads
([Common Sense](https://www.commonsensemedia.org/app-reviews/moose-math-by-duck-duck-moose);
[App Store](https://apps.apple.com/us/app/moose-math-by-duck-duck-moose/id660345152)).
This shows that town-building works as a motivator for ages 4–7. We want to go further: make the
building itself mathematical.

**Zearn.** Received an ESSA Tier 1 "Strong" rating from a RAND RCT: 10,000 students in grades
3–5, 64 schools, +0.07 SD on STAAR (confirmatory) and +0.11 SD on MAP (exploratory)
([Zearn press release](https://about.zearn.org/press-releases/evidence-for-essa);
[Zearn research](https://about.zearn.org/research)). Zearn is the evidence benchmark: modest but
real causal gains from visual-model-based digital lessons with mastery checks. It is not a game.

**DreamBox.** Harvard CEPR studied ~3,000 students in grades 3–5. More usage went with larger
gains, and following recommendations rather than repeating lessons went with faster gains. However,
"most students did not reach the recommended levels of usage", and the causal evidence was
"encouraging but mixed"
([CEPR](https://cepr.harvard.edu/dreambox-learning-achievement-growth)). Lesson: pedagogically
sound adaptivity fails if kids don't *want* to use it. That is the gap a game frame fills.

**Todo Math / Enuma.** 700+ activities for PreK–2, launched 2014. Enuma's Kitkit School co-won the
$10M Global Learning XPRIZE in 2019 for tablet-based learning with no adult instruction
([EdSurge](https://www.edsurge.com/news/2019-05-15-the-5-year-15-million-global-learning-xprize-competition-is-over-here-s-who-won);
[XPRIZE](https://annualreport.xprize.org/prizes/global-learning)). Kitkit School is relevant
because it proves that a self-directed tablet app for pre-readers can produce learning gains.

**Beast Academy Online.** Art of Problem Solving's program for ages ~6–13. It uses comic-based
concept intros, puzzle-heavy practice, logic puzzles, and spiral review, and has a strong reputation
with advanced kids. Reviewers note it is hard for kids who are behind
([Homeschool Fox](https://homeschoolfox.com/curriculum/beast-academy);
[UEPC report 2025 (commissioned)](https://uepc.utah.edu/_resources/documents/beast-academy-report-2025.pdf);
[WestEd evaluation](https://www.wested.org/resources/evaluation-of-beast-academy/)). **For
advanced kids, hard puzzles *are* the reward.** Include genuinely challenging optional puzzles.

**Synthesis Tutor.** An AI voice tutor for ages ~5–11 that uses visual manipulatives, adaptive
difficulty, and narration, and asks kids to explain their reasoning
([synthesis.com](https://synthesis.com/);
[Homeschool Fox](https://homeschoolfox.com/curriculum/synthesis-tutor)). Evidence is
company-reported only. It is useful as a model for voice-led, manipulative-based instruction.

**Math Academy.** XP is defined as ~1 minute of focused effort, with a recommended 20–40 XP/day.
A knowledge graph schedules spaced reviews, and reviews of advanced topics "trickle down" to
prerequisites (Fractional Implicit Repetition)
([How it works](https://mathacademy.com/how-it-works);
[Justin Skycak on FIRe](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/);
[Frank Hecker, a year of Math Academy](https://frankhecker.com/2026/01/10/a-year-of-math-academy/)).
Parents report XP often takes 2–3 minutes in practice. Michael Pershan's critique warns that spaced
repetition can reinforce shallow understanding
([notes](https://notes.andymatuschak.org/Math_Academy)). **Borrow the engine (graph + spacing +
honest XP) for the "older kid" end of the app.**

**Reflex Math.** Adaptive fact-fluency games with a daily "green light" goal. A Title I RCT
(74 vs 77 students) found greater fluency gains
([ExploreLearning research](https://reflex.explorelearning.com/research/research-behind-reflex)).
An independent Touro study found improved fluency and attitudes but no significant STAR Math
improvement ([Touro](https://touroscholar.touro.edu/tucgsoe/162)). Fluency is necessary but not
sufficient.

**Times Tables Rock Stars.** Timed multiplication, rock-star persona, speed-based status, coins for
avatar, and class/school competitions. A 2024 academic critique notes no formal research on its
effectiveness ([Southampton EdPsych blog](https://blog.soton.ac.uk/edpsych/?p=1410)). Vendor data
show average answer time dropping ~56%
([TES interview](https://www.tes.com/news/edtech-success-bruno-reddy-times-tables-rock-stars)).
Emulate the self-improvement status. Avoid public speed leaderboards for young kids.

**Duolingo Math.** Gamified math inside the Duolingo app with streaks, XP, and short lessons
([Duolingo blog](https://blog.duolingo.com/new-subjects/);
[Technical.ly review](https://technical.ly/startups/duolingo-math-app-review/)). It is polished
with excellent celebration feedback, but reviewers find it shallow. Its streak mechanics are
discussed in §3.4.

**Kahoot!** A literature review (Wang & Tahir, *Computers & Education*, 2020,
[doi:10.1016/j.compedu.2020.103818](https://doi.org/10.1016/j.compedu.2020.103818)) reports positive
effects on engagement, classroom dynamics, and some learning outcomes, mostly in short-term
classroom studies. The live, music-driven "game show" energy is great for occasional family events.
Speed-based scoring disadvantages a 5-year-old against an 8-year-old unless handicapped.

---

## 2. Research on game-based learning

### 2.1 Intrinsic integration: Habgood & Ainsworth (2011), *Zombie Division*

Habgood, M. P. J., & Ainsworth, S. E. (2011). "Motivating children to learn effectively: Exploring
the value of intrinsic integration in educational games." *Journal of the Learning Sciences*,
20(2), 169–206. doi:10.1080/10508406.2010.508029
([Nottingham repository](https://nottingham-repository.worktribe.com/output/23577510/motivating-children-to-learn-effectively-exploring-the-value-of-intrinsic-integration-in-educational-games);
[SHU repository](https://shura.shu.ac.uk/3556)).

- **Game:** a 3D adventure for ages 7–11. Skeleton enemies carry numbers on their chests. The
  player attacks with weapons that represent divisors (2, 3, 4, 5…), and only a weapon that divides
  the enemy's number evenly defeats it. Division *is* the combat.
- **Conditions:** intrinsic (math in the combat), extrinsic (same game with a math quiz between
  levels), and a non-game control.
- **Study 1 (n = 58):** under fixed time, the intrinsic version produced greater learning gains.
- **Study 2 (n = 16, free choice):** children spent about **7x** as long playing the intrinsic
  version ([KQED MindShift](https://www.kqed.org/mindshift/20765/whats-the-secret-sauce-to-a-great-educational-game)).
- **Design principles from Habgood's thesis/related work**
  ([Nottingham eprint](https://eprints.nottingham.ac.uk/10385);
  [Simulation & Gaming 2005](https://ideas.repec.org/a/sae/simgam/v36y2005i4p483-498.html)):
  1. Deliver learning through the parts of the game that are most fun (the core mechanic and flow
     experience), not the fantasy wrapper.
  2. Embody the learning material in the structure and representations of the game world.

**Implication:** every mini-game must pass the test *"if I removed the math, would the game stop
working?"* If the answer is no, the math is extrinsic. Redesign it.

### 2.2 Malone's foundations and the "chocolate-covered broccoli" critique

- Malone (1981) identified **challenge, curiosity, and fantasy** as sources of intrinsic motivation.
  He argued that fantasy should be *endogenous*, meaning connected to the learning content.
- **"Chocolate-covered broccoli"** describes edutainment that wraps drills in thin game chrome
  (classic example: *Math Blaster*). Amy Bruckman (1999, "Can Educational Be Fun?") used the image,
  and Brenda Laurel popularized "chocolate-covered broccoli" in *Utopian Entrepreneur* (2001)
  ([Tedium](https://tedium.co/2019/05/09/edutainment-math-blaster-chocolate-covered-broccoli);
  [The Avocado](https://the-avocado.org/2021/11/17/thats-edutainment-duolingo-and-chocolate-dipped-broccoli);
  [Meaningful Play 2014](https://meaningfulplay.msu.edu/proceedings2014/mp2014_submission_20.pdf)).
- Two failure modes: kids eat the chocolate and skip the broccoli (Prodigy wandering), or they
  detect the trick and resent it.

### 2.3 Overjustification effect and rewards

- **Lepper, Greene & Nisbett (1973):** preschoolers who liked drawing and were told they'd get a
  "Good Player" certificate later drew *less* in free play than those who got no award or an
  unexpected one ([PDF](https://typeset.io/pdf/undermining-children-s-intrinsic-interest-with-extrinsic-3qn44yqiou.pdf)).
- **Deci, Koestner & Ryan (1999)**, *Psychological Bulletin* 125(6), a meta-analysis of 128
  experiments ([PDF](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf)):
  - Expected tangible rewards contingent on engagement, completion, or performance undermine free-choice
    intrinsic motivation. The effect is stronger for children than adults.
  - Verbal rewards (positive, informational feedback) tend to *enhance* intrinsic motivation.
  - Unexpected tangible rewards did not undermine it.
  - The finding is contested by Cameron, Pierce & Eisenberger, but the core pattern is broadly
    accepted ([2001 follow-up](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)).
- **Applied rules:**
  - Do not pay coins per correct answer as the primary loop.
  - Prefer *informational* feedback: "You made 10 two different ways!"
  - Give *surprise* gifts: a resident brings a present.
  - Rewards should unlock *new things to do with math*, such as new tools, new building types, or
    harder puzzles, more than inert cosmetics.
  - **Parent-awarded real-world rewards** should be occasional, unexpected or celebratory, tied to
    effort or persistence milestones rather than per-problem, and framed as celebration ("let's
    celebrate finishing the bridge with a family game night") rather than payment.

### 2.4 Self-determination theory (SDT) in games

Ryan, Rigby & Przybylski (2006), "The motivational pull of video games: A self-determination theory
approach," *Motivation and Emotion* 30(4). Across four studies, perceived **autonomy, competence,
and relatedness** independently predicted enjoyment and intent to keep playing. This work led to
the PENS measure
([PDF](https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf);
[CSDT: PENS](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/)).

| Need | How it shows up in this app |
|---|---|
| Autonomy | Choose which workshop to visit and which project to build; decorate freely; choose avatar or creature; optional challenge puzzles; a "free play" sandbox with manipulatives |
| Competence | Calibrated ~85–90% success; visible mastery (skill garden grows); "you used to need 6 s, now 2 s" personal-best stats; boss puzzles that feel hard but winnable |
| Relatedness | Sibling co-op builds; residents who remember the child; parent dashboard plus "show a grown-up" moments; family events |

### 2.5 Flow and challenge–skill balance

- Csikszentmihalyi's flow channel: challenge matched to skill, clear goals, immediate feedback.
  Jenova Chen's "Flow in Games" (2006 MFA thesis) argues for player-controlled
  difficulty adjustment so different players can find their own flow zones
  ([jenovachen.com](https://www.jenovachen.com/flowingames/)).
- **Lomas, Patel, Forlizzi & Koedinger (CHI 2013)**, "Optimizing challenge in an educational game
  using large-scale design experiments." This was a large online experiment with *Battleship
  Numberline*. Easier settings produced *more* engagement, contrary to the "moderate challenge
  maximizes motivation" assumption. Engagement was reported highest near ~90% success
  ([PDF](https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf);
  [CMU HCII](https://hcii.cmu.edu/news/chi-preview-researchers-hcii-believe-difficulty-can-be-overrated-games)).
- **Wilson, Shenhav, Straccia & Cohen (2019)**, "The Eighty Five Percent Rule for optimal
  learning," *Nature Communications* 10:4646. For gradient-descent learners, training accuracy
  ≈ 85% maximizes learning rate. This is a theoretical result for simple binary tasks, not a
  classroom law ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579)).
- **Design target:** keep each child's rolling first-attempt accuracy in roughly the **80–90%**
  band. Push toward the lower end in "learn" activities and the higher end in "play/fluency"
  activities. Let the child opt into harder "spicy" variants for autonomy.

### 2.6 Meta-analyses on math games

- **Tokac, Novak & Thompson (2019)**, *J. Computer Assisted Learning*: PreK–12 math video games vs
  traditional instruction. Small but positive overall effect, **d ≈ 0.13**, with high heterogeneity
  ([record](https://www.scinapse.io/papers/2913074290);
  [author PDF](https://annescollege.fsu.edu/sites/g/files/upcbnu4516/files/Umit-Tokac.pdf)).
- **Game-based learning and math higher-order thinking** (Psicodidáctica): small positive effect
  (g ≈ .13) ([link](https://ojs.ehu.eus/index.php/psicodidactica/article/view/28240)).
- **Wang et al. (2022)**, digital game-based STEM, *IJ STEM Education*
  ([PDF](https://link.springer.com/content/pdf/10.1186/s40594-022-00344-0.pdf)).
- A Turkish primary-school meta-analysis found digital games had a smaller effect (≈0.44) than
  non-digital games (≈1.03). The sample is regional
  ([Dergipark](https://dergipark.org.tr/en/pub/iperj/article/1067794)).
- **Virtual manipulatives:** Moyer-Packenham & Westenskow (2013; revisited 2016) found moderate
  effects (~**0.34**) vs other instruction. They identified five beneficial affordances: *focused
  constraint, creative variation, simultaneous linking (of representations), efficient precision,
  motivation* ([PDF](https://blogs.sd38.bc.ca/sd38mathandscience/wp-content/uploads/sites/14/2020/06/VMMetaAnalysisPaper.MoyerPackenhamWestenskow.pdf);
  [2016](https://digitalcommons.usu.edu/teal_facpub/2399)).
- **Interleaving:** Rohrer, Dedrick, Hartwig & Cheung (2020), *J. Educ. Psych.* 112(1). A cluster
  RCT with 787 7th graders in 54 classes: interleaved practice scored 61% vs 38% for blocked
  practice on a test one month later (d = 0.83). The study meets WWC standards without reservations
  ([WWC](https://ies.ed.gov/ncee/wwc/Study/88770)).
- **Competition vs collaboration:** Plass et al. (2013), *J. Educ. Psych.* 105(4). In an arithmetic
  fluency game, competition increased in-game performance. Both competitive and collaborative play
  increased situational interest, and collaboration produced the strongest intent to play again
  ([ScienceDaily](https://www.sciencedaily.com/releases/2013/11/131106122025.htm)).
- **Wuzzit Trouble** (Devlin's puzzle game; Pope & Mangram 2015, *IJ Serious Games*): 3rd graders
  who played for ~120 minutes improved significantly on number sense vs a comparison class. The
  study is quasi-experimental with n = 59
  ([IJSG](https://journal.seriousgamessociety.org/index.php/IJSG/article/view/88);
  [Stanford](https://ed.stanford.edu/news/stanford-study-shows-how-digital-math-games-can-teach-more-rote-skills)).
  This supports *constraint puzzles* (several mathematical constraints at once, with try–check–revise
  loops) as a core activity type.
- **Slice Fractions** (Ululab/UQAM): 3rd graders learned as much as with conventional instruction
  and transferred to abstract fraction items
  ([IATED 2016](https://library.iated.org/view/CYR2016GAM)). This is an intrinsic physics-puzzle
  fraction game that requires no text.

**Reading of the literature:** games on average give *small* positive effects. Well-designed
intrinsic games and manipulative-based tools sit at the top of the distribution. The big win of a
game is usually **more time on task and willingness to return**, so the game must not waste that
time.

### 2.7 Concreteness fading

Fyfe, McNeil, Son & Goldstone (2014), "Concreteness fading in mathematics and science instruction:
a systematic review," *Educ. Psychol. Rev.* 26, 9–25
([doi:10.1007/s10648-014-9249-3](https://doi.org/10.1007/s10648-014-9249-3)). Move from concrete
(objects) to iconic (simplified pictures) to abstract (symbols), with explicit linking between
them. DragonBox's cards-to-variables progression is the canonical game example. Every mechanic in
§4 should have a fading path. For example, a ten frame with apples becomes a ten frame with dots,
which becomes "7 + 3 = 10".

---

## 3. Gamification mechanics for ages 5–10, scaling to ~14

### 3.1 Mechanic catalog with age guidance

| Mechanic | Ages 5–7 | Ages 8–10 | Ages 11–14 | Notes |
|---|---|---|---|---|
| **Progression / world map** | Linear numbered path (number line as map), big landmarks | Branching map with zones per strand (number, geometry, measurement) | Skill-tree / knowledge graph view; "fog of war" reveal | Linear numbered paths are themselves pedagogically useful (Siegler & Ramani) |
| **Collectibles** | Number creatures (a "7" creature made of 7 parts), stickers | Creature evolution through math (combine 3 and 4 → 7, a fraction creature) | Rare puzzle trophies, proofs collection, "named theorems" | Collect *mathematical objects* rather than random loot |
| **Avatar / pet / creature companion** | Pet that reacts (cheers, sleepy at session end) | Customization unlocks from milestones | Avatar becomes less central; identity via titles and achievements | Companion is a relatedness lever; never "sad because you didn't play" |
| **Home base building / decorating** | Place items freely; build with shapes | Build with constraints (area, perimeter, budget) | Design challenges (scale drawings, volume, optimization) | Strongest K→8 scaling (see Concept B) |
| **Story / quests** | Short voiced character requests ("I need 8 shells!") | Multi-step quests across workshops | Mystery/puzzle arcs, "the island economy is failing, fix it with ratios" | Keep story lightweight; story that gates math is expensive to author |
| **Streaks** | Avoid daily streaks. Use a "week garden": a flower grows per session, no wilting | Weekly goal (e.g., 4 of 7 days), auto freeze | Optional streak with freezes and repair | See §3.4 |
| **Daily goal** | "3 activities today" ring that completes | Time or XP goal set with parent | Self-set XP goal (Math Academy model) | Goals should end the session, not extend it |
| **XP & levels** | Avoid numbers; use visible growth (island grows) | Levels per skill (mastery stars) | Honest XP ≈ minutes of focused work | Tie XP to effort/mastery, not to clicking |
| **Badges** | Picture stickers for *firsts* ("first make-ten!") | Badges for strategies ("used doubles"), persistence | Hard-challenge badges, puzzle-hunt achievements | Badges reward process and strategy, not just volume |
| **Boss challenges** | "Big puzzle" with a friendly giant; scaffolds available; can't "lose" | Multi-step boss combining skills (end-of-zone check) | Timed or untimed challenge sets, competition problems (MATHCOUNTS-style) | Boss = mastery check; failure → "train and come back", no loss of progress |
| **Sibling co-op** | Co-op build with each kid's own-level tasks | Same | Older kid as "mentor" role | §3.3 |
| **Friendly competition** | Avoid head-to-head speed. Use "beat your own best" | Handicapped races; family quiz show | Leaderboards vs self or opt-in friends | Plass 2013: competition boosts performance, collaboration boosts replay intent |
| **Parent-awarded real-world rewards** | Parent sees milestones, gives occasional celebration | Family goals ("20 sessions → museum trip") | Same, negotiated with the kid | Unexpected, celebratory, not per-problem (§2.3) |

### 3.2 Healthy "currency" design

- Earned currency (shells, bricks) should come from **math-integrated building activity**, not from
  answering questions on a separate screen.
- Example: in the Bakery workshop, you *make* bread by composing 10 from two trays. The bread is
  then used to pay builders.
- No purchasable currency, no randomized rewards (loot boxes), no time-limited offers.
- Spending should be **non-punitive and reversible**: undo, rearrange freely. Nothing decays.
- Rewards unlock **capabilities**: new tools such as a ruler, a balance scale, or a protractor, and
  new building types. Each new capability brings a new math mechanic. This ties progression to
  curriculum progression, so "leveling up" means "learning more math".

### 3.3 Two kids at different levels: co-op and fair competition

**Co-op patterns:**
- **Shared island, separate workbenches.** Both kids contribute to the same build, each receiving
  problems from their own adaptive level. Example: the bridge needs 20 planks. The K kid makes
  planks by counting or making ten; the 2nd grader makes planks with two-digit addition. Both see
  the bridge grow.
- **Asymmetric roles** (like *Mario Odyssey*'s Cappy player or *Kirby*'s helper characters). The
  older child does the "measuring", the younger does the "counting/placing". On one device, use
  pass-and-play turns with a big "Your turn, [name]!" voice prompt and an avatar swap.
- **Interlocking projects:** some buildings need one contribution from each sibling. This drives
  relatedness and gives the older child a natural mentoring role without doing the younger child's
  math. Optionally reward "explaining": the older kid can record a hint.

**Handicapped competition patterns:**
- **Level-relative scoring:** each kid's problems are calibrated to their ~85–90% band, and scoring
  is "correct answers within *your* target time". The race is fair because difficulty differs.
- **Personal-best racing:** each kid races their own ghost (previous best). The family scoreboard
  shows *improvement*, not raw totals.
- **Team vs the game:** both kids together vs a friendly "storm" or "puzzle giant". Cooperation
  framed as a competition against the system gives competition's energy without sibling losers.
- **Family quiz show** (Kahoot-style, occasional): different question decks per player, equal
  points per correct answer, music and celebration. Parents can play too with "grown-up" questions.

### 3.4 Streaks without guilt

Evidence: Duolingo explicitly designs streaks around *loss aversion*. Streak Freeze exists because
losing a streak is aversive ([Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)).
Critics document anxiety and compulsive use
([Smashing Magazine 2026](https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/);
[Mobbin study of 859 streak designs](https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs)).
Khan Academy removed its streak feature in 2021
([Khan support thread](https://support.khanacademy.org/hc/fr/community/posts/12848471851533-Streak-system)).

**Rules for this app:**
- No daily streak for ages 5–8. Use a **weekly** rhythm ("3 sessions this week"), set by the parent.
- Represent consistency as **accumulation**, never as a loss. Example: a garden gains a flower each
  session day. Flowers never wilt. Missing days shows nothing negative.
- If streaks exist for older kids: auto-applied freezes (e.g., 2/week), weekend-optional, and
  no "you'll lose your streak!" notifications.
- No guilt-tripping companions. The pet is never sad or hungry because the child didn't play.
- Celebrate *returning* ("Welcome back! The island missed you, look what grew") rather than
  punishing absence.

### 3.5 Dark patterns to avoid (hard rules)

Radesky et al. (2022), "Prevalence and Characteristics of Manipulative Design in Mobile Applications
Used by Children," *JAMA Network Open* 5(6):e2217641. Nearly all children in the sample (~99%) used
at least one app with manipulative design. These features included:
- parasocial pressure from characters;
- lures to prolong play;
- pressure to purchase;
- disguised ads;
- roadblock ads that can't be closed for ~20 s.

Such features were more common in apps used by lower-SES children
([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/);
[Michigan Medicine](https://www.michiganmedicine.org/health-lab/design-tricks-commonly-used-monetize-young-childrens-app-use)).
The UK ICO Children's Code (Standard 13, nudge techniques) prohibits nudges that work against
children's interests. It encourages pro-wellbeing nudges such as break prompts and pause/save
features ([ICO Standard 13](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/)).

**Never:**
- ads of any kind;
- in-app purchases or paid currency;
- loot boxes or gacha;
- randomized paid rewards;
- countdown-timer offers;
- limited-time "event" items that vanish (FOMO);
- characters that guilt or beg;
- push notifications to the child;
- infinite autoplay ("one more" chains without a stop point);
- social comparison of purchases;
- pay-to-win;
- "lives" or "hearts" lost on mistakes (punishes the struggling learner and gates practice);
- dark-pattern confirmations ("No, I don't want to get smarter").

**Always:**
- natural end points;
- a parent-set session timer that ends gracefully ("the island is going to sleep");
- parent dashboard behind a parent gate;
- all content available to all players (no paywalls, given it's a family app).

---

## 4. Interactive mechanics for specific math concepts

### 4.1 Reference tools (for interaction design inspiration)

- **Mathigon Polypad** (now part of Amplify): free canvas with number tiles, fraction bars, algebra
  tiles, number lines, balance scales, geoboards, tangrams, and pentominoes. It is the gold standard
  for manipulative interaction feel ([mathigon.org](https://mathigon.org);
  [Amplify free activities](https://go.info.amplify.com/freemathactivities)).
- **Toy Theater**: simple, bright, ad-free K–3 manipulatives (clocks, coins, rekenrek, fraction
  strips) ([overview](https://www.teachingchannel.com/k12-hub/blog/10-free-online-manipulative-reosurces-to-add-to-your-math-toolbox)).
- **NCTM Illuminations**: ~100 interactives (ten frame, spinners, isometric drawing, geometric
  solids) ([TCEA](https://blog.tcea.org/virtual-manipulatives-for-math-remote-learning)).
- **Didax** virtual manipulatives: ten frames, rekenrek, base-ten, fraction tiles, unifix cubes.
- **Clements & Sarama learning trajectories** ([learningtrajectories.org](https://learningtrajectories.org/);
  IES subitizing module [PDF](https://ies.ed.gov/ncee/rel/math-young-children/pdf/TMYC_Mod1_Subitizing_Developmental_Progression.pdf)):
  developmental progressions and activities such as "Snapshots" (quick-flash dot images).

### 4.2 Concept → mechanic catalog (K–8)

Each row lists an **intrinsically integrated** game mechanic, where the math is the action, and an
in-world framing for an island-builder frame.

| Concept (grade) | Manipulative / mechanic | Intrinsic game framing | Input on touch |
|---|---|---|---|
| Subitizing 1–5, conceptual to 10 (PreK–K) | Flash dot patterns, dice, ten frames shown ~1 s | "Firefly count": fireflies blink in groups; tap the matching number of lanterns to catch them. Speed emerges naturally as fireflies fade | Tap big numerals (1–10 tiles) |
| Counting, 1-to-1 correspondence (K) | Count-and-move objects | Feed each creature exactly one berry; creature glows when fed | Tap or drag; auto-snap |
| Number path / linear board game (PreK–1) | Linear numbered board, spinner 1–2 or die 1–3, **say the numbers while moving** | The island path itself is numbered 1–100; moving your boat says each number aloud ("6, 7, 8!"). Mirrors Siegler & Ramani's protocol | Tap spinner; token auto-moves with counting audio; child taps each square (counting on) |
| Number line estimation 0–10, 0–100, 0–1000, fractions, decimals, negatives (K–8) | Place number on an unmarked line; feedback shows distance | "Drop the treasure": a crab says "I buried it at 37". Place the marker; the dig reveals how close you were (hot/cold). Battleship Numberline-style | Tap location (no drag precision needed); magnifier for older kids |
| Make ten / decomposition (K–1) | Ten frames, number bonds, Nooms-like creatures | "Ten-boat": a boat sails only with exactly 10 passengers; combine creature groups (7 + 3) | Drag groups or tap pairs |
| Addition/subtraction within 20, strategies (K–2) | Rekenrek (2 rows of 10 beads, 5/5 color split), ten frames, number line hops | "Abacus bridge": slide beads to show 8 + 6 as 10 + 4 to open the gate | Swipe beads in groups (grab "5 at once") |
| Place value, regrouping (1–3) | Base-ten blocks (units, rods, flats); 10 units merge into a rod | "Brick factory": 10 bricks auto-fuse into a rod when grouped; trading rods for bricks to "borrow" | Drag; pinch-to-merge optional; tap "trade" |
| Multi-digit add/subtract (2–4) | Base-ten plus place-value chart; open number line | Shipments of materials arrive in hundreds/tens/ones crates | Same |
| Fact fluency (+, −, ×, ÷) (1–5) | Strategy first (doubles, make ten, ×5/×10, near-squares), then retrieval practice | "Rhythm harvest": crops ripen to a beat and the right answer harvests. Per-fact adaptive timing (Reflex-style), private, self-competitive | Big answer tiles (multiple choice for young kids), number pad for older kids |
| Multiplication as arrays/area (2–4) | Array builder, area model | "Garden plots": plant a 4 × 6 bed; the number of seeds is the product; split 7 × 8 into 7 × 5 + 7 × 3 by drawing a fence | Drag-to-draw rectangle on grid, snap to cells |
| Division (3–5) | Fair sharing, grouping (quotative), remainders | Zombie-Division-style: share 24 fish equally among creature families; leftovers go to the seagull (remainder) | Drag groups, auto-distribute animation |
| Fractions (2–5) | Fraction bars, circles, number line, area models | "Slice the pizza/cake for guests" (Slice Fractions style); equivalent fractions as stacking bars; compare on number line | Tap to cut (snap cuts); drag bars |
| Time (1–3) | Analog clock with geared hands | "Ferry schedule": set the clock to depart; elapsed time on a time number line | Drag hand (large handle) or tap ± buttons |
| Money (1–3) | Coins/bills, making change | Island market: pay exact amounts, make change at your shop | Tap coins into tray |
| Measurement, length (1–3) | Unit iteration, ruler | Measure a bridge gap with planks, then with a ruler | Drag planks end-to-end (auto-align) |
| Geometry, shapes (K–2) | Tangrams, pattern blocks, geoboard | "Fill the window": compose shapes to fill outlines; geoboard for fences | Drag + tap-to-rotate (no two-finger rotate for K) |
| Area & perimeter (3–5) | Grid builder | Fence (perimeter) vs grass (area) cost; fixed fence length, maximize garden | Draw on grid |
| Patterns & early algebra (K–3) | AB/ABC patterns, growing patterns, function machines | "Bead necklaces"; "Machine shop": input → machine → output; guess the rule | Tap/drag |
| Equations / balance (1–8) | Balance scale, algebra tiles, DragonBox-style isolation | "Ship cargo balance": keep the scale level; later boxes are "x" | Drag weights; tap "remove same from both sides" |
| Coordinates (5–8) | Coordinate grid | Treasure maps; place buildings by coordinates; later negative quadrants | Tap grid intersections |
| Ratios & rates (6–7) | Tape diagrams, double number lines, ratio tables | Recipes at the bakery scaled for guests; paint mixing to match color (ratio) | Drag on double number line |
| Percents, budgeting (6–7) | 100-grid, tape diagram | Island economy: taxes, discounts, interest at the bank | Tap/number pad |
| Integers (6–7) | Number line with negatives, zero pairs (+/− tiles) | Elevator to underwater caves; temperature; zero-pair annihilation animation | Drag tiles |
| Linear functions (7–8) | Tables, graphs, "machines" | Machine outputs plotted; tune a conveyor belt's rate and start (slope, intercept) to hit targets | Drag points / sliders |
| Logic puzzles (all) | KenKen, magic squares, Wuzzit-style constraint puzzles, Sudoku variants, "Numbo"/24-game, Hidato | Optional "Puzzle Tower", daily puzzle, "spicy" challenge rewards for advanced kids | Tap cell + big number pad |

### 4.3 Number writing / handwriting input

- Numeral writing is a real K–1 skill, worth including as an *optional* input method with a
  tracing → guided → free progression. Show direction arrows and start dots.
- Evidence on recognition accuracy for 4–6-year-olds' finger-written digits is thin. Small
  prototypes show feasibility with lightweight CNNs (e.g., MobileNet)
  ([Springer 2022](https://link.springer.com/doi/10.1007/978-981-16-8129-5_153)), and kids rate
  finger handwriting input positively
  ([1×1 trainer](https://igi.indrastra.com/items/show/1297)).
- **Recommendation:**
  - Never require handwriting to progress for K.
  - Use a constrained recognizer: only digits 0–9, with the expected answer as a prior.
  - Be lenient. On low-confidence recognition, show "Did you write 7?" with 2–3 big candidates
    rather than marking wrong.
  - Treat reversals (backwards 3, 7) as normal developmental errors. Accept them and gently model
    the correct form.

### 4.4 Fact fluency design notes

- **Teach strategies before speed:** make-ten, doubles, near doubles, ×10/×5 anchors, commutativity.
- **Adaptive per-fact tracking:** keep a per-fact model of accuracy and latency, and introduce small
  sets of new facts interleaved with known ones (Reflex-like). Reflex's own evidence shows fluency
  gains, but fluency alone may not move broader achievement
  ([Touro](https://touroscholar.touro.edu/tucgsoe/162)).
- **Speed is private and self-referential:** "your fastest bakery run", with no public leaderboard.
  Times Tables Rock Stars' speed-status idea works best as personal growth.
- **Interleave:** mix operations and fact families rather than blocking (Rohrer 2020).

---

## 5. UX for young children on touch tablets

### 5.1 Motor and touch

From NN/g, "Children's UX: Physical Development" ([nngroup.com](https://www.nngroup.com/articles/children-ux-physical-development/)):
- **Touch targets ≥ 2 cm × 2 cm** for young kids, ~4x adult size. That is ≈ 76 CSS px at nominal
  96 dpi, so **use ≥ 80 px for K and ≥ 64 px for ages 8+**, with ≥ 16–24 px spacing between targets.
  7-year-olds missed a 5 mm close button and landed in the app store.
- **Tap and swipe** are mastered at all young ages. **Dragging** is easy for coarse moves but hard
  when precise. A 5-year-old failed to drop items exactly onto targets, and misplaced items vanished.
- **Offer two ways** to do the same thing (drag *or* tap source then tap destination).
- **Avoid two-handed or quick reactive actions under 5**, and limit coordination demands under 8.
- Design for at least three age bands (3–5, 6–8, 9–12). This app needs adaptive UI chrome per child
  profile.

**Rules:**
- Snap-to-target with a generous magnet radius (≥ 1 target width).
- A mis-drop returns the item to its origin with a gentle animation. Never delete it.
- No pinch or two-finger rotate for K. Use tap-to-rotate buttons instead.
- Avoid long-press as the only method.
- Place primary controls away from screen edges, since Fire OS gestures and tablet bezel grips
  cause accidental touches.
- Ignore palm and multi-touch noise. Debounce taps; double-taps shouldn't double-answer.
- Landscape orientation is typical for kids' tablet play. Support both if feasible.

### 5.2 Audio-first for pre-readers

- Every instruction is spoken, with a persistent big "hear it again" speaker button.
- Use text only as reinforcement, for example numerals and simple words with highlight-as-spoken.
- Show, don't tell: animate a hand demonstrating the gesture on first use (ghost-hand tutorial).
- Use voice prompts for turn-taking in sibling mode ("Maya's turn!").
- Audio is essential to the Siegler & Ramani benefit: *saying* the numbers while moving matters.
- Allow muting of music separately from voice. Common Sense criticized DragonBox Numbers for lacking
  a music-off option.

### 5.3 Sessions and pacing

- Target **10–20 minute sessions** for ages 5–8, made of 3–6 activities of 2–4 minutes each.
  Daily-mission formats (Todo Math) and Reflex's short daily goal are good models.
- Get to the first problem within 10 seconds. No long intros, cutscenes, or unskippable story.
- Provide a natural ending ritual: the companion yawns, the island lights dim, and a "today you
  built…" recap. Parent-set limits end sessions gracefully after the current activity.
- Use pause/save anywhere, as the ICO recommends.

### 5.4 Celebrations and feedback

- Make correct-answer feedback immediate (< 100 ms visual response) and **proportionate**:
  - small sparkle for routine answers;
  - bigger celebration for milestones;
  - huge celebration for a boss or a first-ever mastery.
  Over-celebrating everything devalues it.
- Feedback should be **informational**: "You made 10 by doing 6 + 4!" or "You remembered that one
  faster than last time!" Praise process and strategy, not intelligence. Mueller & Dweck (1998)
  found intelligence praise led more kids to choose easy problems afterward
  ([PDF](https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf)). The
  person- vs process-praise evidence is mixed in later work
  ([Kent](https://kar.kent.ac.uk/id/document/20157)), but avoiding "you're so smart" is low-risk.
- **The mechanic itself should show correctness.** The boat sails, the bridge holds, the scale
  balances. Intrinsic feedback beats a green check.

### 5.5 Error feedback that doesn't shame

- No buzzers, red X's, sad faces, or lost lives.
- Use **"show what your answer did"**. Example: a boat with 9 passengers wobbles ("one more seat
  is empty!"). The error becomes information, as in DragonBox and Slice Fractions, where wrong moves
  are visible but not punished.
- Graduated scaffolding:
  1. Retry with a hint.
  2. Highlight the manipulative (e.g., ten frame).
  3. Worked example / "watch me", then a similar problem soon after.
- Log misconceptions (e.g., place-value reversal 31 vs 13, adding denominators) for adaptivity and
  the parent dashboard. Never surface them to the child as failures.
- Mistakes don't cost currency or progress.

### 5.6 Accessibility

- **Color vision:** use a colorblind-safe palette (e.g., Okabe–Ito). Never encode information by
  color alone. Fraction pieces, rekenrek 5/5 groups, and +/− tiles also need pattern, shape, or
  label. Test with a deuteranopia simulator.
- **Dyslexia / early readers:** audio for all text, large clear sans-serif type (≥ 24 px body for
  K), high contrast, no italics or all-caps paragraphs, short lines.
- **Dyscalculia / struggling learners:** manipulatives always available, no time pressure by
  default, subitizing-friendly structured arrangements (5-groups), slower pacing option.
- **Motor:**
  - tap alternatives to drag;
  - adjustable snap radius;
  - no required timing (timers off by default; fact-fluency speed thresholds adapt per child);
  - left-handed layout option (Todo Math offers one);
  - switch-friendly focus order for the web build.
- **Reduce motion** setting (respect `prefers-reduced-motion`), captions for voice, no flashing
  above 3 Hz (photosensitivity).

### 5.7 Platform notes: Amazon Fire tablet + browser

- Fire tablets run Fire OS (Android-based). The built-in Silk browser is Chromium/Blink-based, and
  Fire tablets integrate with Amazon Kids profiles
  ([Wikipedia: Amazon Silk](https://en.wikipedia.org/wiki/Amazon_Silk)). Low-end Fire models have
  modest CPUs/GPUs, and historical reports note choppy HTML5 performance on Fire hardware.
- **Recommendations:**
  - Build a single web app (Canvas/WebGL via a light engine, or DOM/SVG for manipulatives).
  - Test early on the actual Fire device.
  - Cap particle effects and keep 60 fps-friendly animations; prefer CSS transforms and sprite
    sheets.
  - Preload audio and work offline (service worker) so kids aren't blocked by Wi-Fi.
  - On Fire, either add the site to the child's Amazon Kids allowed web content via the Parent
    Dashboard, or wrap it in an Android WebView shell for sideloading/Appstore. PWA install support
    in Silk is not well documented; verify on-device.
  - Audio autoplay requires a user gesture in Chromium, so start with a big "Play" tap.

---

## 6. Three game-frame concepts

All three share the same learning engine:
- adaptive per-child skill graph with ~85–90% success targeting;
- interleaved/spaced review;
- manipulative-based activities with concreteness fading;
- parent dashboard;
- no monetization.

The frames differ in *why kids come back* and *where the math lives*.

### Concept A — "Number Creatures": world-map adventure with creature collection

**Pitch:** Kids explore a world map (a literal numbered path for K, branching for older kids)
populated by **number creatures** whose bodies *are* quantities. Like DragonBox Nooms, a "7" is made
of 7 segments, a "½" creature splits in two, and a "x" creature hides its value. You befriend
creatures by solving their puzzle: compose a 10 to wake the Ten-Whale, share fish evenly to calm a
division crab. Creatures combine (3 + 4 → 7) and evolve as math grows (fractions, negatives, variables).

- **Core loop:** travel to node → creature puzzle (math mechanic) → befriend/collect → creature
  joins team and unlocks a *mathematical ability* (the Ten-Whale lets you "make ten" anywhere) →
  new region.
- **Pros:**
  - Collection is extremely motivating at 5–9.
  - Creatures-as-numbers are intrinsically mathematical (combining is addition).
  - Linear map gives the Siegler & Ramani benefit.
  - Strong narrative hook.
- **Cons:**
  - High risk of drifting toward Prodigy: battles and collection become the point, and math becomes
    the toll.
  - Older kids (11–14) may find creatures babyish.
  - Content-heavy (art per creature).
  - Collection completion can drive compulsion.
- **K→8 scaling:** creature families per strand: whole numbers → place value → fractions → integers
  → variables/expressions ("x-creatures" with masks you reveal by balancing). Older-kid regions shift
  to mystery/puzzle tone.
- **Keeping math core:** a creature's *only* interaction verbs are mathematical (combine, split,
  share, compare, balance). No HP/attack-number combat.

### Concept B — "Number Island": build-your-own island funded and shaped by math (recommended)

**Pitch:** The siblings share an island that starts as a sandbar. Every building is a
**workshop** containing an intrinsically integrated math mini-game, and *doing that math is how
the building gets built and how it produces*. Number-creature **residents** move in and make
requests, which serve as quests.

Examples of workshop math:
- The bakery makes bread by composing ten.
- The brick factory fuses ten units into rods (place value).
- The garden plants arrays (multiplication/area).
- The dock's ferry schedule uses clocks.
- The market makes change.
- The bridge spans are measured on a number line.

The island's main road is a **numbered path 1→100 (later →1000)** that the boat travels while
counting aloud.

- **Core loop (session ≈ 15 min):**
  1. A resident request appears ("We need a bridge to the east beach: 23 planks!").
  2. The kid chooses which workshop to work in (autonomy).
  3. They do 2–4 minutes of math-mechanic play that *produces* materials. Materials are the
     direct product of math (planks measured, bricks grouped), not coins for answers.
  4. They build or place by tapping where it goes. Placement itself can be mathematical: fit a
     3 × 4 garden, put the house at (5, 2).
  5. The resident celebrates and the island visibly grows.
  6. Wind-down ritual.
- **Pros:**
  - Best K→8 scaling, because building and economies naturally host measurement, area/perimeter,
    money, ratios, percentages, coordinates, scale drawings, volume, rates, and linear functions.
  - Strong **autonomy** (decorate, choose projects) and **relatedness**: a shared sibling island
    with interlocking projects, plus a parent "visitor" who can leave surprise gifts (unexpected
    rewards).
  - Persistent world = intrinsic reason to return without streak guilt.
  - Proven appeal in Moose Math and DragonBox Big Numbers. Animal Crossing-style decorating is
    beloved across ages 5–14.
  - Each workshop is a self-contained module, so engineering scales by adding workshops.
- **Cons:**
  - Economies can degrade into "grind math for coins". Mitigate by making materials the *direct
    product* of the math action and keeping building costs low/fast.
  - Less immediate adrenaline than battles. Mitigate with rhythm/fluency workshops and boss events
    (storms, festivals as mastery checks).
  - The K kid may not grasp an economy. Mitigate with no abstract currency for K: just "the bridge
    needs 10 planks" (counting).
  - Free-decorate time can lower math density. Mitigate by capping non-math time per session, or by
    making decoration placement mathematical (symmetry, patterns).
- **K→8 scaling:**
  - **K–1:** count, subitize, make ten, shapes, patterns, numbered road.
  - **2–3:** place value bricks, add/subtract to 1000, arrays, clocks, money market, fractions
    (bakery pies).
  - **4–5:** multi-digit ×/÷, area/perimeter plots, fraction equivalence, decimals in the market,
    coordinates on the island map.
  - **6–7:** ratios (recipes, paint), rates (ferries), percents (market discounts, bank interest),
    integers (underwater levels, temperature), scale drawings.
  - **8:** linear functions (conveyor machines, fare schedules), Pythagorean distances for bridges,
    volume (reservoirs), systems (two ferries).
  - For older kids, the island can become a **town simulation** whose economy they actually model
    with equations.
- **Keeping math core:**
  - Every workshop passes the "remove the math and the game breaks" test.
  - No currency for answering questions on a separate screen.
  - Placement and design challenges use math.
  - Track math-density telemetry with a ≥ 70% target.

### Concept C — "The Lost Numbers": story-driven quest with a mini-game arcade

**Pitch:** A narrative adventure (episodic, voiced) in which the kids help a character restore a
world where numbers went missing. Each chapter unlocks an **arcade cabinet**, a polished intrinsic
math mini-game (Firefly Count, Ten-Boat, Treasure Number Line, Fraction Slicer, Balance Cargo,
Function Machines). Story beats sit between cabinets. Replay cabinets for high scores and stars.

- **Core loop:** story scene (≤ 30 s) → mini-game set → chapter boss (multi-skill puzzle) → next
  chapter. The arcade hub lets kids replay favorites.
- **Pros:**
  - Variety keeps novelty high.
  - Each mini-game can be designed and tested independently.
  - The arcade hub supports autonomy.
  - Easy to add handicapped sibling arcade competitions.
  - Strong for short sessions.
- **Cons:**
  - Story is expensive to author and voice, and it is linear: two kids at different levels need
    separate story progress.
  - Mini-game arcades fragment into a "collection of drills" if not tied together.
  - The story is a wrapper, which risks chocolate-covered broccoli at the narrative level.
  - Replay-for-high-score encourages speed over understanding.
  - Older kids may outgrow the story tone.
- **K→8 scaling:** new seasons/chapters per grade band; cabinets get "levels" spanning grades
  (Number Line cabinet: 0–10 → fractions → negatives → scientific notation).
- **Keeping math core:** mini-games are intrinsic, but the *story* is not. Keep story minimal and
  skippable.

### 6.1 Comparison

| Criterion | A: Creatures | B: Island | C: Story + Arcade |
|---|---|---|---|
| Appeal at 5–6 | ★★★★★ | ★★★★ | ★★★★ |
| Appeal at 7–8 | ★★★★★ | ★★★★★ | ★★★★ |
| Appeal at 11–14 | ★★ | ★★★★ | ★★★ |
| Math in core mechanic | ★★★★ (if no combat) | ★★★★★ | ★★★★ (games) / ★★ (story) |
| K→8 curricular breadth | ★★★ | ★★★★★ | ★★★★ |
| Sibling co-op (different levels) | ★★★ | ★★★★★ (shared island) | ★★★ |
| Autonomy | ★★★ | ★★★★★ | ★★★ |
| Return motivation without dark patterns | ★★★ (collection compulsion risk) | ★★★★★ (persistent world) | ★★★ (needs new content) |
| Content/art cost | High (many creatures) | Medium (modular workshops + decor) | High (story + voice) |
| Engineering modularity | Medium | High | High |

### 6.2 Recommendation

**Build Concept B, "Number Island", borrowing the best of A and C:**
- From **A:** residents are **number creatures** whose bodies are quantities (Nooms-style). Kids
  collect them by building homes they request, and creatures combine/split in math workshops.
  Collection comes from building, not battling.
- From **C:** each workshop is a polished, replayable **intrinsic mini-game**, so the codebase is
  effectively an arcade of math mechanics with a persistent world as the hub. Light story arrives
  through resident requests and seasonal "festivals" (boss/mastery events). No heavy narrative.
- **Sibling design:**
  - One shared island with per-child workbenches and avatars.
  - Interlocking co-op projects.
  - "Team vs storm" boss events.
  - Optional family quiz-show night with per-player decks.
  - Personal-best ghosts instead of head-to-head speed.
- **Parent layer:**
  - Parent dashboard (skills, misconceptions, time).
  - Weekly goal settings and session limits.
  - "Leave a surprise gift on the island" (unexpected reward).
  - Real-world celebration milestones the parent defines.
- **For the two target kids specifically:**
  - The K kid starts on the numbered road + Firefly Count + Ten-Boat + Shape Windows.
  - The 2nd grader starts at Brick Factory (place value) + Garden Arrays + Market + Clock Dock,
    with Puzzle Tower "spicy" challenges (KenKen, magic squares, Wuzzit-style), since advanced kids
    find challenge rewarding (Beast Academy lesson).

**Success metrics to instrument from day one:**
- math density (% active time in math interactions; target ≥ 70%);
- time to first problem (≤ 10 s);
- rolling first-try accuracy per child (target 80–90%);
- voluntary return rate (sessions started by the child without prompting);
- session end type (natural end vs abandoned mid-activity);
- mastery gains on embedded transfer probes that use standard notation without the manipulative.

---

## 7. Sources

**Game-based learning research**
- Habgood & Ainsworth (2011), JLS — https://nottingham-repository.worktribe.com/output/23577510/motivating-children-to-learn-effectively-exploring-the-value-of-intrinsic-integration-in-educational-games ; https://shura.shu.ac.uk/3556
- Habgood, effective integration of digital games and learning content (thesis) — https://eprints.nottingham.ac.uk/10385
- Habgood, Ainsworth & Benford (2005), Endogenous fantasy, *Simulation & Gaming* — https://ideas.repec.org/a/sae/simgam/v36y2005i4p483-498.html
- KQED MindShift, "secret sauce" of educational games — https://www.kqed.org/mindshift/20765/whats-the-secret-sauce-to-a-great-educational-game
- Lepper, Greene & Nisbett (1973) — https://typeset.io/pdf/undermining-children-s-intrinsic-interest-with-extrinsic-3qn44yqiou.pdf
- Deci, Koestner & Ryan (1999) — https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf ; 2001 follow-up https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf
- Ryan, Rigby & Przybylski (2006) — https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf ; PENS https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/
- Jenova Chen, Flow in Games — https://www.jenovachen.com/flowingames/
- Lomas et al. (CHI 2013) — https://www.stat.cmu.edu/~brian/463-663/project-part-one/Optimizing%20Challenge.pdf ; https://hcii.cmu.edu/news/chi-preview-researchers-hcii-believe-difficulty-can-be-overrated-games
- Wilson et al. (2019), 85% rule — https://pmc.ncbi.nlm.nih.gov/articles/PMC6831579
- Chocolate-covered broccoli — https://tedium.co/2019/05/09/edutainment-math-blaster-chocolate-covered-broccoli ; https://the-avocado.org/2021/11/17/thats-edutainment-duolingo-and-chocolate-dipped-broccoli ; https://meaningfulplay.msu.edu/proceedings2014/mp2014_submission_20.pdf
- Tokac, Novak & Thompson (2019) — https://www.scinapse.io/papers/2913074290 ; https://annescollege.fsu.edu/sites/g/files/upcbnu4516/files/Umit-Tokac.pdf
- GBL and math HOTS meta-analysis — https://ojs.ehu.eus/index.php/psicodidactica/article/view/28240
- Wang et al. (2022), digital GBL STEM — https://link.springer.com/content/pdf/10.1186/s40594-022-00344-0.pdf
- Turkish primary meta-analysis — https://dergipark.org.tr/en/pub/iperj/article/1067794
- Moyer-Packenham & Westenskow (2013/2016) — https://blogs.sd38.bc.ca/sd38mathandscience/wp-content/uploads/sites/14/2020/06/VMMetaAnalysisPaper.MoyerPackenhamWestenskow.pdf ; https://digitalcommons.usu.edu/teal_facpub/2399
- Rohrer et al. (2020) interleaving RCT — https://ies.ed.gov/ncee/wwc/Study/88770
- Plass et al. (2013) — https://www.sciencedaily.com/releases/2013/11/131106122025.htm
- Pope & Mangram (2015), Wuzzit Trouble — https://journal.seriousgamessociety.org/index.php/IJSG/article/view/88 ; https://ed.stanford.edu/news/stanford-study-shows-how-digital-math-games-can-teach-more-rote-skills
- Slice Fractions study — https://library.iated.org/view/CYR2016GAM
- Fyfe et al. (2014), concreteness fading — https://doi.org/10.1007/s10648-014-9249-3
- Mueller & Dweck (1998) — https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf ; Skipper & Douglas — https://kar.kent.ac.uk/id/document/20157

**Number sense / number line**
- Siegler & Ramani (2008), Developmental Science — https://onpurposely.com/wp-content/uploads/2023/10/sieg-ram08.pdf ; WWC https://ies.ed.gov/ncee/wwc/study/73725
- Siegler & Ramani (2009), linear vs circular — https://ies.ed.gov/ncee/wwc/study/78079 ; https://www.edweek.org/education/study-board-games-boost-preschoolers-math-skills/2009/08
- Ramani et al. (2012) — https://education.umd.edu/sites/default/files/uploads/Ramani%20et%20al.%2C%202012%20%281%29.pdf
- Schneider et al. (2018), number line meta-analysis — https://www.uni-trier.de/fileadmin/fb1/prof/PSY/PAE/Team/Schneider/SchneiderEtAl2018.pdf
- Clements & Sarama subitizing (IES) — https://ies.ed.gov/ncee/rel/math-young-children/pdf/TMYC_Mod1_Subitizing_Developmental_Progression.pdf ; https://learningtrajectories.org/

**Apps**
- Prodigy FTC complaint — https://www.edweek.org/technology/popular-interactive-math-game-prodigy-is-target-of-complaint-to-federal-trade-commission/2021/02 ; https://www.axios.com/2021/02/19/prodigy-math-game-ftc-complaint ; https://fairplayforkids.org/wp-content/uploads/2021/02/Prodigy_Complaint_Feb21.pdf ; https://fairplayforkids.org/?p=26304 ; https://en.wikipedia.org/wiki/Prodigy_Education
- Prodigy product pages — https://prodigygame.com/membership ; https://www.prodigygame.com/mythical-epics ; https://prodigygame.com/blog/parents-guide-to-prodigy
- Parent account of Prodigy math time — https://www.theargumentmag.com/p/homework-shouldnt-be-all-fun-and
- DragonBox research — https://doaj.org/article/28d05a10d8ea487f80d0c3b6811e3e9d ; https://sites.google.com/view/from-here-to-there/research-findings_1/summary-of-findings ; https://kahoot.com/blog/2023/02/27/dragonbox-algebra-mitigated-learning-loss/
- Kahoot! Numbers / Big Numbers — https://www.commonsensemedia.org/app-reviews/dragonbox-numbers ; https://www.commonsensemedia.org/app-reviews/kahoot-big-numbers-dragonbox ; https://www.commonsense.org/education/reviews/kahoot-big-numbers-dragonbox
- Khan Academy Kids — https://www.umass.edu/news/article/new-educational-app-shows-promise ; https://www.edweek.org/leadership/khan-app-boosted-early-literacy-parent-teaching-in-small-trial/2020/05 ; https://www.commonsensemedia.org/app-reviews/khan-academy-kids ; https://apps.apple.com/app/khan-academy-kids-learning/id1378467217
- Moose Math — https://www.commonsensemedia.org/app-reviews/moose-math-by-duck-duck-moose ; https://apps.apple.com/us/app/moose-math-by-duck-duck-moose/id660345152
- Zearn — https://about.zearn.org/press-releases/evidence-for-essa ; https://about.zearn.org/research
- DreamBox (Harvard CEPR) — https://cepr.harvard.edu/dreambox-learning-achievement-growth
- Enuma / XPRIZE — https://www.edsurge.com/news/2019-05-15-the-5-year-15-million-global-learning-xprize-competition-is-over-here-s-who-won ; https://annualreport.xprize.org/prizes/global-learning ; https://www.schwabfound.org/awardees/sooinn-lee
- Beast Academy — https://homeschoolfox.com/curriculum/beast-academy ; https://uepc.utah.edu/_resources/documents/beast-academy-report-2025.pdf ; https://www.wested.org/resources/evaluation-of-beast-academy/
- Synthesis — https://synthesis.com/ ; https://homeschoolfox.com/curriculum/synthesis-tutor
- Math Academy — https://mathacademy.com/how-it-works ; https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/ ; https://frankhecker.com/2026/01/10/a-year-of-math-academy/ ; https://notes.andymatuschak.org/Math_Academy
- SplashLearn reviews — https://www.wukongsch.com/blog/splashlearn-review-math-reading-app-post-62609/ ; https://www.myengineeringbuddy.com/blog/splashlearn-reviews-alternatives-pricing-offerings/
- Reflex — https://reflex.explorelearning.com/research/research-behind-reflex ; https://touroscholar.touro.edu/tucgsoe/162
- Times Tables Rock Stars — https://blog.soton.ac.uk/edpsych/?p=1410 ; https://www.tes.com/news/edtech-success-bruno-reddy-times-tables-rock-stars
- Duolingo Math — https://blog.duolingo.com/new-subjects/ ; https://technical.ly/startups/duolingo-math-app-review/
- Kahoot! literature review (Wang & Tahir 2020) — https://doi.org/10.1016/j.compedu.2020.103818

**Engagement ethics, streaks, dark patterns**
- Duolingo streak design — https://blog.duolingo.com/how-duolingo-streak-builds-habit
- Streak UX critiques — https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/ ; https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs
- Radesky et al. (2022), JAMA Netw Open — https://pmc.ncbi.nlm.nih.gov/articles/PMC9206186/ ; https://www.michiganmedicine.org/health-lab/design-tricks-commonly-used-monetize-young-childrens-app-use
- UK ICO Children's Code, Standard 13 — https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/13-nudge-techniques/

**UX / manipulatives / platform**
- NN/g, Children's UX: Physical Development — https://www.nngroup.com/articles/children-ux-physical-development/
- Mathigon Polypad — https://mathigon.org ; Amplify free activities https://go.info.amplify.com/freemathactivities
- Virtual manipulative roundups — https://www.teachingchannel.com/k12-hub/blog/10-free-online-manipulative-reosurces-to-add-to-your-math-toolbox ; https://blog.tcea.org/virtual-manipulatives-for-math-remote-learning
- Handwriting digit recognition for 4–6-year-olds — https://link.springer.com/doi/10.1007/978-981-16-8129-5_153 ; https://igi.indrastra.com/items/show/1297
- Amazon Silk — https://en.wikipedia.org/wiki/Amazon_Silk
