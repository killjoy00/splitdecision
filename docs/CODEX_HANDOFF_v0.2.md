# Closing Arguments Web Prototype — Codex Handoff v0.2

> This is the original design and implementation handoff. Its rules contracts remain
> useful source material, but its milestone plan, kickoff prompt, and statements about
> unbuilt features are historical. See `README.md`, `docs/ENGINE_STATUS.md`, and
> `docs/ROADMAP.md` for the current Split Decision implementation.

## 1. Purpose

Build a browser-based playtest implementation of **Closing Arguments**, a four-player strategy game about two pairs of co-counsel law firms. Each side must win legal Issues collectively, but only one firm wins the game.

The first product is a **debuggable local playtest tool**, not a commercial game client. Correct rules, deterministic replays, bot support, and useful telemetry matter more than animation or final art.

### Source of truth

Use these files together:

1. `Closing_Arguments_Rulebook_v0.2.docx` — human-readable rules.
2. `closing_arguments_game_data_v0.2.json` — canonical IDs and seed data.
3. This handoff — software behavior, architecture, tests, and milestones.

When this handoff and the rulebook differ, the rulebook controls game behavior; update the JSON and tests to match before coding further.

---

## 2. Product goals

- Play a complete four-seat game in a desktop browser.
- Configure each seat as Human, Easy Bot, or Standard Bot.
- Support all-bot games and fast automated runs.
- Preserve private Closing Argument and Specialty information.
- Make every legal choice explicit and inspectable.
- Produce a deterministic event log that can replay any game from its seed.
- Export playtest telemetry as JSON.
- Keep the rules engine independent from React so simulations can run headlessly.

## 3. Explicit non-goals for the first build

- Online multiplayer, accounts, matchmaking, or a server.
- Generative-AI chat or natural-language negotiation.
- Final illustration, animation, sound, or mobile polish.
- A learning bot trained from self-play.
- Rules variants not exposed behind a developer feature flag.

---

## 4. Locked v0.2 rules decisions

1. Exactly four players and two fixed sides: Plaintiff and Defense.
2. Six Issues: Witnesses, Evidence, Experts, Judge, Jury, and Case Law.
3. Six rounds; two Issues score per round.
4. The first three rounds hear every Issue once. Rounds 4-6 repeat the same Issue pairings in the same order, so every Issue returns exactly three rounds later.
5. Each round reveals six shared Case cards.
6. Each side independently divides the six card numbers into two briefs of three. Both Dividers submit secretly and reveal simultaneously.
7. Each partner chooses one brief; the Divider receives the other.
8. Every shared Case card is resolved once by Plaintiff and once by Defense. A side may choose a different printed Issue from the other side.
9. Dual-Issue Lead: choose one printed Issue; place 3 own markers.
10. Dual-Issue Co-Counsel: choose one printed Issue; place 2 own, 1 partner, and 1 Joint Work marker.
11. Focus: one printed Issue; choose Lead or Co-Counsel when played.
12. Normal Hearing scores 3 Reputation for Lead Firm and 2 for a participating ally.
13. First-cycle Issues clear after scoring. Second-cycle Issues remain and may receive more markers.
14. Each player secretly knows one unique Closing Argument Issue from setup. Four different Issues score at game end for 2/1.
15. Specialties are an advanced module: one secret one-time power plus a 2- or 3-point conditional bonus.
16. Verdict: compare the lower-scoring firm on each side. Higher floor wins the case. Higher-scoring firm on that side wins the game.
17. Marker quantities are physical prototype guidance, not game limits. The digital engine uses unbounded nonnegative counts.
18. If both sides have 0 strength in an Issue, the Issue awards no Reputation or Lead Credit and neither tiebreaker marker moves.
19. If the two finalist firms remain tied after Lead Credit tiebreakers, the firm holding that side's First Chair wins; the base game always produces one winner.

---

## 5. Canonical data

### Issue IDs

| ID | Display name |
|---|---|
| `witnesses` | Witnesses |
| `evidence` | Evidence |
| `experts` | Experts |
| `judge` | Judge |
| `jury` | Jury |
| `case_law` | Case Law |

### Dual-Issue Case cards

