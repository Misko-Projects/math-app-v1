# 04 — Technology Stack Research

**Project:** Adaptive math-learning game for kids (K–8)
**Targets:** Amazon Fire tablet (touch) + any modern web browser (desktop, laptop, other tablets)
**Team:** One developer working with AI coding agents. The first users are the developer's own two kids; the app may be shared more widely later.
**Research date:** 17 November 2026. Every version and status below was checked against 2025–2026 sources. Where a claim could not be confirmed, the text says so.

---

## 0. Executive summary

1. **The Fire tablet line is ending.** On 8 Oct 2026 Amazon announced **Alexa Tablets** (8, 11, and 12 Pro) and **Kids Tablets** (8.7" and 11"). They run **Android 16 with a custom layer and the full Google Play Store**, not Fire OS. Amazon told CNBC it has stopped producing new Fire tablets but will keep supporting existing ones [S1–S4]. In practice there are now two target groups:
   - **Existing Fire tablets** (which the kids probably already have) on **Fire OS 8 (Android 11, API 30)** or **Fire OS 7 (Android 9, API 28)**. These have no Google Play and use Silk as the default browser.
   - **New Amazon tablets** on stock Android 16 with Google Play. These behave like any other Android device.
2. **Vega OS (Linux, React Native based) is so far only on Fire TV and Echo devices.** Tablets have not moved to it, and Amazon's new tablets went to Android instead [S5–S7]. Vega blocks sideloading, but it does not affect tablets.
3. **The Amazon Appstore closed on non-Amazon Android devices on 20 Aug 2025.** It **is still running on Fire tablets and Fire TV** [S8–S10].
4. **A web app is the lowest-risk common denominator.** Silk is Chromium-based and current: APKMirror lists builds versioned 138–142 for Sep 2025 to Jan 2026 [S11]. So service workers, IndexedDB, WebGL2, and Web Audio should all be available, but **verify on the actual devices** (checklist in §12). Inside an **Amazon Kids child profile**, a parent can add specific approved websites to the Kids Browser's allow-list and pin them as bookmarks [S12]. This is the cleanest no-sideloading path onto the kids' Fire tablets.
5. **Sideloaded APKs in child profiles are unreliable.** Child profiles prefer Appstore-sourced apps, and the community workarounds are flaky [S13, S14]. If a native wrapper is wanted on Fire, **publishing to the Amazon Appstore** (possibly as a private or limited release) is cleaner than sideloading. The newer tablets can use Google Play, with parent approval per download [S15].
6. **Recommended stack (Option A):**
   - TypeScript web app: **React 19 + Vite + vite-plugin-pwa**.
   - Mostly DOM/SVG/CSS UI, with **PixiJS v8** canvas scenes only where a mini-game needs them.
   - **Rive** or **Lottie** for character animation.
   - **Dexie (IndexedDB)** as the local source of truth, holding an **append-only attempt-event log**.
   - A small **Hono API on Cloudflare Workers + D1** for sync and the parent dashboard (Supabase is an equal alternative).
   - Static hosting on **Cloudflare Workers static assets**.
   - Optional **Capacitor 8** APK for the Appstore, Play, or sideloading.
   - **Pre-rendered TTS** audio generated at build time.
   - Vitest 4, Playwright, fast-check, and GitHub Actions for testing and CI.
7. **COPPA:** The amended Rule took effect **23 Jun 2025**, and full compliance was required by **22 Apr 2026** [S30–S32]. Design for it now: no third-party analytics or ads SDKs, a written data-retention policy and security program, and separate parental consent for any third-party disclosure.

---

## 1. Fire tablet platform constraints (2025–2026)

### 1.1 Fire OS versions and Android base

The table lists the OS each model ships with, from Amazon's developer docs [S16]:

| Model | Fire OS | Android / API |
|---|---|---|
| Fire HD 8 (2024, 12th gen) | Fire OS 8 | Android 11 / 30 |
| Fire HD 10 (2023, 13th gen) | Fire OS 8 | Android 11 / 30 |
| Fire Max 11 (2023) | Fire OS 8 | Android 11 / 30 |
| Fire HD 8 (2022) | Fire OS 8 | Android 11 / 30 |
| Fire 7 (2022) | Fire OS 8 | Android 11 / 30 |
| Fire HD 10 (2021, 11th gen) | Fire OS 7 | Android 9 / 28 |
| Fire HD 8 (2020) | Fire OS 7 | Android 9 / 28 |
| Fire HD 10 (2019), Fire 7 (2019) | Fire OS 7 | Android 9 / 28 |

- **No Fire OS 9 exists for tablets.** Fire OS 8 is the last tablet release. A "Fire OS 16" exists, but only for Fire TV [S6, S7].
- Fire OS 8 "incorporates updates from Android 10 and 11". Amazon notes that feature parity with Android 11 does not mean every Android 11 feature is present. Fire OS 8 has **no Google services** and requires APK Signature Scheme v2 [S17].
- I found no evidence that the 2021 HD 10 or the 2020 HD 8 were upgraded to Fire OS 8, so assume they stay on Fire OS 7 [S18].

### 1.2 The October 2026 change: Fire tablets become Alexa Tablets

- **Lineup and prices:**
  - Alexa Tablet 8: $229.99, 4 GB RAM.
  - Alexa Tablet 11: $329.99, 8 GB RAM.
  - Alexa Tablet 12 Pro: $499.99, 8 GB RAM.
  - Kids Tablet 8.7" (ages 3+) and Kids Tablet 11" (ages 6+). Both include a kid-proof case and one year of Amazon Kids+.

  They went on sale 14 Oct 2026 in the US [S1–S4, S15].
- **OS:** Android 16 with a custom layer and the Google Play Store. On Kids Tablets, every Play download needs parental approval through the Parent Dashboard [S2, S15].
- **Existing Fire tablets:** Amazon says it will keep supporting them, but production has ended [S3].
- **What this means for the project:**
  - Any new hardware the family buys is ordinary Android plus Chrome or Play.
  - The old Fire OS 7/8 tablets remain the hard constraint.
  - A web-first architecture covers both groups without separate work.

### 1.3 Vega OS

- **What it is:** a Linux-based OS with React Native in its base layer. It launched Sep 2025 on the Fire TV Stick 4K Select and some Echo Show devices, and arrived on more Fire TV sticks in 2026 [S5, S19].
- **Restrictions:** Apps can only be installed from the Amazon Appstore, so there is no sideloading [S20].
- **Tablets:** No tablet runs Vega. The 2026 tablet line went to Android instead.

### 1.4 Amazon Appstore status

- It shut down on non-Amazon Android devices on **20 Aug 2025**, and Amazon Coins ended at the same time. It **continues on Fire tablets and Fire TV** [S8–S10].
- Amazon's developer blog (Dec 2025) still describes ongoing Appstore investment: dashboards, DevTest for IAP, and Appstore Quality Central [S19].
- **Unverified:** whether the Appstore is preinstalled on the new Android 16 Alexa Tablets. Coverage only mentions Google Play.

### 1.5 Google Play and Chrome on Fire OS (unofficial)

- **Google Play** can be sideloaded on Fire OS 8 by installing, in order: Google Account Manager, Google Services Framework, Google Play services, and the Play Store [S21]. A Fire OS update can break the setup.
- **Chrome** needs Play services. Without them it crashes or loses functionality [S21].
- **Recommendation:** do **not** depend on Chrome or Play on the old Fire tablets. Treat Silk (or the Kids Browser) as the runtime.

### 1.6 Silk browser capabilities

- **Engine:** Chromium-based and updated regularly [S11, S22]. Observed versions in late 2025 to early 2026 were 138–142 [S11].
- **Expected support:** Given that Chromium version, service workers, Cache Storage, IndexedDB, WebGL 1/2, Web Audio, Pointer Events, and the Fullscreen API should all be present.
  - I found no Amazon statement confirming each feature. Amazon's web-app runtime page only says it "supports the latest HTML5 features" and offline storage, and it is dated 2020 [S23].
  - **Verify on the device** using the checklist in §12.
