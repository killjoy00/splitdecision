# Historical initial pull-request description

> This file records the first Milestone 0 engine pull request and is intentionally
> preserved as history. Its test totals, disabled features, and known limits are not
> the current product status. See `README.md`, `docs/ENGINE_STATUS.md`, and
> `docs/ROADMAP.md` for the live implementation.

## Original summary

Establish the first playable rules-engine foundation for **Split Decision**.

This draft implements the deterministic core before building the full browser interface:

- scaffold React + TypeScript + Vite;
- add canonical Case-card and Specialty data;
- implement seeded setup and mirrored Hearings;
- enumerate and validate all ten 3/3 brief splits;
- implement split commits, brief choices, and card assignment;
- implement Lead, Co-Counsel, and Focus resolution;
- implement 3/2 Hearings, 2/1 Closing Arguments, clearing, and tiebreakers;
- implement the team-floor verdict and individual winner;
- redact secret Closing Argument and uncommitted choice information;
- add deterministic replay, state hashes, Easy bots, simulation metrics, and invariants;
- add a minimal React shell for exercising seeded setup.

## Validation

- `npm test` — 16/16 passing
- 1,000 seeded random legal games — no invariant failures
- deterministic replay reproduces final state and event hashes
- all games consume 36 unique Case cards over 96 player actions

## Stress-test snapshot

- Plaintiff wins: 49.8%
- Defense wins: 50.2%
- Lead / Co-Counsel use: 49.98% / 50.02%
- team-floor elimination of the table high score: 10.5%
- Closing Arguments changes winning side: 13.6%
- Closing Arguments changes winning firm: 27.9%

Random bots validate execution and symmetry, not strategic balance.

## Known limits

The Specialty module is present in data but intentionally disabled until its selection and timing windows are implemented. The full pass-and-play board UI and Standard bot are follow-up milestones.
