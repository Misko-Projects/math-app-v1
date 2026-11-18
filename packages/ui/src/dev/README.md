# Dev tools (Storybook only)

Nothing in this folder is exported from `src/index.ts` or shipped in the web app.

## Content Browser (03 §10.1 step 9)

Run `pnpm storybook` and open **Dev / Content Browser**. In the browser you can:

- Pick a template. The list is grouped by strand and skill, and you can filter it by id, format,
  tier, generator or skill name.
- Scrub the seed (1–10,000) and, optionally, a target difficulty. The slider spans the template's
  untargeted difficulty range over seeds 1–200, ±0.5.
- Switch the age mode between K and G1+.

For the current item it shows:

- The live widget (formats without a widget show the placeholder).
- The rendered prompt.
- The answer.
- The difficulty breakdown: base + Σ weight × value = total.
- The hint ladder, with rendered text, demo ops and overlay kind.
- The worked solution.
- The widget config and params.

Answer in the widget to see the response and its `checkResponse` result: correct or not, the
feedback key and any misconception ids. **Show me** plays the solution through demo mode.

The browser does not read `packages/content/dist/`. It bundles the YAML sources with
`import.meta.glob` (`contentSources.ts`, the same files `readContentFiles` reads) and compiles
them in the page with `compileContent`, so it works without `pnpm content:build`. In
`pnpm storybook` it picks up YAML edits on reload. If the content doesn't compile, it lists the
compiler diagnostics.