| Lead ID | Co-Counsel ID | Title | Eligible Issues |
|---|---|---|---|
| C01 | C02 | Corroboration | Witnesses / Evidence |
| C03 | C04 | Specialist Testimony | Witnesses / Experts |
| C05 | C06 | Witness Ruling | Witnesses / Judge |
| C07 | C08 | Compelling Testimony | Witnesses / Jury |
| C09 | C10 | Impeachment Rule | Witnesses / Case Law |
| C11 | C12 | Forensic Analysis | Evidence / Experts |
| C13 | C14 | Motion in Limine | Evidence / Judge |
| C15 | C16 | Demonstrative Exhibit | Evidence / Jury |
| C17 | C18 | Evidentiary Precedent | Evidence / Case Law |
| C19 | C20 | Expert Qualification | Experts / Judge |
| C21 | C22 | Explain the Science | Experts / Jury |
| C23 | C24 | Expert Standard | Experts / Case Law |
| C25 | C26 | Jury Instructions | Judge / Jury |
| C27 | C28 | Dispositive Motion | Judge / Case Law |
| C29 | C30 | Theory of the Case | Jury / Case Law |

### Focus cards

| ID | Title | Issue | Resolution |
|---|---|---|---|
| C31 | Key Witness | Witnesses | Choose Lead or Co-Counsel |
| C32 | Critical Exhibit | Evidence | Choose Lead or Co-Counsel |
| C33 | Decisive Expert | Experts | Choose Lead or Co-Counsel |
| C34 | Pivotal Ruling | Judge | Choose Lead or Co-Counsel |
| C35 | Persuasive Narrative | Jury | Choose Lead or Co-Counsel |
| C36 | Controlling Precedent | Case Law | Choose Lead or Co-Counsel |

### Specialty cards

| ID | Name | One-time power | Endgame bonus |
|---|---|---|---|
| `cross_examiner` | Cross-Examiner | Before Witnesses scores, place 1 of your Firm markers in Witnesses. | +3: Hold at least 2 Witnesses Lead Credits. |
| `evidence_specialist` | Evidence Specialist | Before Evidence scores, place 1 of your Firm markers in Evidence. | +3: Hold at least 2 Evidence Lead Credits. |
| `expert_coordinator` | Expert Coordinator | Before Experts scores, place 1 of your Firm markers in Experts. | +3: Hold at least 2 Experts Lead Credits. |
| `bench_advocate` | Bench Advocate | Before Judge scores, place 1 of your Firm markers in Judge. | +3: Hold at least 2 Judge Lead Credits. |
| `jury_advocate` | Jury Advocate | Before Jury scores, place 1 of your Firm markers in Jury. | +3: Hold at least 2 Jury Lead Credits. |
| `appellate_scholar` | Appellate Scholar | Before Case Law scores, place 1 of your Firm markers in Case Law. | +3: Hold at least 2 Case Law Lead Credits. |
| `trial_lawyer` | Trial Lawyer | When you resolve a Case card in Witnesses or Jury, place 1 additional Firm marker of your color in the chosen Issue. | +3: Hold at least 1 Witnesses and 1 Jury Lead Credit. |
| `technical_litigator` | Technical Litigator | When you resolve a Case card in Evidence or Experts, place 1 additional Firm marker of your color in the chosen Issue. | +3: Hold at least 1 Evidence and 1 Experts Lead Credit. |
| `motion_counsel` | Motion Counsel | When you resolve a Case card in Judge or Case Law, place 1 additional Firm marker of your color in the chosen Issue. | +3: Hold at least 1 Judge and 1 Case Law Lead Credit. |
| `generalist` | Generalist | When you resolve a Case card, choose any Issue instead of an eligible printed Issue. Resolve the same action type. On a Focus card, first choose Lead or Co-Counsel, then choose any Issue. | +2: Your Lead Credits show at least 3 different Issues. |
| `team_builder` | Team Builder | When you resolve Co-Counsel, place 1 additional Joint Work marker in that Issue. | +2: Both firms on your side have at least 17 Reputation before Specialty bonuses. |
| `closer` | Closer | After Closing Argument cards are revealed, move up to 2 of your Firm markers from unrevealed Issues to one revealed Issue. | +3: Hold at least 2 Closing Argument Lead Credits. |

---

## 6. Recommended technical shape

Use a TypeScript monorepo or a single Vite app with clearly separated packages/modules:

