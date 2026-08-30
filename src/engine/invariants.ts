import { GAME_DATA } from '../data/gameData.js';
import { SPECIALTY_BY_ID } from './specialties.js';
import { isValidThreeThreeSplit } from './splits.js';
import {
  ISSUE_IDS,
  SEAT_ORDER,
  SIDE_IDS,
  SLOTS,
  type GameState,
} from './types.js';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invariant failed: ${message}`);
}

export function assertGameInvariants(state: GameState): void {
  invariant(state.hearingSchedule.length === 6, 'six Hearing rounds are required');
  const firstCycleIssues = state.hearingSchedule.slice(0, 3).flat();
  invariant(firstCycleIssues.length === 6, 'first Hearing cycle must contain six Issues');
  invariant(new Set(firstCycleIssues).size === 6, 'first Hearing cycle must contain each Issue once');
  invariant(ISSUE_IDS.every((issueId) => firstCycleIssues.includes(issueId)), 'first Hearing cycle is missing an Issue');
  for (let index = 0; index < 3; index += 1) {
    invariant(
      JSON.stringify(state.hearingSchedule[index]) === JSON.stringify(state.hearingSchedule[index + 3]),
      `Hearing Round ${index + 4} must mirror Round ${index + 1}`,
    );
  }

  invariant(state.caseDeck.length === GAME_DATA.caseCards.length, 'Case deck size must match canonical data');
  invariant(new Set(state.caseDeck).size === state.caseDeck.length, 'Case deck cards must be unique');
  const canonicalCardIds = new Set(GAME_DATA.caseCards.map((card) => card.id));
  invariant(state.caseDeck.every((cardId) => canonicalCardIds.has(cardId)), 'Case deck must contain only canonical cards');
  invariant(state.caseDeckIndex >= 6 && state.caseDeckIndex <= 36, 'Case deck index must be within 6-36');
  invariant(state.docket.length === 6, 'current Docket must contain six cards');
  invariant(new Set(state.docket.map((card) => card.slot)).size === 6, 'Docket slots must be unique');
  invariant(SLOTS.every((slot) => state.docket.some((card) => card.slot === slot)), 'Docket must use slots 1-6');
  const docketCardIds = [...state.docket]
    .sort((left, right) => left.slot - right.slot)
    .map((card) => card.cardId);
  invariant(new Set(docketCardIds).size === 6, 'current Docket cards must be unique');
  invariant(
    JSON.stringify(docketCardIds)
      === JSON.stringify(state.caseDeck.slice(state.caseDeckIndex - state.rules.docketSize, state.caseDeckIndex)),
    'current Docket must match the most recently drawn Case cards',
  );

  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    invariant(player.seatId === seat, `${seat} identity mismatch`);
    invariant(state.players[player.partnerSeatId].partnerSeatId === seat, `${seat} partner mapping is not reciprocal`);
    invariant(Number.isInteger(player.reputation) && player.reputation >= 0, `${seat} reputation must be nonnegative`);
    if (state.rules.specialtiesEnabled) {
      if (player.specialtyId !== null) {
        invariant(
          SPECIALTY_BY_ID.has(player.specialtyId),
          `${seat} holds unknown Specialty ${player.specialtyId}`,
        );
        invariant(
          player.specialtyOptions.length === 0 || player.specialtyOptions.includes(player.specialtyId),
          `${seat} chose a Specialty it was not offered`,
        );
      }
      invariant(
        player.specialtyId !== null || !player.specialtyUsed,
        `${seat} cannot spend a Specialty it never chose`,
      );
      invariant(
        state.phase !== 'complete' || player.specialtyId !== null,
        `${seat} must hold a Specialty in a completed game`,
      );
    } else {
      invariant(player.specialtyId === null, `${seat} must not hold a Specialty when the module is off`);
    }
  }

  const chosenSpecialties = SEAT_ORDER
    .map((seat) => state.players[seat].specialtyId)
    .filter((specialtyId): specialtyId is string => specialtyId !== null);
  invariant(
    new Set(chosenSpecialties).size === chosenSpecialties.length,
    'each firm must hold a distinct Specialty',
  );

  for (const issueId of ISSUE_IDS) {
    const issue = state.issues[issueId];
    invariant(issue.normalHearingsResolved >= 0 && issue.normalHearingsResolved <= 2, `${issueId} Hearing count invalid`);
    for (const seat of SEAT_ORDER) {
      invariant(Number.isInteger(issue.firmMarkers[seat]) && issue.firmMarkers[seat] >= 0, `${issueId}/${seat} marker count invalid`);
    }
    for (const side of SIDE_IDS) {
      invariant(Number.isInteger(issue.jointWork[side]) && issue.jointWork[side] >= 0, `${issueId}/${side} Joint Work invalid`);
    }
  }

  for (const side of SIDE_IDS) {
    const brief = state.briefs[side];
    if (brief.submittedSplit !== null) {
      invariant(isValidThreeThreeSplit(brief.submittedSplit), `${side} split must cover slots 1-6 in groups of three`);
    }
    if (state.phase === 'round_argue') {
      const dividerSlots = brief.assignments[brief.divider];
      const chooserSlots = brief.assignments[brief.chooser];
      invariant(dividerSlots?.length === 3, `${side} divider must receive three slots`);
      invariant(chooserSlots?.length === 3, `${side} chooser must receive three slots`);
      const assigned = new Set([...(dividerSlots ?? []), ...(chooserSlots ?? [])]);
      invariant(SLOTS.every((slot) => assigned.has(slot)), `${side} assignments must cover all six slots`);
    }
  }

  invariant(
    Number.isInteger(state.actionsResolvedThisRound)
      && state.actionsResolvedThisRound >= 0
      && state.actionsResolvedThisRound <= 12,
    'round action count must be 0-12',
  );
  const resolvedDocketActions = state.docket.reduce(
    (total, card) => total + SIDE_IDS.filter((side) => card.usedBy[side] !== null).length,
    0,
  );
  invariant(
    state.actionsResolvedThisRound === resolvedDocketActions,
    'round action count must match resolved Docket uses',
  );
  invariant(
    state.phase === 'round_argue' ? state.activeSeat !== null : state.activeSeat === null,
    'active seat must exist only while arguing the case',
  );

  if (state.phase === 'complete' && state.rules.specialtiesEnabled) {
    invariant(
      state.specialtyBonuses.length === SEAT_ORDER.length,
      'a completed game must score every Specialty bonus',
    );
  }

  const allClosingIssues = [
    ...SEAT_ORDER.map((seat) => state.players[seat].closingArgumentIssue),
    ...state.closingUndealt,
  ];
  invariant(allClosingIssues.length === 6, 'six Closing Argument Issues must exist');
  invariant(new Set(allClosingIssues).size === 6, 'Closing Argument Issues must be unique');

  if (state.phase === 'complete') invariant(state.verdict !== null, 'complete game must have a verdict');
}
