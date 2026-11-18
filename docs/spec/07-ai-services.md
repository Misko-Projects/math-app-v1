# 07: AI services

Research and exact policy quotes are in [`../research/05-ai-services.md`](../research/05-ai-services.md) (verified 2026-11-17). This spec is the binding design.

## 0. Policy constraints that shape everything

| Provider | Rule (paraphrased; exact quotes in research 05) | Consequence |
|---|---|---|
| **Google Gemini API** (and Vertex) | Users must be 18+, and the Services may not be used "as part of a website, application, or other service … directed towards or … likely to be accessed by individuals under the age of 18" (Gemini API Additional Terms, effective 2026-03-23). There is no paid-tier exception. | **Gemini is never called at runtime** by the family server or the app, and never receives a child's photo. Gemini is used only at **build time**, by the adult developer, to pre-render static narration files (§3). That reading is defensible but **not confirmed by Google**, so the renderer must be swappable in one config line. |
| **OpenAI API** | Allows products serving minors with safeguards and COPPA compliance, and advises using the current flagship models for minors. But "you should not use OpenAI services to process any personal data of children under 13 … without first implementing zero data retention" (Under-18 API guidance), and ZDR is a sales arrangement. | **Owner's choice for feedback and parent summaries** (2026-11-18). This is allowed **only because those requests carry no personal data** (§1, §8): no names, ids, photos or free text, just an age band and an anonymous math attempt. **Never send a photo or anything identifying to OpenAI.** |
| **Anthropic Claude API** | Allows products serving minors, with safeguards, publicly stated COPPA compliance, and AI disclosure ("Guidelines for Organizations Serving Minors"). There is no ZDR prerequisite. | **Photo → avatar attributes uses Claude** (a child's photo is personal data, so OpenAI is excluded). Claude is also a drop-in alternative for feedback and summaries (one config line). |
| Image generators (Gemini image, FLUX/BFL, fal, OpenAI image) | Ban or restrict uploading or editing images of minors. | **No AI-generated likeness of the child.** Photo → *attributes* for our own SVG avatar only (§4). |

**Every AI feature is optional.** The game is fully functional with no keys: deterministic feedback, manual avatar creation, and a statistics-only parent summary. Families must use **billed** API keys. The parent area and `docs/PRIVACY.md` say so.

**Implementers:**
- **OpenAI:** use the official `openai` npm SDK with Structured Outputs (a JSON schema generated from the Zod schema; `zodResponseFormat` / `responses.parse`, or the equivalent current helper). Verify the current API surface and model ids against developers.openai.com before coding, and handle refusals.
- **Claude:** load the `claude-api` skill (TypeScript) and use `@anthropic-ai/sdk` with structured outputs (`output_config.format` / `messages.parse`). Check `stop_reason` (including `refusal`) before reading content.
- Never guess SDK shapes for either provider.

## 1. Provider layer (`apps/api/src/ai/`)

```ts
interface TextProvider { generateJson<T>(req: { system: string; input: unknown; schema: ZodType<T>; maxTokens: number; effort?: 'low'|'medium'|'high' }): Promise<{ value: T; usage: Usage }>; }
interface VisionProvider { analyzeImage<T>(req: { system: string; image: { mediaType: string; data: Uint8Array }; schema: ZodType<T> }): Promise<{ value: T; usage: Usage }>; }
```

- Implementations:
  - `OpenAIProvider` (text);
  - `AnthropicProvider` (text and vision);
  - `MockProvider` (tests/CI; deterministic fixtures keyed by input hash).
- **Provider and model per feature are configuration**, never hard-coded in feature code:

  | Feature | Provider var (default) | Model var (default) | Fallback model var (default) | Notes |
  |---|---|---|---|---|
  | Feedback (§2) | `AI_FEEDBACK_PROVIDER=openai` | `AI_FEEDBACK_MODEL=gpt-6.2-sol` | `AI_FEEDBACK_FALLBACK_MODEL=gpt-6.1-sol` | Owner's choice. Low reasoning effort. |
  | Parent summary (§5) | `AI_SUMMARY_PROVIDER=openai` | `AI_SUMMARY_MODEL=gpt-6.2-sol` | `AI_SUMMARY_FALLBACK_MODEL=gpt-6.1-sol` | Aggregated stats only |
  | Photo → attributes (§4) | `AI_VISION_PROVIDER=anthropic` (**`openai` is rejected by config validation**) | `AI_VISION_MODEL=claude-opus-5-5` | none | Child photo = personal data |

  - **Model availability fallback (owner's rule: use GPT-6.2 Sol, else GPT-6.1 Sol, never plain GPT-6 Sol).** `gpt-6.2-sol` is listed on OpenAI's models page as of 2026-11-18, but an account may not have API access yet.
    - If the primary model returns a model-availability error (model not found, or no access: HTTP 404, or 403 with a model-access error code), `OpenAIProvider` retries the same request once on the fallback model.
    - It caches "primary unavailable" for 1 hour (in memory plus `ai_usage` notes) and reports the effective model in `/api/health`.
    - Other errors follow `aiGuard`'s normal retry/fallback rules.
    - `gpt-6-sol` must not be used as a default or fallback anywhere.
  - Alternatives are one line each: `AI_FEEDBACK_PROVIDER=anthropic` with `claude-opus-5-5` or `claude-haiku-5-5`.
- The AI1 live smoke test reports measured latency and cost for each configured provider with a key, so the parent can tune.
- A feature whose provider key is missing is reported as unavailable in `/api/health` and degrades to its deterministic fallback.
- Every call goes through `aiGuard`, which:
  - checks the family feature flag and the monthly budget (`AI_MONTHLY_BUDGET_USD`, default 10);
  - meters usage into `ai_usage`;
  - applies a timeout (feedback 6 s, others 30 s);
  - makes one retry with backoff, and only on 429 / 5xx / network errors;
  - on any failure, returns `null`, so the caller falls back deterministically.
- **Never send:** names, ids, birth dates, free text typed by a child, or anything identifying. Send only an age band (`5-6`, `7-8`, `9-10`, …).

## 2. Feedback and error diagnosis (runtime, `POST /api/ai/feedback`)

**When:** after a **wrong first attempt** (and optionally after a second wrong attempt), if `ai.feedback` is on. Correctness is always computed in code. AI never decides right or wrong and never changes mastery.

**Input** (built by `TaskRunner`, sent by the client; the server re-validates and caps sizes):

```json
{ "ageBand": "5-6", "grade": "K", "skill": { "id": "CPS.03", "name": "Partners of 10" },
  "item": { "format": "tenframe-fill", "tier": "pictorial", "promptText": "7 and how many make 10?", "params": {"a":7} },
  "correctAnswer": "3", "childResponse": "4", "attemptNo": 1,
  "matchedMisconceptions": ["MC.off-by-one-counting"],
  "misconceptionLibrary": [{ "id": "...", "description": "..." }],
  "recentPattern": { "sameSkillWrongInRow": 1 },
  "phraseBank": ["ph.lets-count-together", "ph.look-at-the-empty-boxes", "..."] }
```

**Output schema** (structured output, validated with Zod):

```json
{ "mode": "phrases" | "text",
  "phrases": [{ "id": "ph.look-at-the-empty-boxes" }, { "number": 3 }],
  "text": "Look at the empty boxes. How many are still empty?",
  "likelyMisconception": "MC.off-by-one-counting" | null,
  "confidence": 0.0,
  "revealsAnswer": false }
```

- **Two delivery modes.** The family setting `ai.feedbackMode` defaults to `phrases`.
  - **`phrases` (default):** the model composes feedback **only from the pre-rendered phrase bank** (≈ 150 short feedback phrases authored in content YAML and rendered at build time) plus number slots. Speech uses the consistent narrated voice with no runtime TTS. Validation: every id exists and the number slots are in range.
  - **`text`:** a free sentence, spoken **on-device** via the Web Speech API by the helper character (§7). No cloud TTS. Validation: ≤ 18 words (K) / 28 words (G1+); reading-level check (no word over 3 syllables for K unless it's a math term in an allow-list); an allow-list of characters; a deny-list of words; no URLs or emojis.
- **Answer-leak guard:** on `attemptNo = 1`, reject the output if `text`/`phrases` contains the correct answer as a number or number word, or if `revealsAnswer` is true. Fall back to the deterministic line.
- **Latency window:** the deterministic feedback plays immediately. The AI line is delivered by `RunnerFeedback.onAiFeedback` if it arrives **within 5 s** and before the child's next action; otherwise it is dropped silently.
- **Caching:** key = hash(skill, template, params, childResponse, attemptNo, mode, ageBand). Text results are cached server-side for 30 days (`ai_cache`). Identical mistakes cost nothing the second time.
- **Diagnosis:** `likelyMisconception` (from the provided library only) with `confidence ≥ 0.7` is recorded as `aiMisconceptionId` on the `ai.feedback.shown` event that references the attempt (02 §5.8), kept separate from the deterministic `misconceptionIds`. It feeds parent insights and can trigger remediation only if the deterministic matcher agrees or the same AI diagnosis repeats ≥ 3 times.
- **Prompt:** a system prompt with the child-safety guidance from §8, the role ("a warm math coach for young children on Number Island; you are a helper robot named Glim"), CPA-oriented hint strategies, the "never give the answer on the first try" rule, and a few examples per mode. Keep the system prompt stable so it caches well.

## 3. Narration TTS (build time, `tools/narration`)

- **Renderer interface:** `render(lines: {id, text, voice, style}[]) → files`. Providers:
  - **`gemini`** (default): model **`gemini-3.8-flash-tts`** `v1beta`: **interactive calls for small runs (< 200 clips)** and the **Batch API** (50% cost) otherwise. The tool may poll a batch for up to ~4 hours, and is resumable. Output is 24 kHz mono PCM/WAV, transcoded to Opus with `ffmpeg-static` (no system ffmpeg needed) (`.webm` or `.ogg`, ~24 kbps). Delivery style goes in `speech_metadata.style`. Implementers verify the endpoint shape against live docs before coding; research 05 §1 has both `interactions` and `generateContent` examples.
  - **`kokoro`** (fallback, local, Apache-2.0 model via `kokoro-js`/ONNX in Node): no external calls at render time. The model is downloaded on first local use only, never in CI. Selected with `NARRATION_PROVIDER=kokoro`.
  - **`stub`**: deterministic silent or beep files for tests and CI.
- **Voices:** audition `Sulafat` (warm), `Achird` (friendly), `Vindemiatrix` (gentle), `Leda` (youthful) and `Puck` (upbeat). Pick one narrator and one for Pip; Glim's phrase-bank voice is a third, distinct voice. Record the choices in `packages/content/narration/voices.yaml`. **Defaults until the owner auditions:** narrator `Sulafat`, Pip `Puck`, Glim `Achird`. The audition is an owner-verification item, not a blocker. A `pnpm narration:audition` script renders the same 5 lines in each candidate voice into `tmp/audition/` for the parent to listen to.
- **Cost guard:** `--max-usd` (default 5). A K–3 library of ≈ 3,000–5,000 clips is ≈ $1.50–$3 on Batch at current prices (prices double on 2027-01-01). Abort if the estimate exceeds the cap.
- **Idempotent:** clip file names are content hashes of (provider, model, voice, style, text). The manifest maps narration keys to clips. Re-running renders only new or changed lines.
- **Runtime:** no TTS calls at all. Missing clips fall back to on-device Web Speech (02 §5.5).
- **Implementation notes (A02, 2026-11-18).** `tools/narration` (`pnpm narration:render`, `pnpm narration:audition`) implements the above. Judgment calls:
  - **What is rendered.** Every non-blank static segment of every `narration.json` line becomes the clip `<key>#<i>` (03 §8.4). A punctuation-only segment, such as the `?` right after a slot, has no audio; the AudioManager skips it. Every `num.<n>`, `num.hundred`, `num.thousand` and `num.million` also gets its sentence-final variant as the clip `num.<n>.end#0` (03 §8.3), which the AudioManager plays when the number ends the sentence. `num.negative` has none.
  - **Styles.** `voices.yaml` maps each 03 §8.2 `style` to the `speech_metadata.style` text. It also defines `clip`, used for clip-set words (`num`, `den`, `ord`, `time`, `money`, `unit`, `noun`, `shape`, `word`, `res`), and `end`, used for the `.end` variants. Clip words must be spoken as one smooth word: with the default "slow, for a five-year-old" style, Gemini paused inside hyphenated numbers ("twenty … three"), which breaks stitching.
  - **Files.** The hash also covers the encoding settings, so changing the encoder re-renders. Files are flat in `apps/web/public/audio/` as `<16 hex>.ogg` (Ogg Opus, 24 kbps mono, silence trimmed to a 30 ms lead-in and 70 ms tail so stitched clips sit together). Identical voice, style and text share one file. A render prunes clip files the new manifest no longer references, except when `--only` limits the run.
  - **Voices.** v1 renders clip sets in the narrator's voice only, because the AudioManager resolves clip ids without a voice (02 §5.5). Pip's and Glim's lines therefore stitch narrator-voiced numbers. Per-voice clip sets need a voice-qualified clip id: a follow-up.
  - **Spend.** The dry-run estimate is deliberately generous. The actual cost is measured from each response's `usageMetadata`. Each request or batch reserves its estimate until its results arrive, and new work starts only while measured spend plus all outstanding reservations stays under the cap.
  - **Batches.** Batch jobs go in chunks of 100 clip files. Requests are identified by the clip file's content hash, so clips sharing a file are one request. A ledger in `tmp/narration/state/` records each job before its creation request is sent. It gains the job's name once Gemini confirms it, and the record is removed only when the job has finished and every result is stored. Any later run, in either mode and with any `--only` filter, adopts a saved job for each request it still needs, so nothing is paid for twice. A job this run doesn't need is left alone; only a complete run forgets one that nothing needs any more.
  - **Ledger scope.** Each output target (directory and format) has its own ledger under `tmp/narration/state/<target>/`. A lock file allows one render per ledger at a time. Ledger and manifest writes are atomic (write, then rename). A ledger in an unknown format stops the run instead of being ignored, and so does an unreadable manifest.
  - **Creating batches.** A batch creation is retried only after a 429. Display names are unique per submission. After an ambiguous failure the job is looked up by its exact display name. A submission that stays unconfirmed blocks new submissions until it is found, or until the operator passes `--abandon-unconfirmed-batches` after checking Google AI Studio. A failed submission stops new work, but the run still collects every job it already knows about. The Batch API accepted TTS requests on 2026-11-18.
  - **Estimate.** Requests a saved job already covers are left out of the estimate, because they cost nothing new.
  - **Partial runs.** Only a complete run (unfiltered, nothing failed or pending, no abort) writes a manifest of exactly the current plan and prunes unreferenced clips. Any other run keeps every previous entry whose file still exists for clips it has no new file for, and prunes nothing, so a failed or filtered run never removes working audio.
  - **Key.** The API key is redacted from every provider error message.
  - **Kokoro.** `kokoro-js` is not a dependency, because it pulls in hundreds of MB of ONNX runtime that every install (CI included) would download. Add it with `pnpm --filter @number-island/narration add kokoro-js` when switching. It refuses to run when `CI` is set.
  - **ffmpeg.** `pnpm i` does not run ffmpeg-static's install script, so CI never downloads the binary. The first local encode runs that script once. Tests and CI use the `stub` provider with WAV output.
- **Owner action (outside the build):** ask Google in writing whether build-time rendering of static narration for a children's app is permitted. If the answer is no, switch to `NARRATION_PROVIDER=kokoro` and re-render.

## 4. Photo → avatar attributes (`POST /api/ai/avatar-from-photo`, parent only)

- **Flow:** parent area → "Make a look from a photo" → privacy note (photo analysed once by Claude, never stored, only style choices kept) → take or upload a photo → the client downsizes it to ≤ 768 px JPEG and strips EXIF → the server sends it to the vision provider **in memory** → returns `AvatarSuggestion` → the parent previews → "send to <child>'s character creator", where the child confirms or adjusts → `avatar.updated`.
- **Output schema:** *only* creator option ids, e.g. `AvatarSuggestion` (02 §5.8), e.g. `{ skinTone: "s07", hairStyle: "curly-short", hairColor: "h03", eyeColor: "e02", eyebrows: "e-soft", glasses: "round" | null, freckles: boolean }`. The schema is generated from the creator's option lists. **No race, ethnicity, age or other sensitive inferences, and no free-text description.** The prompt explicitly instructs this, and validation rejects anything outside the enums.
- **Never stored:** no photo bytes in D1, `ai_cache`, logs, Dexie or service-worker caches. A test asserts this (AI2). The request body size limit is 2 MB.
- **No generated likeness images** in v1 (§0). The SVG avatar *is* the likeness asset, and it animates, which a generated image could not.

## 5. Parent weekly summary (`POST /api/ai/parent-summary`, parent only)

- **Input:** aggregated stats only (skills mastered, in progress, misconceptions with counts, minutes, accuracy band, math density, upcoming skills), with the child referred to as "your child".
- **Output:** `{ headline, highlights[3], watchFor[≤2], tryAtHome[2] }`, where `tryAtHome` holds short offline activity ideas tied to current skills. Cached per child per week. Without AI, a deterministic template produces the same structure from the stats.

## 6. Build-time content drafting (optional, `tools/content-draft`)

Agents may use Claude at build time to draft story-problem wording, hint ladders, misconception descriptions and phrase-bank lines. **Code computes every answer.** Everything drafted goes through the content validators and agent or human review in PRs. Gemini text models must not be used for content drafting (to keep the build-time Gemini use narrowly scoped to TTS).

## 7. Disclosure and the helper character

- **Glim**, a small lantern-robot helper, delivers every AI-originated line. Glim introduces itself on first appearance: "Hi! I'm Glim, a computer helper. I'm not a person, but I love puzzles!" Glim appears only when AI feedback is on.
- The parent area has an **AI log** listing every AI line shown to each child (stored locally in Dexie table `aiLog`: timestamp, child, skill, line text; retained 90 days), so parents can audit.
- The parent settings page and `docs/PRIVACY.md` state which provider is used, what is sent and retention, and a COPPA statement suited to self-hosting:
  - OpenAI API: not used for training unless opted in; abuse logs kept up to 30 days.
  - Anthropic API: not used for training; deleted within 30 days.

## 8. Child-safety safeguards (OpenAI under-18 guidance and Anthropic guidelines for organisations serving minors)

0. **No personal data to OpenAI** (a hard requirement of its under-18 guidance without ZDR):
   - The server builds the OpenAI request from a **whitelisted field set** (age band, grade label, skill/item data, the anonymous response, misconception ids, phrase-bank ids) and drops everything else.
   - A test asserts that no name, id, birth year or free text can reach the OpenAI request builder.
   - Photos are never routed to OpenAI; config validation rejects `AI_VISION_PROVIDER=openai`.

1. **No open-ended interaction:** children never type to or talk with the model. Inputs are structured by code.
2. **Output filtering:** schema validation, an allow-list (phrase mode), deny-list and length checks, the answer-leak guard, and refusal/stop-reason checks. Anything failing falls back to deterministic content.
3. **Child-safety system prompt:** include the provider's child-safety guidance where one is provided (Anthropic's child-safety system prompt; OpenAI's under-18 guidance), plus our own rules (age-appropriate, encouraging, math-only, no personal questions, no references to the outside world).
4. **Monitoring:** the parent AI log, plus `ai.feedback.shown` events (hash only) for auditing.
5. **Regulatory statement:** publish the COPPA/privacy statement in `docs/PRIVACY.md` and the README.
6. **Parental control:** every AI feature is off until the parent turns it on in setup or settings; the kill switch is immediate.

## 9. Testing

- All AI routes are tested with `MockProvider` fixtures, including adversarial outputs: answer leaks, over-length lines, unknown phrase ids, refusals, timeouts and budget exhaustion.
- A contract test checks that the JSON schema sent to the provider is generated from the same Zod schema used for validation.
- The narration tool is tested with the `stub` provider (idempotency, manifest, cost estimate).
- A live smoke test (`pnpm ai:smoke`, needs keys, never in CI) runs 20 fixture feedback requests and 1 vision request (on a stock non-child test image, e.g. an illustrated face from the repo's test assets) and prints latency p50/p95 and estimated cost per model.