- **"Install" / PWA:** Silk's menu has **Add to Home Screen**. Third-party guides describe it as a **shortcut that opens in Silk**, not a separately installed standalone app [S11, S24].
  - Chrome on Android "installs" PWAs by minting a WebAPK, which needs Google Play services. Fire OS has no Play services, so true standalone PWA install should not be expected.
  - Offline caching through a service worker should still work inside Silk.
- **Amazon WebView (AWV):** the Chromium-based WebView on Fire OS. It replaces Android's WebView and is what Capacitor would use on Fire [S25]. Amazon documents that Silk and AWV "may not always support the same features". Check the AWV version on the device.
- **Firefox:** Mozilla ended Firefox support on Fire TV and Echo Show devices [S26]. That is not directly about tablets, but it shows that alternative browsers on Amazon hardware are fragile.

### 1.7 Amazon Kids (formerly FreeTime) and child profiles

- **Parent Dashboard:** available at parents.amazon.com, in the Parent Dashboard app, or on the device. It provides time limits, Learn First goals, activity history, and per-child content [S27, S28]. The new tablets support up to four child profiles [S15].
- **Websites (best path):**
  - The **Kids Browser** has two modes: "hand-selected" (allow-list) and "filtered".
  - **Parents can type in approved and blocked web addresses** and add bookmarks.
  - Parents can show or hide the address bar, block third-party cookies (blocked by default), or turn off web access entirely [S12].
  - **Plan:** add the app's origin to each child's allowed list and add a bookmark.
  - **Must test:** whether the Kids Browser keeps service workers and IndexedDB between sessions, and whether third-party cookie blocking matters. It should not, if auth uses same-origin cookies or tokens.
- **Apps:**
  - Amazon's help page covers adding Amazon content and Appstore apps to child profiles. It does not cover sideloaded apps [S29].
  - Community reports say sideloaded apps often don't appear in the child launcher. The old workaround used a "GoToApp" launcher (2017 guide) [S13].
  - A 2024 report says a sideloaded app on a kids tablet failed to update after an Amazon update [S14].
  - **Conclusion:** sideloading into a child profile is a fragile path.
- **Kids tablet restrictions:** Kids Edition and Kids Pro devices may restrict developer options and unknown sources more than regular devices. Test on the actual hardware.

### 1.8 Hardware and performance implications

Data from Amazon device specs [S16, S35]:

| Device | SoC / CPU | GPU | RAM | Screen |
|---|---|---|---|---|
| Fire 7 (2022) | MT8168-class quad A53 | Mali-G52 MC1 | 2 GB | 1024×600 |
| Fire HD 8 (2022/2024) | MT8169A, 6×A55 @ 2.0 GHz | Mali-G52 MC2 | 2–4 GB | 1280×800 |
| Fire HD 10 (2023) | MT8186A, 2×A76 + 6×A55 | Mali-G52 MC2 | 3 GB | 1920×1200 |
| Fire Max 11 (2023) | MT8188J, 2×A78 + 6×A55 | Mali-G57 MC2 | 4 GB | 2000×1200 |
| Fire HD 10 (2021) | MT8183 | Mali-G72 MP3 | 3–4 GB | 1920×1200 |

All of these support OpenGL ES 3.2, so WebGL2 should be available.

Implications:
- **Fire 7 and HD 8 are low-end** (Cortex-A53/A55 class, roughly 2015–2017 mid-range phone performance). Budget **≤ 2–3 MB of JS and WASM** on the critical path and keep the main-thread work per frame small.
- **Prefer DOM/CSS/SVG** for question UI, and use one WebGL canvas only for animated scenes.
- Use **texture atlases**, avoid full-screen filters and blurs, and cap the canvas resolution (devicePixelRatio ≤ 1.5).
- Keep **memory under about 300 MB**: on a 2 GB device the OS and Silk use much of the rest. Stream audio and lazy-load mini-games.
- Test at 30 fps and design animations that still look fine at 30 fps.

---

## 2. Distribution options for Fire

| Option | How | Pros | Cons / risks | Verdict |
|---|---|---|---|---|
| **(a) Web app / PWA via Silk or Kids Browser** | Host at your own HTTPS origin. Parent adds the URL to the child's approved websites and bookmarks it, or uses Add to Home Screen in an adult profile. | No store review, instant updates, same code as desktop. Service worker gives offline play. | Not a true standalone app: it shows browser UI and opens in Silk. Service worker and storage persistence in the Kids Browser are **unverified**. Storage eviction is possible, so call `navigator.storage.persist()` and keep a server backup. | **Primary path** |
| **(b) Sideloaded APK** (Capacitor) | Enable "Apps from Unknown Sources" in the adult profile and install the APK. | Full-screen, offline assets bundled, no store. Fire OS 8 needs v2 signing [S17]. | Unreliable in child profiles [S13, S14]. Manual updates (use Capacitor live updates or a self-hosted update check). | Dev/testing only |
| **(c) Amazon Appstore** | Submit a packaged APK. Amazon still documents "hosted" and "packaged" web-app submissions, though the docs look old [S36]. | Officially appears in child profiles. Amazon Kids discovery is possible. | Review process. Child-directed app policy: COPPA, no prohibited SDKs, no Amazon ads [S37]. Some overhead per release. | **Best native path on old Fire** if needed |
| **(d) TWA / Bubblewrap** | Wrap the PWA with Bubblewrap and Digital Asset Links. | Thin wrapper over the live site. Standard on Play. | On Fire, a TWA needs a browser that supports Custom Tabs/TWA. **Silk support is unverified**, so it would fall back to a WebView or Custom Tab with a URL bar [S38]. | Good for **Google Play / new Alexa Tablets**; not for Fire OS |
| **(e) Google Play** (new Alexa/Kids Tablets, other Android) | Capacitor AAB or TWA. Families Policy applies for kids apps. | Standard Android; Kids Tablets have parent approval built in [S15]. | Play Families and Teacher Approved requirements, data-safety forms. | Later, if sharing widely |

**Recommendation:**
- Ship as a web app first: add the URL to the Kids Browser allow-list and use Silk in adult profiles.
- Keep a **Capacitor wrapper** ready from day one, which costs very little with a Vite app. Use it for (c) the Amazon Appstore if Kids Browser storage proves unreliable, and for (e) Google Play if sharing widely.
- Skip TWA on Fire.

---

## 3. Cross-platform framework comparison

Requirements: 2D, touch-heavy, animated, audio, offline, web + Android, low-end GPU, accessible, testable, high AI-agent velocity.

### 3.1 Current versions (verified Nov 2026)

- **Phaser 4:** stable as **v4.0.0 "Caladan"** (10 Apr 2026), with v4.1 and v4.2.1 following (Jul 2026). Phaser 4.1 added an "AI agent skills folder" [S39–S41].
- **PixiJS:** **v8.20.x** (Aug 2026), with an actively developed WebGPU path. The WebGL path remains the safe choice for Fire [S42].
- **Godot:** **4.5** (Sep 2025; WASM SIMD on by default for web) and **4.6** (early 2026). Web export is single-threaded by default, which avoids COOP/COEP headers but is slower [S43, S44].
  - A stripped 2D web build can reach about 2.7–5 MB brotli; real games are typically 9 MB or more [S45].
  - C# projects historically could not export to web in Godot 4. Verify for 4.6 before choosing C#.