```text
closing-arguments/
  src/
    app/                 # React routes, screens, components
    engine/              # pure deterministic game rules
      actions.ts
      bots.ts
      createGame.ts
      legalActions.ts
      reducer.ts
      scoring.ts
      selectors.ts
      types.ts
      visibility.ts
    data/
      game-data.json
      loadData.ts
    telemetry/
      events.ts
      export.ts
      metrics.ts
    ui/
      board/
      docket/
      briefs/
      secrets/
      debug/
  tests/
    engine/
    fixtures/
    bots/
  scripts/
    simulate.ts
```

### Architectural rule

The React UI must never directly mutate game state. It requests legal actions from the engine and submits one action to a pure reducer:

```ts
const result = applyAction(state, action);
if (!result.ok) showRuleError(result.error);
else setState(result.state);
```

The same `applyAction` function must power humans, bots, tests, replay, and headless simulation.

---

## 7. Core TypeScript model

The exact names may change, but preserve these concepts.

```ts
export type IssueId =
  | 'witnesses'
  | 'evidence'
  | 'experts'
  | 'judge'
  | 'jury'
  | 'case_law';

export type SideId = 'plaintiff' | 'defense';
export type SeatId = 'P1' | 'D1' | 'P2' | 'D2';
export type BotLevel = 'human' | 'easy' | 'standard' | 'hard';
export type CaseActionType = 'lead' | 'co_counsel';

export interface PlayerState {
  seatId: SeatId;
  sideId: SideId;
  partnerSeatId: SeatId;
  controller: BotLevel;
  reputation: number;
  leadCredits: Array<{ issueId: IssueId; source: 'hearing' | 'closing' }>;
  closingArgumentIssue: IssueId;   // secret in opponent views
  specialtyId?: string;            // secret until revealed
  specialtyUsed: boolean;
}

export interface IssueState {
  firmMarkers: Record<SeatId, number>;
  jointWork: Record<SideId, number>;
  normalHearingsResolved: 0 | 1 | 2;
}

export interface DocketCardState {
  slot: 1 | 2 | 3 | 4 | 5 | 6;
  cardId: string;
  usedBy: Record<SideId, SeatId | null>;
  chosenIssueBy: Partial<Record<SideId, IssueId>>;
  chosenActionBy: Partial<Record<SideId, CaseActionType>>;
}

export interface BriefState {
  divider: SeatId;
  chooser: SeatId;
  submittedSplit?: [number[], number[]];
  chosenBriefIndex?: 0 | 1;
  assignments?: Record<SeatId, number[]>;
}
```

### Game phase

Use an explicit state machine. Avoid deriving phase from scattered booleans.

```ts
export type GamePhase =
  | 'setup'
  | 'setup_specialty_choice'
  | 'round_reveal'
  | 'round_split_commit'
  | 'round_split_reveal'
  | 'round_choose_commit'
  | 'round_choose_reveal'
  | 'round_argue'
  | 'round_hearing'
  | 'round_cleanup'
  | 'closing_reveal'
  | 'closing_power_window'
  | 'closing_scoring'
  | 'specialty_scoring'
  | 'verdict'
  | 'complete';
```

`round_hearing` also needs an index for the left/right Hearing. `closing_scoring` needs the ordered list of four revealed Issues and a current index. Commit phases must not expose the opposing side's submission through selectors, logs, or UI state until the matching reveal phase.

### Game actions

Use a discriminated union so legal-action enumeration, replay, bots, and the UI all submit the same objects.

```ts
export type GameAction =
  | { type: 'choose_specialty'; actor: SeatId; specialtyId: string }
  | { type: 'commit_split'; actor: SeatId; groups: [number[], number[]] }
  | { type: 'choose_brief'; actor: SeatId; briefIndex: 0 | 1 }
  | {
      type: 'play_docket_card';
      actor: SeatId;
      slot: 1 | 2 | 3 | 4 | 5 | 6;
      chosenIssue: IssueId;
      focusAction?: CaseActionType;
      useSpecialty?: boolean;
    }
  | { type: 'use_specialty'; actor: SeatId; payload?: unknown }
  | { type: 'pass_specialty_window'; actor: SeatId };
```

Automatic transitions such as revealing the Docket, scoring after all actions, marker clearing, and advancing the round should be emitted as engine events rather than forged as player actions.

---

## 8. Deterministic setup

`createGame(config, seed)` must use a seeded PRNG for every random choice.

