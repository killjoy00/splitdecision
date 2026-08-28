# Split Decision

A browser playtest implementation of **Split Decision**, a four-player strategy game about two pairs of co-counsel law firms. Each side must win legal issues together, but only one firm wins the game.

## Current milestone

The playable Milestone 0 build includes:

- private remote rooms for up to four devices
- six-character invite codes and shareable room links
- server-authoritative turns backed by a Cloudflare Durable Object
- mix-and-match Human, Easy, Medium, and Hard remote seats
- complete local pass-and-play React interface
- four Human, Easy, Medium, or Hard seats with named firms
- privacy handoffs for every secret decision
- responsive public board, Docket, scoring history, and verdict
- automatic browser save and resume
- pure deterministic rules engine separated from React
- seeded setup and mirrored Hearing schedule
- all ten legal 3/3 brief partitions
- Lead, Co-Counsel, and Focus card resolution
- normal Hearing and Closing Argument scoring
- team-floor verdict calculation
- player-view redaction for secret Closing Argument information
- Easy random, Medium heuristic, and Hard sampled-lookahead bots
- difficulty matchups and gameplay-differentiation simulation metrics
- engine tests and invariant checks

The advanced Specialty module is represented in canonical data but is intentionally not active in this first implementation slice. A later engine increment should add Specialty selection, timing windows, powers, and endgame bonuses before the UI is treated as rules-complete.

The engine has completed a 1,000-game random-bot validation run without an invariant failure. The aggregate report is checked in at `docs/milestone-0-simulation.json`; it validates execution and rough seat symmetry, not strategic balance. The simulator supports larger local or CI runs.

## Run locally

```bash
npm install
npm test
npm run simulate -- --games 1000 --seed demo
npm run analyze:gameplay -- --profile-games 300 --matchup-games 300 --hard-games 80
npm run dev
```

The browser app saves the active case to local storage after every accepted action. Use **New case** to clear it and return to setup.

To exercise remote play locally, run the web app and Worker in separate terminals:

```bash
npm run dev
npm run dev:remote
```

Then open the Vite URL on each device. Localhost origins automatically use `http://localhost:8787`; production uses `https://splitdecision-api.planitnow.us`.

## Deploy

Pushes to `main` deploy `web-dist` through GitHub Pages using `.github/workflows/deploy-pages.yml`. In repository **Settings → Pages**, select **GitHub Actions** as the source. The production custom domain is `splitdecision.planitnow.us`, so Vite's default `/` base path is intentional.

Remote play runs separately on Cloudflare Workers and Durable Objects. Its deployment is deliberately manual: add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets, then run the **Deploy remote play service** workflow. Wrangler attaches the first-level custom domain `splitdecision-api.planitnow.us` and Cloudflare creates its DNS record and certificate. See [`docs/REMOTE_PLAY.md`](docs/REMOTE_PLAY.md) for the exact setup and recovery steps.

## Architecture

```text
src/
  app/       React shell
  data/      canonical card data
  engine/    pure rules, selectors, bots, simulation
  remote/    browser/server protocol types
worker/      Cloudflare Worker, Durable Object, and integration tests
scripts/     headless simulation entry point
tests/       deterministic engine tests
docs/        Codex implementation handoff
```

React never mutates game state directly. Human input, bots, tests, replay, simulations, and remote clients all submit the same discriminated `GameAction` objects to `applyAction`. In remote rooms, the Durable Object authenticates the player, replaces the submitted actor with the authenticated seat, advances bots, persists the canonical state, and returns a player-redacted view.

## Source documents

The game-data JSON and Codex handoff in this repository are based on rules prototype v0.2. The working product title is **Split Decision**; some source documents retain the earlier working title **Closing Arguments**.
