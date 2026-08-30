# Random-bot simulation baseline

> Historical pre-Specialty baseline. The current protocol-v2 validation report is
> `docs/milestone-0-simulation-v2.json`; current interpretation is documented in
> `docs/ENGINE_STATUS.md` and `docs/GAMEPLAY_ANALYSIS.md`.

Command:

```bash
npm run simulate -- --games 1000 --seed milestone-0
```

Results:

```json
{
  "games": 1000,
  "seedPrefix": "milestone-0",
  "firmWins": {
    "P1": 234,
    "D1": 246,
    "P2": 264,
    "D2": 256
  },
  "sideWins": {
    "plaintiff": 498,
    "defense": 502
  },
  "leadRate": 0.4997916666666667,
  "coCounselRate": 0.5002083333333334,
  "sideTieRate": 0.1261875,
  "internalTieRate": 0.101125,
  "highestScoreEliminatedRate": 0.105,
  "closingChangedSideRate": 0.136,
  "closingChangedFirmRate": 0.279
}
```

These are random legal bots, so the numbers are a regression and seat-symmetry baseline rather than evidence of strategic balance. The nearly even side and seat results are useful as an initial smoke test. Closing Arguments changed the winning side in 13.6% of games and the provisional winning firm in 27.9%, which is a useful first measurement for the intended endgame uncertainty.