1. Seat order is `P1, D1, P2, D2` clockwise.
2. Shuffle the six first-cycle Hearing Issues and place two in each of Rounds 1-3.
3. Copy those Issue pairings into Rounds 4-6 in the same order.
4. Shuffle the 36 Case cards.
5. Shuffle six Closing Argument cards and deal four without replacement, one per seat; two remain unseen.
6. If Specialties are on, deal two to each player without replacement; each human privately chooses one and each bot chooses one. For automated simulations, a bot may choose via its evaluator or randomly at Easy level.
7. Randomly choose one Divider per side. The allied firm begins with First Chair.
8. Randomly choose the Starting Player. Court's Favor begins with the opposite side.

Store the seed and the final setup decisions in the event log.

---

## 9. Round state machine

### 9.1 Reveal the Docket

Draw the next six cards from the shuffled deck. Assign slots 1-6. A card has two separate use states, one per side.

### 9.2 Submit splits

- There are exactly 10 distinct unlabeled 3/3 partitions of six slots.
- Each Divider submits a canonical split without seeing the opponent Divider's submission.
- Canonicalize the two groups so equivalent swaps are identical; for example, sort each group and order groups lexicographically.
- Reveal both splits only after both are submitted.

Reference split generator:

```ts
export function enumerateThreeThreeSplits(): Array<[number[], number[]]> {
  const slots = [1, 2, 3, 4, 5, 6];
  const results: Array<[number[], number[]]> = [];
  for (const combo of combinations(slots, 3)) {
    if (!combo.includes(1)) continue; // removes mirror duplicates
    const other = slots.filter(x => !combo.includes(x));
    results.push([combo, other]);
  }
  return results; // length 10
}
```

### 9.3 Choose briefs

Both Choosers select one of their side's two revealed briefs. Choices lock independently and reveal together. Assign the unchosen brief to the Divider.

### 9.4 Argue the Case

- Beginning with Starting Player, proceed clockwise.
- Continue for three full circuits.
- On a turn, the active player chooses one assigned, unused Docket slot.
- For a dual-Issue card, choose one eligible Issue.
- For a Focus card, its Issue is fixed and the player chooses Lead or Co-Counsel.
- Apply markers atomically and record the choice.
- The same slot remains available to the opposing side until that side resolves it.

### 9.5 Hearings

Score the left scheduled Issue, then the right.

For a side:

```ts
sideStrength = firmA + firmB + jointWork;
```

If both side totals are 0, the Issue is unresolved: award no Reputation or Lead Credit, do not move Court's Favor or First Chair, and proceed to the normal clear/retain step for that scoring cycle.

Tie between sides when the tied total is greater than 0:

1. More Joint Work in the Issue.
2. Court's Favor; then pass Court's Favor to the other side.

Within the winning side, Lead Firm is the firm with more personal markers. Joint Work never counts. Internal tie is broken by First Chair, which then passes to the allied firm.

Normal award:

- Lead Firm: +3 and a Lead Credit.
- Allied firm: +2 only if it has at least one personal marker in the Issue.
- Losing side: 0.

After first-cycle scoring, clear every marker in the Issue. After second-cycle scoring, leave all markers.

### 9.6 Cleanup

- Discard the six Docket cards.
- Return numbered tiles.
- Pass each side's Divider marker to the ally.
- Pass Starting Player clockwise.
- Advance the round or enter Closing Arguments after Round 6.

---

## 10. Closing Arguments

1. Reveal all four dealt Closing Argument Issues simultaneously. They are guaranteed unique.
2. Resolve powers with `after_closing_reveal` timing.
3. Score the four revealed Issues in board order: Witnesses, Evidence, Experts, Judge, Jury, Case Law.
4. Before each score, open a Specialty power window in clockwise order from the current Starting Player.
5. Use normal side and Lead Firm calculations.
6. Award 2 Reputation to Lead Firm and 1 to its participating ally.
7. Do not clear markers.
8. Reveal remaining Specialties and award earned bonuses.

The player who held a revealed Closing Argument card receives no automatic benefit from it. Card ownership only guaranteed that its Issue would score and gave that player private information during the game.

The two undealt Closing Argument cards remain set aside. Their Issue identities are inferable once the other four are revealed; a debug setting may expose the actual undealt card objects in the log.

### Specialty timing contract

