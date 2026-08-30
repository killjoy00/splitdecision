import { GAME_DATA } from '../data/gameData.js';
import { chooseBotAction, type AutomatedBotLevel } from './bots.js';
import { createGame } from './createGame.js';
import { getPendingActors } from './legalActions.js';
import { createRandom } from './random.js';
import { applyAction } from './reducer.js';
import { SIDE_BY_SEAT } from './selectors.js';
import { hashPublicGameState } from './stateHash.js';
import {
  SEAT_ORDER,
  type GameState,
  type IssueId,
  type SeatId,
  type SideId,
} from './types.js';

export type BotControllers = Record<SeatId, AutomatedBotLevel>;

export interface SpecialtyTelemetry {
  offered: number;
  selected: number;
  used: number;
  bonusEarned: number;
  wins: number;
}

export type SpecialtyTelemetryById = Record<string, SpecialtyTelemetry>;

export interface BotGameSummary {
  seed: string;
  winner: SeatId;
  winningSide: SideId;
  scores: Record<SeatId, number>;
  actions: number;
  leadActions: number;
  coCounselActions: number;
  citationActions: number;
  secondChairActions: number;
  scheduledIssueActions: number;
  knownClosingActions: number;
  postHearingActions: number;
  postHearingClosingActions: number;
  sideTies: number;
  internalTies: number;
  supportScores: number;
  scoredHearings: number;
  closeHearings: number;
  blowoutHearings: number;
  totalSideMargin: number;
  scoreRange: number;
  highestScoreEliminated: boolean;
  closingChangedSide: boolean;
  closingChangedFirm: boolean;
  specialtyMetrics: SpecialtyTelemetryById;
}

export type RandomGameSummary = BotGameSummary;

export interface GameplayMetrics {
  leadRate: number;
  coCounselRate: number;
  citationRate: number;
  secondChairRate: number;
  scheduledIssueRate: number;
  knownClosingRate: number;
  postHearingClosingRate: number;
  sideTieRate: number;
  internalTieRate: number;
  supportScoreRate: number;
  closeHearingRate: number;
  blowoutHearingRate: number;
  averageSideMargin: number;
  averageScoreRange: number;
  highestScoreEliminatedRate: number;
  closingChangedSideRate: number;
  closingChangedFirmRate: number;
}

export interface SimulationSummary extends GameplayMetrics {
  games: number;
  seedPrefix: string;
  controllers: BotControllers;
  firmWins: Record<SeatId, number>;
  sideWins: Record<SideId, number>;
  specialtyMetrics: SpecialtyTelemetryById;
}

export interface MatchupSummary extends GameplayMetrics {
  games: number;
  seedPrefix: string;
  challenger: AutomatedBotLevel;
  opponent: AutomatedBotLevel;
  challengerWins: number;
  opponentWins: number;
  challengerWinRate: number;
  challengerPlaintiffGames: number;
  challengerDefenseGames: number;
  specialtyMetrics: SpecialtyTelemetryById;
}

interface AggregateCounters {
  leadActions: number;
  coCounselActions: number;
  citationActions: number;
  secondChairActions: number;
  scheduledIssueActions: number;
  knownClosingActions: number;
  postHearingActions: number;
  postHearingClosingActions: number;
  sideTies: number;
  internalTies: number;
  supportScores: number;
  scoredHearings: number;
  closeHearings: number;
  blowoutHearings: number;
  totalSideMargin: number;
  totalScoreRange: number;
  highestScoreEliminated: number;
  closingChangedSide: number;
  closingChangedFirm: number;
  specialtyMetrics: SpecialtyTelemetryById;
}

function emptySpecialtyMetrics(): SpecialtyTelemetryById {
  return Object.fromEntries(GAME_DATA.specialties.map((specialty) => [
    specialty.id,
    { offered: 0, selected: 0, used: 0, bonusEarned: 0, wins: 0 },
  ]));
}

