import {
  SEAT_ORDER,
  type GameState,
  type SeatId,
  type SideId,
} from './types.js';

export const SEATS_BY_SIDE: Record<SideId, [SeatId, SeatId]> = {
  plaintiff: ['P1', 'P2'],
  defense: ['D1', 'D2'],
};

export const PARTNER_BY_SEAT: Record<SeatId, SeatId> = {
  P1: 'P2',
  P2: 'P1',
  D1: 'D2',
  D2: 'D1',
};

export const SIDE_BY_SEAT: Record<SeatId, SideId> = {
  P1: 'plaintiff',
  P2: 'plaintiff',
  D1: 'defense',
  D2: 'defense',
};

export function nextSeat(seat: SeatId): SeatId {
  const index = SEAT_ORDER.indexOf(seat);
  return SEAT_ORDER[(index + 1) % SEAT_ORDER.length] as SeatId;
}

export function getSideFloor(state: GameState, side: SideId): number {
  const [first, second] = SEATS_BY_SIDE[side];
  return Math.min(state.players[first].reputation, state.players[second].reputation);
}

export function getSideTotal(state: GameState, side: SideId): number {
  const [first, second] = SEATS_BY_SIDE[side];
  return state.players[first].reputation + state.players[second].reputation;
}

export function getCardById(state: GameState, cardId: string) {
  return state.docket.find((entry) => entry.cardId === cardId);
}
