# Milestone 0 engine status

## Completed in this branch

- React, TypeScript, and Vite application shell
- Pure deterministic rules engine isolated from React
- Seeded setup with mirrored Hearing schedule
- All 36 Case cards and all 10 legal 3/3 partitions
- Simultaneous split and brief-choice commit flow
- Lead, Co-Counsel, and Focus card resolution
- Normal Hearings, Closing Arguments, marker clearing, and all base tiebreakers
- Team-floor verdict and individual winner resolution
- Secret Closing Argument and private-choice visibility filtering
- Deterministic action replay and state hashes
- Easy random bots and headless batch simulation
- Development invariants and automated tests

## Validation

- `npm test`: 16/16 tests passing
- 1,000 seeded random-bot games without an invariant failure
- Every simulated game resolved exactly 96 player actions and consumed all 36 Case cards

Aggregate random-bot results are recorded in `docs/milestone-0-simulation.json`:

- Plaintiff side wins: 49.8%
- Defense side wins: 50.2%
- Lead actions: 49.98%
- Co-Counsel actions: 50.02%
- Highest table score eliminated by the team-floor rule: 10.5%
- Closing Arguments changed the winning side: 13.6%
- Closing Arguments changed the winning firm: 27.9%

These figures validate execution and rough symmetry only. Random bots do not test strategic balance.

## Deferred intentionally

- Specialty selection, one-time powers, timing windows, and endgame Specialty bonuses
- Full pass-and-play board UI and privacy gates
- Standard heuristic bot and Monte Carlo bot
- Save/load UI, telemetry dashboard, responsive polish, and online multiplayer

The engine rejects `specialtiesEnabled: true` rather than silently applying incomplete rules.
