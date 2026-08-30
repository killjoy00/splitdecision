# Gameplay differentiation and balance

## Current conclusion

Citation and Second Chair materially reduce strategic convergence in bot play without
introducing a detectable side bias or collapsing the difficulty ladder. They are ready
for human playtesting. Their marker values should not be tuned again until complete
human games establish whether the added brief analysis and partner tension are fun.

The evidence is encouraging, not final proof of balance. Bots are useful controlled
opponents; they do not measure teaching cost, negotiation, perceived agency, or turn
length.

## Reproducible comparison

The current and prior rules were run with the same seed and sample design:

```bash
npm run analyze:gameplay -- \
  --profile-games 300 \
  --matchup-games 300 \
  --hard-games 100 \
  --seed gameplay-analysis-v2
```

Profile rows use four bots at the same level. Matchups place two bots of one level
against two of another and alternate the challenger between Plaintiff and Defense.

- pre-Specialty baseline: `docs/gameplay-analysis-v2.json`
- Specialties-only baseline: `docs/gameplay-analysis-v3.json`
- Citation/Second Chair summary: `docs/gameplay-analysis-v4-summary.json`

## The deck experiment

New games still use exactly 36 cards. Six fixed cards were replaced:

| Action | Before | Current |
|---|---:|---:|
| Fixed Lead | 15 | 12 |
| Fixed Co-Counsel | 15 | 12 |
| Focus | 6 | 6 |
| Citation | 0 | 3 |
| Second Chair | 0 | 3 |

The removed cards form a six-edge cycle across the six Issues. Citation occupies
alternating edges and Second Chair retains the other three pairs, leaving every Issue
printed on exactly ten current cards. Each new action therefore resolves 8.33% of all
Case cards in every complete game.

Citation is relational: it chooses either other card in the acting firm's brief and
uses one Issue printed on that card. A deal constraint keeps all three Citations out of
the same six-card Docket, so no 3/3 split can produce an unplayable all-Citation brief.
Second Chair adds 1 acting-firm marker, 2 partner markers, and 1 Joint Work.

## Differentiation results

| Metric | Easy | Medium | Hard |
|---|---:|---:|---:|
| Plays on the scheduled Issues | 32.6% | 55.1% | 56.5% |
| Plays on the acting firm's Closing Issue | 16.9% | 23.3% | 25.7% |
| Citation actions | 8.3% | 8.3% | 8.3% |
| Second Chair actions | 8.3% | 8.3% | 8.3% |
| Hearings decided by a side tiebreak | 11.1% | 30.1% | 42.6% |
| Hearings with a 0–1 marker margin | 26.0% | 53.1% | 59.7% |
| Average Hearing margin | 4.09 | 1.95 | 1.59 |
| Closing changed the winning side | 16.7% | 14.7% | 19.0% |

The strongest signal is reduced convergence:

| Profile | Base rules | Specialties | Current cards |
|---|---:|---:|---:|
| All Medium side-tiebreak rate | 44.4% | 37.9% | **30.1%** |
| All Hard side-tiebreak rate | 63.8% | 54.0% | **42.6%** |

Against the immediately preceding Specialty rules, average Hearing margins widened
from 1.78 to 1.95 for Medium and from 1.32 to 1.59 for Hard. The 7+ marker blowout
rate stayed low at 2.3% and 0.8%, respectively. The change therefore created more
decisive close Hearings rather than lopsided ones.

The split also matters in a new way. A Citation's target set is determined by the two
cards grouped with it, so moving the same Citation between briefs changes its later
legal resolutions. Medium and Hard split evaluation explicitly models those companion
cards rather than valuing Citation as a standalone card.

## Bot ladder

| Matchup | Games | Higher-level wins |
|---|---:|---:|
| Medium vs Easy | 300 | 283 (94.3%) |
| Hard vs Medium | 100 | 65 (65.0%) |
| Hard vs Easy | 100 | 98 (98.0%) |

The Hard-versus-Medium result is essentially unchanged from the 64% Specialty-only
baseline, while both higher levels remain clearly separated from Easy.

## Symmetry and execution sweep

A separate 10,000-game Easy-bot run used:

```bash
npm run simulate -- --games 10000 --seed citation-second-chair-balance
```

It completed without an invariant failure. Plaintiff won 4,996 games and Defense
5,004. Individual firms won between 2,427 and 2,569 games. Side-tiebreak Hearings were
11.08%, the team-floor rule eliminated the table's highest scorer in 10.96%, and
Closing changed the winning side in 13.08%. The compact result is
`docs/milestone-0-simulation-v3.json`.

This is strong evidence against an obvious side or seat bias. Easy bots choose random
legal actions, so the run is not evidence that competing human strategies are equally
strong.

## Human playtest questions

Do not change the marker values before collecting these observations:

1. Does grouping a Citation create an interesting split decision or simply make the
   split take longer?
2. Do players understand that Citation may reference a companion card even after that
   card has resolved?
3. Does Second Chair feel like a calculated partnership investment, or does giving the
   partner two markers feel like losing control?
4. Does all-Hard's remaining 42.6% side-tiebreak rate predict human convergence, or is
   it specific to deterministic bot heuristics?
5. Do Citation and Second Chair interact cleanly with all twelve Specialties in live
   play?

Re-run the fixed-seed suite after any deck-count, marker, Specialty, or scoring change.
Treat a material side skew, a broken Easy → Medium → Hard ladder, or a Closing side-flip
rate outside roughly 10–25% as a release blocker.
