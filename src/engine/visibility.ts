import { SIDE_BY_SEAT } from './selectors.js';
import type {
  GameEvent,
  GameState,
  IssueId,
  PlayerState,
  SeatId,
} from './types.js';

export type VisiblePlayerState = Omit<PlayerState, 'closingArgumentIssue'> & {
  closingArgumentIssue: IssueId | null;
};

export type PlayerView = Omit<GameState, 'players' | 'seed'> & {
  seed: null;
  players: Record<SeatId, VisiblePlayerState>;
};

function redactEvent(event: GameEvent): GameEvent {
  if (event.type !== 'setup_complete'
      || event.payload === null
      || typeof event.payload !== 'object'
      || Array.isArray(event.payload)) {
    return event;
  }

  const { seed: _seed, ...publicPayload } = event.payload as Record<string, unknown>;
  return { ...event, payload: publicPayload };
}

export function getPlayerView(state: GameState, viewer: SeatId): PlayerView {
  const view = JSON.parse(JSON.stringify(state)) as unknown as PlayerView;
  const closingIsPublic = state.closingRevealed.length > 0 || state.phase === 'complete';
  view.seed = null;
  view.caseDeck = view.caseDeck.slice(0, view.caseDeckIndex);
  view.actionHistory = [];
  view.eventLog = view.eventLog.map(redactEvent);
  if (!closingIsPublic) view.closingUndealt = [];

  for (const [seat, player] of Object.entries(view.players) as Array<[SeatId, VisiblePlayerState]>) {
    if (seat !== viewer && !closingIsPublic) player.closingArgumentIssue = null;
    if (seat !== viewer && !player.specialtyRevealed) player.specialtyId = null;
  }

  if (state.phase === 'round_split_commit') {
    for (const side of ['plaintiff', 'defense'] as const) {
      if (state.briefs[side].divider !== viewer) view.briefs[side].submittedSplit = null;
    }
  }

  if (state.phase === 'round_choose_commit') {
    for (const side of ['plaintiff', 'defense'] as const) {
      if (state.briefs[side].chooser !== viewer) view.briefs[side].chosenBriefIndex = null;
    }
  }

  const viewerSide = SIDE_BY_SEAT[viewer];
  if (state.phase === 'round_split_commit') {
    const otherSide = viewerSide === 'plaintiff' ? 'defense' : 'plaintiff';
    view.briefs[otherSide].submittedSplit = null;
  }

  return view;
}
