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

const PRIVATE_EVENT_TYPES = new Set([
  'specialty_chosen',
  'split_committed',
  'brief_choice_committed',
  'specialty_passed',
  'specialty_declined',
  'specialty_window_opened',
]);

function redactEvent(event: GameEvent): GameEvent | null {
  if (PRIVATE_EVENT_TYPES.has(event.type)) return null;
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
  view.eventLog = view.eventLog
    .map(redactEvent)
    .filter((event): event is GameEvent => event !== null);
  if (!closingIsPublic) view.closingUndealt = [];

  for (const [seat, player] of Object.entries(view.players) as Array<[SeatId, VisiblePlayerState]>) {
    if (seat !== viewer && !closingIsPublic) player.closingArgumentIssue = null;
    if (seat !== viewer && !player.specialtyRevealed) player.specialtyId = null;
    // Offered Specialties would leak the chosen card by elimination.
    if (seat !== viewer) player.specialtyOptions = [];
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

  if (state.phase === 'setup_specialty_choice') {
    // Hide who has already locked a Specialty so the choice stays simultaneous.
    for (const seat of Object.keys(view.players) as SeatId[]) {
      if (seat !== viewer) view.players[seat].specialtyId = null;
    }
  }

  if (state.phase === 'specialty_power_window') {
    if (state.specialtyWindow?.pendingSeats[0] === viewer && view.specialtyWindow) {
      view.specialtyWindow.pendingSeats = [viewer];
    } else {
      // Eligibility can identify a hidden Specialty, including Closer after a pass.
      view.specialtyWindow = null;
    }
  }

  const viewerSide = SIDE_BY_SEAT[viewer];
  if (state.phase === 'round_split_commit') {
    const otherSide = viewerSide === 'plaintiff' ? 'defense' : 'plaintiff';
    view.briefs[otherSide].submittedSplit = null;
  }

  return view;
}
