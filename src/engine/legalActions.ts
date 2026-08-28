import { GAME_DATA } from '../data/gameData.js';
import { enumerateThreeThreeSplits } from './splits.js';
import { SIDE_BY_SEAT } from './selectors.js';
import type {
  CaseActionType,
  GameAction,
  GameState,
  SeatId,
} from './types.js';

const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));

function canPlaceInIssue(state: GameState, issueId: (typeof GAME_DATA.issues)[number]['id']): boolean {
  return state.rules.allowPlacementAfterSecondHearing
    || state.issues[issueId].normalHearingsResolved < 2;
}

export function getPendingActors(state: GameState): SeatId[] {
  if (state.phase === 'round_split_commit') {
    return (['plaintiff', 'defense'] as const)
      .filter((side) => state.briefs[side].submittedSplit === null)
      .map((side) => state.briefs[side].divider);
  }
  if (state.phase === 'round_choose_commit') {
    return (['plaintiff', 'defense'] as const)
      .filter((side) => state.briefs[side].chosenBriefIndex === null)
      .map((side) => state.briefs[side].chooser);
  }
  if (state.phase === 'round_argue' && state.activeSeat !== null) return [state.activeSeat];
  return [];
}

export function getLegalActions(state: GameState, actor: SeatId): GameAction[] {
  const side = SIDE_BY_SEAT[actor];
  const brief = state.briefs[side];

  if (state.phase === 'round_split_commit') {
    if (brief.divider !== actor || brief.submittedSplit !== null) return [];
    return enumerateThreeThreeSplits().map((groups) => ({ type: 'commit_split', actor, groups }));
  }

  if (state.phase === 'round_choose_commit') {
    if (brief.chooser !== actor || brief.chosenBriefIndex !== null) return [];
    return [
      { type: 'choose_brief', actor, briefIndex: 0 },
      { type: 'choose_brief', actor, briefIndex: 1 },
    ];
  }

  if (state.phase !== 'round_argue' || state.activeSeat !== actor) return [];
  const assignedSlots = brief.assignments[actor] ?? [];
  const actions: GameAction[] = [];

  for (const slot of assignedSlots) {
    const docketCard = state.docket.find((entry) => entry.slot === slot);
    if (!docketCard || docketCard.usedBy[side] !== null) continue;
    const card = CARD_BY_ID.get(docketCard.cardId);
    if (!card) throw new Error(`Unknown Case card ${docketCard.cardId}`);

    if (card.form === 'focus') {
      const chosenIssue = card.issues[0];
      if (!chosenIssue) throw new Error(`Focus card ${card.id} has no Issue`);
      if (!canPlaceInIssue(state, chosenIssue)) continue;
      for (const focusAction of ['lead', 'co_counsel'] as CaseActionType[]) {
        actions.push({ type: 'play_docket_card', actor, slot, chosenIssue, focusAction });
      }
    } else {
      for (const chosenIssue of card.issues) {
        if (!canPlaceInIssue(state, chosenIssue)) continue;
        actions.push({ type: 'play_docket_card', actor, slot, chosenIssue });
      }
    }
  }

  return actions;
}
