import type { GameAction, SeatId } from '../engine/types.js';
import type { PlayerView } from '../engine/visibility.js';

export type RemoteController = 'human' | 'easy';

export interface RemoteSeat {
  seat: SeatId;
  name: string;
  controller: RemoteController;
  claimed: boolean;
}

export interface RemoteLobby {
  code: string;
  phase: 'lobby' | 'playing' | 'complete';
  revision: number;
  hostSeat: SeatId;
  seats: RemoteSeat[];
}

export interface RemoteSession {
  code: string;
  seat: SeatId;
  token: string;
}

export interface RemotePlayerSnapshot {
  lobby: RemoteLobby;
  seat: SeatId;
  game: PlayerView | null;
  legalActions: GameAction[];
  pendingActor: SeatId | null;
}

export type RemoteApiSuccess<T> = { ok: true; value: T };
export type RemoteApiFailure = {
  ok: false;
  code: string;
  error: string;
  status: number;
};
export type RemoteApiResult<T> = RemoteApiSuccess<T> | RemoteApiFailure;