function emptyCounters(): AggregateCounters {
  return {
    leadActions: 0,
    coCounselActions: 0,
    citationActions: 0,
    secondChairActions: 0,
    scheduledIssueActions: 0,
    knownClosingActions: 0,
    postHearingActions: 0,
    postHearingClosingActions: 0,
    sideTies: 0,
    internalTies: 0,
    supportScores: 0,
    scoredHearings: 0,
    closeHearings: 0,
    blowoutHearings: 0,
    totalSideMargin: 0,
    totalScoreRange: 0,
    highestScoreEliminated: 0,
    closingChangedSide: 0,
    closingChangedFirm: 0,
    specialtyMetrics: emptySpecialtyMetrics(),
  };
}

function addGame(counters: AggregateCounters, game: BotGameSummary): void {
  counters.leadActions += game.leadActions;
  counters.coCounselActions += game.coCounselActions;
  counters.citationActions += game.citationActions;
  counters.secondChairActions += game.secondChairActions;
  counters.scheduledIssueActions += game.scheduledIssueActions;
  counters.knownClosingActions += game.knownClosingActions;
  counters.postHearingActions += game.postHearingActions;
  counters.postHearingClosingActions += game.postHearingClosingActions;
  counters.sideTies += game.sideTies;
  counters.internalTies += game.internalTies;
  counters.supportScores += game.supportScores;
  counters.scoredHearings += game.scoredHearings;
  counters.closeHearings += game.closeHearings;
  counters.blowoutHearings += game.blowoutHearings;
  counters.totalSideMargin += game.totalSideMargin;
  counters.totalScoreRange += game.scoreRange;
  if (game.highestScoreEliminated) counters.highestScoreEliminated += 1;
  if (game.closingChangedSide) counters.closingChangedSide += 1;
  if (game.closingChangedFirm) counters.closingChangedFirm += 1;
  for (const [specialtyId, values] of Object.entries(game.specialtyMetrics)) {
    const target = counters.specialtyMetrics[specialtyId];
    if (!target) continue;
    target.offered += values.offered;
    target.selected += values.selected;
    target.used += values.used;
    target.bonusEarned += values.bonusEarned;
    target.wins += values.wins;
  }
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function metrics(counters: AggregateCounters, games: number): GameplayMetrics {
  const totalCardActions = counters.leadActions
    + counters.coCounselActions
    + counters.citationActions
    + counters.secondChairActions;
  return {
    leadRate: rate(counters.leadActions, totalCardActions),
    coCounselRate: rate(counters.coCounselActions, totalCardActions),
    citationRate: rate(counters.citationActions, totalCardActions),
    secondChairRate: rate(counters.secondChairActions, totalCardActions),
    scheduledIssueRate: rate(counters.scheduledIssueActions, totalCardActions),
    knownClosingRate: rate(counters.knownClosingActions, totalCardActions),
    postHearingClosingRate: rate(counters.postHearingClosingActions, counters.postHearingActions),
    sideTieRate: rate(counters.sideTies, counters.scoredHearings),
    internalTieRate: rate(counters.internalTies, counters.scoredHearings),
    supportScoreRate: rate(counters.supportScores, counters.scoredHearings),
    closeHearingRate: rate(counters.closeHearings, counters.scoredHearings),
    blowoutHearingRate: rate(counters.blowoutHearings, counters.scoredHearings),
    averageSideMargin: rate(counters.totalSideMargin, counters.scoredHearings),
    averageScoreRange: rate(counters.totalScoreRange, games),
    highestScoreEliminatedRate: rate(counters.highestScoreEliminated, games),
    closingChangedSideRate: rate(counters.closingChangedSide, games),
    closingChangedFirmRate: rate(counters.closingChangedFirm, games),
  };
}

function assertAutomatedControllers(controllers: BotControllers): void {
  for (const seat of SEAT_ORDER) {
    const level = controllers[seat];
    if (level !== 'easy' && level !== 'medium' && level !== 'hard') {
      throw new Error(`Simulation controller for ${seat} must be easy, medium, or hard`);
    }
  }
}

export function runBotGame(seed: string, controllers: BotControllers): BotGameSummary {
  assertAutomatedControllers(controllers);
  let state = createGame({ seed, controllers, recordTelemetry: false });
  let guard = 0;
  let actionCount = 0;
  let leadActions = 0;
  let coCounselActions = 0;
  let citationActions = 0;
  let secondChairActions = 0;
  let scheduledIssueActions = 0;
  let knownClosingActions = 0;
  let postHearingActions = 0;
  let postHearingClosingActions = 0;

  while (state.phase !== 'complete') {
    guard += 1;
    if (guard > 500) throw new Error(`Simulation ${seed} exceeded action guard`);
    const actors = getPendingActors(state);
    if (actors.length === 0) throw new Error(`No pending actors in phase ${state.phase}`);
    const actor = actors[0] as SeatId;
    const level = controllers[actor];
    const action = chooseBotAction(
      state,
      actor,
      level,
      createRandom(`simulation-bot:${hashPublicGameState(state)}:${actor}`),
    );
    actionCount += 1;
    if (action.type === 'play_docket_card') {
      const docketCard = state.docket.find((entry) => entry.slot === action.slot);
      const card = GAME_DATA.caseCards.find((entry) => entry.id === docketCard?.cardId);
      const actionType = action.focusAction ?? card?.action;
      if (actionType === 'lead') leadActions += 1;
      else if (actionType === 'co_counsel') coCounselActions += 1;
      else if (actionType === 'citation') citationActions += 1;
      else if (actionType === 'second_chair') secondChairActions += 1;
      else throw new Error(`Unable to classify Case action in slot ${action.slot}`);

      const currentHearings: readonly IssueId[] = state.hearingSchedule[state.round - 1] ?? [];
      if (currentHearings.includes(action.chosenIssue)) scheduledIssueActions += 1;
      if (action.chosenIssue === state.players[actor].closingArgumentIssue) knownClosingActions += 1;
      if (state.issues[action.chosenIssue].normalHearingsResolved >= 2) {
        postHearingActions += 1;
        if (action.chosenIssue === state.players[actor].closingArgumentIssue) {
          postHearingClosingActions += 1;
        }
      }
    }
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${seed}: ${result.error.code}: ${result.error.message}`);
    state = result.state;
  }

  if (!state.verdict) throw new Error(`Simulation ${seed} completed without a verdict`);
  const scores = Object.fromEntries(
    SEAT_ORDER.map((seat) => [seat, state.players[seat].reputation]),
  ) as Record<SeatId, number>;
  const maxScore = Math.max(...Object.values(scores));
  const minScore = Math.min(...Object.values(scores));
  const highestSeats = SEAT_ORDER.filter((seat) => scores[seat] === maxScore);
  const highestScoreEliminated = highestSeats.every(
    (seat) => state.players[seat].sideId !== state.verdict?.winningSide,
  );

  const scoredHearings = state.hearingResults.filter((result) => result.source === 'hearing');
  const sideTies = scoredHearings.filter(
    (result) => result.sideTieBreaker === 'joint_work' || result.sideTieBreaker === 'courts_favor',
  ).length;
  const internalTies = scoredHearings.filter(
    (result) => result.leadTieBreaker === 'first_chair',
  ).length;
  const supportScores = scoredHearings.filter((result) => result.supportFirm
    && result.pointsAwarded[result.supportFirm] !== undefined).length;
  const margins = scoredHearings.map(
    (result) => Math.abs(result.sideStrength.plaintiff - result.sideStrength.defense),
  );
  const provisional = state.provisionalVerdict ?? state.verdict;
  const specialtyMetrics = emptySpecialtyMetrics();
  for (const seat of SEAT_ORDER) {
    for (const specialtyId of state.players[seat].specialtyOptions) {
      const metric = specialtyMetrics[specialtyId];
      if (metric) metric.offered += 1;
    }
    const specialtyId = state.players[seat].specialtyId;
    if (!specialtyId) continue;
    const metric = specialtyMetrics[specialtyId];
    if (!metric) continue;
    metric.selected += 1;
    if (state.players[seat].specialtyUsed) metric.used += 1;
    if (state.specialtyBonuses.some((bonus) => bonus.seatId === seat && bonus.earned)) {
      metric.bonusEarned += 1;
    }
    if (state.verdict.winningFirm === seat) metric.wins += 1;
  }

  return {
    seed,
    winner: state.verdict.winningFirm,
    winningSide: state.verdict.winningSide,
    scores,
    actions: actionCount,
    leadActions,
    coCounselActions,
    citationActions,
    secondChairActions,
    scheduledIssueActions,
    knownClosingActions,
    postHearingActions,
    postHearingClosingActions,
    sideTies,
    internalTies,
    supportScores,
    scoredHearings: scoredHearings.length,
    closeHearings: margins.filter((margin) => margin <= 1).length,
    blowoutHearings: margins.filter((margin) => margin >= 7).length,
    totalSideMargin: margins.reduce((total, margin) => total + margin, 0),
    scoreRange: maxScore - minScore,
    highestScoreEliminated,
    closingChangedSide: provisional.winningSide !== state.verdict.winningSide,
    closingChangedFirm: provisional.winningFirm !== state.verdict.winningFirm,
    specialtyMetrics,
  };
}

export function runRandomGame(seed: string): RandomGameSummary {
  return runBotGame(seed, { P1: 'easy', D1: 'easy', P2: 'easy', D2: 'easy' });
}

export function simulateBotGames(
  games: number,
  controllers: BotControllers,
  seedPrefix = 'simulation',
): SimulationSummary {
  if (!Number.isInteger(games) || games <= 0) throw new Error('games must be a positive integer');
  assertAutomatedControllers(controllers);
  const firmWins: Record<SeatId, number> = { P1: 0, D1: 0, P2: 0, D2: 0 };
  const sideWins: Record<SideId, number> = { plaintiff: 0, defense: 0 };
  const counters = emptyCounters();

  for (let index = 0; index < games; index += 1) {
    const result = runBotGame(`${seedPrefix}:${index}`, controllers);
    firmWins[result.winner] += 1;
    sideWins[result.winningSide] += 1;
    addGame(counters, result);
  }

  return {
    games,
    seedPrefix,
    controllers,
    firmWins,
    sideWins,
    specialtyMetrics: counters.specialtyMetrics,
    ...metrics(counters, games),
  };
}

export function simulateGames(games: number, seedPrefix = 'simulation'): SimulationSummary {
  return simulateBotGames(
    games,
    { P1: 'easy', D1: 'easy', P2: 'easy', D2: 'easy' },
    seedPrefix,
  );
}

export function simulateMatchup(
  games: number,
  challenger: AutomatedBotLevel,
  opponent: AutomatedBotLevel,
  seedPrefix = `${challenger}-vs-${opponent}`,
): MatchupSummary {
  if (!Number.isInteger(games) || games <= 0) throw new Error('games must be a positive integer');
  let challengerWins = 0;
  const counters = emptyCounters();
  let challengerPlaintiffGames = 0;
  let challengerDefenseGames = 0;

  for (let index = 0; index < games; index += 1) {
    const challengerSide: SideId = index % 2 === 0 ? 'plaintiff' : 'defense';
    if (challengerSide === 'plaintiff') challengerPlaintiffGames += 1;
    else challengerDefenseGames += 1;
    const controllers = Object.fromEntries(SEAT_ORDER.map((seat) => [
      seat,
      SIDE_BY_SEAT[seat] === challengerSide ? challenger : opponent,
    ])) as BotControllers;
    const result = runBotGame(`${seedPrefix}:${index}`, controllers);
    if (result.winningSide === challengerSide) challengerWins += 1;
    addGame(counters, result);
  }

  return {
    games,
    seedPrefix,
    challenger,
    opponent,
    challengerWins,
    opponentWins: games - challengerWins,
    challengerWinRate: challengerWins / games,
    challengerPlaintiffGames,
    challengerDefenseGames,
    specialtyMetrics: counters.specialtyMetrics,
    ...metrics(counters, games),
  };
}
