# tools/narration

Build-time narration renderer (`docs/spec/07-ai-services.md` §3). It never runs in the app: the game plays the committed clips in `apps/web/public/audio/` and falls back to on-device Web Speech for anything missing.

```sh
pnpm narration:render --dry-run      # counts and estimated cost; exits 0 with instructions if there is no key
pnpm narration:render                # render new or changed clips, write manifest.json, prune unused files
pnpm narration:audition              # 5 lines × 5 candidate voices into tmp/audition/ (open index.html)
```

`narration:render` runs `pnpm content:build` first, then renders from `packages/content/dist/narration.json`.

| Option | Default | Meaning |
|---|---|---|
| `--provider gemini\|kokoro\|stub` | `NARRATION_PROVIDER`, else `voices.yaml` (`gemini`) | Renderer |
| `--max-usd <n>` | 5 | Abort if the estimate exceeds it; stop starting requests once spend would exceed it |
| `--concurrency <n>` | 4 | Requests in flight (v1 renders with interactive calls; the Batch API is a follow-up) |
| `--only <regex>` | | Render only matching clip ids; other entries stay as they were and nothing is pruned |
| `--out <dir>` | `apps/web/public/audio` (`tmp/narration/stub` for `stub`) | Output directory |
| `--format opus\|wav` | opus | `wav` skips ffmpeg (tests) |

- **Key:** `GEMINI_API_KEY` from the environment, else from `~/.config/math-app-v1/secrets.env` (or `$MATH_APP_SECRETS`). It is never printed.
- **Voices and styles:** `packages/content/narration/voices.yaml`. Changing a voice, style text or the model changes the clip hashes, so the next render re-renders exactly the affected clips.
- **Per-voice clip sets:** the clip sets listed under `voiceClipSets` in `voices.yaml` (v1: `num` for the guide and Glim) are rendered again in that character's voice as `guide:<clip id>` / `glim:<clip id>` (02 §5.5), so their lines stitch numbers in their own voice. The game falls back to the narrator's clip when a voice clip is missing.
- **Idempotent:** clip files are named by a hash of (provider, model, voice, style, text, encoding). A re-run with unchanged content renders nothing.
- **Kokoro:** add `kokoro-js` first (`pnpm --filter @number-island/narration add kokoro-js`); the model downloads on first use. Never in CI.
- **ffmpeg:** the `ffmpeg-static` binary downloads on the first local encode; CI never needs it.
