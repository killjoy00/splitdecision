# Split Decision roadmap

The production game now satisfies the Milestone 0 reliability gate. The next work
should validate the human experience before expanding the rules or adding account
features.

## 1. Production playtest

Complete at least five full remote games across phone and desktop browsers. Cover:

- creating and joining by invite link and room code
- refreshing and recovering a private seat
- replacing a departed player with a bot
- host transfer, seat reopening, and rematch
- simultaneous splits and brief choices
- every Specialty timing, including powers used before scoring and after Closing reveal

Record confusion and interruptions as well as rules feedback. A technically complete
game can still be too difficult to learn or too slow to finish.

## 2. Product telemetry and diagnostics

Retain privacy-safe aggregate data for:

- completed and abandoned rooms
- game and phase duration
- reconnect and recovery attempts
- bot replacements and host transfers
- Specialty offers, selections, powers, bonuses, and winners
- Hearing margins, tiebreaks, and Closing side or firm changes

Do not store firm names, invite codes, recovery tokens, seeds, private choices, or
complete hidden game state.

## 3. Gameplay-differentiation experiments

Specialties reduced all-Medium side-tiebreak Hearings from 44.4% to 37.9%, but
all-Hard play still reaches 54.0%. Test the following variants one at a time behind
developer feature flags.

### Option 1 — Signature Argument

After briefs are assigned, each firm privately marks one of its three cards as its
Signature Argument. When that card resolves, reveal the choice and add one of that
firm's markers to the chosen Issue.

**Why test it:** the split leaves a lasting fingerprint because each firm's potential
signature depends on the cards it received. The choice also creates one predictable
moment of personal ambition inside the team contest.

**Primary risk:** a flat extra marker may make an already strong Lead card too efficient.
Compare a marker bonus with a narrower tiebreak-only benefit if necessary.

### Option 2 — Reframe token

Give each firm one Reframe token per game. When resolving a fixed Lead or Co-Counsel
card, spend the token to use the other action type; printed Issue eligibility does not
change.

**Why test it:** thirty of the thirty-six cards currently have a fixed action. Reframe
adds one high-leverage timing decision without replacing the deck or creating more
hidden setup information.

**Primary risk:** converting Lead to Co-Counsel could make the already efficient team
action even more common. Measure action mix and support scoring.

### Option 3 — Brief Doctrines

After making a split, the Divider labels one brief **Lead Strategy** and the other
**Team Strategy**. The first matching action from each brief gains a small capped
benefit: one extra personal marker for Lead Strategy or one extra Joint Work marker
for Team Strategy. The Chooser sees both labels before selecting.

**Why test it:** the Divider shapes not only which cards travel together but also the
incentive attached to each group, while the Chooser decides which posture to claim.

**Primary risk:** it adds another layer to the most analysis-heavy phase and may make
one brief obviously superior.

### Option 4 — Court Agenda

Reveal one public Agenda at the start of each round. It names a scheduled Issue and a
simple objective, such as the first Lead or first Co-Counsel action there receiving one
extra marker. Both sides compete under the same Agenda.

**Why test it:** a changing public incentive breaks repeated evaluation patterns without
adding private state. It also gives the current Docket and Hearing schedule a different
texture from game to game.

**Primary risk:** first-player timing may become more valuable. Track seat order and
whether the Agenda creates automatic plays.

### Option 5 — Card-specific precedent text

Give every Case-card title a small, one-line rule effect instead of treating titles as
flavor only. Effects should use a constrained vocabulary such as move one marker,
protect one marker from clearing, or count one marker for a specific tiebreak.

**Why test it:** this creates the largest difference between briefs and makes individual
card identities memorable.

**Primary risk:** thirty-six effects create substantial teaching, balance, interface,
and physical-component cost. Prototype six Focus-card effects before considering the
whole deck.

## Experiment order and success criteria

Start with **Signature Argument**, then test **Reframe** separately. They are the
smallest changes and address different causes of convergence: card assignment and
action rigidity.

For every variant, use the same simulation seeds and compare against current rules.
A promising change should:

- reduce all-Hard side-tiebreak Hearings materially below 54%
- keep all-Medium side-tiebreak Hearings below 40%
- keep Closing side changes between roughly 10% and 25%
- preserve a clear Easy → Medium → Hard performance ladder
- avoid increasing human turn time or rules confusion enough to offset the benefit

Do not combine variants until each one has an isolated result.

## 4. Usability and production hardening

After the first human playtests:

- revise static onboarding and rules language using observed confusion
- add a post-deployment live smoke test for the Pages client and Worker protocol
- add durable error monitoring and room-lifecycle metrics
- add API rate limits and abuse protection before opening play broadly
- improve keyboard and screen-reader coverage

## 5. Later product features

Defer accounts and progression until the game itself is stable. Later candidates are
match history, shareable verdicts, public replays with secrets revealed only at the
correct time, spectators, achievements, and asynchronous play.

