import { getLegalActions } from './legalActions.js';
import { randomItem, type RandomSource } from './random.js';
import type { GameAction, GameState, SeatId } from './types.js';

export function chooseEasyAction(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): GameAction {
  const legalActions = getLegalActions(state, actor);
  if (legalActions.length === 0) throw new Error(`Easy Bot ${actor} has no legal actions in ${state.phase}`);
  return randomItem(legalActions, random);
}
