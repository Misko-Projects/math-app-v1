# Frozen golden-replay content

This directory is a frozen copy of the `packages/content` sources. It holds the C01 fixture as it was on `main` at 188c73a, the commit that added the golden replay (#54).

It is frozen on purpose. `test/golden-replay.test.ts` compiles this copy rather than the live curriculum. As a result, `replay-log.jsonl` and `replay-snapshot.json` change only when a fold or the recorder changes. They do not change every time a content PR (K01, K02) adds skills.

The live content is still exercised. The same test file replays the recorded log against the live `packages/content` and checks invariants only: no fold throws, and every live skill gets a valid status.

The compiler checks the fixed clip inventory (03 §8.3) against `narration/numbers.yaml`. So when a PR adds required inventory ids, it also adds those clip entries here, and only those. It then re-derives the snapshot, where only `contentVersion` moves. K01 part 2 (geometry and measurement) added the `word.*` shape, measure and position clips this way.

## Refreshing it

Refresh the copy only when the compiler or schema changes so much that this directory no longer compiles, or when the golden test deliberately needs new content.

1. Replace this directory's sources with the wanted revision of `packages/content`. Keep this README.
2. Re-record the golden files with `UPDATE_GOLDEN=1 pnpm exec vitest run --project engine test/golden-replay.test.ts`.
3. Review the snapshot diff in the PR, and say why the refresh was needed.