- Every Specialty power is optional and may be used at most once per game.
- Reveal the Specialty when its power is used; using the power does not forfeit its endgame bonus.
- A power keyed to an Issue uses the **chosen Issue**, not merely an icon printed on a dual-Issue card.
- Before-Issue-scoring powers are legal during either normal Hearing or Closing Arguments for that Issue.
- In a scoring power window, act clockwise from the current Starting Player. Once a player passes, that player cannot act later in the same window.
- `Generalist` changes only location eligibility; it does not turn Lead into Co-Counsel or vice versa. On Focus, choose the action normally, then redirect the Issue.
- `Team Builder` adds one Joint Work after the normal Co-Counsel placement.
- `Closer` moves only its owner's markers, may draw them from one or more unrevealed Issues, and places all moved markers into one revealed Issue.
- Team Builder's 17/17 bonus is evaluated before any Specialty bonuses are added.

---

## 11. Verdict algorithm

```ts
function resolveVerdict(
  players: PlayerState[],
  courtFavor: SideId,
  firstChairBySide: Record<SideId, SeatId>,
) {
  const sides = groupBySide(players);
  const floor = {
    plaintiff: Math.min(...sides.plaintiff.map(p => p.reputation)),
    defense: Math.min(...sides.defense.map(p => p.reputation)),
  };

  let winningSide: SideId;
  if (floor.plaintiff !== floor.defense) {
    winningSide = floor.plaintiff > floor.defense ? 'plaintiff' : 'defense';
  } else {
    const totalP = sumRep(sides.plaintiff);
    const totalD = sumRep(sides.defense);
    winningSide = totalP !== totalD
      ? (totalP > totalD ? 'plaintiff' : 'defense')
      : courtFavor;
  }

  const finalists = sides[winningSide];
  // Firm tie: more Lead Credits, then more Closing Lead Credits, then First Chair.
  return resolveFirmWinner(finalists, firstChairBySide[winningSide]);
}
```

Return a structured explanation so the UI can show why the globally highest score may have been eliminated.

---

## 12. Visibility and secret information

Implement `getPlayerView(state, viewerSeatId)`.

A player may see:

- All public board state, scores, schedule, revealed Docket cards, revealed splits, assignments, and Lead Credits.
- Their own Closing Argument Issue and Specialty.
- Nothing about the other three secret cards except what has been publicly revealed by a power.

Bots must receive the same redacted view as a human in that seat. Never allow bot code to inspect canonical hidden state except through sampled hypotheses supplied by a rollout service.

For local pass-and-play, use a privacy gate before displaying a human's secret information or choice. Do not leave private cards visible on the main board.

---

## 13. UI requirements

### Setup screen

- Seat name and controller for P1, D1, P2, D2.
- Specialties toggle.
- Seed input with randomize button.
- Bot speed: Step / Normal / Instant.
- Developer options collapsed by default.

### Main board

- Six Issue panels visible at once.
- Each panel shows four personal marker counts and both sides' Joint Work.
- Clear labels for the two Issues scoring this round.
- Show whether an Issue has scored zero, one, or two normal Hearings.
- Reputation scores and side-floor values always visible.
- Docket row with six cards. Dual cards show two Issue chips and fixed action; Focus shows one Issue chip and both action icons.
- Each card shows Plaintiff-use and Defense-use status separately.
- Current player, circuit number, and remaining assigned cards.
- Expandable action log.

### Split screen

- Show all 10 legal 3/3 partitions as selectable options or allow drag-and-drop with validation.
- For the first version, the 10-option grid is easier to test and harder to break.
- Divider submits behind a privacy screen; opponent split remains hidden until both submit.

### Choose screen

- Show the two briefs with full card information.
- Chooser selects one; do not show the opposing chooser's decision until both lock.

### Action screen

- Select assigned card.
- Select eligible Issue if dual.
- Select Lead/Co-Counsel if Focus.
- Preview exact marker change before confirm.

### Hearing and Closing screens

- Animate only with simple count changes for MVP.
- Display side totals, Joint Work tiebreak, Lead Firm calculation, points, and any marker clearing.
- Closing reveal should clearly show the four scoring Issues and the two non-scoring Issues.

### Verdict screen

Show:

1. Final four scores.
2. Each side's lower score.
3. Winning side and tiebreak path if relevant.
4. Winning firm within that side.
5. A note when the table's highest-scoring firm was eliminated by its partner's floor.
6. Export log and replay buttons.

