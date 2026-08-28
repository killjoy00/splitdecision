import { GAME_DATA } from '../data/gameData.js';
import { appendEvent } from './events.js';
import { createRandom, randomItem, shuffled } from './random.js';
import {
  PARTNER_BY_SEAT,
  SEATS_BY_SIDE,
  SIDE_BY_SEAT,
} from './selectors.js';
import {
  DEFAULT_RULES,
  ISSUE_IDS,
  SEAT_ORDER,
  SIDE_IDS,
  type BriefState,
  type CreateGameOptions,
  type DocketCardState,
  type GameState,
  type IssueId,
  type IssueState,
  type PlayerState,
  type SeatId,
  type SideId,
  type Slot,
} from './types.js';

function makeIssueState(): IssueState {
  return {
    firmMarkers: { P1: 0, D1: 0, P2: 0, D2: 0 },
    jointWork: { plaintiff: 0, defense: 0 },
    normalHearingsResolved: 0,
  };
}

function pairIssues(issues: IssueId[]): Array<[IssueId, IssueId]> {
  if (issues.length !== 6) throw new Error('Expected exactly six Issues');
  return [
    [issues[0] as IssueId, issues[1] as IssueId],
    [issues[2] as IssueId, issues[3] as IssueId],
    [issues[4] as IssueId, issues[5] as IssueId],
  ];
}

export function createBriefState(divider: SeatId, side: SideId): BriefState {
  const [first, second] = SEATS_BY_SIDE[side];
  return {
    divider,
    chooser: divider === first ? second : first,
    submittedSplit: null,
    chosenBriefIndex: null,
    assignments: {},
  };
}

export function revealNextDocket(state: GameState): void {
  const start = state.caseDeckIndex;
  const ids = state.caseDeck.slice(start, start + state.rules.docketSize);
  if (ids.length !== state.rules.docketSize) {
    throw new Error(`Expected ${state.rules.docketSize} Case cards, found ${ids.length}`);
  }

  state.docket = ids.map((cardId, index): DocketCardState => ({
    slot: (index + 1) as Slot,
    cardId,
    usedBy: { plaintiff: null, defense: null },
    chosenIssueBy: { plaintiff: null, defense: null },
    chosenActionBy: { plaintiff: null, defense: null },
  }));
  state.caseDeckIndex += ids.length;
  appendEvent(state, 'docket_revealed', { cardIds: ids });
}

export function createGame(options: CreateGameOptions): GameState {
  const rules = { ...DEFAULT_RULES, ...options.rules };
  if (rules.specialtiesEnabled) {
    throw new Error('The Specialty module is not enabled in the Milestone 0 scaffold');
  }
  if (rules.rounds !== 6 || rules.docketSize !== 6 || rules.briefSize !== 3) {
    throw new Error('Milestone 0 currently supports the locked 6-round, 6-card, 3/3 rules only');
  }

  const random = createRandom(options.seed);
  const firstCycle = pairIssues(shuffled(ISSUE_IDS, random));
  const hearingSchedule: Array<[IssueId, IssueId]> = [
    ...firstCycle,
    ...firstCycle.map(([left, right]): [IssueId, IssueId] => [left, right]),
  ];

  const closingDeck = shuffled(ISSUE_IDS, random);
  const closingBySeat = Object.fromEntries(
    SEAT_ORDER.map((seat, index) => [seat, closingDeck[index] as IssueId]),
  ) as Record<SeatId, IssueId>;

  const dividerBySide = Object.fromEntries(
    SIDE_IDS.map((side) => [side, randomItem(SEATS_BY_SIDE[side], random)]),
  ) as Record<SideId, SeatId>;

  const firstChairBySide = Object.fromEntries(
    SIDE_IDS.map((side) => {
      const divider = dividerBySide[side];
      return [side, PARTNER_BY_SEAT[divider]];
    }),
  ) as Record<SideId, SeatId>;

  const startingPlayer = randomItem(SEAT_ORDER, random);
  const startingSide = SIDE_BY_SEAT[startingPlayer];
  const courtFavor: SideId = startingSide === 'plaintiff' ? 'defense' : 'plaintiff';

  const players = Object.fromEntries(
    SEAT_ORDER.map((seat): [SeatId, PlayerState] => [
      seat,
      {
        seatId: seat,
        sideId: SIDE_BY_SEAT[seat],
        partnerSeatId: PARTNER_BY_SEAT[seat],
        controller: options.controllers?.[seat] ?? 'human',
        reputation: 0,
        leadCredits: [],
        closingArgumentIssue: closingBySeat[seat],
        specialtyId: null,
        specialtyUsed: false,
        specialtyRevealed: false,
      },
    ]),
  ) as Record<SeatId, PlayerState>;

  const issues = Object.fromEntries(
    ISSUE_IDS.map((issueId) => [issueId, makeIssueState()]),
  ) as Record<IssueId, IssueState>;

  const state: GameState = {
    recordTelemetry: options.recordTelemetry ?? true,
    schemaVersion: GAME_DATA.schemaVersion,
    seed: options.seed,
    rules,
    phase: 'round_split_commit',
    round: 1,
    players,
    issues,
    hearingSchedule,
    caseDeck: shuffled(GAME_DATA.caseCards.map((card) => card.id), random),
    caseDeckIndex: 0,
    docket: [],
    briefs: {
      plaintiff: createBriefState(dividerBySide.plaintiff, 'plaintiff'),
      defense: createBriefState(dividerBySide.defense, 'defense'),
    },
    dividerBySide,
    firstChairBySide,
    courtFavor,
    startingPlayer,
    activeSeat: null,
    actionsResolvedThisRound: 0,
    closingUndealt: closingDeck.slice(4),
    closingRevealed: [],
    hearingResults: [],
    provisionalVerdict: null,
    verdict: null,
    actionHistory: [],
    eventLog: [],
  };

  appendEvent(state, 'setup_complete', {
    seed: options.seed,
    hearingSchedule,
    startingPlayer,
    dividerBySide,
    firstChairBySide,
    courtFavor,
  });
  revealNextDocket(state);
  return state;
}
