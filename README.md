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

`pnpm dev:lan` serves the app on your home network so a tablet can open `http://<laptop-ip>:5173`. Contributor commands and rules are in [`AGENTS.md`](AGENTS.md).

## License

MIT (code). Third-party assets and their licences are listed in `LICENSES-ASSETS.md`.
