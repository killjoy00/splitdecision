# Milestone 0 engine status

## Completed in Milestone 0

- Complete responsive React pass-and-play interface
- Four named Human, Easy, Medium, or Hard seats
- Private-device handoffs for splits, brief choices, and turns
- Automatic local save/resume, scoring history, and verdict presentation
- Pure deterministic rules engine isolated from React
- Seeded setup with mirrored Hearing schedule
- All 36 Case cards and all 10 legal 3/3 partitions
- Simultaneous split and brief-choice commit flow
- Lead, Co-Counsel, and Focus card resolution
- Normal Hearings, Closing Arguments, marker clearing, and all base tiebreakers
- Team-floor verdict and individual winner resolution
- Secret Closing Argument and private-choice visibility filtering
- Deterministic action replay and state hashes
- Easy random bots, transparent Medium heuristics, and sampled-lookahead Hard bots
- Headless population profiles, difficulty matchups, and differentiation metrics
- Development invariants and automated tests

## Validation

- `npm test`: engine and Cloudflare room suites passing
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

These figures validate execution and rough symmetry only. The strategic-bot report and gameplay recommendations are in `docs/GAMEPLAY_ANALYSIS.md`.

## Deferred intentionally

- Full simulation telemetry dashboard

The Specialty module is complete and enabled by default. `specialtiesEnabled: false`
still plays the base-rules game, and the engine keeps every Specialty field empty in
that mode.

## Specialty module

- setup deals each firm two of the twelve Specialties and locks one secretly
- all four power timings resolve: before an Issue scores, when resolving a Case
  card, when resolving Co-Counsel, and after the Closing Argument reveal
- powers are one-time and reveal the card when spent; declining the Closer window
  forfeits the power without revealing it
- endgame bonuses are paid after Closing Arguments score and before the verdict,
  so they count toward the team floor
- Team Builder reads Reputation from before any bonus is paid, so bonuses cannot
  cascade within the same pass
- player views redact both the chosen Specialty and the two dealt options, and the
  draft hides which opponents have already committed

### Measured bonus reach

Share of games in which each Specialty's endgame condition was met, by bot level:

| Bot level | Overall bonus rate |
|---|---|
| Easy | 24.6% |
| Medium | 31.1% |
| Hard | 38.0% |

The rate rising with bot strength is the intended signal: bonuses reward directed
play rather than luck. The spread between cards is wide, though — Generalist,
Team Builder, and Closer land 60-72% at Medium, while the six single-Issue
specialists land 10-27%. The +3 versus +2 payout only partly offsets that. The
conditions are implemented exactly as written in the canonical data, so closing
that gap is a rules-tuning decision rather than an engine change.