---

## 14. Bot design

### Easy Bot

- Random legal split.
- Random legal brief choice.
- Random assigned card and legal resolution.
- Random legal Specialty use with a modest preference for immediate value.

Purpose: exercise all flows, not play well.

### Standard Bot

Use a transparent heuristic. It should understand that maximizing its own Reputation alone is not enough.

Suggested evaluation features:

- `scheduledSideWinDelta`: change in projected probability that its side wins each current Hearing.
- `ownLeadDelta`: change in chance it becomes Lead Firm.
- `partnerParticipationDelta`: whether ally gains at least one marker and can receive 2/1.
- `sideFloorHealth`: projected difference between its side's lower score and opponent floor.
- `ownCeiling`: own score relative to partner, but only after floor risk is acceptable.
- `knownClosingValue`: investment in its secret Closing Argument Issue.
- `futureScheduleValue`: investment in an Issue's next known Hearing.
- `specialtyProgress`: estimated completion and power value.
- `overinvestmentPenalty`: markers beyond what is likely needed to win or lead.
- `opponentDenial`: reducing the opposing side's likely score.

A practical action score:

```text
+ 8.0 * side-win improvement on current Hearings
+ 5.0 * projected Reputation gained by this player
+ 3.5 * projected Reputation gained by ally when ally is the side floor
+ 2.5 * known Closing Argument value
+ 1.5 * Specialty progress
- 4.0 * risk that ally becomes the final winner when side floor is already safe
- 2.0 * overinvestment
```

These weights are starting values and must live in configuration, not hard-coded throughout the bot.

### Split evaluation

For each of the 10 splits:

1. Estimate which brief the partner will choose using a public-information partner model.
2. Evaluate the expected retained brief.
3. Evaluate side coverage across the two current Hearings.
4. Penalize starving the allied floor.
5. Sample plausible partner secrets rather than reading them.
6. Pick the highest expected personal win probability, not simply highest immediate points.

### Hard Bot — later milestone

Add Monte Carlo rollouts from redacted information sets. Sample unknown Closing Argument and Specialty assignments consistent with visible information. Hard Bot is not required for the first playable build.

---

## 15. Telemetry and replay

Every action should append an immutable event. Prefer JSONL-compatible objects.

```ts
interface GameEvent {
  index: number;
  seed: string;
  phase: GamePhase;
  round?: number;
  actor?: SeatId;
  type: string;
  payload: unknown;
  publicStateHash: string;
}
```

Log at minimum:

- setup assignments and seed;
- Docket reveal;
- each submitted split and chosen brief;
- every card resolution, chosen Issue, chosen action, and marker delta;
- Specialty use and reveal;
- Hearing totals, tiebreaks, Lead Firm, awards, and clearing;
- Closing Argument reveal and scores;
- bonus completion;
- side-floor and winner calculations.

### Derived metrics

- Divider versus Chooser win rate.
- Starting-seat and side win rate.
- Split decision time.
- Brief-choice decision time.
- Lead versus Co-Counsel use rate.
- Focus action choice rate.
- Side-tie and internal-tie frequency.
- Partner score gap after each round.
- Frequency that the highest-scoring player is eliminated.
- How often Closing Arguments changes the winning side or winning firm.
- Closing performance by the round in which that Issue had its second Hearing.
- Specialty completion and win rate by card.
- Frequency of placements into Issues after their second Hearing.
- Frequency that the final Docket composition is effectively predictable.

---

## 16. Rules-engine invariants

Enforce these after every reducer action in development builds:

1. Each side has exactly two players and every player has one partner.
2. Every round has six Docket cards and each side uses each slot exactly once.
3. Every player receives exactly three slots per round.
4. A split contains two disjoint groups of three covering 1-6.
5. A dual-Issue play uses exactly one printed Issue unless Generalist is used.
6. A Focus play uses its printed Issue unless Generalist is used.
7. Lead adds exactly 3 own markers.
8. Co-Counsel adds exactly 2 own, 1 partner, and 1 Joint Work.
9. Joint Work never contributes to Lead Firm.
10. A 0-0 Issue awards nothing and moves no tiebreaker marker.
11. An ally with zero personal markers receives no support Reputation.
12. First-cycle scoring clears only the scored Issue.
13. Second-cycle and Closing scoring never clear markers.
14. Exactly four unique Closing Argument Issues score.
15. Specialty powers can be used at most once.
16. Reputation and marker counts are never negative.
17. The 36-card deck is empty after Round 6.
18. Event replay from seed and actions produces the same final state hash.

