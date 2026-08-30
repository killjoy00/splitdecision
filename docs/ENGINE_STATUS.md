# Current implementation status

Milestone 0 is complete. The repository now contains the deterministic game engine,
local and remote browser clients, three bot levels, the full Specialty module, and
the validation and deployment paths required for a playable production build.

The original design handoff and first pull-request description remain in `docs/`
as historical records. This file and the root `README.md` are the current status
sources.

## Playable product

- responsive local pass-and-play and private remote rooms
- four named Human, Easy, Medium, or Hard seats
- private handoffs or per-device views for every secret decision
- static pregame onboarding and a complete in-app rules reference
- automatic local save/resume and private remote recovery links
- host seat management, bot replacement, host transfer, and rematches
- public board, Docket, score floors, Hearing history, and verdict explanation

## Rules engine

- pure deterministic reducer and legal-action generator isolated from React
- all 36 Case cards and all ten legal 3/3 partitions
- seeded setup and mirrored six-round Hearing schedule
- simultaneous split and brief-choice commitments
- Lead, Co-Counsel, and Focus resolution
- normal Hearings, Closing Arguments, clearing, and every base tiebreaker
- team-floor verdict and individual winner resolution
- deterministic replay, public state hashes, and development invariants
- player-view filtering for Closing Arguments, Specialties, and private commitments

## Specialties and bots

- secret two-card Specialty draft with all twelve roles enabled by default
- all four power timings and conditional endgame bonuses
- Easy random, Medium heuristic, and Hard sampled-lookahead bots
- determinized Medium and Hard decisions that do not inspect canonical opponent secrets
- headless profiles, difficulty matchups, and gameplay-differentiation metrics

`specialtiesEnabled: false` still runs the complete base game and leaves every
Specialty field empty.

## Current validation

- `npm test`: 41 engine tests and 8 Cloudflare room tests
- production React build and Cloudflare Worker dry-run
- mobile Chromium smoke test in GitHub Actions
- protocol-v2 Worker health check before every Pages deployment
- 10,000 seeded Easy-bot games without an invariant failure

The current 10,000-game report is `docs/milestone-0-simulation-v2.json`:

- Plaintiff wins: 50.07%
- Defense wins: 49.93%
- individual firm wins: 24.77%–25.21%
- Lead / Co-Counsel use: 49.95% / 50.05%
- normal Hearings decided by a side tiebreak: 11.48%
- highest table score eliminated by the team-floor rule: 11.30%
- Closing changed the winning side: 13.58%
- Closing changed the winning firm: 31.07%

These figures validate execution and rough symmetry. They do not establish human
balance or prove that the best strategies are sufficiently different.

## Known design questions

- all-Hard games still decide 54.0% of normal Hearings through a side tiebreak,
  indicating strategic convergence among strong players
- Generalist, Team Builder, and Closer earn their Specialty bonuses much more often
  than the six single-Issue specialists
- Co-Counsel may provide too much side strength relative to its personal-credit cost
- Issues heard for the second time earlier can receive more late placements before Closing
- the production recovery and host-transfer flows need repeated human, multi-device playtests

The measured bot results and rationale are in `docs/GAMEPLAY_ANALYSIS.md`. The
ordered product work and five isolated gameplay experiments are in `docs/ROADMAP.md`.

## Next release gates

1. Complete at least five full production remote games across multiple real devices.
2. Capture game duration, reconnects, abandoned rooms, and per-Specialty outcomes.
3. Prototype one gameplay-differentiation rule behind a feature flag.
4. Compare that variant against the current rules on identical seeds before enabling it.
