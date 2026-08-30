# Gameplay differentiation analysis

## Reproducible run

```bash
npm run analyze:gameplay -- \
  --profile-games 300 \
  --matchup-games 300 \
  --hard-games 100 \
  --seed gameplay-analysis-v2
```

The profile rows use four bots at the same level. Matchups put two bots of one level on one side and two bots of the other level on the opposing side, alternating Plaintiff and Defense every game. The compact checked-in result is `docs/gameplay-analysis-v2.json`.

## Results

| Metric | Easy | Medium | Hard |
|---|---:|---:|---:|
| Plays on this round's scheduled Issues | 33.0% | 52.9% | 53.8% |
| Plays on the acting firm's Closing Issue | 16.8% | 23.3% | 25.6% |
| Post-Hearing plays on the known Closing Issue | 17.1% | 28.0% | 34.9% |
| Co-Counsel actions | 49.9% | 53.5% | 56.7% |
| Normal Hearings decided by a side tiebreak | 13.2% | 44.4% | 63.8% |
| Normal Hearings with a 0–1 marker margin | 29.7% | 59.4% | 71.8% |
| Normal Hearings with a 7+ marker margin | 19.8% | 1.8% | 0.2% |
| Average normal-Hearing margin | 3.78 | 1.63 | 1.03 |
| Closing changed the winning side | 12.3% | 17.0% | 17.0% |

| Matchup | Games | Higher-level wins |
|---|---:|---:|
| Medium vs Easy | 300 | 284 (94.7%) |
| Hard vs Medium | 100 | 73 (73.0%) |
| Hard vs Easy | 100 | 96 (96.0%) |

## What the simulation says

The engine has meaningful decisions. Medium's scheduled-Issue rate is 19.9 percentage points above Easy, and Hard is twice as likely as Easy to preserve late markers for its known Closing Argument. Those choices produce a clear difficulty ladder.

The larger problem is strategic convergence. As all four seats improve, side-tiebreak Hearings rise from 13.2% to 44.4% and then 63.8%, while blowouts almost disappear. Skilled bots see the same six cards, know the same two scheduled Issues, and each side ultimately plays every card. They therefore find similar placements even though the split determines which partner controls each card.

The deck reinforces that convergence: 30 of 36 cards have a fixed Lead or Co-Counsel action. Only the six Focus cards let their player choose the action mode. The data already contains 12 Specialties, but at the time of this baseline the engine intentionally disabled them.

Closing Arguments are doing useful work and should stay unchanged for the next experiment. Skilled bots target their own secret more often, and the Closing phase changes the winning side in 17% of Medium and Hard games.

## Follow-up: Specialties enabled

Recommendation 1 is now implemented. Re-running the identical command on the same
`gameplay-analysis-v2` seed with the Specialty module active produces
`docs/gameplay-analysis-v3.json`:

| Metric | Easy | Medium | Hard |
|---|---:|---:|---:|
| Plays on this round's scheduled Issues | 33.0% | 51.8% | 54.0% |
| Plays on the acting firm's Closing Issue | 16.9% | 23.2% | 25.3% |
| Post-Hearing plays on the known Closing Issue | 16.3% | 28.9% | 33.4% |
| Co-Counsel actions | 50.0% | 53.3% | 56.7% |
| Normal Hearings decided by a side tiebreak | 12.4% | 37.9% | 54.0% |
| Normal Hearings with a 0–1 marker margin | 28.0% | 56.4% | 67.3% |
| Average normal-Hearing margin | 3.96 | 1.78 | 1.32 |
| Closing changed the winning side | 12.3% | 16.7% | 21.0% |

Side-tiebreak rates against the pre-Specialty baseline:

| Profile | Before | After |
|---|---:|---:|
| All Easy | 13.2% | 12.4% |
| All Medium | 44.4% | **37.9%** |
| All Hard | 63.8% | **54.0%** |

This clears the target set in recommendation 4: the all-Medium side-tiebreak rate
is below 40%, and Closing side flips stay inside the 10–25% band (12.3% / 16.7% /
21.0%). Average Hearing margins widen at every skilled level, and blowouts stop
vanishing entirely.

Specialties are not a complete fix. All-Hard play still resolves more than half of
its Hearings on a tiebreak, so recommendations 2 and 3 remain open.

One trade-off is visible in the matchups:

| Matchup | Before | After |
|---|---:|---:|
| Medium vs Easy | 94.7% | 95.7% |
| Hard vs Medium | 73.0% | 64.0% |
| Hard vs Easy | 96.0% | 99.0% |

Hard's edge over Medium narrows because the secret two-card draft injects variance
that a stronger player cannot always convert. The Hard-versus-Easy and
Medium-versus-Easy gaps both widen, so the ladder still holds. Whether the Hard
versus Medium narrowing is acceptable is a design call: it is the cost of the
asymmetry that reduced the tie rate.

## Recommended experiments

1. **Finish and enable Specialties first.** *(Done — see the follow-up above.)* Persistent firm identities are the cleanest source of asymmetric priorities, and the 12 Specialty definitions already exist. Implement selection, timing windows, powers, and bonuses as one complete rules slice.
2. **Make the 3/3 split leave a lasting fingerprint.** At present the side plays all six cards regardless of the partition. Prototype one small brief-level benefit—for example, each firm privately selects one of its three received cards as its signature argument and gains a narrowly capped personal benefit when using it. This makes the split matter after assignment without changing which cards the side receives.
3. **Add one action-conversion resource per firm.** A once-per-game `Reframe` token that changes a fixed Lead card to Co-Counsel or vice versa would expand agency beyond the six Focus cards while keeping the deck intact.
4. **Test the changes separately before combining them.** Run current rules, Specialties only, Reframe only, and both. A good first target is to bring the all-Medium side-tiebreak rate below 40% without pushing Closing side flips outside roughly 10–25%.

Do not change marker totals or Hearing points first. The present test shows that skilled sides already keep margins extremely tight; changing only the numeric rewards is more likely to move the tie frequency than create genuinely different strategies.
