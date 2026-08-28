import { hashPublicGameState } from './stateHash.js';
import type { GameState, SeatId } from './types.js';

export function appendEvent(
  state: GameState,
  type: string,
  payload: unknown,
  actor: SeatId | null = null,
): void {
  if (!state.recordTelemetry) return;
  state.eventLog.push({
    index: state.eventLog.length,
    phase: state.phase,
    round: state.round,
    actor,
    type,
    payload,
    stateHash: hashPublicGameState(state),
  });
}
