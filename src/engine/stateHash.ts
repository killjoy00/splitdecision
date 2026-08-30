import type { GameState } from './types.js';

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function fnv1a(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashValue(value: unknown): string {
  return fnv1a(stableStringify(value));
}

export function hashGameState(state: GameState): string {
  const { eventLog: _eventLog, ...hashable } = state;
  return hashValue(hashable);
}

export function hashPublicGameState(state: GameState): string {
  const clone = JSON.parse(JSON.stringify(state)) as GameState;
  clone.seed = '';
  clone.caseDeck = clone.caseDeck.slice(0, clone.caseDeckIndex);
  clone.eventLog = [];
  clone.actionHistory = [];

  const closingIsPublic = clone.closingRevealed.length > 0 || clone.phase === 'complete';
  if (!closingIsPublic) {
    for (const player of Object.values(clone.players)) {
      player.closingArgumentIssue = 'witnesses';
    }
    clone.closingUndealt = [];
  }
  for (const player of Object.values(clone.players)) {
    player.specialtyOptions = [];
    if (!player.specialtyRevealed && clone.phase !== 'complete') player.specialtyId = null;
  }
  if (clone.specialtyWindow) clone.specialtyWindow.pendingSeats = [];

  if (clone.phase === 'round_split_commit') {
    clone.briefs.plaintiff.submittedSplit = null;
    clone.briefs.defense.submittedSplit = null;
  }
  if (clone.phase === 'round_choose_commit') {
    clone.briefs.plaintiff.chosenBriefIndex = null;
    clone.briefs.defense.chosenBriefIndex = null;
  }

  return hashValue(clone);
}