- **Unity 6:** an empty web build is roughly 7.7 MB (2D) to 10.7 MB (3D URP) [S46]. Mobile web is officially supported from Unity 6.
- **Defold:** the engine is about 1 MB for web [S46]. It uses Lua, has a small ecosystem, and is a good fit for low-end hardware.
- **Capacitor 8:** released 8 Dec 2025. minSdk 24, target/compile SDK 36. Needs a WebView based on Chrome 60 or later. Adds an edge-to-edge SystemBars plugin [S47–S49]. Fire OS 7 (API 28) and Fire OS 8 (API 30) both clear the minimum.
- **Expo SDK 56:** released 21 May 2026, with React Native 0.85, React 19.2, and Hermes v1 on by default. New Architecture only since SDK 55 [S50, S51].
- **Flutter:** 3.44 (May 2026, I/O) and 3.47 (Aug 2026). Web renders through CanvasKit or skwasm (WASM) [S52].
- **Rive web runtime (brotli):**
  - canvas-lite: about 222 KB.
  - canvas: about 567 KB.
  - webgl2: about 648 KB.

  Lottie (dotLottie) is the lighter-tooling alternative [S53].

### 3.2 Comparison matrix

Ratings: ★ = poor, ★★★★★ = excellent, for this use case.

| Criterion | **TS web: React/Svelte + Vite + PixiJS/Phaser (+ Capacitor)** | **Godot 4.6** | **Unity 6** | **Defold** | **Flutter (web + Android)** | **Expo / RN + react-native-web** |
|---|---|---|---|---|---|---|
| Web bundle (first load) | ★★★★★ (≈150–600 KB JS gz + Pixi ≈ 150–250 KB gz) | ★★ (≈5–10 MB) | ★ (≈8–11 MB+) | ★★★★ (≈1–2 MB) | ★★ (CanvasKit/skwasm ≈ 1.5–3 MB+) | ★★★ (RNW is DOM, OK) |
| Low-end Fire perf | ★★★★ (DOM UI + one WebGL canvas) | ★★★ (WASM single-thread in Silk; native APK good) | ★★ | ★★★★ | ★★★ (native good; web heavy) | ★★★ native / ★★★ web |
| Offline (web) | ★★★★★ service worker + IndexedDB | ★★★ (PWA export option) | ★★ | ★★★ | ★★★ | ★★★ |
| Android/Fire APK | ★★★★ Capacitor (uses AWV on Fire) | ★★★★★ native export (Compatibility/GLES3 renderer) | ★★★★ | ★★★★ | ★★★★★ (no GMS needed unless plugins) | ★★★★ (avoid GMS-dependent modules) |
| 2D animation / game feel | ★★★★ (Pixi/Phaser + Rive) | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ (Rive/Flame) | ★★★ (Skia/Reanimated) |
| UI-heavy screens (dashboard, forms) | ★★★★★ | ★★ | ★★ | ★★ | ★★★★ | ★★★★ |
| Accessibility (screen readers, text scaling) | ★★★★★ DOM-native | ★★ (improving) | ★★ | ★ | ★★★ (semantics tree) | ★★★★ |
| AI-agent velocity (training data, tooling, TS types) | ★★★★★ | ★★★ (GDScript, editor-centric scenes) | ★★★ (C#, editor-centric) | ★★ (Lua) | ★★★★ (Dart well known) | ★★★★ |
| Testability (unit, E2E, visual) | ★★★★★ Vitest + Playwright + Storybook | ★★ (GUT; no browser E2E story) | ★★ | ★★ | ★★★★ (widget/integration tests) | ★★★ |
| Single codebase for web + Fire | ★★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ | ★★★ (RNW parity gaps) |

### 3.3 Notes per option

- **TS web-first (React + Vite + PixiJS):**
  - Math questions are mostly *UI*: numbers, number lines, ten-frames, fraction bars, drag-and-drop. These are best built with DOM, SVG, and CSS. That gives accessible, crisp text at any DPI, cheap re-rendering, and easy automated testing.
  - Use **PixiJS** (rendering only, about 150 KB+ gz with tree-shaking) or **Phaser 4** (a full game framework with scenes, physics, input, and audio) only for arcade-style mini-games and reward scenes. `@pixi/react` integrates with React.
  - **React** has the largest share of agent training data. **Svelte 5** or **Solid** produce smaller bundles, but React's ecosystem (dnd-kit, React Aria, Motion) and agent fluency win here.
  - Consider **Preact** compatibility later if bundle size becomes a problem.
- **Hybrid (React UI shell + Pixi/Phaser canvases):** the recommended pattern.
  - The question engine, adaptivity, and all screens are DOM.
  - Each mini-game is a lazily loaded module exposing `mount(canvas, props) → unmount()`. It communicates through typed events (`answerSubmitted`, `completed`).
  - **Rive** (state machines, about 222–650 KB runtime) suits interactive mascots. **Lottie/dotLottie** suits simple celebratory loops. Pick one to limit bundle size; Rive is better for interactive characters.
- **Godot 4:** best for an actual *game*, such as a world map with characters and physics puzzles.
  - The web export is heavy for a Fire 7 over Wi-Fi and runs WASM single-threaded in Silk.
  - Text-heavy UI, accessibility, the parent dashboard, and Playwright-style testing are weak spots.
  - Agents can write GDScript but are less reliable with `.tscn` scene files and editor-driven workflows.
- **Unity 6:** overkill. It is the heaviest web option and has licensing and editor overhead. Not recommended.
- **Defold:** excellent footprint, but it uses Lua with a small community and is weak for UI and dashboards.
- **Flutter:** a solid option if you prefer Dart.
  - The native Android APK runs on Fire OS without GMS.
  - The web build is canvas-rendered and heavier on first load; Silk on a Fire 7 is the worst case.
  - Accessibility goes through a semantics overlay.
  - Good testing story.
- **Expo / React Native:** great for native mobile.
  - Its web output (react-native-web) is DOM and fine for UI, but game-like canvases need Skia or WebGL. Parity issues between web and native slow development.
  - Native modules that need FCM or GMS won't work on Fire.
  - Two render targets add complexity compared with "web everywhere".

---

## 4. Backend, data, and sync

### 4.1 Data shape (this drives the choice)

- `Family` (parent account) → `ChildProfile[]` (name, avatar, grade, picture-password hash, settings).
- `Skill` graph and `ItemTemplate`s are **static content**, shipped in the bundle and versioned.
- `AttemptEvent` (append-only): `{id (UUIDv7), childId, deviceId, ts, skillId, templateId, seed, params, response, correct, latencyMs, hintsUsed, contentVersion}`.
- `MasteryState` per child per skill: **derived** by folding events through the adaptivity model (BKT, Elo, or similar), and cached locally.
- `Settings` / `Rewards`: small mutable documents, resolved with last-writer-wins plus `updatedAt`.

**Key design decision:** because progress is an **append-only event log** and mastery is a pure function of events, sync reduces to **"union of event sets"**. There are no merge conflicts. That makes heavyweight CRDT or sync engines unnecessary for the core data.

### 4.2 Local-first options (Nov 2026 status)

| Option | Status | Fit |
|---|---|---|
| **Dexie.js 4.4** (IndexedDB) + optional **Dexie Cloud** | Mature. Dexie 4.4 and Dexie Cloud Server 3.0 released Mar 2026. Cloud sync has offline queueing, a free tier, and OTP login [S54]. | **Excellent.** Use plain Dexie with a hand-rolled event sync, or Dexie Cloud for zero-backend sync. |
| **RxDB** | Mature, with replication plugins (HTTP, Supabase, CouchDB, etc.). Some features are premium. | Good but heavier than needed. |
| **PowerSync** (SQLite WASM, Postgres/Supabase) | Web SDK `@powersync/web`. Third-party sources report a free tier of about 2 GB/month and 50 connections, Pro $49/month [S55]. | Strong if using Supabase/Postgres. Adds a service and WASM SQLite (heavier on Fire 7). |
| **ElectricSQL** | Postgres → client "shapes" sync [S56]. | Read-path sync. Writes go through your API. Overkill. |
| **Replicache / Zero** | Replicache is in **maintenance mode** and open-sourced. **Zero 1.0** shipped in 2026 [S57]. | Zero is server-authoritative and needs Postgres plus zero-cache. Too much infrastructure here. |
| **Triplit** | **Joined Supabase (Oct 2025)**. AGPL; future as an independent product unclear [S58]. | Avoid. |
| **Jazz** | Active, CRDT-based, Apache-2.0 [S56]. | Collaboration-oriented. Unnecessary. |
| **InstantDB** | Active BaaS with client DB [S56]. | Fine for a prototype. Vendor lock-in and the kids-data posture need review. |

### 4.3 Backend options

| Option | Notes | Cost for a family-scale app |
|---|---|---|
| **Cloudflare Workers + D1 + Hono** | All TypeScript, one vendor with the static hosting, commercial use allowed on the free plan. D1 free tier is reportedly 5M rows read and 100k rows written per day, 5 GB storage. **Hard enforcement since 1 Sep 2026**: queries fail once the limit is hit [S59, S60]. Hono runs natively. Auth is yours to build (e.g., Better Auth or magic links via an email API). | **$0**; Workers Paid is about $5/month if limits are exceeded |
| **Supabase** (Postgres + Auth + RLS) | Free: 500 MB DB, 50k MAU, 2 projects, **pauses after 7 days of inactivity**. Pro starts at $25/month, with compute billed on top beyond a $10 credit [S61]. Mature auth (magic link, OAuth), RLS per family. | $0 (risk of pausing) → $25/month |
| **Firebase** | Mature, with offline Firestore. Google SDKs on Fire OS work in web form. **Analytics SDK must be avoided** for COPPA. | $0 → pay-as-you-go |
| **PocketBase** | Single Go binary with SQLite, auth, and realtime. Still **0.x (v0.35)**, with no 1.0 [S62]. Needs a host (Railway, Fly). | About $5/month on Railway Hobby |
| **Convex** | Reactive server functions, TypeScript-native. Server-centric and not offline-first [S56]. | Free tier → paid |

**Recommendation:** Dexie locally, plus a sync endpoint `POST /sync {sinceCursor, events[]}` returning `{events[], cursor}` on **Cloudflare Workers + Hono + D1** (Drizzle ORM). Store events per family and authorise with a family session token.
- This avoids Supabase free-tier pausing and keeps one vendor and one language.
- If built-in auth and a SQL console are preferred, **Supabase plus the same event-sync design** is the drop-in alternative.

### 4.4 Authentication suited to kids

- **Parent account only.** Use an email magic link or passkey (WebAuthn). For a household, also offer "Sign in with Google/Apple" on the parent's devices. **No child email or child credentials ever reach a third party.**
- **Device pairing:**
  - A parent signs in once on each device; on a Fire child profile this happens inside the Kids Browser.
  - Alternatively, the parent shows a **pairing QR code or 6-digit code** from the dashboard. The device receives a long-lived, revocable **device token** scoped to the family.
- **Child profile picker:**
  - The child taps an avatar, then optionally a **picture password** (pick 3 of 9 pictures, or a 4-shape sequence).
  - Hash it locally with a per-profile salt. It is a *convenience lock* between siblings, not a security boundary.
- **Parent gate** for the dashboard and settings: a parent PIN, or the standard "hold for 3 seconds + solve an adult-level arithmetic question" gate.
- **Storage:** keep the session in an HttpOnly same-origin cookie or an IndexedDB token. The Kids Browser blocks third-party cookies by default [S12], so **serve the API from the same origin as the app** (e.g., `app.example.com/api` through Workers routes).

---

## 5. Hosting

| Host | Free tier (2026) | Commercial use on free? | Notes |
|---|---|---|---|
| **Cloudflare Workers (static assets)** / Pages | Static asset requests are **free and unlimited**. 100k Worker requests per day [S63, S59]. | Yes | Cloudflare now steers new projects to **Workers + static assets**; Pages is in maintenance mode [S63]. Same origin as the API. **Recommended.** |
| **Vercel** | Hobby: about 100 GB bandwidth and 1M edge requests per month | **No, non-commercial only** [S64]. Pro is $20 per developer per month. | Fine for personal use; needs Pro once shared commercially. |
| **Netlify** | Credit-based since Sep 2025: 300 credits/month, projects pause at the limit. Personal $9, Pro $20 flat (Apr 2026) [S65]. | Yes | OK, but credits make costs less predictable. |
| **Railway** | Free: $1/month credit. Hobby $5/month including $5 usage. Pro $20/month [S66]. | Yes | For a long-running server (PocketBase, Postgres). Not needed for a static PWA. |

**Expected cost for this project at family scale: $0/month.** Add a domain (about $10/year). Optional paid tiers: about $5/month for Workers Paid, or $25/month for Supabase Pro.

---

## 6. Kid-specific requirements

### 6.1 COPPA (2025 amendments, now in force)

**Dates** [S30–S32]:
- Published 22 Apr 2025.
- Effective 23 Jun 2025.
- **Compliance deadline 22 Apr 2026** (passed).

**Key new obligations:**
- **Separate verifiable parental consent before disclosing a child's personal information to third parties**, including for targeted advertising.
- A **written data-retention policy**, published in the privacy notice: keep data only as long as necessary, then delete.
- A **written information-security program**: designated person, annual risk assessment, testing, and updates.
- **Vendor due diligence** with written assurances from service providers.
- Expanded "personal information": now includes **biometric identifiers** (voiceprints, faceprints) and government IDs.
- The privacy notice must describe the internal-operations uses of persistent identifiers.
- New parental-consent methods: knowledge-based questions, ID plus face match, and text-plus.
- Penalties of up to about $53k per violation [S31].

**Scope note:**
- For a family-only app run by the parent, COPPA's "operator" obligations are practically moot.
- **Once shared publicly with children under 13**, the app is a child-directed service and must comply. Amazon's child-directed app policy and Google Play's Families policy add their own requirements [S37].
- **State app-store age laws:** Texas SB 2420 and Utah SB 142 put duties on app *stores* and developers. Texas's law has been in and out of injunctions in 2026; Utah's developer obligations took effect May 2026 or were deferred [S67]. These only matter for store distribution. Re-check before publishing to stores.

**Privacy by design for this app:**
- **No third-party analytics, ads, crash-reporting, or attribution SDKs** in the child-facing app. No Google Analytics, Firebase Analytics, Sentry with PII, or Facebook SDK.
- If telemetry is needed, collect **first-party, aggregate, non-identifying** events to your own Worker, or self-host Plausible/Umami **on parent pages only**.
- Use crash logs without identifiers, scrub inputs, and make reporting opt-in by the parent.
- Collect the minimum: the child's first name or nickname, an avatar, and a grade band. **No photos, no voice recordings** (voiceprints are biometric under the new Rule), no free-text chat, no location.
- Don't load fonts from Google Fonts or images from third-party CDNs at runtime. **Self-host all assets**: this also helps offline play and avoids leaking IP addresses.
- Provide parent-facing data export and delete, a retention policy (e.g., delete raw events older than N years and keep only aggregated mastery), and a privacy notice.
- Use a strict CSP (`default-src 'self'`), HTTPS only, and encryption at rest (D1 and Supabase provide it).

### 6.2 Audio and TTS for pre-readers

| Approach | Quality | Offline | Cost | Fire risk |
|---|---|---|---|---|
| **Pre-recorded human voice** | Best, warm | Yes | Your time | None |
| **Web Speech API `speechSynthesis`** | Varies by OS. Voices load asynchronously (`voiceschanged`), and may be missing [S68]. | Usually | Free | **High**: a 2022 report says Amazon blocked access to the TTS engine for apps on Fire OS [S69]. Silk support is undocumented. **Don't rely on it.** |
| **Cloud TTS pre-rendered at build time** (OpenAI, ElevenLabs, Google) | Very good | Yes, shipped as audio files | **OpenAI** tts-1 $15/1M chars; gpt-4o-mini-tts is token-priced. One source says OpenAI lists these TTS models for **deprecation on 6 Jan 2027** (unverified). **ElevenLabs** about $40–100 per 1M chars depending on model [S70]. | None at runtime |
| **Local open-weight TTS at build time** (e.g., Kokoro-82M, Piper) | Good | Yes | Free; runs on a dev machine | None |

**Recommendation:** pre-render every prompt, number word, and hint to **Opus/WebM**, with an **AAC/M4A fallback** for older Safari.
- **Number-reading cost:** procedurally generated problems ("What is 7 + 5?") would need astronomically many full-sentence clips. Instead, **concatenate clip segments**: "What is" + "seven" + "plus" + "five", using carefully trimmed clips from one voice. Alternatively, pre-render the full sentence for each template's bounded parameter range; K–2 ranges are small.
- **Volume:** a K–8 curriculum is perhaps 5–20k short clips. At 24–32 kbps Opus that is roughly 30–150 MB. Lazy-load clips per skill pack and cache them in the service worker.
- **Playback:** use **Web Audio** (decode once, play instantly) for SFX and short clips. Use HTMLAudio for long narration. Unlock audio on the first tap (autoplay policy).
- Pass all TTS content through a content-hash manifest, so a clip is only regenerated when its text changes.

### 6.3 Handwriting digit recognition

- **Web, on-device:**
  - A tiny CNN (MNIST/EMNIST digits plus math symbols) can be **≈100–500 KB** quantised [S71].
  - Runtime choices:
    - **TF.js** (tfjs-core + webgl/wasm backend, a few hundred KB to over 1 MB).
    - **ONNX Runtime Web** (WASM, several MB, too heavy for this).
    - A **hand-rolled TS inference** for a 2-layer CNN, which is tiny.
  - Preprocess by cropping, centring, and resizing to 28×28 with MNIST-style normalisation. Segment multi-digit answers by connected strokes or x-gaps.
  - Train on **kids' handwriting**: augment MNIST with thick strokes, rotation, and touch-jitter. Collect your own kids' samples locally *with consent*; never upload them.
- **Android ML Kit Digital Ink Recognition:** stroke-based, offline, and very good. Its `com.google.mlkit:digital-ink-recognition` artifact is the bundled style, but **whether it works without Google Play services on Fire OS is unverified** [S72]. Model download uses Google's servers. It is only reachable via Capacitor native code, so it doesn't help the web build.
- **Recommendation:** make the **number pad / tap-to-answer the primary input**. Add handwriting later as an optional mode using a small TS or TF.js model, with a "Did you mean 7?" confirm UI. Never penalise recognition errors as wrong answers.

---

## 7. Content authoring

- **Repo-as-CMS:**
  - Store `content/skills/*.yaml` (skill graph with prerequisites, grade, standards tags such as Common Core codes) and `content/templates/*.yaml` (item templates).
  - Parse and validate with **Zod** schemas, which provide typed loaders, generated JSON Schema for editor autocomplete, and CI validation.
  - Use a build step that compiles to hashed JSON chunks per skill pack.
- **Item template shape (example):**
  ```yaml
  id: add.within20.make10
  skill: K.OA.add-within-20
  params:
    a: { int: [2, 9] }
    b: { int: [2, 9] }
  constraints: ["a + b > 10", "a + b <= 18"]
  prompt: { text: "What is {a} + {b}?", audio: ["what_is", "{a}", "plus", "{b}"] }
  answer: "a + b"
  representation: ten-frame   # UI widget id
  distractors: ["a + b - 1", "a + b + 1", "a + b - 10"]  # common-error models
  hints:
    - "Make 10 first: {a} + {10 - a} = 10."
    - "Then add the rest: 10 + {b - (10 - a)}."
  ```
- **Procedural generation:** use a deterministic seeded PRNG (e.g., `pure-rand` or a mulberry32 seed stored in each `AttemptEvent`), so any item can be replayed exactly.
  - Evaluate expressions through a **tiny safe expression evaluator**, not `eval`. Use rational or integer arithmetic for fractions and decimals (e.g., `fraction.js`) to avoid floating-point bugs.
  - Generate distractors from **misconception models** (off-by-one, place-value swap, adding denominators) so that wrong answers are diagnostic.
- **Adaptivity:** keep the model, e.g., per-skill Elo/BKT plus spaced review, as pure functions over the event log. This makes it unit-testable and lets it be recomputed when the algorithm changes.
- **LLMs at build time, with human review:**
  - Use a script such as `pnpm content:draft --skill K.OA.add-within-20` that prompts an LLM to draft templates, hints, word-problem stems, and misconception distractors as **structured output that matches the Zod schema**.
  - Write the drafts to `content/drafts/`, then review, edit, and move them into `content/` through PRs.
  - CI validates the schema, runs property tests (§8), and checks reading level (Flesch-Kincaid per grade).
  - **No runtime LLM calls in the child app.** This keeps it COPPA-simple, offline-capable, and deterministic.
  - Record the provenance (`generatedBy`, `reviewedBy`) in each file.
- **Word problems:** keep a curated name and noun list that is diverse, culturally neutral, and avoids sensitive topics. Generate text from templates instead of free-form LLM output at runtime.
- **i18n-ready:** keep all strings and audio keys in locale files from day one, even if only English ships.

---

## 8. Testing and tooling

- **Monorepo:** pnpm workspaces with `apps/web` (React PWA), `apps/api` (Hono Worker), `packages/engine` (generators, adaptivity, scoring; pure TS, no DOM), `packages/content` (Zod schemas and compiled content), and `packages/ui`.
- **TypeScript strict** everywhere. Use **Biome** or ESLint + Prettier.
- **Vite** (Vite 8 moved to Rolldown; it was in beta in Nov 2025 [S73], so confirm stable before adopting, or stay on Vite 7), **vite-plugin-pwa** (Workbox) for the service worker.
- **Vitest 4:** **Browser Mode is stable** (with `@vitest/browser-playwright`) and supports visual regression and Playwright traces [S73, S74]. Use it for engine unit tests and component tests in real Chromium.
- **Property-based tests with fast-check:** for each template, `∀ seed: generate(seed)` must:
  - satisfy its constraints;
  - produce an answer equal to an independent reference solver;
  - produce distractors that are distinct and ≠ the answer;
  - render hint strings with no unfilled `{}`;
  - produce audio keys that exist in the audio manifest;
  - be deterministic (the same seed gives the same item).

  Add adaptivity invariants: mastery stays within [0, 1], is monotonic under consecutive correct answers, and gives the same state regardless of event order after sorting.
- **Playwright:** E2E flows (profile pick → session → sync) and **mobile emulation** (`hasTouch`, `isMobile`, a custom 1280×800 "Fire HD 8" viewport, CPU throttling via CDP) [S75].
  - Emulation does not reproduce a Fire GPU or Silk quirks, so keep a **manual device test pass**.
  - Playwright's experimental `_android` API can drive Chrome on ADB-connected devices. Use it for Silk via remote debugging where possible [S22].
- **Storybook 10** with the Vitest addon, for widget stories (ten-frame, number line, fraction bar) and visual tests [S73].
- **Accessibility:** axe-core in Playwright, React Aria for drag-and-drop alternatives, a minimum 48 px touch target, and every tap target reachable without drag.
- **Performance budgets:** Lighthouse CI or `size-limit` in CI (e.g., initial JS ≤ 250 KB gz), plus a Chrome performance trace at 4× CPU throttle.
- **GitHub Actions CI:**
  - Run in order: typecheck → lint → Vitest (unit + property) → content validation → build → Playwright (Chromium, mobile emulation) → size-limit.
  - Deploy previews with `wrangler`.
  - Main branch deploys to production.
  - Optional jobs: Capacitor `assembleRelease` to produce a signed APK artifact; TTS render job (cached by content hash).

---

## 9. Three concrete stack options

### Option A — TypeScript PWA (React + Vite + PixiJS) + Capacitor + Cloudflare (recommended)

- **Client:** React 19, TypeScript, Vite, vite-plugin-pwa; DOM/SVG/CSS question widgets; Motion for UI transitions; **PixiJS v8** (or Phaser 4 for full mini-games) lazy-loaded per mini-game; **Rive** canvas-lite for the mascot; Web Audio for SFX and pre-rendered voice.
- **Data:** Dexie 4 (IndexedDB) with an event log and derived mastery; `navigator.storage.persist()`.
- **Backend:** Hono on Cloudflare Workers, D1 with Drizzle; same-origin `/api`; parent auth by magic link or passkey (e.g., Better Auth); device pairing codes.
- **Hosting:** Cloudflare Workers static assets ($0).
- **Native:** Capacitor 8 wrapper for the Amazon Appstore, Google Play, or sideload when needed.
- **Pros:**
  - Smallest bundle and best low-end performance for UI-heavy math.
  - One codebase for web, Fire, and Android.
  - Best accessibility and testability.
  - Best AI-agent velocity.
  - Instant updates; $0 hosting.
- **Cons:**
  - Rich "game world" feel takes more deliberate work than in an engine.
  - Two rendering paradigms (DOM + canvas) to integrate.
  - The PWA on Fire is "in Silk", not a true app.
- **Fire risk: Low–Medium.** Silk and AWV are modern Chromium. The main unknowns are **Kids Browser storage persistence** and **audio unlock behaviour**. The Capacitor/Appstore fallback mitigates both.

### Option B — Godot 4.6 (web export + native Android APK)

- GDScript; Godot UI (Control nodes); Compatibility renderer (GLES3/WebGL2); web export as a PWA; native APK for Fire via sideload or Appstore. Backend is the same as A, called over HTTP from Godot, or Supabase REST.
- **Pros:**
  - Best for an actual game world: scenes, tweens, particles, physics, an animation editor.
  - The native Android build performs well on Fire.
  - Free and open source.
- **Cons:**
  - 5–10 MB+ WASM first load; single-threaded web.
  - Weaker text/UI, accessibility, and IME handling.
  - Parent dashboard needs a separate web app anyway.
  - E2E testing is harder.
  - Agents are less effective with scene files.
  - C# web export is uncertain.
- **Fire risk: Medium.** The APK is fine, but the web build in Silk on a Fire 7 will be slow to load and memory-heavy. Sideloaded APKs in child profiles are unreliable, which pushes towards the Appstore.

### Option C — Flutter 3.47 (Android + web), or Expo SDK 56 as a variant

- Flutter widgets for UI; Flame or Rive for game scenes; Drift (SQLite) or Hive locally; Supabase Flutter SDK or the same Hono API; Android APK/AAB and the web build (skwasm/CanvasKit).
- **Pros:**
  - One language and a high-quality native Android app on both Fire and the new Alexa Tablets.
  - Strong widget-testing story; good animation.
  - Agents know Dart reasonably well.
- **Cons:**
  - Web first load is heavy (1.5–3 MB+ engine) and canvas-rendered.
  - Weaker web accessibility and SEO; slower in Silk on low-end hardware.
  - The plugin ecosystem often assumes GMS.
- **Expo variant:** excellent native React Native development and shares the TS skillset. The web via react-native-web is decent for UI. But canvas games need Skia or WebGL with web/native parity work, and GMS-dependent modules must be avoided on Fire.
- **Fire risk: Medium** for the web build in Silk; **Low** for the native APK, though distribution into child profiles has the same Appstore and sideload issue as Option B.

### Recommendation

**Choose Option A.**

- **The content is mostly interactive UI, not a physics game.** Number lines, ten-frames, base-10 blocks, fraction bars, and multiple choice are best built with DOM and SVG, which are accessible, crisp, testable, and cheap on a Fire 7.
- **Web-first fits Fire distribution best.** It needs no sideloading: put the URL on the Kids Browser allow-list. It also works unchanged on the new Android 16 Alexa/Kids Tablets, desktops, and iPads. Capacitor keeps a store path open without a rewrite.
- **The TypeScript, Vite, Vitest, and Playwright ecosystem gives the highest velocity with AI coding agents.** It also makes property-based testing of generators straightforward.
- **The cost is about $0/month.** The event-log sync design avoids hard sync problems and vendor lock-in.

**Guardrails:**
- Use PixiJS (or Phaser 4) only inside lazily loaded mini-game modules.
- Keep `packages/engine` framework-free, so a future Godot or Flutter "world" shell could reuse the rules via a port, or a WebView, if ever needed.
- Run the §12 device checklist in **week 1**.

---

## 10. Suggested initial architecture (Option A)

```
apps/web (React PWA)
  ├─ screens/: ProfilePicker, Map/Home, Session, Rewards, ParentGate, ParentDashboard
  ├─ widgets/: NumberPad, TenFrame, NumberLine, FractionBar, DragTiles, HandwritingPad (later)
  ├─ minigames/: (lazy) pixi-*.ts — mount(canvas, props) / unmount()
  ├─ audio/: AudioManager (Web Audio, clip concatenation, unlock-on-tap)
  ├─ data/: Dexie db (profiles, events, masteryCache, settings, outbox), syncClient
  └─ sw/: Workbox precache (app shell, current skill packs), runtime cache (audio)
packages/engine: rng, template compiler, expression eval, generators, adaptivity (Elo/BKT), scheduler
packages/content: Zod schemas, YAML → JSON compiler, audio manifest
apps/api (Hono on Workers): /auth/*, /pair, /sync, /dashboard/* → D1 (families, devices, children, events, settings)
tools/: content-draft (LLM, build-time), tts-render (build-time), validate
```

---

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Kids Browser does not persist IndexedDB or service worker | Medium | Test in week 1. Server sync as the source of backup. Fall back to the Capacitor app via the Appstore. |
| Silk/AWV audio autoplay or latency quirks | Medium | Unlock on first tap; Web Audio buffers; test on device. |
| Fire 7 performance | Medium | DOM-first UI; perf budget in CI; DPR cap; 30 fps-friendly animations. |
| Fire tablets discontinued, so the OS is frozen | Certain | Web-first works on the new Android tablets; no Fire-specific APIs. |
| Storage eviction on low disk | Low–Medium | `storage.persist()`; sync events to the server; idempotent re-download. |
| COPPA exposure when sharing | Medium (later) | No third-party SDKs; minimal data; retention policy; parental consent flow before public launch. |
| TTS vendor model deprecation | Medium | Pre-render to files, so there is no runtime dependency; keep the local TTS option. |
| D1 free-tier hard limits | Low | Batch event inserts; Workers Paid at $5/month. |

---

## 12. Week-1 on-device verification checklist (Fire OS 7 and 8, Silk and Kids Browser)

1. Open a test page that reports `navigator.userAgent` (Chromium version) and feature detection: `serviceWorker`, `indexedDB`, `caches`, WebGL2 (`canvas.getContext('webgl2')`), `AudioContext`, `PointerEvent`, `navigator.storage.persist`, `speechSynthesis.getVoices()`.
2. Install a Workbox service worker, go offline (airplane mode), reload, and play. Do this both in an adult profile in Silk **and** in a child profile in the Kids Browser after adding the URL to the approved list.
3. Write 10k events to IndexedDB, reboot the tablet, and confirm they persist. Check `navigator.storage.estimate()`.
4. Measure Web Audio latency of a tap-to-sound effect and the first-tap unlock behaviour.
5. Run a PixiJS scene with 200 sprites plus a Rive animation; record fps and memory on a Fire 7/HD 8.
6. Check whether Add to Home Screen opens full-screen or with browser UI, and whether a manifest `display: standalone` has any effect.
7. Build a Capacitor debug APK: install it via adb, check the AWV version, and try adding it to a child profile.
8. Test same-origin cookie or token auth inside the Kids Browser with third-party cookies blocked.

---

## 13. Sources

**Fire / Amazon platform**
- [S1] Engadget — Everything Amazon announced in October 2026: https://www.engadget.com/2281378/everything-amazon-announced-october-2026-alexa-tablet-kindle-fire-tv-ring-lock/
- [S2] TechCrunch — Amazon unveils new Alexa tablets with Alexa+ and Google Play Store access (8 Oct 2026): https://techcrunch.com/2026/10/08/amazon-unveils-new-alexa-tablets-with-alexa-and-google-play-store-access/
- [S3] CNBC — Amazon overhauls devices lineup with Alexa tablet, dumping the budget Fire: https://www.cnbc.com/2026/10/08/amazon-alexa-tablet-release.html
- [S4] TechRepublic — Amazon's New Alexa Tablets Start at $229: https://www.techrepublic.com/article/news-amazon-alexa-tablets-google-play-fire-tablets/ ; Yahoo Tech — Amazon kills Fire tablets: https://tech.yahoo.com/home/articles/amazon-kills-fire-tablets-launches-133747056.html
- [S5] Liliputing — Amazon goes all in on Vega OS for Fire TV: https://liliputing.com/amazon-goes-all-in-on-vega-os-for-fire-tv-devices-android-based-fire-os-media-streamers-days-are-numbered/
- [S6] Cord Cutters News — Amazon launches Android-based Fire OS 16 amid switch to Vega OS: https://cordcuttersnews.com/amazon-launches-android-based-fire-os-16-amid-switch-to-vega-os/
- [S7] Business Standard — Fire OS update amid Vega push: https://www.business-standard.com/technology/tech-news/amazon-making-fire-os-16-update-android-vega-os-126052700845_1.html
- [S8] Android Central — Amazon shutting down Android app store (Aug 2025): https://www.androidcentral.com/apps-software/amazon-shutting-down-its-android-app-store-next-week-august-date
- [S9] 9to5Google — Amazon Appstore Android shutting down 2025: https://9to5google.com/2025/02/20/amazon-appstore-android-shutting-down-2025/
- [S10] Android Authority — Amazon shuts down Android app store: https://www.androidauthority.com/amazon-shuts-down-android-app-store-3528170
- [S11] APKMirror — Amazon Silk builds: https://www.apkmirror.com/apk/amazon-mobile-llc/silk-browser/silk-browser-126-6-2-6478-238-10-release ; Silk basics: https://digprjsurvey.amazon.com/csad/help/node/201829650
- [S12] About Amazon — Amazon explains web browsing controls on Fire Kids tablets: https://aboutamazon.com/news/devices/amazon-explains-web-browsing-controls-on-fire-kids-tablets
- [S13] How-To Geek — Get sideloaded apps to show up in FreeTime profiles (2017): https://www.howtogeek.com/321474/how-to-get-sideloaded-apps-to-show-up-in-freetime-profiles-on-fire-tablets/
- [S14] r/kindlefire — Sideloading apps on kids Kindle Fire (2024): https://r.darklab.sh/r/kindlefire/comments/1e3hisw/sideloading_apps_on_kids_kindle_fire_tablet/ljfvs4g/?context=3
- [S15] Digital Trends — Amazon's new kids tablets let parents control Google Play: https://digitaltrends.com/tablets/amazons-new-kids-tablets-let-parents-control-google-play-and-manage-screen-time/
- [S16] Amazon Developer — Identify Fire Tablet Devices: https://developer.amazon.com/docs/device-specs/ft-identify-tablet-devices.html ; Fire HD specs: https://developer.amazon.com/docs/device-specs/ft-device-specifications-firehd-models.html
- [S17] Amazon Developer — Fire OS 8: https://developer.amazon.com/docs/fire-tablets/fire-os-8.html
- [S18] Amazon — Fire Tablet Software Updates: https://digprjsurvey.amazon.com/csad/help/node/G2JXLC4L34GX73TE ; Android Authority — Fire OS 8: https://www.androidauthority.com/amazon-fire-os-8-3167616/
- [S19] Amazon Developer Blog — 2025 year in review: https://developer.amazon.com/apps-and-games/blogs/2025/12/2025-year-in-review
- [S20] Tom's Guide — Amazon set to ditch Android in all devices (Vega): https://www.tomsguide.com/news/amazon-set-to-ditch-android-in-all-devices-and-its-starting-with-fire-tv ; Feedbagel — Vega blocks sideloading: https://feedbagel.com/post/amazons-new-fire-sticks-block-sideloading-with-transition-to-vega-os
- [S21] Liliputing — Install Google Play on Fire 7 with Fire OS 8: https://liliputing.com/how-to-install-google-play-on-the-amazon-fire-7-tablet-with-fire-os-8-12th-gen-2022-model/ ; Technobezz 2026 guide: https://www.technobezz.com/how-to-install-google-play-store-on-a-fire-tablet
- [S22] AWS — What is Amazon Silk / remote debugging: https://docs.aws.amazon.com/silk/latest/developerguide/what-is-silk.md ; https://docs.aws.amazon.com/de_de/silk/latest/developerguide/remote-debugging.html
- [S23] Amazon Developer — Web app runtime feature support (2020): https://developer.amazon.com/docs/fire-tablets/ft-webapp-runtime-feature-support.html
- [S24] Laptops251 — Add website shortcut to Fire home screen: https://laptops251.com/how-to-add-youtube-kids-on-amazon-fire-tablet-2025-easy-tutorial
- [S25] Amazon Developer — Hybrid apps / Amazon WebView FAQ: https://developer.amazon.com/docs/fire-tablets/web-hybrid-app-faq.html ; https://developer.amazon.com/docs/fire-tablets/hybrid-apps-overview.html
- [S26] Mozilla — End of support for Firefox on Amazon devices: https://support.mozilla.org/en-US/kb/end-support-firefox-amazon-devices/revision/225216
- [S27] Amazon — Manage Amazon Kids via Parent Dashboard: https://digprjsurvey.amazon.com/csad/help/node/GNTST5RQEYKPGLYE
- [S28] About Amazon — Set parental controls using Parent Dashboard: https://aboutamazon.com/news/devices/set-parental-controls-using-amazon-parent-dashboard
- [S29] Amazon — Add Content to a Child Profile on Fire Tablet: https://digprjsurvey.amazon.com/csad/help/node/TLapk3JDh2OYFiiBed

**COPPA / legal**
- [S30] Hunton — FTC publishes final COPPA rule amendments: https://www.hunton.com/privacy-and-information-security-law/ftc-publishes-final-coppa-rule-amendments
- [S31] Davis Polk — FTC prioritizes COPPA enforcement: https://www.davispolk.com/insights/client-update/ftc-prioritizes-coppa-enforcement-new-compliance-obligations-take-effect
- [S32] BBB National Programs — Amended COPPA Rule compliance date: https://bbbprograms.org/media/insights/blog/coppa-amended ; Latham — FTC publishes updates to COPPA rule: https://www.lw.com/en/insights/ftc-publishes-updates-to-coppa-rule
- [S37] Amazon Developer — Child-directed apps (privacy-children): https://developer.amazon.com/docs/policy-center/privacy-children.html ; Navigating app submission and compliance (Feb 2025): https://developer.amazon.com/apps-and-games/blogs/2025/02/navigating-app-submission-and-compliance
- [S67] MoFo — Texas App Store Accountability Act: https://www.mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law ; CCIA (May 2026): https://ccianet.org/news/2026/05/judge-denies-texas-request-to-enforce-its-app-store-law-that-likely-violates-first-amendment/ ; Stoel Rives — Utah App Store Accountability Act: https://www.stoel.com/insights/publications/utahs-app-store-accountability-act-goes-into-effect

**Distribution**
- [S35] Liliputing — Comparing Fire 7 / HD 8 / HD 10 specs: https://liliputing.com/comparing-specs-amazon-fire-7-fire-hd-8-and-fire-10-tablets/
- [S36] Amazon Developer — Web app setup (hosted vs packaged): https://developer.amazon.com/docs/fire-tablets/ft-webapp-setup-environment.html ; Understanding Appstore submission: https://developer.amazon.com/docs/app-submission/understanding-submission.html
- [S38] Chrome Developers — TWA lay of the land: https://developer.chrome.com/docs/android/trusted-web-activity/lay-of-the-land ; Thinktecture — Bubblewrap: https://www.thinktecture.com/en/pwa/twa-bubblewrap

**Frameworks**
- [S39] Phaser — v4.0.0 Caladan: https://phaser.io/download/stable ; GameDev.net — Phaser 4 released: https://gamedev.net/news/2759-phaser-4-released/
- [S40] Phaser — 4.1.0 Salusa release: https://phaser.io/news/2026/04/phaser-4-1-0-salusa-release
- [S41] Phaser — Phaser 3 vs Phaser 4: https://phaser.io/news/2026/05/phaser-3-vs-phaser-4 ; npm phaser 4.2.1: https://newreleases.io/project/npm/phaser/release/4.2.1
- [S42] PixiJS blog — June 2026 update: https://pixijs.com/blog/june-2026 ; GameDev.net — PixiJS v8.20.0: https://gamedev.net/news/5221-pixijs-v8200-released/
- [S43] Godot docs — Exporting for the Web (4.6): https://docs.godotengine.org/en/4.6/tutorials/export/exporting_for_web.html
- [S44] Cinevva — Godot 4.5 release / 4.6 release summaries: https://app.cinevva.com/news/2025-09-18-godot-4-5-release ; https://app.cinevva.com/news/2026-02-27-godot-4-6-released
- [S45] popcar — How to minify Godot's build size: https://popcar.bearblog.dev/how-to-minify-godots-build-size/
- [S46] Aras P. — Unity 6 web build sizes gist: https://gist.github.com/aras-p/740c2d4f9977ce92b7de72b1394dd365 ; Defold build size: https://github.com/defold/build-size ; Cinevva web engines comparison: https://cinevva-site.pages.dev/guides/web-game-engines-comparison
- [S47] Ionic — Announcing Capacitor 8 (8 Dec 2025): https://ionic.io/blog/announcing-capacitor-8
- [S48] Capacitor — Updating to 8.0: https://capacitorjs.com/docs/updating/8-0
- [S49] Capacitor — Android docs (API 24+, WebView Chrome 60+): https://capacitorjs.com/docs/android
- [S50] Expo — SDK 56: https://expo.dev/changelog/sdk-56
- [S51] Expo — SDK 55: https://expo.dev/changelog/sdk-55
- [S52] Flutter — What's new / release notes: https://docs.flutter.dev/release/whats-new ; What's new in Flutter 3.41: https://flutter.dev/blog/whats-new-in-flutter-3-41
- [S53] Rive — Runtime sizes: https://rive.app/docs/runtimes/runtime-sizes.md ; Canvas vs WebGL2: https://rive.app/docs/runtimes/web/canvas-vs-webgl ; LottieFiles — LottieFiles or Rive: https://lottiefiles.com/blog/lottie-animations/lottiefiles-or-rive

**Data / backend / hosting**
- [S54] Dexie — 4.4 / Dexie Cloud Server 3.0: https://dexie.org/blog/dexie-44-dexie-cloud-server-30-the-big-one ; Dexie Cloud: https://dexie.org/cloud ; pricing: https://dexie.org/cloud/pricing
- [S55] PowerSync — JS web SDK docs: https://docs.powersync.com/client-sdks/reference/javascript-web.md ; Toolradar pricing summary: https://toolradar.com/tools/powersync
- [S56] Electric — Alternatives: https://electric-sql.com/docs/reference/alternatives ; PkgPulse — Convex vs InstantDB vs ElectricSQL 2026: https://www.pkgpulse.com/guides/convex-vs-instantdb-vs-electricsql-real-time-sync-2026
- [S57] InfoQ — Zero version 1: https://infoq.com/news/2026/06/zero-version-1 ; Replicache (maintenance mode): https://replicache.dev/
- [S58] Supabase — Triplit joins Supabase: https://supabase.com/blog/triplit-joins-supabase
- [S59] Cloudflare — D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/ ; freetier.co D1 limits: https://freetier.co/articles/cloudflare-d1-free-tier-limits-pricing-and-alternatives
- [S60] Cloudflare changelog — D1 free tier limit enforcement (1 Sep 2026): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- [S61] Supabase pricing summaries (2026): https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/ ; https://makerkit.dev/blog/saas/supabase-pricing
- [S62] PocketBase — releases: https://www.github.com/pocketbase/pocketbase/releases ; docs: https://pocketbase.io/docs
- [S63] Cloudflare — Migrate from Pages to Workers static assets: https://developers.cloudflare.com/workers/static-assets/migrate-from-pages/ ; DEV — Cloudflare Pages vs Workers in 2026: https://dev.to/rickcogley/cloudflare-pages-vs-workers-in-2026-migration-guide-ka7
- [S64] Vercel — Hobby plan: https://vercel.com/docs/plans/hobby ; Fair use policy: https://vercel.com/docs/v2/platform/fair-use-policy
- [S65] Netlify — Pricing updates April 2026: https://www.netlify.com/changelog/2026-04-14-pricing-updates-april-2026/ ; Netlify free plan limits 2026: https://netli.fyi/blog/netlify-free-plan-limits-2026
- [S66] Railway — Pricing: https://railway.com/pricing

**Audio / ML**
- [S68] MDN — SpeechSynthesis: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis ; Readium — SpeechSynthesis in browsers and OSes: https://readium.org/speech/docs/WebSpeech.html
- [S69] Stack Overflow — Speech synthesis inaccessible on Kindle Fire (2022): https://stackoverflow.com/questions/73980570/any-way-to-access-speechsynthesis-inaccessible-on-kindle-fire
- [S70] Activepieces — OpenAI TTS pricing 2026: https://www.activepieces.com/blog/openai-tts-pricing-cost-per-model-2026-guide ; ElevenLabs pricing 2026: https://www.stork.ai/blog/elevenlabs-pricing-2026 ; TokenCost — TTS pricing 2026: https://tokencost.app/blog/tts-api-pricing-2026
- [S71] TensorFlow.js quantization example: https://github.com/caisq/tfjs-examples-1/blob/master/quantization ; Tiny in-browser network (145 KB): https://dev.to/rahul_sangamker_653e0c1ba/i-put-a-neural-network-inside-my-portfolio-no-tensorflow-no-server-145-kb-32k7
- [S72] Google ML Kit — Digital Ink Recognition: https://developers.google.com/ml-kit/vision/digital-ink-recognition ; Android guide: https://developers.google.com/ml-kit/vision/digital-ink-recognition/android

**Testing / tooling**
- [S73] VoidZero — What's new Nov 2025 (Vite 8 beta / Rolldown): https://voidzero.dev/posts/whats-new-nov-2025 ; Announcing Vitest 4: https://voidzero.dev/posts/announcing-vitest-4 ; Storybook 10 + Vitest addon usage: https://github.com/modelcontextprotocol/inspector/pull/1899
- [S74] InfoQ — Vitest 4 browser mode: https://www.infoq.com/news/2025/12/vitest-4-browser-mode
- [S75] BrowserStack — Playwright mobile automation 2026: https://www.browserstack.com/guide/playwright-mobile-automation ; TestDino — Playwright mobile testing 2026: https://testdino.com/blog/playwright-mobile-testing

**Unverified or lower-confidence items:**
- Silk per-feature support (service worker, WebGL2, Web Audio) is inferred from its Chromium version.
- Kids Browser storage persistence is untested.
- Whether ML Kit Digital Ink works without GMS is unconfirmed.
- The OpenAI TTS deprecation date comes from a single third-party source.
- Utah SB 142's effective date is reported inconsistently.
- Exact free-tier numbers for D1, PowerSync, and Supabase come from third-party summaries. Confirm them on the vendor pages.
