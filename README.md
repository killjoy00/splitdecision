# Split Decision

A browser playtest implementation of **Split Decision**, a four-player strategy game about two pairs of co-counsel law firms. Each side must win legal issues together, but only one firm wins the game.

## Current milestone

Milestone 0 includes:

- complete local pass-and-play React interface
- four Human or Easy-bot seats with named firms
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
- Easy random-bot simulation
- engine tests and invariant checks

The advanced Specialty module is represented in canonical data but is intentionally not active in this first implementation slice. The next engine increment should add Specialty selection, timing windows, powers, and endgame bonuses before the UI is treated as rules-complete.

The engine has completed a 1,000-game random-bot validation run without an invariant failure. The aggregate report is checked in at `docs/milestone-0-simulation.json`; it validates execution and rough seat symmetry, not strategic balance. The simulator supports larger local or CI runs.

## Run locally

```bash
npm install
npm test
npm run simulate -- --games 1000 --seed demo
npm run dev
```

The browser app saves the active case to local storage after every accepted action. Use **New case** to clear it and return to setup.

## Deploy

Pushes to `main` deploy `web-dist` through GitHub Pages using `.github/workflows/deploy-pages.yml`. In repository **Settings → Pages**, select **GitHub Actions** as the source. The production custom domain is `splitdecision.planitnow.us`, so Vite's default `/` base path is intentional.

## Architecture

```text
src/
  app/       React shell
  data/      canonical card data
  engine/    pure rules, selectors, bots, simulation
scripts/     headless simulation entry point
tests/       deterministic engine tests
docs/        Codex implementation handoff
```

React never mutates game state directly. Human input, bots, tests, replay, and simulations all submit the same discriminated `GameAction` objects to `applyAction`.

## Source documents

The game-data JSON and Codex handoff in this repository are based on rules prototype v0.2. The working product title is **Split Decision**; some source documents retain the earlier working title **Closing Arguments**.
