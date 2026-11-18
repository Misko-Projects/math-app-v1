# Widget registry contract

Every `ItemFormat` has exactly one widget (02 §5.2). The workshops and the lesson player never
import a widget directly. They render `<WidgetHost>`, which looks up the format in the registry,
lazily loads the widget's chunk and passes it the props below. This document is the contract that
U03–U05 implement against. `sample/SampleSetWidget.tsx` is a complete worked example.

## Registering a widget

Add one line per format to `registry.ts`. A one-line entry keeps parallel widget PRs free of
conflicts (`docs/build/plan.md`, rule 2):

```ts
export const widgetRegistry: WidgetRegistry = {
  'tap-count': () => import('./tap-count/TapCountWidget'),
};
```

The module default-exports a `WidgetComponent<'tap-count'>`. Because entries are loaders, each
widget lands in the chunk of the workshop that first renders it (02 §6). `preloadWidget(format)`
starts a load early, for example to prefetch the recommended workshop (06 §8).

A format with no entry renders `PlaceholderWidget`: Pip says the game is still being built, and
"next" answers `{ kind: 'skip' }`, so a session never gets stuck. The placeholder also shows when a
widget fails to load or throws while rendering (`WidgetHost` has an error boundary). In development
it tags the missing format.

## Props (`WidgetProps<ConfigFor<F>>`)

| Prop | Type | Meaning |
|---|---|---|
| `config` | `ConfigFor<F>` | The item's `GeneratedItem.widget`: everything needed to render (03 §5.5). |
| `tier` | `Tier` | `concrete` (draggable objects), `pictorial` (a drawn picture) or `abstract` (symbols and number pad). Render every tier the format supports (05 §4 rule 4). |
| `disabled` | `boolean` | No input at all: demo playback, feedback showing, or the runner waiting. |
| `onResponse` | `(r: ResponseValue) => void` | The child's answer, **once per submission**: the widget's own "check" (debounced ≥ 400 ms, 06 §4), or an end-state action. Never on partial input. The widget never judges correctness: the runner calls `checkResponse` (03 §5.5). The `ResponseValue` kind must match the format's answer kinds (03 §5.1). Any valid alternative state counts (state equivalence, 03 §5.5). |
| `onInteract` | `(e: InteractionEvent) => void` | Every manipulative interaction in order (`tap`, `drag`, `drop`, `undo`, `move`), for the trace in `TaskRunner.submit(meta.trace)` (03 §5.1). Wrap it with `useInteractionTrace(onInteract)`, which stamps `ms` since the widget first rendered. The trace stays in memory only. |
| `demo` | `WidgetDemo` | Demo mode for lessons and hints (03 §6.3); see below. Always provided (an inert controller outside lessons). |

One widget instance shows one item. Pass the item's identity as `WidgetHost`'s `itemKey`: a new value remounts the widget with fresh state, even for the same format.

## Demo mode (03 §6.3)

A lesson host creates `const demo = createDemoController()` and passes it as `demo`. The widget
binds its implementation for as long as it is mounted:

```ts
useWidgetDemo(demo, {
  ops: ['drag', 'remove', 'count-aloud'],          // the format's op list, 03 §5.5
  play: async (action) => { /* animate one op, resolve when it ends */ },
  invite: (action) => { /* highlight the target of a child step; null clears */ },
});
```

- `demo.play(action)` animates one op through the format's state model
  (`packages/engine/src/formats/<format>.ts`: `apply(state, action)`) and resolves when the
  animation ends. The host passes `disabled` while it plays.
- `demo.invite(action)` highlights the target of a child step: the `.ni-invite` pulse plus a
  `.ni-hand` pointer (`HandPointerIcon`).
- Calls made before the widget mounts wait for it. A remount re-binds.
- An op the widget doesn't list **throws `UnsupportedWidgetOpError` in development** and is skipped
  with a warning in production. V21 prevents this for authored lessons.
- With reduced motion (`useReducedMotion()`), ops become instant state changes plus the highlight.

## Interaction rules every widget follows

- **Drag and tap-to-place:** use `useDragToTarget` (or `useTapToPlace` when nothing drags). Every
  drag has a tap-to-select → tap-to-place alternative and a keyboard path (Enter/Space, arrow keys,
  Escape). Tap-only mode and the snap radius come from the child's settings through `UiProvider`.
  A mis-drop glides home with no penalty (06 §4).
- **Targets never contain items as DOM children.** Render the drop target as a pad behind the
  items, so items stay separate buttons (axe `nested-interactive`).
- **Sizes:** hit targets use `var(--target-min)` (80 px for K, 64 px from G1), with
  `var(--target-gap)` (12 px) between them. Numerals are ≥ 32 px (05 §11).
- **Audio:** tapping a number, coin or shape speaks its name when `speakOnTap` is on
  (`useSpeech().sayNumber`). Labels come from narration keys (`useNarrationText`), never inline
  strings.
- **Colour:** never encode quantity or correctness in colour alone (06 §7). Check the widget's
  stories with the Storybook vision simulator.
- **Tests:** stories with play functions cover every tier, plus the drag path (mouse and touch),
  the tap-to-place path and the keyboard path. Each emits the correct `ResponseValue` and trace.
  axe runs on every story. `src/test-support/storyHelpers.ts` has `pointerDrag`,
  `expectTargetSize` and `expectTargetGaps`.
