import { getSideFloor, getSideTotal, SEATS_BY_SIDE } from './selectors.js';
import type { GameState, SeatId, SideId, VerdictResult } from './types.js';

function closingCredits(state: GameState, seat: SeatId): number {
  return state.players[seat].leadCredits.filter((credit) => credit.source === 'closing').length;
}

export function resolveVerdict(state: GameState): VerdictResult {
  const sideFloor: Record<SideId, number> = {
    plaintiff: getSideFloor(state, 'plaintiff'),
    defense: getSideFloor(state, 'defense'),
  };
  const sideTotal: Record<SideId, number> = {
    plaintiff: getSideTotal(state, 'plaintiff'),
    defense: getSideTotal(state, 'defense'),
  };

  let winningSide: SideId;
  let sideTieBreaker: VerdictResult['sideTieBreaker'];
  if (sideFloor.plaintiff !== sideFloor.defense) {
    winningSide = sideFloor.plaintiff > sideFloor.defense ? 'plaintiff' : 'defense';
    sideTieBreaker = 'floor';
  } else if (sideTotal.plaintiff !== sideTotal.defense) {
    winningSide = sideTotal.plaintiff > sideTotal.defense ? 'plaintiff' : 'defense';
    sideTieBreaker = 'combined_reputation';
  } else {
    winningSide = state.courtFavor;
    sideTieBreaker = 'courts_favor';
  }

  const [first, second] = SEATS_BY_SIDE[winningSide];
  let winningFirm: SeatId;
  let firmTieBreaker: VerdictResult['firmTieBreaker'];
  if (state.players[first].reputation !== state.players[second].reputation) {
    winningFirm = state.players[first].reputation > state.players[second].reputation ? first : second;
    firmTieBreaker = 'reputation';
  } else if (state.players[first].leadCredits.length !== state.players[second].leadCredits.length) {
    winningFirm = state.players[first].leadCredits.length > state.players[second].leadCredits.length
      ? first
      : second;
    firmTieBreaker = 'lead_credits';
  } else if (closingCredits(state, first) !== closingCredits(state, second)) {
    winningFirm = closingCredits(state, first) > closingCredits(state, second) ? first : second;
    firmTieBreaker = 'closing_credits';
  } else {
    winningFirm = state.firstChairBySide[winningSide];
    firmTieBreaker = 'first_chair';
  }

  return {
    winningSide,
    winningFirm,
    sideFloor,
    sideTotal,
    sideTieBreaker,
    firmTieBreaker,
  };
}
