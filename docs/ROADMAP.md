# Split Decision roadmap

Milestone 0 is playable in local and remote modes. The immediate goal is to learn from
real games before adding another rules system.

## 1. Production playtest

Complete at least five full remote games across phone and desktop browsers. Include:

- creating and joining by invite link and room code
- refreshing and recovering a private seat
- replacing a departed player with a bot
- host transfer, seat reopening, and rematch
- simultaneous splits and brief choices
- at least one Citation and Second Chair resolution per game
- all Specialty timings, including pre-Hearing and post-Closing powers

Record total duration, round duration, rules questions, abandoned games, and moments
where a player felt forced into an obvious decision.

## 2. Evaluate Citation and Second Chair

The first card-type differentiation experiment is implemented and enabled:

- **Citation:** cite either companion card in the brief, choose one of its printed
  Issues, and add 2 acting-firm markers plus 1 Joint Work.
- **Second Chair:** choose a printed Issue and add 1 acting-firm marker, 2 partner
  markers, and 1 Joint Work.

Controlled bots reduced Medium side-tiebreak Hearings from 37.9% to 30.1% and Hard
from 54.0% to 42.6%. A 10,000-game sweep produced a 49.96% / 50.04% side split.
These pass the simulation gate; they do not pass the human-experience gate.

After five complete games, choose exactly one outcome:

1. keep both cards unchanged;
2. tune one marker recipe while keeping three copies of each;
3. change the three/three copy mix while preserving balanced Issue access; or
4. remove the card that creates confusion and restore its legacy cards.

Do not add a third new card type until that decision is made.

## 3. Privacy-safe telemetry and diagnostics

Retain aggregate data for:

- completed and abandoned rooms
- game, phase, split, and turn duration
- reconnect and recovery attempts
- bot replacements and host transfers
- action-type and Issue selection rates
- Citation target count and referenced companion position
- Specialty offers, selections, powers, bonuses, and winners
- Hearing margins, tiebreaks, and Closing side or firm changes

Do not store firm names, invite codes, recovery tokens, seeds, private choices, or full
hidden game state.

## 4. Usability and production hardening

Use observed playtest friction to:

- revise static onboarding and rules language
- clarify Citation choices if players miss the companion-card relationship
- add a post-deployment smoke test for both the Pages client and Worker protocol
- add durable error monitoring, room-lifecycle metrics, rate limits, and abuse controls
- improve keyboard and screen-reader coverage

## 5. Later product work

Only after the rules and remote flow are stable, consider match history, shareable
verdicts, public replays with correctly timed secret reveals, spectators, achievements,
asynchronous play, accounts, or progression.
