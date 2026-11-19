# Number Island (math-app-v1)

An open-source, adaptive math game for kids, from kindergarten through grade 3 first, with a design that extends to grade 8 and beyond. Two siblings share an island. Every building is a workshop where doing real math is how things get built. The game works out what each child has mastered, teaches what they're ready for next, and brings older skills back before they fade.

It runs in any modern browser and installs as an app on Android tablets, including Amazon's Alexa and Kids Tablets. Each family hosts its own copy with its own API keys. There is no public service, no ads and no tracking.

## Status

Research and specs are complete, and v1 is being built. See:

- [`docs/spec/`](docs/spec/README.md): the binding specification (product, architecture, curriculum, learning engine, game design, UX, AI, backend, quality)
- [`docs/build/`](docs/build/plan.md): build plan, issue breakdown and orchestration prompt
- [`docs/research/`](docs/research/): background research behind the decisions
- [`docs/plan/index.html`](docs/plan/index.html): the interactive options/plan document

## Quick start

You need Node 24 (see `.nvmrc`) and pnpm 10 (`corepack enable` picks the pinned version).

```sh
pnpm i
pnpm secrets:link   # optional: copies your API keys from ~/.config/math-app-v1/secrets.env; fine if the file is missing
pnpm dev            # open http://localhost:5173
```

To run the tests (`pnpm verify`, `pnpm e2e`), the scripts download Playwright's Chromium on first use. On Linux, Chromium also needs some system libraries; install them once with `pnpm exec playwright install-deps chromium`, which asks for your password to run the system package manager (macOS and Windows need nothing extra).

`pnpm dev:lan` serves the app on your home network so a tablet can open `http://<laptop-ip>:5173`. Contributor commands and rules are in [`AGENTS.md`](AGENTS.md).

## Troubleshooting

**The parent area says "No children on this island yet."** On a device you just paired, this usually means the family's children haven't arrived yet: they come with the first sync, so a failed or slow sync shows an empty family for a while. Tap **Sync now** in the parent area, and check that the device is on the same network as the island server (and that the server is running). Nothing is lost while you wait; the children's profiles stay on the server.

## License

MIT (code). Third-party assets and their licences are listed in `LICENSES-ASSETS.md`.
