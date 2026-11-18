# 06: UX, screens and accessibility

## 1. Device targets

| Target | Notes |
|---|---|
| **Amazon Alexa Tablet 8 / 11, Kids Tablet 8.7 / 11** (Android 16, Chrome) | Primary. Landscape-first, also usable in portrait. 4–8 GB RAM. Installed as a PWA from Chrome ("Add to Home screen" / install prompt). Add the URL to the Amazon Kids allowed list if a kids profile restricts browsing; how Amazon Kids profiles behave on the new tablets is unverified (research 05). It is an **owner verification** item on real hardware, not an acceptance criterion for any issue. |
| Desktop / laptop browsers (Chrome, Edge, Firefox, Safari latest) | Mouse plus keyboard; same UI scaled. Keyboard input for the number pad. |
| Other tablets (iPad Safari, Android) | Best effort; a Playwright WebKit smoke test runs in the non-required nightly CI job (09 §2). |

Design viewport baseline: 1280 × 800 CSS px landscape (tablet) and 800 × 1280 portrait. Minimum supported is 960 × 600. Use container-relative layout; the island map scales to fit.

## 2. Child screens

| Screen | Purpose | Key rules |
|---|---|---|
| **Profile Picker** | Choose who's playing | Big avatar cards (≥ 160 px). Tapping an avatar plays its name. Picture password (3 of 9 pictures) if set. A small parent-gate entry sits in the corner. |
| **Island** | Hub | Requests as speech bubbles over residents, with the recommended one pulsing. Storehouse, Collection Book, Character, Decorate and Home buttons as big icons with spoken labels on tap. No text-only controls. |
| **Workshop** | Math play | Full-screen scene: widget area (≥ 60% of the screen), product tray, buddy, hint button (lightbulb), replay-prompt button (speaker), home button. Progress shown as products earned, not "3/8". |
| **Lesson overlay** | Worked → faded → scaffolded | Pip demonstrates in the same widget. The child can tap "show me again". |
| **Build / Decorate** | Spend materials | Recipe cards with countable costs; tap a plot to place; drag decor with snap. |
| **Collection Book** | Pebblings, decor, outfits | Swipe pages; tapping a Pebbling plays a line. |
| **Character Creator** | Avatar | Category tabs as icons; live preview with idle animation; "random" dice button; "done" plays a cheer. |
| **Festival / Storm Watch** | Weekly event | Scene plus mixed-review items (via `TaskRunner`); co-op progress picture. |
| **Wind-down** | End of session | Sunset; Pip recaps one or two learned things (spoken); "See you tomorrow!"; returns to the Profile Picker. |
| **Placement adventure** | First run | 04 §5 and 05 §10. |

## 3. Parent area (behind the parent gate)

**Parent gate:** hold the gate button for 2 s, then enter the parent passphrase (or a 4–6 digit parent PIN set at setup). The in-app parent gate session lasts 10 min idle; it is separate from the 12 h passphrase login cookie used on parent devices (08 §3).

| Screen | Contents |
|---|---|
| **Setup Wizard** (first run) | Create family (passphrase and PIN); add children (name, birth year, grade, optional "working above grade"); pair this device; set the AI keys status (read-only display of whether the server has keys); choose AI features on/off. |
| **Dashboard** | Per child: this week's minutes and sessions, accuracy band, math density, skills mastered this week, the next skills up, misconception alerts, AI weekly summary (if enabled). |
| **Skill Map** | Interactive graph by strand with status colours plus icons (never colour alone). Tap a skill for evidence: last attempts, formats and tiers, P(ref), next review, assumed/override flags. Override actions: mark mastered / reset (with confirmation). |
| **Settings** | Session length per child, daily cap, quiet hours, `timedChallenges`, music, voice speed, AI feature toggles, picture passwords, reset placement, export/import backup. |
| **Character photo** | Upload/take a photo → AI attribute mapping → preview → send to the child's creator for confirmation. Shows the clear privacy note from 07 §4. |
| **Gifts & Milestones** | Leave a gift (decor plus an optional typed message ≤ 140 characters, read aloud on-device via `AudioManager.sayText`); define real-world milestones tied to projects or skills. |
| **Devices** | Paired devices list; pair a new device (6-digit code / QR); revoke. |

Parent-area UI uses normal-density, accessible web UI (still touch-friendly, ≥ 44 px targets).

## 4. Touch and interaction rules (children)

- Hit targets **≥ 2 cm (≥ 80 CSS px) for K, ≥ 64 px for G1+**, with ≥ 12 px spacing.
- Every drag interaction has a **tap-to-select → tap-to-place** alternative. Snap to targets within 48 px. A mis-drop returns the item gently with no sound penalty.
- No multi-finger gestures are required. Rotation (shapes) uses a rotate button.
- No hover-only affordances. No long-press requirements for children, except the parent gate.
- Number pad: 3 × 4 large keys, a backspace, and a big "check" button. Show the entered number large. Keyboard digits work on desktop.
- Debounce double-taps on "check" (≥ 400 ms). Never auto-submit on partial input, except formats whose widget state is the answer (e.g. clock hands) once the child taps "check".

## 5. Audio-first rules

- Every child-facing instruction auto-plays once on entry and has a **replay** button. Tapping any number, coin or shape speaks its name (configurable).
- K mode: no required reading. All buttons are icons with spoken labels. G2 mode: text is shown alongside the audio.
- Narration never overlaps itself. New speech cancels old, except feedback after the answer, which waits for the prompt to finish.
- Audio unlocks on the first tap of the Profile Picker. Show a big "Tap to start" if the context is locked.

## 6. Feedback and celebration

- **Correct:** pebble chime, product pop, buddy reaction, and a short varied praise line that is process-focused when possible ("You made a ten first!").
- **Incorrect:** soft knock, diegetic cue, then the hint ladder (04 §6.4). Language is always growth-oriented ("Let's look again together"). Never red X's or buzzers. Mistakes are never shown to the sibling.
- **AI feedback** (when enabled): the deterministic line plays immediately; a personalised AI line from Glim, the helper robot, follows if ready within 5 s (07 §2). If it isn't ready, it is skipped silently.
- **Streak moments** (3 correct in a row): buddy dance. Request complete: parade. Build: confetti burst (Pixi), max 2 s.

## 7. Accessibility

- WCAG 2.2 AA for the parent area. For child screens: contrast ≥ 4.5:1 for numerals and controls, and colour-blind-safe palette pairs (verify with a CVD simulation in Storybook).
- Never convey correctness or quantity by colour alone (use shape, icon, position and sound).
- `prefers-reduced-motion`: disable parallax and confetti, and shorten animations to ≤ 150 ms fades.
- Captions: an optional on-screen caption line for narration (on by default for G2, off for K).
- Motor: an adjustable snap radius (settings) and "tap-only mode" (disable all drags).
- Dyslexia-friendly: Andika font, generous letter spacing, no all-caps for child text.
- Screen readers: parent area fully labelled. Child widgets expose ARIA labels and keyboard operation (arrow keys and enter), so desktop keyboard play works.

## 8. Performance and offline UX

- Budgets in 02 §6.
- Skeleton loaders are forbidden on child screens. Use the island/workshop walk transition to mask chunk loading. Prefetch the recommended workshop's chunk while on the island.
- Offline: everything works except AI features and sync. Show a tiny cloud icon in the parent area only, never to children.
- Update flow: a new service worker activates on the next app launch, never mid-session.

## 9. UI evidence expectations (for PRs)

Every UI PR attaches screenshots at **tablet landscape 1280×800 @2x** and **desktop 1440×900**, plus a short video for interactions (09 §4).
