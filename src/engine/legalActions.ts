import { GAME_DATA } from '../data/gameData.js';
import { enumerateThreeThreeSplits } from './splits.js';
import { SIDE_BY_SEAT } from './selectors.js';
import {
  canBoostCaseCard,
  canBoostCoCounsel,
  canRetargetAnyIssue,
  getSeatSpecialty,
  hasUnusedPower,
  unrevealedIssues,
} from './specialties.js';
import {
  SEAT_ORDER,
  type CaseActionType,
  type FocusActionType,
  type GameAction,
  type GameState,
  type IssueId,
  type SeatId,
} from './types.js';

const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));

function canPlaceInIssue(state: GameState, issueId: (typeof GAME_DATA.issues)[number]['id']): boolean {
  return state.rules.allowPlacementAfterSecondHearing
    || state.issues[issueId].normalHearingsResolved < 2;
}

/** True when spending the power alongside this Case card is legal. */
function canUsePowerOn(
  state: GameState,
  actor: SeatId,
  chosenIssue: IssueId,
  actionType: CaseActionType,
): boolean {
  if (!hasUnusedPower(state, actor)) return false;
  if (canBoostCaseCard(state, actor, chosenIssue)) return true;
  return actionType === 'co_counsel' && canBoostCoCounsel(state, actor);
}

export function getPendingActors(state: GameState): SeatId[] {
  if (state.phase === 'setup_specialty_choice') {
    return SEAT_ORDER.filter((seat) => state.players[seat].specialtyId === null);
  }
  if (state.phase === 'specialty_power_window') {
    const actor = state.specialtyWindow?.pendingSeats[0];
    return actor ? [actor] : [];
  }
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

  if (state.phase === 'setup_specialty_choice') {
    if (state.players[actor].specialtyId !== null) return [];
    return state.players[actor].specialtyOptions.map((specialtyId) => ({
      type: 'choose_specialty',
      actor,
      specialtyId,
    }));
  }

  if (state.phase === 'specialty_power_window') {
    if (!getPendingActors(state).includes(actor)) return [];
    const actions: GameAction[] = [{ type: 'pass_specialty', actor }];
    if (state.specialtyWindow?.kind === 'before_issue_scores') {
      return [...actions, { type: 'use_specialty', actor }];
    }
    if (state.specialtyWindow?.kind !== 'after_closing_reveal') return [];
    const sources = unrevealedIssues(state)
      .filter((issueId) => state.issues[issueId].firmMarkers[actor] > 0);
    for (const toIssue of state.closingRevealed) {
      for (const first of sources) {
        actions.push({ type: 'use_specialty', actor, toIssue, fromIssues: [first] });
        for (const second of sources) {
          const pair: IssueId[] = [first, second];
          const needed = first === second ? 2 : 1;
          if (state.issues[second].firmMarkers[actor] < needed) continue;
          if (sources.indexOf(second) < sources.indexOf(first)) continue;
          actions.push({ type: 'use_specialty', actor, toIssue, fromIssues: pair });
        }
      }
    }
    return actions;
  }

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

    const retargets = canRetargetAnyIssue(state, actor);

    if (card.form === 'focus') {
      const printedIssue = card.issues[0];
      if (!printedIssue) throw new Error(`Focus card ${card.id} has no Issue`);
      const targetIssues = retargets ? [...GAME_DATA.issueOrder] : card.issues;
      for (const chosenIssue of targetIssues) {
        if (!canPlaceInIssue(state, chosenIssue)) continue;
        const offBook = chosenIssue !== printedIssue;
        for (const focusAction of ['lead', 'co_counsel'] as FocusActionType[]) {
          if (!offBook) {
            actions.push({ type: 'play_docket_card', actor, slot, chosenIssue, focusAction });
          }
          if (offBook || canUsePowerOn(state, actor, chosenIssue, focusAction)) {
            actions.push({
              type: 'play_docket_card',
              actor,
              slot,
              chosenIssue,
              focusAction,
              useSpecialty: true,
            });
          }
        }
      }
    } else if (card.form === 'citation') {
      for (const citedSlot of assignedSlots) {
        if (citedSlot === slot) continue;
        const citedDocket = state.docket.find((entry) => entry.slot === citedSlot);
        const citedCard = citedDocket ? CARD_BY_ID.get(citedDocket.cardId) : null;
        if (!citedCard || citedCard.issues.length === 0) continue;
        const targetIssues = retargets ? [...GAME_DATA.issueOrder] : citedCard.issues;
        for (const chosenIssue of targetIssues) {
          if (!canPlaceInIssue(state, chosenIssue)) continue;
          const offBook = !citedCard.issues.includes(chosenIssue);
          if (!offBook) {
            actions.push({ type: 'play_docket_card', actor, slot, chosenIssue, citedSlot });
          }
          if (offBook || canUsePowerOn(state, actor, chosenIssue, 'citation')) {
            actions.push({
              type: 'play_docket_card',
              actor,
              slot,
              chosenIssue,
              citedSlot,
              useSpecialty: true,
            });
          }
        }
      }
    } else {
      if (card.action === 'choose' || card.action === 'citation') {
        throw new Error(`Dual-Issue card ${card.id} has an invalid action`);
      }
      const actionType: CaseActionType = card.action;
      const targetIssues = retargets ? [...GAME_DATA.issueOrder] : card.issues;
      for (const chosenIssue of targetIssues) {
        if (!canPlaceInIssue(state, chosenIssue)) continue;
        const offBook = !card.issues.includes(chosenIssue);
        if (!offBook) actions.push({ type: 'play_docket_card', actor, slot, chosenIssue });
        if (offBook || canUsePowerOn(state, actor, chosenIssue, actionType)) {
          actions.push({ type: 'play_docket_card', actor, slot, chosenIssue, useSpecialty: true });
        }
      }
    }
  }

  return actions;
}
