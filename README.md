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
- static pregame onboarding with the objective, round flow, and core actions
- a complete in-app rules reference organized by flow, scoring, and endgame
- automatic browser save and resume
- pure deterministic rules engine separated from React
- seeded setup and mirrored Hearing schedule
- secret Specialty draft, one-time powers, and endgame bonuses
- all ten legal 3/3 brief partitions
- Lead, Co-Counsel, and Focus card resolution
- normal Hearing and Closing Argument scoring
- team-floor verdict calculation
- player-view redaction for secret Closing Argument information
- Easy random, Medium heuristic, and Hard sampled-lookahead bots
- difficulty matchups and gameplay-differentiation simulation metrics
- engine, Worker integration, and mobile-browser smoke tests

The Specialty module is now active. Each firm is secretly dealt two of the twelve
Specialties during setup and locks one before Round 1. Every card carries a
one-time power and a conditional endgame bonus:

- six Issue specialists place an extra Firm marker before their Issue scores
- three pair specialists add a marker when resolving a Case card in either Issue
- Generalist retargets one Case card to any Issue, keeping its action type
- Team Builder adds one Joint Work marker when resolving Co-Counsel
- Closer moves up to two Firm markers into a revealed Issue after the reveal

Bonuses are paid after Closing Arguments score and before the verdict, so they
count toward the team floor. Set `rules.specialtiesEnabled: false` to play the
earlier base-rules game.

After the Specialty timing and hidden-information fixes, the engine completed a fresh 10,000-game random-bot validation without an invariant failure. Plaintiff won 50.07% of games, Defense won 49.93%, and each firm won between 24.77% and 25.21%. The protocol-v2 report, including per-Specialty offer, pick, use, bonus, and win counts, is checked in at `docs/milestone-0-simulation-v2.json`. It validates execution and rough seat symmetry, not strategic balance; earlier reports describe the superseded rules implementation.

See [`docs/ENGINE_STATUS.md`](docs/ENGINE_STATUS.md) for the current implementation and validation status, [`docs/GAMEPLAY_ANALYSIS.md`](docs/GAMEPLAY_ANALYSIS.md) for measured strategic behavior, and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the next playtest and gameplay experiments. Documents explicitly marked historical are retained as implementation records and should not be read as the current feature set.

## Run locally

```bash
npm install
npm test
npx playwright install chromium
npm run test:e2e
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

Remote play runs on Cloudflare Workers and Durable Objects. Add the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets once. On every push to `main`, the production workflow deploys and health-checks protocol v2 of the Worker before it deploys GitHub Pages, preventing an incompatible client/server pair. The **Deploy remote play service** workflow remains available for an emergency Worker-only redeploy. See [`docs/REMOTE_PLAY.md`](docs/REMOTE_PLAY.md) for setup and recovery.

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
