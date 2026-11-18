# 02 — Pedagogy and Adaptivity: Evidence-Based Math Teaching and Adaptive Mastery Assessment

*Research date: 2026-11-17. Scope: an adaptive math-learning game for K–8 (extensible). Initial users: one advanced kindergartner and one advanced 2nd grader.*

**How to read this document.** Each section summarizes the evidence, notes how strong it is, and ends with **Design implications** for the app. Section 9 consolidates the recommendations. Some sources are vendor pages or secondary summaries; these are flagged. Effect sizes are reported as the cited source gives them. Claims I could not verify against a primary source are marked *(unverified)*.

---

## Table of contents

1. [Pedagogy with evidence](#1-pedagogy-with-evidence)
2. [How the leading products do it](#2-how-the-leading-products-do-it)
3. [Mastery-estimation and scheduling algorithms](#3-mastery-estimation-and-scheduling-algorithms)
4. [Placement and diagnostic design](#4-placement-and-diagnostic-design)
5. [Mastery criteria, guessing, and misconception detection](#5-mastery-criteria-guessing-and-misconception-detection)
6. [Designing for young children and pre-readers](#6-designing-for-young-children-and-pre-readers)
7. [Parent dashboard and parent-in-the-loop](#7-parent-dashboard-and-parent-in-the-loop)
8. [LLMs (e.g., Claude) for hints, explanations, and item generation](#8-llms-eg-claude-for-hints-explanations-and-item-generation)
9. [Consolidated recommendations](#9-consolidated-recommendations)
10. [Sources](#10-sources)

---

## 1. Pedagogy with evidence

### 1.1 The big picture: what the strongest syntheses agree on

The most authoritative US syntheses converge on a short list:

- **WWC, *Assisting Students Struggling with Mathematics: Intervention in the Elementary Grades* (2021, K–6).** All six recommendations are rated **Strong evidence** on the WWC page: (1) systematic instruction; (2) clear, concise mathematical language; (3) a well-chosen set of concrete and semi-concrete representations; (4) the number line; (5) deliberate instruction on word problems; (6) regularly include **timed activities** as one way to build fluency. [WWC PG 26](https://ies.ed.gov/ncee/wwc/practiceguide/26). The guide targets struggling students, but the practices (explicit modeling, representations, number line, fluency) generalize well, and advanced kids need them too, just faster.
- **WWC, *Teaching Math to Young Children* (Frye et al., 2013, ages 3–6).** Five recommendations: (1) teach number and operations using a **developmental progression**; (2) teach geometry, patterns, measurement, and data analysis; (3) use **progress monitoring** so instruction builds on what each child already knows; (4) teach children to view and describe their world mathematically; (5) dedicate time to math each day. [Summary of the guide](https://kidswholovemath.substack.com/p/us-department-of-education-recommendations); [Nebraska DoE Rec. 1 handout](https://www.education.ne.gov/wp-content/uploads/2020/05/Teaching-Math-to-Young-Children-Recommendation-1.pdf); [full guide mirror](https://marzanoresearch.com/wp-content/uploads/2025/08/Teaching-Math-to-Young-Children.pdf). Recommendation 1 rests on **moderate** evidence; the official guide is at ies.ed.gov (PracticeGuide/18).
- **IES, *Organizing Instruction and Study to Improve Student Learning* (Pashler et al., 2007).** Recommendations include spacing learning over time, interleaving worked-example solutions with problem-solving exercises, combining graphics with verbal descriptions, using quizzing to promote learning, and helping students manage study. [WWC PG 1](https://ies.ed.gov/ncee/wwc/PracticeGuide/1)
- **Dunlosky et al. (2013), *Improving Students' Learning With Effective Learning Techniques*.** Of ten common techniques, only **practice testing (retrieval)** and **distributed practice (spacing)** were rated "high utility". Interleaving was rated moderate, though math-specific evidence has strengthened since. [Psych. Sci. in the Public Interest](https://journals.sagepub.com/doi/10.1177/1529100612453266)
- **National Mathematics Advisory Panel (2008)** stressed fluency with whole-number facts, explicit instruction for students who struggle, and a coherent progression toward algebra. [NMAP Final Report](https://www2.ed.gov/about/bdscomm/list/mathpanel/report/final-report.pdf)

The **"Science of Math"** movement, with Sarah Powell among its most prominent voices, packages these into a stance: explicit instruction (model, then guided practice, then independent practice), precise vocabulary, fact fluency, and representations. It is skeptical of unguided exploration for novices. Critics, including NCSM, argue that explicit instruction should be minimized in favor of problem-solving, and both sides agree that good classrooms blend the two. [EdSource](https://edsource.org/updates/as-test-scores-plummet-the-science-of-math-movement-may-be-gathering-steam); [The 74](https://www.the74million.org/article/as-test-scores-crater-debate-over-whether-theres-a-science-to-math-recovery/); [EdWeek, Jan 2026](https://www.edweek.org/teaching-learning/debates-over-math-teaching-are-heating-up-they-could-affect-classrooms/2026/01)

### 1.2 Concrete–Representational–Abstract (CRA / CPA, Bruner, Singapore Math)

- **Origin.** Bruner (1966) described enactive, iconic, and symbolic modes of representation. Singapore's curriculum operationalized this as Concrete–Pictorial–Abstract, with the **bar model** as the signature pictorial tool. US special education uses the name CRA.
- **Evidence.** WWC 2021 rates "concrete and semi-concrete representations" and "the number line" as **strong** evidence for students who struggle ([WWC PG 26](https://ies.ed.gov/ncee/wwc/practiceguide/26)). CRA-specific evidence is mostly single-case designs, plus a 2025 meta-analytic review I could not access in full ([U. Kentucky record](https://scholars.uky.edu/en/publications/a-meta-analytic-review-of-the-concrete-representational-abstract-/); [ERIC single-case synthesis](https://files.eric.ed.gov/fulltext/EJ1338995.pdf)).
- **Manipulatives meta-analysis.** Carbonneau, Marley & Selig (2013) found a small-to-moderate overall benefit of manipulatives. Effects were moderated by **level of instructional guidance** (more guidance helped) and by perceptual richness (bland, abstract objects were often better than realistic, "fun" ones). [J. Educ. Psych.](https://doi.org/10.1037/a0031084)
- **Concreteness fading.** Fyfe, McNeil, Son & Goldstone (2014) review evidence that starting concrete and **progressively fading** to abstract beats either concrete-only or abstract-only instruction. [Educ. Psych. Review](https://doi.org/10.1007/s10648-014-9249-3)
- **Number line and board games.** Siegler & Ramani (2008) found that playing a **linear numbered board game** (1–10) improved low-income preschoolers' numerical magnitude knowledge, while circular boards did not. Linear number representations matter. [Developmental Science](https://doi.org/10.1111/j.1467-7687.2008.00714.x)

**Design implications**
- Every skill node should have three representation tiers: **C** (draggable virtual manipulative such as ten-frames, base-10 blocks, counters, rekenrek, fraction strips), **R** (static pictures, bar models, number lines), and **A** (symbols only). The engine fades from C to A as evidence of mastery grows and drops back to C or R when errors appear (a simple "representation ladder").
- Keep manipulatives **visually plain**: dots, cubes, bars. Avoid cartoon candy that distracts. Use animation for feedback, not for the objects themselves.
- Make the **number line** a first-class, recurring representation from K (counting, magnitude) through fractions, decimals, and negatives.
- Use virtual manipulatives *with guidance* (prompts, constrained actions). Do not drop kids into a free-play sandbox.

### 1.3 Number sense and strategies (number talks, Boaler, making ten, number bonds)

- **Number sense is predictive.** Kindergarten number sense (counting, number knowledge, simple arithmetic) predicts later math achievement through 3rd grade (Jordan, Kaplan, Ramineni & Locuniak, 2009). [Dev. Psych.](https://doi.org/10.1037/a0014939)
- **Developmental progressions / learning trajectories.** Clements & Sarama's *Building Blocks* curriculum is built on research-based learning trajectories. In a cluster RCT across 42 schools it produced g = 0.72 over control. Earlier studies reported 0.47 against a comparison curriculum and 1.07 against control; these are developer-run studies. [JRME 2011 summary](https://works.bepress.com/alissa-lange/1/); [2008 evaluation](https://www.mheducation.com/unitas/school/explore/sites/building-blocks/2008-evaluation-effects-research-based-pk-math.pdf). Learning trajectories (e.g., at learningtrajectories.org) are an excellent source for the **K–2 knowledge-graph backbone**.
- **Making ten / derived facts.** Research summaries report that combinations of ten do not develop without explicit attention. Children who could not recall their ten-combinations were less likely to use make-ten (Steinberg, 1985). Children can learn derived-fact strategies even while still counting-all. [Everyday Math 4 research review (publisher)](https://www.mheducation.com/unitas/school/explore/research/em-review-literature-for-facts-strand.pdf); [MERGA 2014](https://merga.net.au/wp-content/uploads/DOCS/common/Uploaded%20files/Annual%20Conference%20Proceedings/2014%20Annual%20Conference%20Proceedings/merga37_young-loveridge.pdf). Bay-Williams & Kling's progression treats **foundational facts** (+0, +1, doubles, combinations of ten) as prerequisites for **derived-fact strategies** (make-ten, near doubles). [Kentucky Center for Mathematics addition script](https://kcm.nku.edu/MathHub/transcripts/KCM_MathHub_SI_Addition_script.pdf)
- **Number talks / Jo Boaler / youcubed.** Number talks (brief whole-class mental-math discussions of multiple strategies) are widely used, but the causal evidence base is thin. Boaler's claims about timed tests have been criticized for weak citations ([Filling the Pail critique](https://fillingthepail.substack.com/p/timed-tests-and-maths-anxiety)). Her *strategy-flexibility* emphasis aligns with the derived-facts research. Her strong *anti-timing* stance conflicts with WWC 2021's strong-evidence recommendation for timed activities. See 1.9.

**Design implications**
- Encode **strategies as skills** in the graph, not just facts. For example: "+1/−1", "doubles", "make 10 (8+5 = 8+2+3)", "near doubles", "think-addition for subtraction", "bridge through 10 on a number line".
- Make **number bonds / part–part–whole** an explicit K skill with a dedicated interaction: split 7 into 5 and 2 on a ten-frame.
- Build a **"strategy explorer" mini-format** (a digital number talk): show a problem, show two or three ways kids solved it (animated on a ten-frame or number line), and ask "which way would you use?" This captures the number-talk benefit without needing a classroom.

### 1.4 Mastery learning (Bloom's 2-sigma)

- Bloom (1984) reported that one-to-one tutoring combined with mastery learning produced about +2 SD, and group mastery learning about +1 SD, over conventional classes.
- **Critiques.** VanLehn noted the tutoring conditions used a 90% mastery threshold against 80% for classroom mastery learning, which could explain part of the gap. Only two of the six tutoring studies Bloom cited showed effects near 2.0. Later reviews find tutoring and mastery learning effects are real but usually smaller than 2 SD and 1 SD. [Nintil review](https://nintil.com/bloom-sigma/); [Skycak's counterpoint](https://justinmath.com/blooms-two-sigma-problem/)
- **The takeaway that survives.** Don't advance until the prerequisite is actually solid, set a **high** mastery bar (≈90%, not 80%), and give **corrective** re-teaching rather than just "try again".

**Design implications.** Hard-gate new topics on prerequisite mastery, using a ≈90% threshold estimated by the model (Section 5). When a child fails, route to *different* instruction (a lower representation tier, a worked example, a prerequisite review) rather than repeating the same items.

### 1.5 Retrieval practice, spaced repetition, interleaving, desirable difficulties

- **Retrieval practice (testing effect)** and **spacing** are the two "high utility" techniques ([Dunlosky et al. 2013](https://journals.sagepub.com/doi/10.1177/1529100612453266)). Classroom studies show distributed practice benefits elementary as well as secondary students ([Frontiers in Psychology 2020](https://www.frontiersin.org/articles/10.3389/fpsyg.2020.00811/full)).
- **Interleaving in math.** In Rohrer, Dedrick, Hartwig & Cheung (2020), a preregistered cluster RCT with 54 7th-grade classes, interleaved practice beat blocked practice on an unannounced test one month later (61% vs 38%, **d = 0.83**). Teachers reported that interleaved assignments took more time. [Summary](https://www.structural-learning.com/research-briefings/mix-it-up); [paper PDF](https://www.gwern.net/doc/psychology/spaced-repetition/2019-rohrer.pdf). An IES-funded replication with about 3,780 students is underway ([IES award](https://ies.ed.gov/use-work/awards/systematic-replication-study-interleaved-mathematics-practice)). The interleaving benefit comes largely from learning to **choose the right strategy**, which blocked practice never exercises.
- **Desirable difficulties (Bjork).** Spacing, interleaving, and retrieval make practice feel harder while improving long-term retention. Most difficulties are *not* desirable; the difficulty must be one the learner can overcome. [Learning & the Brain commentary](https://www.learningandthebrain.com/blog/the-downsides-of-desirable-difficulties/)

**Design implications**
- **Interleaved mixed review** should be a core session component once a child has two or more mastered skills. Introduce new skills in a short blocked burst, then mix them into review.
- Use a per-skill **memory model** to schedule reviews (Section 3.6).
- Target a success rate around **80–85%** in review and practice, enough difficulty to be desirable without breeding frustration. Math Academy's quizzes target about 80% ([how-our-ai-works](https://mathacademy.com/how-our-ai-works)). For 5-year-olds, bias toward the higher end (≈85–90%) to protect motivation.

### 1.6 Worked examples, cognitive load theory, expertise reversal

- **Worked-example effect.** Novices learn more from studying worked examples than from solving equivalent problems, because problem-solving search overloads working memory (Sweller). [Wikipedia overview with refs](https://en.wikipedia.org/wiki/Worked-example_effect)
- **Expertise reversal.** As expertise grows, worked examples become redundant and can hurt; problem-solving becomes better (Kalyuga et al.). [Overview](https://en.wikipedia.org/wiki/Expertise_reversal_effect)
- **Faded worked examples.** Fading steps adaptively, based on each student's demonstrated understanding, beat both fixed fading and pure problem-solving in Cognitive Tutor studies (Salden et al., 2010). [Instructional Science](https://link.springer.com/doi/10.1007/s11251-009-9107-8)

**Design implications.** Lesson pattern per new skill: **(1) animated, narrated worked example → (2) faded example where the child completes the last step → (3) the child solves with scaffold → (4) independent**. Skip or shorten steps 1–2 adaptively when the child's prior evidence is strong; advanced kids will hit expertise reversal quickly. Offer a "show me" button that replays the worked example at any time.

### 1.7 Productive struggle vs. direct instruction

- **Productive failure (Kapur).** In a meta-analysis of 53 studies and 166 comparisons, problem-solving *before* instruction (PS-I) beat instruction-first (I-PS) with g = 0.36, rising to 0.37–0.58 in high-fidelity designs. However, for **younger learners (grades 2–5)** and for domain-general skills, the effects favored **instruction first**. For procedural skills, instruction first works as well. [Sinha & Kapur 2021, RER (abstract)](https://www.x-mol.com/paper/1406031499744456704); [Tech & Learning summary](https://techlearning.com/news/study-productive-failure-a-success-in-education)
- **Kirschner, Sweller & Clark (2006)** argue that minimally guided instruction is less effective for novices, consistent with cognitive load theory. [Educational Psychologist](https://doi.org/10.1207/s15326985ep4102_1)

**Design implications.** For K–2, default to **explicit instruction with brief, low-stakes exploration**. Use "puzzle first" (Beast-Academy-style challenge problems) as **enrichment for already-mastered skills**, which suits advanced kids, rather than as the primary way to introduce a concept. Puzzles with no gating consequence create safe productive struggle.

### 1.8 Feedback

- **Immediate, corrective, task-focused feedback** helps during acquisition. Kluger & DeNisi's (1996) meta-analysis found that about a third of feedback interventions *decreased* performance, especially feedback that directed attention to the self ("you're smart / bad at this") rather than to the task. [Psych. Bulletin](https://doi.org/10.1037/0033-2909.119.2.254)
- **Praise for process, not ability.** Mueller & Dweck (1998): 5th graders praised for intelligence chose easier problems, cared more about performance goals, and described intelligence as fixed, compared with peers praised for effort. [JPSP PDF](https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf). Growth-mindset *interventions* show weak average effects on achievement (Sisk et al., 2018). Treat mindset as a design tone, not a learning lever. [Psych. Science PDF](https://englelab.gatech.edu/articles/2018/Sisk,%20Burgoyne%20et%20al.%20(2018)%20-%20Mindset%20and%20Academic%20Achievement.pdf)

**Design implications.** On an error, give immediate, specific, visual feedback: show the correct quantity on the manipulative, not just a red X. Let the child try again once, with a hint, before revealing the answer. Praise strategy and persistence ("You made a ten first, smart move" is about the *strategy*; avoid "you're so smart"). No sad sounds or lost lives for errors.

### 1.9 Fact fluency: strategies first, then retrieval; timed vs untimed

- **Sequence.** The consensus progression is (1) conceptual understanding with counting and models, then (2) **explicit strategy instruction** for derived facts, then (3) **retrieval practice** to automaticity. Research supports explicit strategy instruction for learning and retaining facts (Van de Walle, as quoted in [MathFactLab, vendor](https://mathfactlab.helpscoutdocs.com/article/68-the-foundational-research-behind-mathfactlab); [EM4 review](https://www.mheducation.com/unitas/school/explore/research/em-review-literature-for-facts-strand.pdf)). I found no single RCT pitting strategy-first against drill-first.
- **Timed practice.** WWC 2021 rates "regularly include timed activities" as **strong** evidence, framed as *one way* to build fluency for students who already have accuracy ([WWC PG 26](https://ies.ed.gov/ncee/wwc/practiceguide/26)). Boaler argues timed tests cause early math anxiety ([youcubed "Fluency Without Fear"](https://youcubed.org/?p=963)), but critics show those claims are weakly sourced ([Filling the Pail](https://fillingthepail.substack.com/p/timed-tests-and-maths-anxiety)). Math anxiety is real by 1st–2nd grade, and it harms high-working-memory children most, because anxiety competes for the working memory their sophisticated strategies need (Ramirez, Gunderson, Levine & Beilock, 2013). [UChicago news](https://news.uchicago.edu/story/math-anxiety-causes-trouble-students-early-first-grade). This is directly relevant to advanced kids.
- **Incremental rehearsal (IR)** interleaves one unknown fact among a growing set of known facts (about 90% known to 10% unknown). A 2026 review rated it "mixed evidence" overall (group-design g ≈ 0.86, wide CI), but it is effective in many single-case studies for math facts. [USM meta-analysis record](https://aquila.usm.edu/fac_pubs/22035); [Tucker & Burns](https://nj.dyslexiaida.org/wp-content/uploads/sites/18/2025/10/Tucker-and-Burns-CQ_44_6.pdf)
- **Fluency criteria.** Commonly cited targets are about 40 correct facts per minute in written probes (Howell & Nolet), or 40–60 correct digits per minute (Mercer & Miller), adjusted for writing speed. For oral or tap responses, **about 1 s latency** is described as automatic. These figures come from practitioner and vendor sources ([Rocket Math](https://www.rocketmath.com/2016/12/02/how-fast-should-students-be-with-math-facts/); [Rocket Math benchmarks](https://www.rocketmath.com/2020/02/15/math-benchmarks-writing-speed-matters/)). A "3-second rule" is common in practice but I could not verify it as a research criterion.

**Design implications**
- **Measure latency silently; never show a countdown to K kids.** Speed counts toward "fluent" status but is never displayed punitively.
- For the 2nd grader, offer **optional, self-referenced timed games** ("beat your own best", "race the turtle") only for facts already at accuracy mastery. This honors WWC Rec. 6 without public or high-stakes timing.
- Use **IR-style mixing**: introduce one new fact or fact family among mostly known facts.
- Gate fact retrieval practice behind the corresponding **strategy skill**. For example, the make-ten strategy precedes 8+5 fluency drills.

---

## 2. How the leading products do it

### 2.1 Math Academy ("The Math Academy Way", Justin Skycak)

Primary sources: [The Math Academy Way (working draft PDF)](https://www.justinmath.com/files/the-math-academy-way.pdf), [How our AI works](https://mathacademy.com/how-our-ai-works), [How it works / FAQ](https://mathacademy.com/how-it-works), [Hierarchical Spaced Repetition / FIRe article](https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/), [Spaced repetition vs spiraling](https://justinmath.com/spaced-repetition-vs-spiraling/), [Frank Hecker's chapter summaries](https://frankhecker.com/2025/02/10/math-academy-part-3/).

- **Knowledge graph.** Topics are nodes and prerequisite edges are arrows. A typical course has about 300 topics, and the full graph has thousands, from 4th grade through university. The graph also stores tutor knowledge: easiest and hardest variations, and which prerequisites matter for which struggle.
- **Two graphs.** A *prerequisite* graph decides what can be learned next. A separate *encompassing* graph decides where review credit flows: topic A encompasses B if practicing A necessarily practices B. Encompassing edges have **fractional weights** set by experts, and only for nontrivial, nearby edges.
- **Diagnostic.** An adaptive exam finds the **knowledge frontier**, the boundary between known and unknown topics. Using the graph, it cuts the number of questions by about an order of magnitude compared with testing 500–1,000 topics. Correct answers are positive evidence and incorrect answers negative evidence. **Slow correct answers count less.** Borderline topics are marked **"conditionally completed"**, and the student falls back if they later struggle on them. The diagnostic measures mastery *and automaticity*.
- **Lessons.** Lessons use worked examples and scaffolded practice. The question count is adaptive: higher accuracy means fewer questions, and each miss adds questions. Lessons are about 10 questions and reviews 3–5 questions in the FIRe article. A lesson **halts after too many errors**. The student then works on unrelated topics and retries later. If halted again, the system assigns remedial reviews on the most relevant prerequisites, possibly several levels back ("key prerequisites enable targeted remediation").
- **Spaced repetition with FIRe.** Per student-topic it tracks `repNum` (spaced repetitions completed) and `memory` (decays over time). Credit for passing an advanced topic **flows down** encompassing edges to simpler topics (implicit repetition), and **penalties for failing a simple topic flow up** to topics built on it. Early reviews earn discounted credit. Each student-topic pair has a learning **speed** (student ability over topic difficulty), and a 2x-speed student needs half as many reviews. When speed is below 1, implicit credit is ignored and explicit reviews are required. **Repetition compression** picks the fewest tasks whose implicit credit covers all due reviews, and new lessons are chosen to knock out due reviews where possible.
- **Interleaving and non-interference.** Reviews and quizzes mix topics. Similar, easily confused topics are spaced apart, and dissimilar ones are taught near each other, to reduce associative interference.
- **Quizzes.** A quiz becomes available about every 150 XP. It samples previously learned topics, adjusts difficulty to target about an 80% average, and a missed question triggers immediate remedial review.
- **XP.** One XP is roughly one minute of focused effort. Bonus XP for perfect work, and penalties for low-effort behavior such as guessing, per user reports. Daily XP goals drive pacing and projected completion dates.
- **Philosophy.** Direct instruction, mastery learning, automaticity before complex problem-solving, "layering" (build on recently learned material so it gets implicit review), and maximizing learning per minute.
- **Critique.** Michael Pershan argues spaced-repetition-heavy systems can reinforce shallow understanding ([Matuschak notes](https://notes.andymatuschak.org/Math_Academy)). Math Academy's curriculum starts at about 4th grade, so it has no K–3 pre-reader design to copy.

**What to borrow:** the two-graph model (prerequisite plus encompassing), conditional completion in the diagnostic, slow-correct-counts-less, halt-and-remediate, repetition compression, the 80% target, and XP as minutes of focused effort. **What to adapt for little kids:** audio-first lessons, CRA tiers, much shorter sessions, and no negative XP.

### 2.2 Khan Academy mastery levels

The current levels are Not started, Attempted, Familiar, Proficient, and Mastered. The mastery percentage counts skills at Proficient or Mastered. Under the older points system, Familiar was about 70–85% on an exercise, Proficient was 100% on a skill question set, and Mastered was 100% on that skill within a Unit Test or Course Challenge after reaching Proficient. Skills **decay down a level** when later missed. [Khan Help: Mastery levels](https://support.khanacademy.org/hc/bg/articles/5548760867853); [Older mastery-points help page](https://support.khanacademy.org/hc/en-us/articles/115002552631)

**Borrow:** a *visible, kid-legible ladder* of levels, promotion only via **mixed or cumulative** assessments (unit test or challenge), and demotion when later evidence contradicts mastery.

### 2.3 ALEKS (Knowledge Space Theory)

- A **knowledge state** is the set of items a student has mastered, and only some sets are feasible (they respect prerequisites). The **outer fringe** is the set of items the student is *ready to learn*, and the **inner fringe** is the "high points" of current competence. A state can be summarized by its two fringes. [Wikipedia: Knowledge space](https://en.wikipedia.org/wiki/Knowledge_space); [Falmagne et al., Learning Spaces (arXiv)](https://arxiv.org/pdf/1511.06757)
- From hundreds of thousands of assessments, the probability that a student successfully learns an item chosen from the outer fringe is **≈ 0.93** ([Falmagne et al., arXiv](https://arxiv.org/pdf/0803.4030)). This is strong validation that "teach from the frontier" works.
- The initial assessment is about 20–30 open-response questions (no multiple choice) and is adaptive; it gets shorter for students who miss early items. [WSU FAQ](https://math.wsu.edu/math-placement-overview/math-placement-faq/); [Kennesaw](https://campus.kennesaw.edu/colleges-departments/csm/academics/mathematics/placement/); [Miami](https://mathematics.miami.edu/undergrad/placement/about-aleks/index.html). ALEKS also models forgetting ([Matayoshi et al., EDM 2018](https://jmatayoshi.github.io/publications/EDM2018_forgetting.pdf)).

**Borrow:** "outer fringe = what to offer next" as the core recommendation rule, and constructed-response-only assessment.

### 2.4 DreamBox

DreamBox captures fine-grained interaction data, including *how* a child manipulates virtual objects (strategy, not just correctness), and adjusts difficulty, scaffolding, hints, and sequencing within and across lessons (vendor claims: [DreamBox adaptive learning](https://www.dreambox.com/adaptive-learning)). In a Harvard CEPR study of about 3,000 students in grades 3–5, usage was below recommendations and gains were modest and dose-dependent: about 20 min/week was associated with roughly +2.5 MAP percentile points. Harvard called the causal evidence "encouraging but mixed". [Harvard CEPR](https://cepr.harvard.edu/news/harvard-researchers-probe-student-time-spent-using-dreambox-math-software); [Hechinger Report](https://hechingerreport.org/customized-math-lessons-help-students-learn-research-says/). A K–1 study reported +0.11 on NWEA (vendor-reported, [Discovery Education](https://www.discoveryeducation.com/ca/dreambox-math/research)).

**Borrow:** treat **strategy evidence from manipulative interactions** as data. For example, did the child count all 8+5 one by one, or make a ten?

### 2.5 Zearn

Zearn is Eureka/EngageNY-aligned and structured as warm-up, concept exploration with digital manipulatives, guided practice, independent "Tower of Power" checks, and teacher-facing reports. A RAND RCT with about 10,000 students in grades 3–5 found +0.11 SD on NWEA MAP and earned an ESSA Tier 1 "Strong" rating (vendor page: [Zearn press release](https://about.zearn.org/press-releases/evidence-for-essa); [Zearn research](https://about.zearn.org/research)).

**Borrow:** a **consistent lesson rhythm** (warm-up, then concept, then practice, then check) and the "struggle → step back to a simpler visual" pattern.

### 2.6 Beast Academy (Art of Problem Solving)

Beast Academy uses comic-book lessons, puzzle-heavy practice, and a strong emphasis on non-routine problem-solving for advanced learners (grades 1–5). The online version has an adaptive mastery path, more than 1,000 lessons, more than 20,000 problems, hints, and a parent dashboard ([Beast Academy Online](https://beastacademy.com/online/enroll); [Modulo review](https://joinmodulo.com/products/beast-academy-online)). I found no public description of its adaptive algorithm.

**Borrow:** **puzzles as enrichment for advanced kids**, story and character framing, and challenge problems that reward persistence.

### 2.7 Summary comparison

| Product | Model | Placement | Mastery signal | Review | Ages |
|---|---|---|---|---|---|
| Math Academy | Prereq + encompassing graph, FIRe | Adaptive diagnostic, graph inference, conditional completion | Adaptive lesson passes, speed-weighted | FIRe spaced repetition + compression; quizzes at ~80% | ~Gr 4+ |
| Khan Academy | Skill list per unit | Course challenge | Level ladder; unit tests | Decay on misses | K–12+ |
| ALEKS | Knowledge Space Theory | ~20–30 open-response items | Knowledge state / fringes | Re-assessments; forgetting models | Gr 3+ |
| DreamBox | Proprietary, strategy-aware | Adaptive in-lesson | Strategy + correctness | Implicit | K–8 |
| Zearn | Curriculum sequence | Grade-level | Tower of Power checks | Fluency warm-ups | K–8 |
| Beast Academy | Curriculum + adaptive path | Placement tests | Problem sets | Mixed practice | ~Gr 1–5 |

---

## 3. Mastery-estimation and scheduling algorithms

The app needs two models that interact:

1. **Learning-state model:** how well does the child currently know skill *s*? This drives mastery gates and item difficulty.
2. **Memory / retention model:** when should *s* be reviewed so it is not forgotten? This drives spaced review.

### 3.1 Bayesian Knowledge Tracing (BKT)

- **Model.** A per-skill hidden Markov model with a binary state (known or unknown) and four parameters: P(L₀) prior, P(T) learn, P(G) guess, P(S) slip ([Corbett & Anderson 1995; Penn MOOT slides](https://learninganalytics.upenn.edu/MOOT/slides/W004V002.pdf)).
- **Update.** After a correct answer, P(L|correct) = P(L)(1−S) / [P(L)(1−S) + (1−P(L))G]. After an incorrect answer, P(L|wrong) = P(L)S / [P(L)S + (1−P(L))(1−G)]. Then P(L)ₙₑₓₜ = P(L|obs) + (1−P(L|obs))·T.
- **Conventions.** Constrain parameters to plausible ranges: Corbett & Anderson capped G < 0.3 and S < 0.1; others used G, S < 0.5. Mastery is usually declared at **P(L) ≥ 0.95**. [Baker et al. slides](https://learninganalytics.upenn.edu/MOOT/slides/W004V002v6.pdf)
- **Strengths.** Very interpretable ("95% sure she knows it"). G naturally captures multiple-choice guessing. Expert-set defaults can be used with no data. Cheap to compute.
- **Weaknesses.** No forgetting in the vanilla model. Binary knowledge state. Ignores item difficulty within a skill. Identifiability problems when fitting. One skill per item (multi-skill items need extensions).
- **Data.** Fitting needs roughly hundreds of student sequences per skill, which this project will not have soon; expert defaults are required.

### 3.2 Item Response Theory (IRT) and Rasch

- **Rasch / 1PL.** P(correct) = σ(θ − b), with student ability θ and item difficulty b. 2PL adds discrimination and 3PL adds a guessing floor.
- **Strengths.** Gold standard for **measurement** and computerized adaptive testing (choose the item where P ≈ 0.5 for maximum information, or ≈ 0.7–0.8 for learning). Puts items and students on one scale.
- **Weaknesses.** Assumes ability is static during testing, so it does not model learning. Calibration traditionally needs large samples, typically hundreds of responses per item ([small-sample CAT discussion](https://ideals.illinois.edu/items/81254)).
- **Cold-start workaround for this app.** Items are **procedurally generated**, so difficulty can be modeled from *item features* (digit count, number of regroupings, presence of zeros, crossing 10, representation tier). This is the idea behind Fischer's **Linear Logistic Test Model (LLTM)**: b = Σ wₖ·featureₖ. Hand-set the weights at first, then refit later.

### 3.3 Elo rating for students and items

- **Model.** Each answer is a "match" between student and item. P = σ(θ_s − d_i). After a response with correctness c ∈ {0, 1}: θ_s ← θ_s + K·(c − P) and d_i ← d_i − K·(c − P). This is essentially Rasch fit online ([Pelánek 2016, Computers & Education](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf); [Papoušek, Pelánek & Stanislav, EDM 2014](https://www.fi.muni.cz/~xpelanek/publications/EDM14-adaptive-facts.pdf)).
- **Uncertainty function.** Use a decreasing K, for example K(n) = α / (1 + β·n) with n = number of prior answers. Pelánek's work uses this form, with constants around α ≈ 1 and β ≈ 0.05 *(exact constants unverified)*. This makes early estimates move fast (good cold start) and later ones stabilize. Dynamic-K variants are an active research topic.
- **Extensions.** Multi-skill Elo (a global math ability plus a per-skill offset), time decay or forgetting ([Pelánek, decay-Elo](https://www.fi.muni.cz/~xpelanek/publications/decay-elo.pdf)), and response-time-aware scoring.
- **Strengths.** Trivial to implement (about ten lines). No offline fitting. Handles item difficulty. Robust. Works from the first answer. Interpretable as "skill level vs item level". Pelánek reports it performs comparably to more complex models in adaptive practice.
- **Weaknesses.** Estimates are not statistically unbiased, and their variance depends on context ([Keeping Elo alive, 2025](https://research.tilburguniversity.edu/en/publications/keeping-elo-alive-evaluating-and-improving-measurement-properties/)). It does not explicitly model learning or forgetting without extensions. A "mastered" threshold must be defined (e.g., predicted P(correct) on a *standard-difficulty* item ≥ 0.9).

### 3.4 Performance Factors Analysis (PFA)

- **Model.** Logistic regression: m = β_skill + γ_skill·(#prior successes) + ρ_skill·(#prior failures), P = σ(m). It handles multi-skill items naturally by summing over skills. [Pavlik, Cen & Koedinger 2009 (PDF)](https://www.stat.cmu.edu/~brian/nynke/726-2021/project%20HCI%20Prereqs%20(Elaine,%20Smeet%20&%20Zhou)/articles/Pavlik,%20Cen%20Kodeinger%2009.pdf); [PFA tutorial](https://yilinl.quarto.pub/pfa/)
- **Strengths.** Predictive accuracy similar to or better than BKT. Multi-skill. Easy to fit with any logistic regression library once data exists. Variants with recency weighting (R-PFA) and duration exist.
- **Weaknesses.** Needs fitted parameters (data). Counts never decay without extensions. Less directly interpretable as "knows / doesn't know".

### 3.5 Deep Knowledge Tracing (DKT) and descendants

DKT (Piech et al., 2015) is an RNN or transformer over the interaction sequence. Khajah, Lindsey & Mozer (2016) showed that **BKT extended with forgetting, skill discovery, and individual ability matched DKT's accuracy**, and that DKT's gains did not come from novel representations. [How Deep is Knowledge Tracing? (arXiv)](https://arxiv.org/abs/1604.02416v2); [Wilson et al., "Deep learning is not the panacea"](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/Wilsonetal2016.pdf). DKT needs tens of thousands of learners, is opaque (bad for parent explanations), and can produce inconsistent predictions. **It is overkill for this project** and should only be revisited if the app ever has thousands of users.

### 3.6 Spaced-repetition schedulers: SM-2, half-life regression, FSRS

- **SM-2 (SuperMemo/Anki legacy).** Intervals grow by a per-item ease factor (starting at about 2.5), and a lapse resets the interval. Simple, but crude and designed for flashcards.
- **Half-Life Regression (Duolingo; Settles & Meeder 2016).** P(recall) = 2^(−Δt/h), where the half-life h is regressed on features (counts of right and wrong answers, item features). [ACL 2016](https://aclanthology.org/P16-1174/). A good fit for generated math items with features.
- **FSRS (Free Spaced Repetition Scheduler).** Based on the DSR model (Difficulty, Stability, Retrievability) from Woźniak. It tracks per-card stability S and difficulty D, models retrievability R(t) with a power forgetting curve, and schedules the next review when R falls to a target retention (e.g., 0.9). Parameters are optimized from review logs, with defaults trained on large Anki datasets. Open-source implementations exist in TypeScript (`ts-fsrs`), Python, Rust, and Go. [FSRS GitHub](https://www.github.com/open-spaced-repetition/free-spaced-repetition-scheduler); [Anki docs](https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm)
  - *Caveat:* FSRS is designed for **self-graded flashcards of independent items**. Math skills are **hierarchical**, and review is done on *freshly generated* problems. Use FSRS's memory math per **skill**, not per item, and feed it graded outcomes automatically (correct and fast = "Good/Easy", correct and slow = "Hard", wrong = "Again"). The default parameters were fit on adult Anki users. Kids' forgetting differs, so treat the target retention as tunable.
- **Math Academy FIRe** (Section 2.1) is the only scheduler here that natively handles **hierarchy**: credit flows down, penalties flow up, and reviews are compressed.

### 3.7 Knowledge Space Theory (KST) as an algorithm

KST is less a per-skill estimator than a **structure for the whole state**: a probability distribution over feasible knowledge states, updated after each answer with careless-error and lucky-guess parameters. It is ideal for **placement** (Section 4). The full state space is combinatorially large, but restricting it to states consistent with a prerequisite DAG, plus per-node marginal approximations, makes it tractable.

### 3.8 Comparison

| Algorithm | Models learning | Models forgetting | Item difficulty | Cold start (0 data) | Data to fit | Interpretability | Implementation |
|---|---|---|---|---|---|---|---|
| BKT | Yes (T) | No (ext. yes) | No | OK with expert defaults | Med (per skill) | High: P(known) | Easy |
| Rasch/IRT | No | No | Yes | Poor (needs calibration); LLTM helps | High | High (for measurement) | Med |
| **Elo** | Implicitly (tracks) | Via decay ext. | **Yes** | **Good** | **None** | Med-High | **Very easy** |
| PFA | Yes (counts) | Ext. (R-PFA) | Via item term | Poor | Med | Med | Easy once data |
| DKT | Yes | Implicit | Implicit | Very poor | Very high | Low | Hard |
| SM-2 | — | Yes (heuristic) | — | Good | None | Med | Very easy |
| FSRS | — | **Yes (principled)** | Per-card D | Good (defaults) | Optional | Med | Easy (library) |
| HLR | — | Yes | Via features | Needs fit | Med | Med | Easy |
| KST | Structural | Ext. | No | OK with expert DAG | Low (structure from experts) | High (fringes) | Med |
| FIRe (MA) | Yes (repNum) | Yes | Speed factor | Expert weights | Proprietary details | High | Med |

### 3.9 Recommendation for the MVP, with an upgrade path

**MVP ("v1"): an expert-authored prerequisite DAG plus three simple, interpretable components.**

1. **Per-skill ability: Elo with uncertainty-decaying K**, global plus per-skill offsets.
   - θ_global (overall math level) and θ_s (per-skill offset), with P(correct on item i) = σ(θ_global + θ_s − d_i).
   - d_i comes from an **LLTM-style feature formula** per item template (hand-set weights). Items are generated, so difficulty is known a priori and refined online.
   - K(n) = α/(1+β·n). Update both θ_s and θ_global (the global one with a smaller K).
   - Use it to **pick item difficulty** that targets ≈ 80–85% predicted success (≈ 85–90% for the kindergartner).
   - Down-weight the update for slow-correct answers and treat hint-assisted correct answers as partial credit (c = 0.5), following Math Academy's slow-correct-counts-less rule.
2. **Mastery gate: a rule layer on top of Elo** (Section 5.1). For example: predicted P(correct) ≥ 0.9 on a reference-difficulty item, **and** at least 5 of the last 6 independent constructed-response items correct across at least 2 item formats and at least 2 sessions, **and** (for facts) median latency under threshold. Explicit rules are easy to explain to a parent and debug.
3. **Memory: a skill-level FIRe-lite scheduler.** Per skill store `stability` (days) and `lastReviewed`. Retrievability R = 2^(−Δt/stability). A review is due when R < 0.85. On a successful review, stability *= ~2–3 (more if fast, less if slow), discounted if the review came early. On a failure, stability shrinks (e.g., /2), and the skill is demoted if two reviews fail in a row. Add **implicit credit**: a successful review of skill A passes a fraction w (an expert-set weight on encompassing edges) of the stability boost to the skills A encompasses, and a failure on a prerequisite marks dependents as "at risk". Add **compression**: when picking review items, prefer the highest-level due skill that covers the most other due skills.

Why this combination and not BKT alone? With two children there is no data to fit BKT, and BKT ignores item difficulty, which is central here because items are generated at controllable difficulty. Elo works from the first answer and handles difficulty, and the rule-based gate adds the interpretability BKT would have offered. **If you prefer a probabilistic "P(knows)" display**, run a **BKT shadow model** with conservative expert defaults (P(L₀) from placement, T = 0.15, G = 0.05 for numeric entry or about 1/k for k-option multiple choice, S = 0.08) in parallel. It is cheap and gives a second opinion for the parent dashboard.

**Upgrade path**
- **v2 (hundreds of child-skill sequences, e.g., more families):** log every attempt (skill, item features, correctness, latency, hints, representation tier, timestamp) from day 1. Fit **PFA / R-PFA or BKT+forgetting** offline, compare to Elo by log-loss/AUC on held-out data, and refit the LLTM feature weights for item difficulty.
- **v3 (thousands of review events):** replace FIRe-lite stability multipliers with **FSRS** (via `ts-fsrs`), with parameters **optimized on the app's own logs**, still per skill, keeping the hierarchical credit flow on top. Alternatively, fit **Half-Life Regression** with item features.
- **v4 (thousands of learners):** consider multidimensional IRT calibration and possibly attention-based knowledge tracing. Only adopt them if they beat simpler models on held-out data *and* their outputs can still be explained to parents.

Design the code around a **`LearnerModel` interface** (`predict(skill, item) → P`, `update(attempt)`, `masteryStatus(skill)`, `dueReviews(now)`) so implementations can be swapped and replayed against logs.

---

## 4. Placement and diagnostic design

**Goal:** find each child's **frontier** (the outer fringe: skills whose prerequisites are mastered but which are not yet mastered) in a few short, friendly sessions, then *verify* the inferred mastery through early reviews.

### 4.1 Principles from ALEKS, Math Academy, and CAT

- Use the **prerequisite DAG for inference**. A *correct* answer on skill X is evidence that X's **ancestors** (prerequisites) are known. An *incorrect* answer is evidence that X's **descendants** are not known. This lets one question update many nodes (Math Academy reports about a 10x reduction in questions).
- **Use constructed responses only.** ALEKS has no multiple choice. For pre-readers, use tap-to-count, drag, and number-pad entry.
- **Speed-weighted evidence.** A slow-correct answer is weaker evidence, especially for fact skills (Math Academy).
- **Conditional completion.** Inferred-but-not-directly-tested skills are marked **"assumed"**, and an early review verifies them. Failures roll the frontier back (Math Academy).
- **Stop rules.** Stop when the frontier is stable (no node's mastery probability is in the uncertain band 0.2–0.8), when a maximum question count is reached, or when the child shows fatigue.

### 4.2 Concrete algorithm ("graph-propagated adaptive placement")

State: for each node v, a probability p(v) that v is mastered, initialized from a **grade/age prior** (e.g., p ≈ 0.9 for skills more than a grade below the child's age-grade, 0.5 near grade level, 0.1 above). Parents may enter "she's doing 2nd grade math at home" to shift the prior up for advanced kids.

Loop:
1. **Select a node** to test that maximizes expected information. A cheap heuristic is to pick the node with p(v) closest to 0.5, weighted by the number of uncertain ancestors and descendants it would resolve (a "graph binary search"). Prefer nodes on the "spine" (big integrative skills such as "2-digit addition with regrouping") early.
2. **Ask 1–2 items** for that node at reference difficulty, using constructed response.
3. **Update.** Do a BKT-style posterior update on v using placement-specific guess and slip values (G ≈ 0.05 for numeric entry, S ≈ 0.1). Then propagate:
   - if correct: for each ancestor a, p(a) ← p(a) + λ_up·(1 − p(a))·(strength of v's posterior), with λ_up decaying with graph distance (e.g., 0.8 for direct prerequisites, 0.6 two hops away);
   - if wrong: for each descendant d, p(d) ← p(d)·(1 − λ_down), with λ_down decaying by distance. Do not lower ancestors (a wrong answer on X does not say *which* prerequisite failed). Instead, mark X's direct prerequisites as **high-priority candidates** for the next probe, which gives the *downward* search.
4. **Repeat** until the stop rule. Then classify: p ≥ 0.85 means "assumed mastered" (direct or inferred), p ≤ 0.3 means "not mastered", and anything in between is tested in early lessons. The **frontier** is the not-mastered nodes whose prerequisites are all assumed mastered.
5. **Verify** in the first week: schedule quick review checks on inferred-mastered nodes, prioritizing those closest to the frontier and those with only indirect evidence. A failure demotes the node and its descendants.

A more principled alternative is a Bayesian network over the DAG, or KST with probabilistic states. These are worth it later, but the heuristic above is transparent and good enough for v1.

### 4.3 Practical placement settings for this app

- **Kindergartner (≈5–6 y):** 3–4 mini-sessions of about 5 minutes (≈8–12 items each), framed as a game ("help the robot count"), with audio prompts, no fail sounds, and a stop on two consecutive "I don't know" or frustration signals. Probe: subitizing (up to 5, then 10), counting and cardinality, number recognition to 20, comparing, composing and decomposing to 10, adding and subtracting within 10 with objects, and teen numbers as ten-and-some.
- **2nd grader (advanced):** 2–3 sessions of about 10 minutes (≈15–20 items each). Probe: facts within 20 (accuracy, then latency), place value to 1,000, 2- and 3-digit addition and subtraction with regrouping, skip counting, early multiplication (equal groups and arrays), measurement and time, and fractions as equal parts. Allow upward probes beyond grade level; advanced kids may be ready for 3rd–4th grade content.
- Every placement item has a **"skip / I haven't learned this"** button, so the child is never forced to guess. A skip counts as weak negative evidence.
- Re-run a **mini-placement** on new domains as the child unlocks them, instead of one giant up-front test.

---

## 5. Mastery criteria, guessing, and misconception detection

### 5.1 What counts as "mastered"

Combine **accuracy, independence, transfer across formats, retention over time, and (for facts) speed.** A suggested ladder, kid-legible and Khan-like:

| Level | Criteria (suggested defaults; tune with data) | Kid-facing |
|---|---|---|
| **New** | Not yet introduced | locked or glowing |
| **Learning** | In lesson; scaffolds or hints in use | seedling |
| **Practiced** | Lesson complete: ≥ 80% on last 5 independent items, ≥ 1 item at reference difficulty | sprout |
| **Proficient** | Elo P(correct @ reference) ≥ 0.9; ≥ 5 of last 6 independent correct; ≥ 2 formats/representations; ≥ 2 sessions | flower |
| **Mastered** | Proficient **and** passed spaced reviews at ≥ 1 day and ≥ 1 week intervals, including ≥ 1 in **interleaved** mixed review | tree |
| **Fluent** (fact/procedure skills only) | Mastered **and** median latency ≤ threshold across ≥ 20 items (e.g., ≤ 2–3 s tap/oral for single-digit facts; relaxed for K); untimed accuracy ≥ 95% | golden tree |

- **Demotion:** two failed reviews in a row, or a failure on a dependent skill traced to this skill, drops one level and schedules remediation. Khan and Math Academy both do this.
- **Mastery threshold ≈ 90%**, not 80%, following the Bloom/VanLehn analysis.
- **Retention is part of mastery.** A skill is not "mastered" until it survives a delay. This is the single biggest correction to naive "10 in a row" systems.
- Don't over-practice: once Proficient, stop new practice and switch to spaced review. Advanced kids especially should not be held on mastered material; let them **test out** of a skill with 3–4 correct reference items.

### 5.2 Handling guessing: prefer constructed response

- With k-option multiple choice, a blind guess is correct 1/k of the time (25% for 4 options). This inflates mastery estimates, and BKT's guess parameter or 3PL's c parameter exists precisely to correct for it.
- **Default to constructed response:** number pad entry, tap-to-count, drag the right number of blocks, place a point on a number line, or build the number with base-10 blocks. Guess rates drop to near zero.
- When multiple choice is unavoidable (pre-readers, comparisons, "which picture shows..."), use ≥ 4 options with **diagnostic distractors** (each wrong option maps to a known misconception), shuffle positions, require more evidence for mastery (e.g., treat a multiple-choice correct answer as c = 0.6 in Elo, or use G = 1/k in BKT), and never gate mastery on multiple choice alone.
- **Detect rapid guessing:** latency below a floor (e.g., < 0.8 s on a non-trivial item) or patterned answers (always the same position) mean the response is excluded from the model, followed by a gentle "let's slow down" prompt. Math Academy similarly penalizes guessing behavior.
- **Number-line estimation** items have graded accuracy (percent absolute error), which gives continuous rather than binary evidence.

### 5.3 Misconception detection via error patterns

Systematic "bugs" are well documented. Brown & Burton's **BUGGY** (1978) modeled students' subtraction errors as substitutions of buggy subprocedures, and later work by Brown & VanLehn (repair theory) and DEBUGGY catalogued dozens of precise place-value subtraction bugs from thousands of students. A fixed bug library catches only known errors, but those cover most cases. [BUGGY overview](https://tecfaetu.unige.ch/staf/staf-d/krige/staf11/buggy.html); [Repair Theory (Brown & VanLehn)](https://www.lri.fr/~mbl/Stanford/CS477/papers/RepairTheory-SeelyBrown.pdf)

**Implementation pattern:** each item template has **buggy-rule functions** that compute what a child holding misconception *m* would answer. When the child's answer equals a buggy answer (and not the correct one), tag the attempt with *m*. When the same *m* shows up on 2 or more of the last 5 relevant items, trigger targeted remediation: go back to the concrete tier for that sub-step, give a worked example contrasting the right and buggy procedure, and alert the parent dashboard. Also design items to **discriminate** between bugs. Note that on 2-digit items such as 52−27, "smaller-from-larger" and "borrow without decrement" both produce 35, so only 3-digit items like 305−128 (223 vs 287) tell them apart. Include zeros in the minuend to expose borrow-across-zero errors.

Starter misconception library (K–5):

| Domain | Misconception (bug) | Example | Detection |
|---|---|---|---|
| Counting | Counts the start number when counting on | 5+3 → "5,6,7" → 7 | answer = a+b−1 |
| Counting | One-to-one correspondence error | skips or double-counts objects | tap trace vs objects |
| Place value | Writes numbers as spoken | "one hundred five" → 1005 | concatenation pattern |
| Place value | Teen/ty confusion; digit reversal | 13 ↔ 31 | reversed digits |
| Addition | Forgets to carry | 47+38 → 75 | column sums mod 10 |
| Addition | Writes full column sum | 47+38 → 715 | concatenated column sums |
| Subtraction | **Smaller-from-larger** | 52−27 → 35; 305−128 → 223 | abs-diff per column |
| Subtraction | Borrows but doesn't decrement | 52−27 → 35; 305−128 → 287 | column-wise simulation |
| Subtraction | Borrow across zero (zero becomes 9, hundreds not decremented) | 403−127 → 376 | zero-column rules |
| Equal sign | "=" means "write the answer" | 3+4=□+5 → 7 | answer = left sum |
| Multiplication | Adds instead of multiplies; area/perimeter swap | 4×3 → 7 | a+b |
| Fractions | Bigger denominator = bigger fraction | 1/8 > 1/3 | compare choice |
| Fractions | Add numerators and denominators | 1/2+1/3 → 2/5 | (a+c)/(b+d) |
| Decimals | Longer is larger | 0.25 > 0.5 | compare by digit length |
| Measurement | Ruler starts at 1 / counts tick marks | off-by-one length | answer = true+1 |

DreamBox-style **process data** (how the child moved the counters, whether they counted on or counted all) can detect *strategy level*, not just bugs. For example, a child who taps all 13 objects for 8+5 is at counting-all, while one who drags 2 of the 5 to complete the ten-frame is using make-ten. Use these signals to choose the next strategy lesson.

---

## 6. Designing for young children and pre-readers

### 6.1 Evidence and guidance

- **Four pillars of educational apps.** Hirsh-Pasek et al. (2015) argue that apps teach when they promote **active** (minds-on, not just tapping), **engaged** (not distracted by bells and whistles), **meaningful** (connected to the child's life), and **socially interactive** learning, *within a clear learning goal*. [Psych. Sci. in the Public Interest](https://doi.org/10.1177/1529100615569721); [New America summary](https://www.newamerica.org/insights/new-framework-identify-truly-educational-apps/)
- **Screen time.** The American Academy of Pediatrics recommends about 1 hour/day of high-quality programming for ages 2–5, co-viewed with a caregiver where possible, and consistent limits for 6+. [HealthyChildren.org (AAP)](https://www.healthychildren.org/English/family-life/Media/Pages/Where-We-Stand-TV-Viewing-Time.aspx)
- **Attention span.** A common practitioner heuristic is roughly 2–3 minutes of sustained focused attention per year of age (so about 10–15 minutes at age 5). This is a rule of thumb, not a precise research finding *(heuristic)*. Design for **5–10 minute sessions for the kindergartner** and **10–20 minutes for the 2nd grader**, with natural stopping points every few minutes.
- **Math anxiety starts early.** It appears by 1st–2nd grade and hurts high-working-memory children most (Ramirez et al., 2013, [UChicago](https://news.uchicago.edu/story/math-anxiety-causes-trouble-students-early-first-grade)). **Parents' math anxiety transmits** to children, especially when anxious parents help frequently with homework (Maloney et al., 2015, [Psych. Science](https://doi.org/10.1177/0956797615592630)).

### 6.2 Design rules

**Audio and text**
- **Audio narration for every prompt, instruction, and feedback message**, with a replay button (a speaker icon). Use professional or high-quality TTS, pre-rendered and cached, so it works offline and wording is reviewed.
- **Minimal text** for K. Use icons, numerals, and pictures, and read numbers and words aloud on tap. Highlight words as they are read (karaoke-style), which supports emergent reading.
- **Use consistent math vocabulary** (WWC Rec. 2): "add", "equals", "ten", "ones", "is the same as". Avoid mixing synonyms early.

**Interaction**
- Big touch targets (≥ 48–64 px), drag-and-drop with snapping, tap-to-count with automatic counting sounds, and no typing for K except a large number pad (0–9, 0–20).
- **Manipulatives:** ten-frames (5- and 10-), counters, a rekenrek (bead rack), number paths and number lines, base-10 blocks, pattern blocks, shapes, and fraction bars. Keep them visually simple.
- **Ignore accidental taps** (debounce) and avoid failure states triggered by motor imprecision.

**Session structure (≈10 min for K)**
1. Warm-up: 1–2 quick review items the child will likely get right (confidence).
2. New learning or practice at the frontier (the main 5 minutes).
3. Interleaved review: 2–4 items.
4. Finish with a win: a celebration, a "today you learned...", and an optional puzzle or play reward.
- **Hard cap** on session length (parent-configurable), with an "all done for today!" screen. The ideal is short, frequent sessions (daily), not long ones; spacing favors this too.

**Emotion and motivation**
- **No visible countdown timers** for K. For 2nd grade, timers are optional and self-referenced only (Section 1.9).
- **No lives or hearts, no game over, no loss of earned rewards.** Errors trigger a hint ladder, not punishment.
- **Process praise:** "You kept trying!", "You used a ten-frame to check, great idea." Avoid "you're so smart."
- **Normalize mistakes:** an occasional "Oops, my brain grew!" style framing, and a character who makes and fixes mistakes too.
- **Frustration detection:** 3 or more errors in a row, rapid random tapping, or long idle time triggers an easier item, a switch to the concrete tier, or a suggested break. Never more than 2 consecutive failures without a success opportunity.
- **Rewards:** prefer *intrinsic* (unlocking new worlds and puzzles, seeing your skill tree grow) over slot-machine extrinsic rewards. XP can map to "minutes of focused effort" (Math Academy), shown to parents more than to kids.
- **Socially interactive:** prompts for co-play ("Show a grown-up how you made 10!"), and family challenge modes (Bedtime-Math-style; see Section 7).

**Hint ladder (per item)**
1. Re-read the prompt (audio replay).
2. Strategy nudge ("Can you make a ten first?").
3. Show the representation (ten-frame or number line overlay).
4. Worked partial step.
5. Show the answer with an animated explanation, then a similar item next.

Each hint level reduces the credit the item gives the learner model.

---

## 7. Parent dashboard and parent-in-the-loop

### 7.1 Evidence

- **Bedtime Math RCT** (Berkowitz et al., 2015, *Science*): 587 first-graders. A math app with short **parent–child** story problems raised math achievement over the school year compared with a reading-app control, with the largest effects for children of **math-anxious parents**. Gains appeared even at about once-a-week use. [ScienceDaily](https://www.sciencedaily.com/releases/2015/10/151008152222.htm); [WBEZ](https://www.wbez.org/news/2015/10/08/where-the-wild-fractions-are-the-power-of-a-bedtime-math-story)
- **Parent math anxiety** can hurt kids when anxious parents help frequently (Maloney et al., 2015). Parent involvement should therefore be **structured and scripted**, not "go help your kid with math".
- WWC *Teaching Math to Young Children* Recs. 3–5 (progress monitoring, everyday math talk, daily math time) map naturally onto a parent role.

### 7.2 What the dashboard should do

- **At a glance:** time practiced this week, streak (gentle, with no punishment for breaks), skills mastered or fluent, and the current frontier ("working on: making 10").
- **Skill map:** a visual of the knowledge graph colored by level (Section 5.1), with inferred-from-placement skills shown distinctly ("assumed") until verified.
- **Why the app believes it:** for any skill, the evidence (recent attempts, accuracy, latency, last review date, next review due). This is the payoff of interpretable models.
- **Misconception alerts** with a plain-language explanation and a **2-minute offline activity** ("Use 10 spoons: hide some, ask how many are hiding" for the number-bonds-to-10 misconception).
- **Conversation starters / family challenges:** daily Bedtime-Math-style story problems the parent reads aloud, with scaffolded questions at three levels and the answers provided. This lowers the bar for math-anxious parents.
- **Controls:** session length cap, daily limit, timed-mode on/off, audio on/off, override placement ("she already knows this" to test out, or "slow down"), pause new content to focus on review, and an "approve next unit" gate if desired.
- **Weekly summary** (in-app, or email only with consent): progress and what's next.
- **Multi-child support** for siblings, without leaderboards between siblings by default; comparison can backfire.
- **Privacy:** store the minimum data needed. See Section 8 on COPPA.

---

## 8. LLMs (e.g., Claude) for hints, explanations, and item generation

### 8.1 Potential benefits

- Rapidly **authoring content**: item templates, word-problem contexts (personalized themes such as dinosaurs or space), multiple explanations per skill, narration scripts, distractor rationales, and parent activity cards.
- **Misconception analysis** of free-form work (older kids), and explanation variety.
- **Adaptive hints** that respond to the specific wrong answer.
- **Parent-facing** summaries and suggestions.

### 8.2 Risks

- **Learning harm without guardrails.** Bastani et al. (PNAS 2025) ran a field experiment with about 1,000 high-school students in Turkey. Unrestricted GPT-4 access raised practice scores by 48%, but students did **17% worse** on later unassisted exams than controls. A tutor version with guardrails (hints, not answers) raised practice scores by 127% and largely mitigated the harm, though it showed no exam gain over control. [SSRN](https://papers.ssrn.com/abstract=4895486); [Wharton summary](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education)
- **Accuracy.** LLMs still make arithmetic slips and unwarranted assumptions on word problems. Even with the gold solution provided, they struggle to locate the first error in a student's work ([arXiv 2509.01395](https://arxiv.org/html/2509.01395v1)). They can generate subtly wrong problems, such as ambiguous wording or wrong answer keys ([Elementary MWP generation, arXiv 2506.05950](https://arxiv.org/pdf/2506.05950)). For a 5-year-old, one wrong "correct answer" is very costly to trust.
- **Safety and appropriateness.** Open-ended chat with young children risks off-topic, unsafe, or manipulative content, and pre-readers cannot meaningfully use text chat anyway.
- **Privacy / COPPA.** The FTC's amended COPPA Rule became effective **June 23, 2025**, with full compliance required by **April 22, 2026**. It requires **separate verifiable parental consent** before disclosing children's personal information to third parties (unless integral to the service), stricter data-retention and security requirements, and expanded definitions of personal information. [Latham & Watkins](https://www.lw.com/en/insights/2025/05/ftc-publishes-updates-to-coppa-rule); [Lowenstein Sandler](https://www.lowenstein.com/news-insights/publications/client-alerts/ftc-finalizes-updates-to-coppa-rule-what-you-need-to-know); [Finnegan](https://www.finnegan.com/en/insights/articles/coppas-amended-rule-is-now-in-full-effect-what-operators-need-to-know.html). Sending a child's free text or voice to an LLM API is a disclosure of personal information to a third party. A private family app has lower exposure than a published one, but the same design should scale to publication.
- **Provider policy.** Anthropic's *Guidelines for Organizations Serving Minors* require products where minors interact with the API to comply with child-safety and privacy laws such as COPPA (with compliance stated publicly) and to **disclose that users are interacting with AI**. They recommend age verification, content moderation and filtering, monitoring and reporting, education on safe use, and Anthropic's child-safety system prompt, layered with the product's own safeguards. Anthropic audits compliance. [Anthropic Help Center](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors); [Child safety guidance for developers](https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers); [Usage Policy](https://www.anthropic.com/aup)

### 8.3 Safer patterns (ranked from safest to riskiest)

1. **Offline authoring with human review (recommended for v1).** Use Claude at *build time* to draft item templates, contexts, explanations, hint ladders, narration scripts, and misconception-specific feedback. A parent or developer reviews them, and they ship as static content. **The child never touches the LLM.** Zero COPPA third-party disclosure from the child.
2. **Deterministic verification.** Never let the LLM be the source of truth for answers. Items are generated by **code** (templates plus parameters) that computes the answer. The LLM writes only the *wording* or story around numbers the code chose, and an automated checker re-parses the text to confirm the numbers and question match. Run a second-pass LLM critic plus unit tests over each generated batch (ambiguity, reading level, cultural appropriateness), then human spot-check.
3. **Constrained runtime selection.** At runtime, the app (not the child) can ask a model to *choose among pre-approved hints or explanations* given structured, non-identifying inputs (skill ID, item parameters, error tag). The output is an enum or ID, validated by code. No child free text is sent.
4. **Constrained runtime generation for older kids (opt-in, parent-consented, later).** Short hint generation from structured inputs, a strict system prompt (including Anthropic's child-safety prompt), output filters (length, reading level, no answer reveal, numeric consistency check against the code-computed answer), logging for parent review, AI disclosure, and no free-form chat.
5. **Open chat tutor:** avoid for K–5. If ever used for older students, follow Bastani-style guardrails (Socratic hints, never the full solution) plus everything above.

Additional practices: send no names, ages, voice, or free text to the API; use pseudonymous IDs; cache and version all generated content; keep a "report a problem" button on every item; and treat any LLM-authored content as untrusted until reviewed.

---

## 9. Consolidated recommendations

### Pedagogy (lesson design)
1. **Explicit instruction first** (worked example, then faded example, then scaffolded, then independent) for new skills, with **adaptive skipping** for advanced kids (expertise reversal). Use puzzles and productive struggle as **enrichment** on mastered skills.
2. Use **CRA representation tiers per skill** with concreteness fading and fallback on errors. Keep manipulatives visually plain. Treat the **number line** as a first-class representation.
3. Encode **strategies as graph nodes** (counting on, doubles, make ten, near doubles, think-addition) and gate fact-retrieval practice on them. Use incremental-rehearsal-style mixing (about 90% known).
4. **Retrieval, spacing, and interleaving by default:** each session includes interleaved review once two or more skills are mastered. Target about 80–85% success (85–90% for K).
5. **Immediate, task-focused feedback** with a graded hint ladder. Praise process, never ability. No punitive timers, lives, or negative XP.
6. Treat **fluency as a separate level above mastery**. Measure latency silently, and offer timed games only as optional self-competition for the 2nd grader on already-accurate facts.

### Adaptivity (engine)
7. Build an **expert-authored prerequisite DAG** (from learning trajectories plus Common Core K–8), plus an **encompassing** relation with fractional weights for implicit review credit (Math Academy's two-graph model).
8. **MVP learner model:** Elo (global plus per-skill, uncertainty-decaying K) with **feature-based item difficulty** (LLTM). Add a **rule-based mastery gate** (≥ 0.9 predicted at reference difficulty, 5 of the last 6, 2 or more formats, 2 or more sessions) and a **skill-level FIRe-lite memory model** (stability doubling, implicit credit down, penalties up, review compression). Optionally run a BKT shadow model for a P(knows) display.
9. Put it behind a swappable interface and log everything. **Upgrade path:** PFA/BKT+forgetting (v2), FSRS-optimized per-skill memory (v3), IRT/KT models only at scale (v4). **Skip DKT.**
10. Use **graph-propagated adaptive placement**: information-seeking node selection, credit propagated up to prerequisites on correct answers and down to dependents on errors, slow-correct down-weighted, inferred skills marked "assumed" and verified in week 1. Keep sessions short (K: about 4 × 5 min; 2nd grade: about 2–3 × 10 min) and allow above-grade probes.
11. **Mastery means retention:** Proficient becomes Mastered only after passing spaced reviews at ≥ 1 day and ≥ 1 week, including interleaved review. Demote on repeated review failures.
12. **Constructed responses by default.** Multiple choice only with diagnostic distractors and discounted evidence. Detect rapid guessing.
13. **Misconception library:** buggy-rule functions per item template, tagging on matches, and triggering targeted remediation and parent alerts after repeated matches. Use manipulative process data to infer strategy level.

### Young kids, parents, LLMs
14. **Audio-first, low-text, big targets, 5–10 minute sessions for K** (10–20 for 2nd grade), warm-up wins, a celebratory finish, frustration detection, and parent-set caps.
15. **Parent dashboard:** a skill map with evidence ("why we think so"), misconception alerts with offline activities, Bedtime-Math-style scripted family problems, controls (time caps, timed-mode, test-out, pace), and no sibling leaderboards.
16. **LLMs at build time only for v1:** Claude drafts content, code computes all answers, automated checks run, a human reviews, and content ships static. The child never interacts with an LLM. Any later runtime use is structured-input and selection-or-constrained output with validation, no PII, AI disclosure, parental consent, COPPA compliance, and Anthropic's minors guidelines.

---

## 10. Sources

**Practice guides and syntheses**
- WWC, *Assisting Students Struggling with Mathematics: Intervention in the Elementary Grades* (2021): https://ies.ed.gov/ncee/wwc/practiceguide/26
- WWC, *Teaching Math to Young Children* (2013) — summary: https://kidswholovemath.substack.com/p/us-department-of-education-recommendations ; Rec. 1 handout: https://www.education.ne.gov/wp-content/uploads/2020/05/Teaching-Math-to-Young-Children-Recommendation-1.pdf ; guide mirror: https://marzanoresearch.com/wp-content/uploads/2025/08/Teaching-Math-to-Young-Children.pdf
- IES, *Organizing Instruction and Study to Improve Student Learning* (2007): https://ies.ed.gov/ncee/wwc/PracticeGuide/1
- Dunlosky et al. (2013): https://journals.sagepub.com/doi/10.1177/1529100612453266
- National Mathematics Advisory Panel (2008): https://www2.ed.gov/about/bdscomm/list/mathpanel/report/final-report.pdf
- Science of Math coverage: https://edsource.org/updates/as-test-scores-plummet-the-science-of-math-movement-may-be-gathering-steam ; https://www.the74million.org/article/as-test-scores-crater-debate-over-whether-theres-a-science-to-math-recovery/ ; https://www.edweek.org/teaching-learning/debates-over-math-teaching-are-heating-up-they-could-affect-classrooms/2026/01

**Pedagogy research**
- CRA meta-analytic review (2025): https://scholars.uky.edu/en/publications/a-meta-analytic-review-of-the-concrete-representational-abstract-/ ; single-case synthesis: https://files.eric.ed.gov/fulltext/EJ1338995.pdf
- Carbonneau, Marley & Selig (2013), manipulatives meta-analysis: https://doi.org/10.1037/a0031084
- Fyfe et al. (2014), concreteness fading: https://doi.org/10.1007/s10648-014-9249-3
- Siegler & Ramani (2008), linear board games: https://doi.org/10.1111/j.1467-7687.2008.00714.x
- Jordan et al. (2009), early number sense predicts later achievement: https://doi.org/10.1037/a0014939
- Building Blocks / learning trajectories: https://works.bepress.com/alissa-lange/1/ ; https://www.mheducation.com/unitas/school/explore/sites/building-blocks/2008-evaluation-effects-research-based-pk-math.pdf
- Fact strategies: https://www.mheducation.com/unitas/school/explore/research/em-review-literature-for-facts-strand.pdf ; https://merga.net.au/wp-content/uploads/DOCS/common/Uploaded%20files/Annual%20Conference%20Proceedings/2014%20Annual%20Conference%20Proceedings/merga37_young-loveridge.pdf ; https://kcm.nku.edu/MathHub/transcripts/KCM_MathHub_SI_Addition_script.pdf ; https://mathfactlab.helpscoutdocs.com/article/68-the-foundational-research-behind-mathfactlab
- Bloom 2-sigma critiques: https://nintil.com/bloom-sigma/ ; https://justinmath.com/blooms-two-sigma-problem/
- Rohrer et al. (2020), interleaving RCT: https://www.structural-learning.com/research-briefings/mix-it-up ; https://www.gwern.net/doc/psychology/spaced-repetition/2019-rohrer.pdf ; replication: https://ies.ed.gov/use-work/awards/systematic-replication-study-interleaved-mathematics-practice
- Spacing in classrooms: https://www.frontiersin.org/articles/10.3389/fpsyg.2020.00811/full
- Desirable difficulties caveat: https://www.learningandthebrain.com/blog/the-downsides-of-desirable-difficulties/
- Worked examples / expertise reversal: https://en.wikipedia.org/wiki/Worked-example_effect ; https://en.wikipedia.org/wiki/Expertise_reversal_effect ; Salden et al. (2010): https://link.springer.com/doi/10.1007/s11251-009-9107-8
- Sinha & Kapur (2021), productive failure meta-analysis: https://www.x-mol.com/paper/1406031499744456704 ; https://techlearning.com/news/study-productive-failure-a-success-in-education
- Kirschner, Sweller & Clark (2006): https://doi.org/10.1207/s15326985ep4102_1
- Kluger & DeNisi (1996), feedback meta-analysis: https://doi.org/10.1037/0033-2909.119.2.254
- Mueller & Dweck (1998): https://www.columbia.edu/cu/psychology/courses/3615/Readings/Mueller_Dweck.pdf
- Sisk et al. (2018): https://englelab.gatech.edu/articles/2018/Sisk,%20Burgoyne%20et%20al.%20(2018)%20-%20Mindset%20and%20Academic%20Achievement.pdf
- Timed tests debate: https://youcubed.org/?p=963 ; https://www.youcubed.org/wp-content/uploads/2017/03/nctm-timed-tests.pdf ; https://fillingthepail.substack.com/p/timed-tests-and-maths-anxiety
- Ramirez et al. (2013), early math anxiety: https://news.uchicago.edu/story/math-anxiety-causes-trouble-students-early-first-grade
- Maloney et al. (2015), parent math anxiety: https://doi.org/10.1177/0956797615592630
- Incremental rehearsal: https://aquila.usm.edu/fac_pubs/22035 ; https://nj.dyslexiaida.org/wp-content/uploads/sites/18/2025/10/Tucker-and-Burns-CQ_44_6.pdf
- Fluency benchmarks (practitioner/vendor): https://www.rocketmath.com/2016/12/02/how-fast-should-students-be-with-math-facts/ ; https://www.rocketmath.com/2020/02/15/math-benchmarks-writing-speed-matters/

**Products**
- The Math Academy Way (draft PDF): https://www.justinmath.com/files/the-math-academy-way.pdf
- Math Academy, How our AI works: https://mathacademy.com/how-our-ai-works ; How it works: https://mathacademy.com/how-it-works ; FAQ: https://www.mathacademy.com/faq
- Skycak, Hierarchical Spaced Repetition / FIRe: https://justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/ ; Spaced repetition vs spiraling: https://justinmath.com/spaced-repetition-vs-spiraling/
- Frank Hecker's Math Academy series: https://frankhecker.com/2025/02/10/math-academy-part-3/
- Critique notes (Matuschak): https://notes.andymatuschak.org/Math_Academy
- Khan Academy mastery levels: https://support.khanacademy.org/hc/bg/articles/5548760867853 ; https://support.khanacademy.org/hc/en-us/articles/115002552631
- Knowledge Space Theory / ALEKS: https://en.wikipedia.org/wiki/Knowledge_space ; https://arxiv.org/pdf/1511.06757 ; https://arxiv.org/pdf/0803.4030 ; https://jmatayoshi.github.io/publications/EDM2018_forgetting.pdf ; ALEKS placement FAQs: https://math.wsu.edu/math-placement-overview/math-placement-faq/ , https://mathematics.miami.edu/undergrad/placement/about-aleks/index.html
- DreamBox: https://www.dreambox.com/adaptive-learning ; https://cepr.harvard.edu/news/harvard-researchers-probe-student-time-spent-using-dreambox-math-software ; https://hechingerreport.org/customized-math-lessons-help-students-learn-research-says/
- Zearn: https://about.zearn.org/press-releases/evidence-for-essa ; https://about.zearn.org/research
- Beast Academy: https://beastacademy.com/online/enroll ; https://joinmodulo.com/products/beast-academy-online

**Algorithms**
- BKT: https://learninganalytics.upenn.edu/MOOT/slides/W004V002.pdf ; https://learninganalytics.upenn.edu/MOOT/slides/W004V002v6.pdf
- Elo in education (Pelánek 2016): https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf ; adaptive facts (EDM 2014): https://www.fi.muni.cz/~xpelanek/publications/EDM14-adaptive-facts.pdf ; decay Elo: https://www.fi.muni.cz/~xpelanek/publications/decay-elo.pdf ; Keeping Elo alive (2025): https://research.tilburguniversity.edu/en/publications/keeping-elo-alive-evaluating-and-improving-measurement-properties/
- PFA: https://www.stat.cmu.edu/~brian/nynke/726-2021/project%20HCI%20Prereqs%20(Elaine,%20Smeet%20&%20Zhou)/articles/Pavlik,%20Cen%20Kodeinger%2009.pdf ; https://yilinl.quarto.pub/pfa/
- DKT critique: https://arxiv.org/abs/1604.02416v2 ; https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/Wilsonetal2016.pdf
- FSRS: https://www.github.com/open-spaced-repetition/free-spaced-repetition-scheduler ; https://docs.ankiweb.net/faqs/what-spaced-repetition-algorithm
- Half-Life Regression (Settles & Meeder 2016): https://aclanthology.org/P16-1174/
- Small-sample CAT calibration: https://ideals.illinois.edu/items/81254
- BUGGY / repair theory: https://tecfaetu.unige.ch/staf/staf-d/krige/staf11/buggy.html ; https://www.lri.fr/~mbl/Stanford/CS477/papers/RepairTheory-SeelyBrown.pdf

**Young children, parents**
- Hirsh-Pasek et al. (2015): https://doi.org/10.1177/1529100615569721 ; https://www.newamerica.org/insights/new-framework-identify-truly-educational-apps/
- AAP screen-time guidance: https://www.healthychildren.org/English/family-life/Media/Pages/Where-We-Stand-TV-Viewing-Time.aspx
- Berkowitz et al. (2015), Bedtime Math RCT: https://www.sciencedaily.com/releases/2015/10/151008152222.htm ; https://www.wbez.org/news/2015/10/08/where-the-wild-fractions-are-the-power-of-a-bedtime-math-story

**LLMs, safety, privacy**
- Bastani et al. (2025), Generative AI without guardrails can harm learning: https://papers.ssrn.com/abstract=4895486 ; https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education
- LLM error detection in student work: https://arxiv.org/html/2509.01395v1 ; LLM word-problem generation: https://arxiv.org/pdf/2506.05950
- COPPA amendments: https://www.lw.com/en/insights/2025/05/ftc-publishes-updates-to-coppa-rule ; https://www.lowenstein.com/news-insights/publications/client-alerts/ftc-finalizes-updates-to-coppa-rule-what-you-need-to-know ; https://www.finnegan.com/en/insights/articles/coppas-amended-rule-is-now-in-full-effect-what-operators-need-to-know.html
- Anthropic, Guidelines for Organizations Serving Minors: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors ; Child safety guidance for developers: https://support.claude.com/en/articles/15591275-child-safety-guidance-for-developers ; Usage Policy: https://www.anthropic.com/aup
