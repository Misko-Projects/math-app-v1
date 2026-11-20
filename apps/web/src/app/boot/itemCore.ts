// The engine's item core (02 §6a, #95): generators, state checkers, misconception rules and format
// models. It is far larger than the rest of the engine, so the shell imports only
// `@number-island/engine/shell` and loads the full entry here, through a dynamic import. The
// bundler turns that into a chunk of its own, outside the initial JS; `pnpm bundle-size` fails if a
// static import ever pulls it back in.
//
// Loading the full entry installs the item core that the learner fold needs, so boot awaits this
// before it opens the data store.

export async function loadItemCore(): Promise<void> {
  await import('@number-island/engine');
}
