import type { BotLevel, GameAction, SeatId } from '../engine/types.js';
import type { PlayerView } from '../engine/visibility.js';

export type RemoteController = BotLevel;
export const REMOTE_PROTOCOL_VERSION = 2 as const;

export interface RemoteSeat {
  seat: SeatId;
  name: string;
  controller: RemoteController;
  claimed: boolean;
}

export interface RemoteLobby {
  protocolVersion: typeof REMOTE_PROTOCOL_VERSION;
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
  protocolVersion: typeof REMOTE_PROTOCOL_VERSION;
  lobby: RemoteLobby;
  seat: SeatId;
  game: PlayerView | null;
  legalActions: GameAction[];
  /** First pending seat. Retained for display; prefer `pendingActors`. */
  pendingActor: SeatId | null;
  /** Every seat that may act now. Simultaneous phases list more than one. */
  pendingActors: SeatId[];
}

export interface RemoteHealth {
  protocolVersion: typeof REMOTE_PROTOCOL_VERSION;
  roomSchemaVersion: 2;
  status: 'ok';
}

export type RemoteApiSuccess<T> = { ok: true; value: T };
export type RemoteApiFailure = {
  ok: false;
  code: string;
  error: string;
  status: number;
};
export type RemoteApiResult<T> = RemoteApiSuccess<T> | RemoteApiFailure;
