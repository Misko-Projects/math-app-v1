# Third-party assets and licences

The code in this repository is MIT-licensed (see `LICENSE`). This file lists every third-party asset that ships with the app, with its licence. Everything is self-hosted: nothing loads from a CDN at runtime.

**Rule for contributors:** when you add a font, sound, image, dataset or other asset you did not create, add a row here in the same pull request (AGENTS.md, "Content and art rules").

## Fonts

| Asset | Used for | Source (npm) | Copyright | Licence |
|---|---|---|---|---|
| Andika | Body text (designed for early readers) | `@fontsource/andika` | © 2004–2022 SIL International | SIL Open Font License 1.1 |
| Baloo 2 | Display text and headings | `@fontsource/baloo-2` | © 2019 The Baloo 2 Project Authors (Ek Type) | SIL Open Font License 1.1 |

The full OFL text ships inside each npm package (`node_modules/@fontsource/*/LICENSE`).

## Audio

| Asset | Used for | Source | Licence |
|---|---|---|---|
| Sound effects: pebble chime, wood knock, fuse, pop, boat horn, firefly twinkle, coin clink, page turn, construction tap (05 §12) | Game feedback and events | Original procedural Web Audio synthesis in `packages/ui/src/audio/sfx/`, written for this project. No samples or recordings. | MIT (this repository) |
| Music: island loop, festival theme, sunset theme, four workshop-family loops (05 §12) | Background music | Original procedural compositions in `packages/ui/src/audio/music/`, written for this project and synthesised at runtime. No samples or recordings. | MIT (this repository) |

| Narration clips (`apps/web/public/audio/*.ogg`, 07 §3) | Spoken narration, number words and clip sets | Generated at build time by `tools/narration` from this project's own narration text (`packages/content/narration/*.yaml`) with Google Gemini TTS (`gemini-3.8-flash-tts`, prebuilt voices listed in `narration/voices.yaml`), encoded to Opus with ffmpeg. Whether build-time rendering for a children's app is permitted, and the terms the generated audio is used under, are open owner-verification items (07 §3); if Google says no, re-render with Kokoro (Apache-2.0 model). | MIT (this repository) for the text; generated audio used under the Gemini API terms (owner to confirm) |

No third-party or CC0 audio ships yet. Any CC0 sound effects added later are listed here with their source URL. The ffmpeg binary (`ffmpeg-static`, GPL-3.0-or-later) is a build-time tool only: it is downloaded on first local render and never shipped or committed.

## Art

None yet. All art is original to this project unless a row says otherwise.

## Curriculum data

None yet. Standards are stored as codes plus our own wording; attributions (for example Achieve the Core CC0 / CC BY material) are added here when used.
