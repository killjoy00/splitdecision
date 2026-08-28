import { SIDE_BY_SEAT } from './selectors.js';
import type {
  GameState,
  IssueId,
  PlayerState,
  SeatId,
} from './types.js';

export type VisiblePlayerState = Omit<PlayerState, 'closingArgumentIssue'> & {
  closingArgumentIssue: IssueId | null;
};

export type PlayerView = Omit<GameState, 'players'> & {
  players: Record<SeatId, VisiblePlayerState>;
};

export function getPlayerView(state: GameState, viewer: SeatId): PlayerView {
  const view = JSON.parse(JSON.stringify(state)) as PlayerView;
  const closingIsPublic = state.closingRevealed.length > 0 || state.phase === 'complete';
  view.actionHistory = [];
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