---

## 17. Required automated tests

### Setup

- Mirrored Hearing schedule: R4=R1, R5=R2, R6=R3 by Issue pair and order.
- Four Closing Argument cards are unique; two remain undealt.
- All 36 Case cards appear exactly once in six Dockets.
- `enumerateThreeThreeSplits()` returns exactly 10 unique partitions.

### Case-card resolution

- Plaintiff may use Corroboration in Witnesses while Defense uses it in Evidence.
- Lead places 3 own markers and nothing else.
- Co-Counsel places 2 own, 1 partner, 1 Joint Work.
- Focus can choose either action but cannot change Issue without Generalist.
- A used slot remains usable by the opposing side.

### Hearing scoring

- Higher combined side wins.
- A 0-0 Issue awards nothing, claims no credit, and moves neither tiebreaker marker.
- Joint Work breaks a side tie.
- Court's Favor breaks a remaining side tie and passes.
- Higher personal contribution determines Lead Firm.
- First Chair breaks an internal tie and passes.
- Participating ally receives 2; absent ally receives 0.
- Losing side receives 0.
- First-cycle clear and second-cycle retain behavior.

### Closing and verdict

- Four revealed Issues score 2/1 in board order.
- Lower score comparison selects side.
- Combined Reputation breaks a tied floor.
- Court's Favor breaks a remaining side tie.
- Firm Lead Credits and Closing Lead Credits resolve internal ties.
- First Chair resolves a remaining finalist-firm tie and guarantees one winner.
- Highest table score can legally lose because its side is eliminated.

### Specialties

- Each power can be used at most once and remains bonus-eligible afterward.
- Trial Lawyer, Technical Litigator, and Motion Counsel trigger from the chosen Issue on a dual-Issue card.
- Generalist preserves the card's action type and may redirect Focus after its action is chosen.
- Team Builder adds exactly one Joint Work and no personal marker.
- Closer moves only its owner's markers from unrevealed Issues to one revealed Issue.
- Team Builder's 17/17 condition is checked before any Specialty bonus is added.

### Visibility

- A player view exposes only that player's secrets.
- An unfinished split and an unrevealed brief choice are visible only to the submitting seat and the canonical engine.
- Bot input is redacted identically.
- Exported public replay can omit secret data until reveal; full debug export may include it behind an explicit flag.
- Physical marker counts never make an otherwise legal digital action illegal.

---

## 18. Developer feature flags

Keep these centralized so playtests can compare variants without rewriting rules:

```ts
interface RulesConfig {
  normalLeadPoints: number;              // default 3
  normalPartnerPoints: number;           // default 2
  closingLeadPoints: number;             // default 2
  closingPartnerPoints: number;          // default 1
  leadOwnMarkers: number;                // default 3
  coCounselOwnMarkers: number;           // default 2
  coCounselPartnerMarkers: number;       // default 1
  coCounselJointWork: number;             // default 1
  specialtiesEnabled: boolean;           // default true
  allowPlacementAfterSecondHearing: boolean; // default true
  hearingScheduleMode: 'mirrored' | 'independent'; // default mirrored
  splitVisibility: 'simultaneous_reveal' | 'public_sequential';
  caseCardTitlesHaveRulesEffect: boolean; // default false
  markerSupplyLimited: boolean;           // default false
  uncontestedIssueRule: 'no_award' | 'use_tiebreakers'; // default no_award
  finalFirmTieBreaker: 'first_chair' | 'shared';         // default first_chair
}
```

Do not expose all flags in the normal setup screen; place experimental flags in a developer drawer and include them in exports.

---

## 19. Design review and playtest risks

The following are not reasons to delay the MVP. They are the questions the app should help answer.

### A. Co-Counsel may be too efficient

It supplies 4 side strength, seeds the ally for support points, and protects the team floor. Its personal-credit cost may or may not be sufficient. Measure use rate and win correlation. Keep marker values configurable.

### B. Closing timing may favor Issues heard in Round 4

