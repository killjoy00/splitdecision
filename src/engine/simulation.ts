import { GAME_DATA } from '../data/gameData.js';
import { chooseEasyAction } from './bots.js';
import { createGame } from './createGame.js';
import { getPendingActors } from './legalActions.js';
import { createRandom } from './random.js';
import { applyAction } from './reducer.js';
import { SEAT_ORDER, type SeatId, type SideId, type VerdictResult } from './types.js';

export interface RandomGameSummary {
  seed: string;
  winner: SeatId;
  winningSide: SideId;
  scores: Record<SeatId, number>;
  actions: number;
  leadActions: number;
  coCounselActions: number;
  sideTies: number;
  internalTies: number;
  highestScoreEliminated: boolean;
  closingChangedSide: boolean;
  closingChangedFirm: boolean;
}

export interface SimulationSummary {
  games: number;
  seedPrefix: string;
  firmWins: Record<SeatId, number>;
  sideWins: Record<SideId, number>;
  leadRate: number;
  coCounselRate: number;
  sideTieRate: number;
  internalTieRate: number;
  highestScoreEliminatedRate: number;
  closingChangedSideRate: number;
  closingChangedFirmRate: number;
}

export function runRandomGame(seed: string): RandomGameSummary {
  let state = createGame({
    seed,
    controllers: { P1: 'easy', D1: 'easy', P2: 'easy', D2: 'easy' },
    recordTelemetry: false,
  });
  const botRandom = createRandom(`${seed}:easy-bots`);
  let guard = 0;
  let actionCount = 0;
  let leadActions = 0;
  let coCounselActions = 0;

  while (state.phase !== 'complete') {
    guard += 1;
    if (guard > 500) throw new Error(`Simulation ${seed} exceeded action guard`);
    const actors = getPendingActors(state);
    if (actors.length === 0) throw new Error(`No pending actors in phase ${state.phase}`);
    const actor = actors[0] as SeatId;
    const action = chooseEasyAction(state, actor, botRandom);
    actionCount += 1;
    if (action.type === 'play_docket_card') {
      const docketCard = state.docket.find((entry) => entry.slot === action.slot);
      const card = GAME_DATA.caseCards.find((entry) => entry.id === docketCard?.cardId);
      const actionType = action.focusAction ?? card?.action;
      if (actionType === 'lead') leadActions += 1;
      else if (actionType === 'co_counsel') coCounselActions += 1;
      else throw new Error(`Unable to classify Case action in slot ${action.slot}`);
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
  const highestSeats = SEAT_ORDER.filter((seat) => scores[seat] === maxScore);
  const highestScoreEliminated = highestSeats.every(
    (seat) => state.players[seat].sideId !== state.verdict?.winningSide,
  );

  const sideTies = state.hearingResults.filter(
    (result) => result.sideTieBreaker === 'joint_work' || result.sideTieBreaker === 'courts_favor',
  ).length;
  const internalTies = state.hearingResults.filter(
    (result) => result.leadTieBreaker === 'first_chair',
  ).length;
  const provisional = state.provisionalVerdict ?? state.verdict;

  return {
    seed,
    winner: state.verdict.winningFirm,
    winningSide: state.verdict.winningSide,
    scores,
    actions: actionCount,
    leadActions,
    coCounselActions,
    sideTies,
    internalTies,
    highestScoreEliminated,
    closingChangedSide: provisional.winningSide !== state.verdict.winningSide,
    closingChangedFirm: provisional.winningFirm !== state.verdict.winningFirm,
  };
}

export function simulateGames(games: number, seedPrefix = 'simulation'): SimulationSummary {
  if (!Number.isInteger(games) || games <= 0) throw new Error('games must be a positive integer');
  const firmWins: Record<SeatId, number> = { P1: 0, D1: 0, P2: 0, D2: 0 };
  const sideWins: Record<SideId, number> = { plaintiff: 0, defense: 0 };
  let leadActions = 0;
  let coCounselActions = 0;
  let hearingScores = 0;
  let sideTies = 0;
  let internalTies = 0;
  let highestScoreEliminated = 0;
  let closingChangedSide = 0;
  let closingChangedFirm = 0;

  for (let index = 0; index < games; index += 1) {
    const result = runRandomGame(`${seedPrefix}:${index}`);
    firmWins[result.winner] += 1;
    sideWins[result.winningSide] += 1;
    leadActions += result.leadActions;
    coCounselActions += result.coCounselActions;
    hearingScores += 16;
    sideTies += result.sideTies;
    internalTies += result.internalTies;
    if (result.highestScoreEliminated) highestScoreEliminated += 1;
    if (result.closingChangedSide) closingChangedSide += 1;
    if (result.closingChangedFirm) closingChangedFirm += 1;
  }

  const totalCardActions = leadActions + coCounselActions;
  return {
    games,
    seedPrefix,
    firmWins,
    sideWins,
    leadRate: leadActions / totalCardActions,
    coCounselRate: coCounselActions / totalCardActions,
    sideTieRate: sideTies / hearingScores,
    internalTieRate: internalTies / hearingScores,
    highestScoreEliminatedRate: highestScoreEliminated / games,
    closingChangedSideRate: closingChangedSide / games,
    closingChangedFirmRate: closingChangedFirm / games,
  };
}
