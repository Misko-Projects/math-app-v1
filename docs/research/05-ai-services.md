# 05 — AI Services: TTS, Runtime Feedback, Photo Avatars (and Provider Policy)

*Researched 2026-11-17 against live official docs and terms. Quotes are verbatim from the pages
as fetched that day. Prices are in USD. This is engineering research, not legal advice. The
age and consumer-use clauses below are contract terms the owner (and every self-hosting parent)
agrees to, so a lawyer should confirm the readings in §5 before launch.*

---

## 0. TL;DR

| Feature | Recommended | Fallback | Gemini status |
|---|---|---|---|
| **A1. Fixed narration (build time)** | **Gemini 3.8 Flash TTS** (`gemini-3.8-flash-tts`) through the Batch API, run once by the developer and shipped as Opus files. This is the defensible reading of Google's terms, but Google hasn't confirmed it (§5.1). | Local **Kokoro-82M / Piper** at build time, or **OpenAI `gpt-4o-mini-tts`** (requires an "AI voice" disclosure). | Gray zone. The terms don't explicitly forbid it, but they don't permit it either. Ask Google in writing. |
| **A2. Dynamic feedback speech (runtime)** | Assemble speech from **pre-rendered clips** (template slots plus number words). For truly free text, run **local Kokoro/Piper on the family server**. | Web Speech API `speechSynthesis` (on-device), or OpenAI TTS with disclosure and no child PII. | **Prohibited.** Runtime calls from an app used by kids fall squarely inside the age clause. |
| **B. Wrong-answer feedback / "explain your thinking"** | **Claude Haiku 5.5** (`claude-haiku-5-5`) with structured JSON outputs and low effort. Costs about **$0.0001 per call**. | Deterministic feedback templates, which must always exist and are the default when no key is configured. Escalate to **Claude Sonnet 5.5** for evaluating explanations. | **Prohibited** (same clause, on both the Gemini API and Vertex). |
| **C. Avatar from photo** | **Attribute-only** (approach 1). Default to the **manual SVG creator**. An optional "suggest from photo" button in the parent area sends one transient image to Claude vision and gets palette/style indices back. The photo is never stored. | Manual creator only. | **Prohibited** for both attribute extraction and Nano Banana generation. |
| **C2. Generated cartoon portrait of the child** | **Don't ship in v1.** All hosted options are closed or risky (§4). | A local open-weight image model on parent hardware, if ever (out of scope). | Prohibited. |

The policy facts that change the design:

1. **Google forbids Gemini in anything "directed towards or … likely to be accessed by individuals under the age of 18".** This applies to the Gemini API ([terms](https://aistudio.google.com/docs/terms), effective 2026-03-23) and also to Vertex AI, now renamed "Gemini Enterprise Agent Platform" ([Cloud Service Terms §20(d)](https://cloud.google.com/terms/service-terms), last modified 2026-11-11). There is no paid-tier or Vertex exception. Gemini can't be the runtime provider for B or C, or for runtime TTS.
2. **Anthropic explicitly allows** API products serving minors, subject to safeguards, COPPA compliance stated publicly, and AI disclosure.
3. **OpenAI allows minors with safeguards,** but says you "should not use OpenAI services to process any personal data of children under 13 … without first implementing zero data retention". ZDR is sales-approved, which is impractical for each self-hosting family.
4. **Black Forest Labs (FLUX) forbids uploading images of under-18s.** fal requires end users to be 18+. OpenAI disallowed editing photos of real children at the GPT-4o image launch. Generating a likeness of the child (C2) is effectively closed on hosted services.
5. **Google and Anthropic both say their APIs are "not for consumer use."** A parent who pastes a personal API key into a home deployment is arguably a consumer. This risk affects every provider and is the same for all of them (§5.6).

---

## 1. Feature A — Text-to-speech (Gemini TTS)

### 1.1 Current models (Nov 2026)

Source: [TTS guide](https://aistudio.google.com/docs/speech-generation) (the old `ai.google.dev/gemini-api/docs/*` URLs now 301-redirect to `aistudio.google.com/docs/*`).

| Model ID | Status / notes |
|---|---|
| `gemini-3.8-flash-tts` | Current flagship, non-preview ID, "Latest update: September 2026". The guide says it's for "maximum acoustic fidelity, nuanced acting, and expressive control … long-form narrations requiring rock-solid voice and room-tone stability". 130 languages. |
| `gemini-3.8-flash-lite-tts` | "fast, cost-efficient workhorse replacement for `gemini-3.1-flash-tts-preview` … optimized for high-volume bulk production … read-aloud features". 101 languages. |
| `gemini-3.1-flash-tts-preview` | Previous generation. No voice design, replication, or remixing. |
| `gemini-2.5-pro-preview-tts` / `gemini-2.5-flash-preview-tts` | Legacy previews. Still priced, but superseded. |

Model page ([gemini-3.8-flash-tts](https://aistudio.google.com/docs/models/gemini-3.8-flash-tts)): input token limit is 8,192 and output is 16,384. Batch API, Flex, and Priority are supported. Structured outputs, thinking, and caching are not supported. One quirk: "**`v1beta` required:** This model uses speech generation features that are currently only available in the `v1beta` API."

### 1.2 Voices

There are 30 prebuilt voices plus an "Extended Voice Library (hundreds more) via `GET /v1beta/voices`". You can also design a custom voice from a text description (`POST /v1beta/voices`, `type="prompted"`), stored for "1 year from last use", with up to 200 per project. Prebuilt voices with Google's descriptors:

Zephyr *Bright* · Puck *Upbeat* · Charon *Informative* · Kore *Firm* · Fenrir *Excitable* · Leda *Youthful* · Orus *Firm* · Aoede *Breezy* · Callirrhoe *Easy-going* · Autonoe *Bright* · Enceladus *Breathy* · Iapetus *Clear* · Umbriel *Easy-going* · Algieba *Smooth* · Despina *Smooth* · Erinome *Clear* · Algenib *Gravelly* · Rasalgethi *Informative* · Laomedeia *Upbeat* · Achernar *Soft* · Alnilam *Firm* · Schedar *Even* · Gacrux *Mature* · Pulcherrima *Forward* · Achird *Friendly* · Zubenelgenubi *Casual* · Vindemiatrix *Gentle* · Sadachbia *Lively* · Sadaltager *Knowledgeable* · Sulafat *Warm*

**Shortlist for a warm narrator for ages 5–8 (audition these):**

- **Sulafat** (Warm)
- **Achird** (Friendly)
- **Vindemiatrix** (Gentle)
- **Leda** (Youthful)
- **Puck** or **Laomedeia** (Upbeat), for celebratory lines
- **Achernar** (Soft), for calm or bedtime-style hints

Avoid the *Firm*, *Gravelly*, and *Mature* voices for the main narrator.

The best option is a **designed voice** ("a warm, gentle, encouraging storyteller who speaks slowly and clearly to a five-year-old"). Freeze its `voice_...` ID in the repo's TTS manifest. The TTL resets on every use, so build-time renders keep it alive.

### 1.3 Style control

Gemini 3.8 TTS treats `text` "strictly as a verbatim transcript". Style is split into two scopes:

- **Turn-level delivery** goes in `speech_metadata.style`, e.g. `"warm and enthusiastic"`, `"whispered urgently"`.
- **Point-in-time vocal events** go inline in the text: `<laugh>`, `<sigh>`, `<breath>`, `<short pause>`, `<long pause>`. The guide says to "Avoid non-vocal sound-effect tags (such as applause or thuds)".

The migration guide says to "Replace multi-paragraph `"Audio Profile"` or `"Director's Notes"` blocks with a custom voice created in Voice design". The old preview-era prompt style ("Say cheerfully: …") may now be read aloud.

Multi-speaker mode supports up to 2 prebuilt voices per request. That fits narrator plus mascot.

### 1.4 Output format

From the guide's "Audio output formats" section:

- **Unary requests:** "Return complete **WAV (`audio/wav`)** audio with a RIFF header (24 kHz, mono, 16-bit signed little-endian PCM)".
- **Streaming requests:** "headerless raw Linear PCM (`audio/l16`)" at 24 kHz mono.
- **Other options:** `audio/mulaw` and `audio/alaw` (8 kHz telephony). `sample_rate` can be 24000 (default), 16000, or 8000.

There is no MP3 or Opus output, so convert at build time:

```sh
ffmpeg -i clip.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 -ac 1 -c:a libopus -b:a 32k -application voip clip.opus
# optional AAC fallback for old WebKit: -c:a aac -b:a 48k clip.m4a
```

### 1.5 Request shape

The **Interactions API** is the docs' primary surface:

```sh
curl -X POST "https://generativelanguage.googleapis.com/v1beta/interactions" \
 -H "x-goog-api-key: $GEMINI_API_KEY" -H "Content-Type: application/json" \
 -d '{
  "model": "gemini-3.8-flash-tts",
  "input": [{"type": "user_input","content": [{"type": "text","text": "Have a wonderful day!",
     "annotations": [{"type": "speech_metadata","style": "cheerful and friendly"}]}]}],
  "response_format": {"type": "audio"},
  "generation_config": {"speech_config": [{ "voice": "Kore" }]}
 }'
# audio: base64 in steps[].content[].data  (SDK: interaction.output_audio.data)
```

The legacy **generateContent** endpoint still works ([generateContent variant of the guide](https://aistudio.google.com/docs/speech-generation.md?generate-content=true)):

```sh
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -X POST -H "Content-Type: application/json" \
  -d '{
    "contents": [{"role": "user","parts": [{"text": "Have a wonderful day!",
        "speech_metadata": {"style": "cheerful and friendly"}}]}],
    "generationConfig": {"responseModalities": ["AUDIO"],
      "speechConfig": {"voiceConfig": {"voice": "Kore"}}}
  }' | jq -r '.candidates[0].content.parts[0].inlineData.data' | base64 --decode > out.wav
```

Two shape changes from the 2.5-preview era:

- `prebuiltVoiceConfig.voiceName` became `voiceConfig.voice`.
- `speech_metadata` sits on each part.

SDK minimums are `google-genai >= 2.25.0` and `@google/genai >= 2.24.0`.

### 1.6 Pricing ([pricing page](https://aistudio.google.com/docs/pricing))

Audio is billed at **25 tokens per second of audio**. All prices are per 1M tokens.

| Model | Standard (paid) | Batch / Flex | Price change |
|---|---|---|---|
| `gemini-3.8-flash-tts` | Input $0.50, audio output **$9.00**, "Equivalent to $0.00225 per 10s audio" | $0.25 / $4.50 | **Doubles on Jan 1, 2027** to $1.00 / $18.00 |
| `gemini-3.8-flash-lite-tts` | $0.50 / **$6.00** ($0.0015 per 10 s) | $0.25 / $3.00 | Doubles on Jan 1, 2027 to $1.00 / $12.00 |

Both models have a free tier (marked "Used to improve our products: Yes"). The paid tier is marked "No".

**Build-time cost estimate:** 3,000 narration clips × 4 s average = 12,000 s = 300k audio tokens. On Batch with Flash TTS that is **about $1.35 now, or $2.70 after Jan 1**. Cost doesn't matter, so render with the flagship model.

### 1.7 Rate limits, batch, latency, streaming

- **Rate limits:** Limits are "applied per project, not per API key". RPD resets at midnight Pacific. Per-model TTS limits are not published; you "can be viewed in Google AI Studio". Spend-based caps also apply: Tier 1 is limited to $10 per 10 minutes ([rate limits](https://aistudio.google.com/docs/rate-limits)).
- **Batch API:** "50% of the standard cost". The "target turnaround time is 24 hours, but in majority of cases, it is much" quicker ([batch](https://aistudio.google.com/docs/batch-api)). This suits the build-time renderer, which needs a content-hash manifest so only changed clips are re-rendered.
- **Streaming:** Supported with `"stream": true`. Chunks arrive as raw PCM.
- **Latency:** Google publishes no time-to-first-audio figure. Flash-Lite is positioned for "real-time voice agent cascades". This is moot for the kids' runtime because of §5.1.

### 1.8 Runtime TTS alternatives

These alternatives are for dynamic feedback.

| Option | Notes |
|---|---|
| **Clip concatenation** (recommended) | Pre-render praise and hint phrases, number words 0–1000, operator words, and the child's chosen avatar *name* (picked from a curated list, so it can be pre-rendered). Most "dynamic" feedback becomes template slots. This needs no runtime provider, works offline, and keeps one consistent voice. |
| **Local Kokoro-82M / Piper** on the family's server | Self-hosted, so no data leaves the house. The voice differs from the Gemini narrator, so make it diegetic: give the AI-feedback lines to a separate character, such as a robot mascot. |
| **Web Speech API** | On-device. Availability on Amazon tablets is unverified (see §6 and [04-technology.md](04-technology.md) §6.2). |
| **OpenAI `gpt-4o-mini-tts`** | 13 voices; the guide says "For best quality, we recommend using marin or cedar". Outputs MP3, Opus, AAC, FLAC, WAV, and PCM. The guide also says: "Our usage policies require you to provide a clear disclosure to end users that the TTS voice they are hearing is AI-generated and not a human voice." ([TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech)). Don't put child PII in the text (§5.4). |

---

## 2. Feature B — Runtime AI feedback on wrong answers

### 2.1 Candidates

Assumptions for the per-call estimate: about 600 input tokens (system prompt, problem, wrong answer, skill tag, misconception hint) and 80 output tokens. Turn thinking off or keep effort low.

| Model (ID) | Price / MTok in / out | Est. per call | Structured JSON | Policy for kids |
|---|---|---|---|---|
| **Claude Haiku 5.5** (`claude-haiku-5-5`, released 2026-10-07) | **$0.10 / $0.50** for prompts ≤100k tokens. Batch is 50% off. | **≈ $0.0001** | Yes. `output_config.format` with `json_schema`; "Structured outputs are available on every model" ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) | **Allowed** with safeguards (§5.3) |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 / $10 | ≈ $0.002 | Yes | Allowed |
| GPT-6 Luna (`gpt-6-luna`) | $0.10 / $0.50 | ≈ $0.0001 | Yes (structured output) | Allowed with safeguards, but needs **ZDR before processing personal data of under-13s** (§5.4) |
| GPT-6.1 Terra (`gpt-6.1-terra`) | $1 / $5 | ≈ $0.001 | Yes | Same as Luna |
| Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) | $0.30 / $2.50 | ≈ $0.0004 | Yes | **Prohibited** (§5.1) |
| Gemini 3.8 Flash (`gemini-3.8-flash`) / Gemini 4 Hydrogen (`gemini-4-hydrogen`) | $0.75 / $3.75 (doubling Jan 1, 2027) / $1.50 / $7.50 | — | Yes | Prohibited |

Notes:

- The Claude table rates Haiku 5.5's latency as "Fastest" and Sonnet 5.5's as "Fast" ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). None of the vendors publish absolute latency. **Budget roughly 1 s to a complete 80-token reply and measure it in week 1.** Show the deterministic template feedback immediately, and let the AI line arrive after it ("Robo says…"). The child never waits on the network.
- Gemini 2.5 Flash is deprecated. Starting Dec 1, 2026, requests to it route to `gemini-3.5-flash-lite` ([models](https://aistudio.google.com/docs/models)).
- **Pick:** **Haiku 5.5** for wrong-answer feedback. Use **Sonnet 5.5**, on demand, to score "explain your thinking" answers from children aged 8 and up. These are the cheapest models whose provider explicitly accepts products for minors without a ZDR prerequisite.

### 2.2 Design for B

Make compliance automatic for every family.

- **No key, no AI.** Deterministic, misconception-keyed templates are the baseline and are always shown. The LLM only rephrases or adds detail.
- **Constrained output:** a JSON schema such as `{say: string ≤140 chars, hint_kind: enum, show_visual: enum}`. Then validate in code:
  - Check length and a reading-level heuristic.
  - Apply a blocklist.
  - Reject any `say` containing digits that contradict the computed correct answer.
  - Fall back to the template on any failure.
- **Input minimization:** Send the problem, the given answer, the skill ID, and an age band. **Don't send the child's name**; insert it locally after the response. Free-text "explain your thinking" input should be typed or picked from options, sent without identity, and never stored at the provider.
- **Disclosure:** In the parent area, plus a child-level cue, e.g. "Robo is a computer helper, not a person". Anthropic requires this (§5.3).
- **Parent controls:** an AI on/off toggle, a log of AI lines shown, and the option to choose a provider or turn AI off entirely.

---

## 3. Feature C — Avatar from an uploaded photo

### 3.1 Approach 1: vision to attributes for the SVG creator (recommended, optional)

**Does it work?** Yes. Any current vision LLM reliably returns `{skin_tone_swatch: 1–12, hair_color_swatch, hair_style_id, hair_length, eye_color_swatch, glasses: bool, freckles: bool}` when given a closed schema of your creator's own options. Use structured outputs so the model can only pick IDs that exist in the creator.

**Provider:**

- **Claude Haiku 5.5** vision, or Sonnet 5.5 for better hair-style judgement. The cost is about one image (around 1–2k tokens), so **well under $0.01 per call**.
- **Gemini is out** (§5.1).
- **OpenAI** would be processing personal data of an under-13 child. Their guidance requires ZDR first, and image inputs are CSAM-scanned and may be retained despite ZDR (§5.4). That makes OpenAI the worse fit.

**Policy shape:**

- **Swatches, not race.** The Anthropic AUP forbids using models "as part of any biometric categorization system for categorizing people based on their biometric data to infer their race…". Output only *palette swatch indices* and visual style IDs. Never output ethnicity or race labels, and never ask for them.
- **Don't keep the photo.** Process the photo transiently in the parent-gated area. Resize to about 512 px and strip EXIF on the server first. Send it once, and never store it; keep only the resulting attribute JSON.
- **Under COPPA,** a child's photo is personal information. The 2025 amendments also add "facial templates; or faceprints" to biometric identifiers ([summary of the final rule](https://hunton.com/privacy-and-information-security-law/ftc-publishes-final-coppa-rule-amendments)). We never create a template, only coarse style choices.
- **Reconcile with [04-technology.md](04-technology.md) §5,** which says "No photos". Amend it to: *photos are never stored and never leave the house except for one opt-in, parent-initiated analysis call*. Make the **manual creator the default**, with "Suggest from a photo" as an extra.

### 3.2 Approach 2: generate a stylized likeness of the child (not recommended)

| Option | Works? / quality | Cost | Policy blocker |
|---|---|---|---|
| **Gemini "Nano Banana 2.1"** (`gemini-nano-banana-2.1`), Nano Banana 2 (`gemini-3.1-flash-image`), and Nano Banana Pro (`gemini-3-pro-image`) | Technically the best fit. "multi-turn character consistency"; "support character resemblance of up to 4 characters" ([image guide](https://aistudio.google.com/docs/image-generation)). All outputs carry a SynthID watermark. | $0.0336 per 1K image on Nano Banana 2.1 | **Prohibited for a kids' app** (§5.1). The guide also says: "Make sure you have the necessary rights to any images you upload." Imagen is "shut down; migrate to Nano Banana" ([docs index](https://aistudio.google.com/llms.txt)). |
| **OpenAI GPT Image** (`gpt-image-2.5-sunburst` / `-flare`; pricing lists `gpt-image-2.6-*` at $8 in / $30 out per MTok for images) | Strong stylization. The docs say it "may occasionally struggle to maintain visual consistency for recurring characters". | ~ $0.03–0.10 per image | The GPT-4o image launch card said: "**At launch, editing uploaded images of photorealistic children will not be allowed.**" ([system card addendum, Mar 2025](https://cdn.openai.com/11998be9-5319-4302-bfbf-1167e093f1fb/Native_Image_Generation_System_Card.pdf)). The 2026 Images 2.0 and 2.5 cards don't say whether this was lifted. It also hits the under-13 ZDR rule, and the CSAM scan retains flagged images even with ZDR. |
| **FLUX Kontext** via BFL, fal, or Replicate | Good identity-preserving stylization | ~ $0.04 per image | BFL Developer Terms: you may not "**Upload images, videos or personal data to the FLUX Services or FLUX AI Models relating to individuals under the age of 18**" ([BFL developer terms](https://bfl.ai/legal/developer-terms-of-service)). fal: "you are responsible for ensuring that your End Users are at least 18 years of age" ([fal ToS](https://fal.ai/legal/terms-of-service)). Replicate lets a parent consent for an under-18 end user ([Replicate terms](https://replicate.com/terms)), but the BFL model terms still apply to FLUX. |
| **Local open-weight models** (e.g. an Apache-licensed image-edit model on a home GPU) | Feasible but heavy. Needs a ~12–24 GB GPU, and quality and consistency need tuning. | Electricity | No provider policy applies, but each model's license still does (FLUX.1 [dev] weights carry BFL terms). Out of scope for a v1 that runs on a low-power family server. |

**Conclusion for C:** Ship approach 1 with the manual creator. If a "storybook portrait" is ever wanted, generate it **from the attribute JSON** (a description, not the photo) using our own SVG or a pre-drawn parts library. Then the photo never reaches an image model.

---

## 4. Data use, retention, ZDR

| Provider / tier | Trains on inputs? | Retention | ZDR |
|---|---|---|---|
| **Gemini API, Unpaid (free tier)** | **Yes.** "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products … human reviewers may read, annotate, and process your API input and output … **Do not submit sensitive, confidential, or personal information to the Unpaid Services.**" | — | No |
| **Gemini API, Paid** (a Cloud project with active billing; "Your access to Gemini API is a 'Paid Service' only when accessing the API through a Cloud Project associated with an active billing account") | No. "Google doesn't use your prompts … or responses to improve our products". | "Google logs prompts and responses for a limited period of time, solely for detecting and preventing violations of the Prohibited Use Policy". [Abuse monitoring](https://aistudio.google.com/docs/usage-policies) sets this at **55 days**. | Not documented for the Gemini Developer API |
| EEA / CH / UK | "You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom." | | |
| **Vertex / Gemini Enterprise Agent Platform** | "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction." (Service Terms §18) | Per Cloud DPA | Configurable per Google Cloud docs (not re-verified here) |
| **Anthropic API** | No. "Anthropic may not train models on Customer Content from Services." ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms)) | "For Anthropic API users, we automatically delete inputs and outputs on our backend within 30 days" ([privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), Jul 2026). The data-retention doc says "Conversation content … is not retained by default; the exception is Covered Models" (Fable/Mythos). Flagged content: "up to 2 years". | By sales arrangement ([docs](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). ZDR orgs can't call from a browser (CORS rejected), which is fine because we call from the server. |
| **OpenAI API** | No. "data sent to the OpenAI API is not used to train or improve OpenAI models (unless you explicitly opt in)". | Abuse logs are "retained for up to 30 days". `/v1/images/*` application state: none. | "subject to prior approval by OpenAI". Image inputs: "If the classifier detects potential CSAM content, the image will be retained for manual review, even if Zero Data Retention … is enabled." ([Your data](https://developers.openai.com/api/docs/guides/your-data)) |

**Implication:** Whatever the provider, the README must tell parents to use a **paid / billed** key. This matters most for Gemini at build time, where the developer's own key should be on a billed project.

---

## 5. Policy: exact terms and how they apply

### 5.1 Google Gemini API Additional Terms of Service

Source: [aistudio.google.com/docs/terms](https://aistudio.google.com/docs/terms), "Effective March 23, 2026". The same clause appears in the archived Dec 18, 2025 and May 20, 2025 versions ([archive](https://aistudio.google.com/docs/terms-archive/index.md)).

> **Age Requirements**
> You must be 18 years of age or older to use the APIs. You also will not use the Services as part of a website, application, or other service (collectively, "**API Clients**") that is directed towards or is likely to be accessed by individuals under the age of 18.

> **Use Restrictions**
> Use of Google AI Studio and Gemini API is for developers building with Google AI models for professional or business purposes, not for consumer use. You may only access the Services (or make API Clients available to users) within an available region. **You may use only Paid Services when making API Clients available to users in the European Economic Area, Switzerland, or the United Kingdom.** … you must comply with our Prohibited Use Policy …

**Paid vs free:** The age clause sits above the tier sections and has **no paid-tier exception**. Paid status only changes the data-use terms.

**Vertex AI (now "Gemini Enterprise Agent Platform"):** The [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms) ("Last modified November 11, 2026"), §20 *Generative AI Services*, say:

> d. Age Restrictions. Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website, Customer Application, or other online service that is directed towards or is likely to be accessed by individuals under the age of 18.

The [services summary](https://cloud.google.com/terms/services) adds: "Generative AI Services also includes any generative AI features or functionality of a Service". On that wording, Gemini-TTS inside Cloud Text-to-Speech is very likely covered. Whether classic non-generative Cloud TTS voices count is ambiguous, so don't rely on them as the loophole. Section 32 separately bars using "any image, audio recording, voice sample, or other data depicting or derived from any individual(s) under the age of 18" with the Live API custom voice/avatar feature.

**Moving to Vertex does not escape the rule.** Claude served through Google Cloud's Model Garden may also be pulled under Cloud's Generative AI terms. Use Anthropic's first-party API to keep the analysis simple.

**How the clause applies here:**

| Scenario | Assessment |
|---|---|
| **(a) Build-time pre-rendered narration.** An adult developer calls the API from a build script. Static Opus files ship in the repo or app, and kids never touch the API. | **Defensible, not certain.** The text targets using "the Services *as part of*" an app "directed towards" minors. The shipped app contains no Gemini integration: it's an output file, and Google "does not assert any ownership" of outputs under the Cloud terms. The developer is an adult using the API "for professional … purposes". The counter-reading is that the build pipeline is part of a service directed to children. Nothing in the terms speaks to static outputs. **Action:** ask Google (AI Studio support or developer relations) in writing. Keep the renderer provider-agnostic with Kokoro or OpenAI swappable in a single config line. Don't use the free tier. |
| **(b) Runtime calls from a self-hosted server used by kids** (feedback, runtime TTS) | **Prohibited.** The family server is an "API Client" "directed towards … individuals under the age of 18". It doesn't matter who holds the key or that the server is self-hosted. |
| **(c) Parent uploads child's photo** (in the parent area) | **Prohibited.** The parent area is part of the same kids' service. It also sends a minor's image to a provider whose terms exclude kids' services. The PUP's "using personal data or biometrics without legally-required consent" also applies. |

### 5.2 Google Generative AI Prohibited Use Policy, and images of real minors

Source: [policies.google.com/terms/generative-ai/use-policy](https://policies.google.com/terms/generative-ai/use-policy) ("Last Modified: December 17, 2024"). The relevant lines:

> Relates to child sexual abuse or exploitation.
> Violates the rights of others, including privacy and intellectual property rights -- for example, using personal data or biometrics without legally-required consent.
> Tracks or monitors people without their consent.
> Impersonating an individual (living or dead) without explicit disclosure, in order to deceive.
> We may make exceptions to these policies based on educational, documentary, scientific, or artistic considerations …

The PUP itself doesn't ban stylizing a consenting parent's child. The **age clause** (5.1) is what blocks it. The Nano Banana guide adds: "Make sure you have the necessary rights to any images you upload. Don't generate content that infringe on others' rights", and notes Nano Banana 2.1 search grounding does "not support using real-world images of people from web search".

### 5.3 Anthropic — organizations serving minors

[Usage Policy](https://www.anthropic.com/legal/aup) (effective Nov 12, 2026), *Additional Use Case Guidelines*:

> All consumer-facing chatbots or AI agents that communicate directly with external users must disclose to users that they are interacting with AI rather than a human. This disclosure must be provided at a minimum at the beginning of each chat session or in the product interface. The disclosure does not need to identify Anthropic, Claude, or the model used.
>
> Products serving minors, including organizations providing minors with the ability to directly interact with products that incorporate our API(s), must comply with the additional guidelines outlined in our Support article and all applicable laws.

The AUP also says: "We define a minor or child to be any individual under the age of 18 years old, regardless of jurisdiction."

[Responsible Use … Guidelines for Organizations Serving Minors](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors) (Mar 16, 2026):

> organizations providing minors with the ability to directly interact with products that incorporate our API(s) should implement the following safeguards:
> **1. Additional Technical Measures** … These safety measures may include, but are not limited to: Age verification systems to ensure only intended users can access the product; Content moderation and filtering to block inappropriate or harmful content; Monitoring and reporting mechanisms to identify and address potential issues; Educational resources and guidance for minors on safe and responsible use of the product … we may provide a child-safety system prompt, which organizations serving minors should implement …
> **2. Regulatory Compliance** It is the responsibility of organizations to comply with all applicable child safety and data privacy regulations, such as the Children's Online Privacy Protection Act (COPPA) in the United States. Compliance with these regulations should be clearly stated on the organization's website or similar public-facing documentation.
> **3. Disclosure Requirements** Organizations must disclose to their users that they are interacting with an AI system rather than a human.
> Anthropic will periodically audit organizations for compliance with these safeguards. … Failure to implement these recommendations when requested, or a continued high violation rate, may lead to the suspension or termination of your account.

**Does this allow an API-backed kids' feature? Yes, explicitly, with conditions.** The [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) have no age-of-audience ban. They do state "Services under these Terms are not for consumer use" (§5.6).

How we satisfy each condition:

- **Disclosure:** the "Robo is a computer helper" cue plus a parent-area notice.
- **Moderation:** schema-constrained output, validators, and template fallback.
- **Monitoring:** a parent-visible log of every AI line.
- **Access control:** a parent gate. "Age verification" here means ensuring only the family's kids use it.
- **Public COPPA statement:** in the README and docs. The project collects nothing, data stays on the family server, and the only third-party flows are listed.
- **System prompt:** include Anthropic's child-safety system prompt if they publish one.

### 5.4 OpenAI — under-18 users and images of minors

[Under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance):

> Young people have unique needs online and offline, so developers should implement additional safeguards when using our API to serve minors (under 18 years old).
> Organizations serving minors must comply with all applicable child protection, safety, and privacy laws, including the Children's Online Privacy Protection Act (COPPA). **You should not use OpenAI services to process any personal data of children under 13 or the applicable age of digital consent without first implementing zero data retention in our API.**
> Organizations serving minors must take reasonable steps to ensure that the content they are serving to minors via the API is safe and age appropriate … Providing age-appropriate disclosures to minors about AI tools … age-appropriate content filters … monitoring and reporting mechanisms … age assurance systems …
> Use OpenAI's most current flagship models, which incorporate the latest safety protections, particularly when building experiences for minors.
> OpenAI reserves the right to audit organizations for compliance with this policy.

The Usage Policies page at openai.com returned HTTP 403 to automated fetches, so this text comes from the [Open Terms Archive copy](https://github.com/OpenTermsArchive/genai-contrib-versions/blob/main/ChatGPT/Acceptable%20Use%20Policy.md) ("Effective: October 29, 2025", recorded Jan 2026). A later revision may exist, so re-check the live page.

> **Keep minors safe**. Children and teens deserve special protection. Our services are designed to prevent harm and support their well-being, and must never be used to exploit, endanger, or sexualize anyone under 18 years old. … We prohibit use of our services for: grooming of minors; exposing minors to age-inappropriate content … shaming or otherwise stigmatizing the body type or appearance of minors …
> [Privacy] use of someone's likeness, including their photorealistic image or voice, without their consent in ways that could confuse authenticity

On images:

- The image-edit restriction on real children is quoted in §3.2.
- The [image guide](https://developers.openai.com/api/docs/guides/image-generation) says "All prompts and generated images are filtered in accordance with our content policy". The `moderation` parameter takes `auto` ("seeks to limit creating certain categories of potentially age-inappropriate content") or `low`.

**Net:** OpenAI is usable for B and A2 only if **no personal data of the child** is sent. That excludes names, photos, and arguably free-text explanations. It is unusable for C.

### 5.5 Other image-model providers (C2)

These are covered in §3.2:

- **BFL** bans under-18 uploads.
- **fal** requires 18+ end users.
- **Replicate** allows parent consent for an under-18 end user, but third-party model terms (BFL) still apply.

### 5.6 The "not for consumer use" problem (all providers)

- **Google:** "Use of Google AI Studio and Gemini API is for developers building with Google AI models for professional or business purposes, not for consumer use."
- **Anthropic:** "Services under these Terms are not for consumer use. Our consumer offerings (e.g., Claude.ai) are governed by our Consumer Terms of Service instead."

A parent who creates an API key purely to run an open-source app for their own family is arguably a consumer. This is common to every "bring your own key" OSS app and isn't resolved by picking a different provider. It's an **open risk to disclose** in the README rather than something the design can fix. What the design can do is make AI **strictly optional**: the game is fully playable with zero keys.

---

## 6. Amazon "Alexa Tablet" / Kids Tablet (Oct 2026)

- **Launch:** Amazon announced the Alexa Tablet 12 Pro, 11, and 8 plus the Kids Tablet 8 and 11 on **Oct 8, 2026**. The tablets "run Android" with the full Google Play Store, which ends Fire OS and the Fire brand ([Amazon: Alexa tablets](https://www.aboutamazon.com/news/devices/new-amazon-alexa-tablets-alexa-plus), [Amazon: Kids tablets](https://www.aboutamazon.com/news/devices/new-amazon-kids-tablets), [TechCrunch](https://techcrunch.com/2026/10/08/amazon-unveils-new-alexa-tablets-with-alexa-and-google-play-store-access/)).
- **Android 16:** Amazon gives no version number. "AFTVnews reports the tablets run Android 16" ([SaveDelete](https://savedelete.com/article/amazon-alexa-tablets-android/)). SaveDelete also notes "Amazon hasn't published certification details" (GMS / Play Protect).
- **Browser (Silk vs Chrome):** **Not confirmed by any official or press source found.** Neither Amazon's announcement nor the coverage names a browser. Fire OS devices shipped Silk. With Play available, Chrome can at least be installed in an adult profile.
- **Kids profiles:** "Every download goes through parental approval" via the Parent Dashboard. The dashboard "lets parents control web browsing" ([Amazon](https://www.aboutamazon.com/news/devices/new-amazon-kids-tablets)). On Fire OS, kids' web browsing could be off, limited to Amazon-curated sites, or curated sites plus parent-added sites ([Amazon web-browsing controls](https://aboutamazon.com/news/devices/amazon-explains-web-browsing-controls-on-fire-kids-tablets)).
- **PWA install, Chrome, and Web Speech in kid profiles: unverified.** Run the device test checklist in [04-technology.md](04-technology.md) on a real Kids Tablet: UA string, service worker, IndexedDB persistence, `speechSynthesis.getVoices()`, and whether a parent-approved Chrome or home-screen shortcut is reachable inside a child profile. Until then, keep the "parent adds URL to approved sites" plan.

---

## 7. Recommended architecture (compliant by default)

```
Build machine (developer, adult, billed Gemini key)
  tts-render:  manifest.json (text, voice_id, style, hash) ──► Gemini 3.8 Flash TTS (Batch)
               └─► WAV 24 kHz ─► ffmpeg loudnorm ─► .opus  ─► shipped static assets
               (provider switch: gemini | openai | kokoro)  ← swap if Google says no

Family server (self-hosted, parent's own keys, all optional)
  /feedback  ──► deterministic template (always) ──► optional Claude Haiku 5.5 (JSON schema,
                 no name/PII, validated, logged for parent) ──► text + clip-concatenated audio
                 or local Kokoro/Piper TTS
  /avatar-suggest (parent gate only) ──► resize+strip EXIF ──► Claude vision (closed schema of
                 creator IDs) ──► attributes JSON; photo discarded, never stored
  NO Gemini calls at runtime. NO image generation of the child.
```

Also put the following in the README / docs:

- a privacy and COPPA statement,
- an AI disclosure,
- the list of third-party data flows and their retention (§4),
- a "use a billed key" warning,
- the consumer-use caveat.

---

## 8. Open risks

1. **Build-time Gemini TTS interpretation** (§5.1a). Get written confirmation from Google, or switch the renderer to Kokoro or OpenAI.
2. **Consumer-use clauses** (§5.6) apply to every BYO-key family. They can be disclosed but not engineered away.
3. **Anthropic audits** apply per API account, so each family is the "organization". Ship safe defaults so a family can't easily misconfigure, e.g. no free-form chat mode.
4. **OpenAI's live Usage Policies** couldn't be fetched (403), and the quoted text is the Oct 29, 2025 version via Open Terms Archive. The current status of the "no edits of photorealistic children" rule is unconfirmed.
5. **Gemini TTS price doubling on Jan 1, 2027.** Render the library before then. It's cheap either way.
6. **Model churn:** `gemini-2.5-flash` will be force-routed on Dec 1, 2026, and Haiku 5.5 retires "not sooner than October 7, 2027". Keep model IDs in config.
7. **Amazon tablet browser and PWA behavior** in Kids profiles is unverified (§6).
8. **COPPA applicability** to a parent self-hosting for their own children is unclear. The project itself collects nothing, but providers' terms still require "all applicable laws". Get legal review before promoting the project publicly.

---

## Sources

- Gemini API Additional Terms (effective 2026-03-23): https://aistudio.google.com/docs/terms ; archive: https://aistudio.google.com/docs/terms-archive/index.md
- Gemini TTS guide: https://aistudio.google.com/docs/speech-generation ; generateContent variant: https://aistudio.google.com/docs/speech-generation.md?generate-content=true
- Gemini 3.8 Flash TTS model page: https://aistudio.google.com/docs/models/gemini-3.8-flash-tts ; Flash-Lite TTS: https://aistudio.google.com/docs/models/gemini-3.8-flash-lite-tts
- Gemini pricing: https://aistudio.google.com/docs/pricing ; rate limits: https://aistudio.google.com/docs/rate-limits ; batch: https://aistudio.google.com/docs/batch-api ; models: https://aistudio.google.com/docs/models ; abuse monitoring (55 days): https://aistudio.google.com/docs/usage-policies ; image generation: https://aistudio.google.com/docs/image-generation ; docs index (Imagen shut down): https://aistudio.google.com/llms.txt ; Gemini 3.5 Flash-Lite: https://aistudio.google.com/docs/models/gemini-3.5-flash-lite
- Google Cloud Service Specific Terms (last modified 2026-11-11), §18, §20(d), §32: https://cloud.google.com/terms/service-terms ; Services summary: https://cloud.google.com/terms/services
- Google Generative AI Prohibited Use Policy: https://policies.google.com/terms/generative-ai/use-policy
- Anthropic Usage Policy (effective 2026-11-12): https://www.anthropic.com/legal/aup
- Anthropic minors guidelines: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
- Anthropic Commercial Terms: https://www.anthropic.com/legal/commercial-terms
- Claude models overview: https://platform.claude.com/docs/en/about-claude/models/overview ; Haiku 5.5: https://platform.claude.com/docs/en/models/haiku-5-5/overview ; pricing: https://platform.claude.com/docs/en/about-claude/pricing ; structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs ; data retention/ZDR: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention ; commercial retention: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- OpenAI Under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance
- OpenAI Usage Policies (live, 403 to fetch): https://openai.com/policies/usage-policies/ ; Open Terms Archive copy: https://github.com/OpenTermsArchive/genai-contrib-versions/blob/main/ChatGPT/Acceptable%20Use%20Policy.md
- OpenAI data controls: https://developers.openai.com/api/docs/guides/your-data ; pricing: https://developers.openai.com/api/docs/pricing ; models: https://developers.openai.com/api/docs/models ; image generation: https://developers.openai.com/api/docs/guides/image-generation ; TTS: https://developers.openai.com/api/docs/guides/text-to-speech
- OpenAI GPT-4o native image generation system card addendum (Mar 2025): https://cdn.openai.com/11998be9-5319-4302-bfbf-1167e093f1fb/Native_Image_Generation_System_Card.pdf ; ChatGPT Images 2.5 card: https://deploymentsafety.openai.com/chatgpt-images-2-5/chatgpt-images-2-5.pdf ; Images 2.0: https://deploymentsafety.openai.com/chatgpt-images-2-0
- Black Forest Labs Developer Terms: https://bfl.ai/legal/developer-terms-of-service ; Usage Policy: https://bfl.ai/legal/usage-policy ; fal ToS: https://fal.ai/legal/terms-of-service ; Replicate terms: https://replicate.com/terms
- COPPA amended rule summary: https://hunton.com/privacy-and-information-security-law/ftc-publishes-final-coppa-rule-amendments
- Amazon tablets: https://www.aboutamazon.com/news/devices/new-amazon-alexa-tablets-alexa-plus ; https://www.aboutamazon.com/news/devices/new-amazon-kids-tablets ; https://techcrunch.com/2026/10/08/amazon-unveils-new-alexa-tablets-with-alexa-and-google-play-store-access/ ; https://savedelete.com/article/amazon-alexa-tablets-android/ ; https://gigazine.net/gsc_news/en/20261009-alexa-tablets/ ; https://www.digitaltrends.com/tablets/amazons-new-kids-tablets-let-parents-control-google-play-and-manage-screen-time/ ; https://aboutamazon.com/news/devices/amazon-explains-web-browsing-controls-on-fire-kids-tablets