Players can continue adding markers after the second Hearing, so an Issue heard in Round 4 has two extra rounds of possible investment while a Round 6 Issue has none. The mirrored schedule removes unequal time *between* normal Hearings but does not remove this endgame timing difference. Measure Closing win rate and marker growth by second-Hearing round. A later variant may freeze Issues after their second Hearing or allow one universal Closing placement phase.

### C. Reactive turn order may matter

The last player in each action circuit sees more information. Starting Player rotates, but six rounds do not give all four seats the same number of starts. Measure seat advantage. A possible variant is alternating clockwise/counterclockwise circuits or simultaneous card selection.

### D. Specialty bonuses may be too swingy

A 3-point Specialty is comparable to a full normal Lead award and can change both the side floor and internal winner. Specialties must be toggleable, and reports should show outcomes before and after bonuses.

### E. Full-deck use creates late-game card counting

All 36 cards appear every game, so experienced players can infer the last Docket. This may be satisfying control or unwanted calculation. Track whether decisions slow in Rounds 5-6. A possible later deck is 42 cards with six unused.

### F. Six-card splitting could create analysis paralysis

There are only 10 legal partitions, which is a strong starting point, but board and secret-state valuation may still slow Dividers. Log time. The UI should show all 10 partitions and allow quick comparison rather than unrestricted drag-and-drop first.

### G. Tie markers may be more procedure than value

Court's Favor and First Chair make ties deterministic and self-balancing, but add two exception systems. Track how often each is used. If rare, replace them with a single alternating initiative marker in a later rules pass.

### H. The team-floor victory rule should be explained continuously

Display each side's current floor alongside individual scores. Bots and players need to see immediately why feeding an ally may improve their own chance to win.

### I. The physical marker footprint may be too large

The web app should use unbounded numeric counts, but the paper prototype can accumulate more markers than its nominal supply in extreme games. Record peak per-firm and per-side Joint Work counts. A publishable physical version may need 5-value markers, stackable chips, or per-Issue count dials rather than hundreds of cubes.

---

## 20. Milestones

### Milestone 0 — Data and engine

- Import canonical JSON.
- Seeded setup.
- Pure reducer and legal-action generator.
- Complete scoring, clearing, Closing Arguments, Specialties, verdict.
- Unit tests and deterministic replay.
- Headless random-bot simulation script.

**Exit:** 10,000 random legal games complete without invariant failure.

### Milestone 1 — Debug play UI

- Four human seats on one desktop browser.
- Privacy gates for splits, choices, and secrets.
- Functional board, Docket, scoring panels, and action log.
- Save/load local game and export JSON.

**Exit:** a complete game can be played without console intervention.

### Milestone 2 — Bots and analysis

- Easy and Standard bots.
- Mixed human/bot seats.
- Step and instant bot speed.
- Batch simulation page or CLI.
- Metrics summary and CSV/JSON export.

**Exit:** all-bot games run deterministically and Standard beats Easy materially above 50% over a large sample while obeying secret information.

### Milestone 3 — Usability polish

- Guided tutorial overlays.
- Responsive layout.
- Better card visuals and verdict presentation.
- Undo constrained to the current private choice in non-competitive local testing.

---

## 21. Acceptance criteria for the first Codex implementation

The first pull request should implement **Milestone 0 only**, plus a minimal CLI or test harness. It is complete when:

- `npm test` passes all rule tests.
- `npm run simulate -- --games 1000 --seed demo` completes with no illegal state.
- The same seed produces byte-equivalent public event logs.
- Every action in the event log can replay to the same final hash.
- The output summarizes winners, side-floor scores, Lead/Co-Counsel rate, tie rate, and Closing swing rate.
- No React code is required in this first PR unless needed for repository scaffolding.

### Copy-paste kickoff prompt for Codex

> Read `Closing_Arguments_Codex_Handoff_v0.2.md`, `Closing_Arguments_Rulebook_v0.2.docx`, and `closing_arguments_game_data_v0.2.json`. Treat the rulebook as the rules authority and the JSON as canonical IDs. Implement Milestone 0 only: a pure TypeScript rules engine, seeded setup, legal-action enumeration, reducer, visibility filtering, deterministic event replay, Easy random bots for simulation, and the required unit tests. Do not build polished UI, online multiplayer, or generative chat. Keep all balance numbers in a central `RulesConfig`. Run at least 10,000 random legal games with invariants enabled and include the aggregate report in the PR description.
