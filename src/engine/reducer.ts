import { GAME_DATA } from '../data/gameData.js';
import { createBriefState, revealNextDocket } from './createGame.js';
import { appendEvent } from './events.js';
import { assertGameInvariants } from './invariants.js';
import { scoreIssue } from './scoring.js';
import {
  applyBeforeIssueScoresPower,
  applyCloserPower,
  applySpecialtyBonuses,
  canBoostCaseCard,
  canBoostCoCounsel,
  canRetargetAnyIssue,
  getSeatSpecialty,
  hasUnusedPower,
  markCardPowerSpent,
  unrevealedIssues,
} from './specialties.js';
import { canonicalizeSplit, isValidThreeThreeSplit } from './splits.js';
import {
  nextSeat,
  PARTNER_BY_SEAT,
  SIDE_BY_SEAT,
} from './selectors.js';
import { resolveVerdict } from './verdict.js';
import {
  ISSUE_IDS,
  SEAT_ORDER,
  SIDE_IDS,
  SLOTS,
  type ApplyActionResult,
  type CaseActionType,
  type GameAction,
  type GameState,
  type IssueId,
  type LeadCreditSource,
  type SeatId,
  type SideId,
} from './types.js';

const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function fail(code: string, message: string): ApplyActionResult {
  return { ok: false, error: { code, message } };
}

function parseAction(value: unknown): { action: GameAction } | { error: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Action must be an object' };
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.actor !== 'string'
      || !SEAT_ORDER.includes(candidate.actor as SeatId)) {
    return { error: 'Action actor must be a valid seat' };
  }
  const actor = candidate.actor as SeatId;

  if (candidate.type === 'choose_specialty') {
    if (typeof candidate.specialtyId !== 'string' || !candidate.specialtyId) {
      return { error: 'choose_specialty requires a Specialty id' };
    }
    return { action: { type: 'choose_specialty', actor, specialtyId: candidate.specialtyId } };
  }

  if (candidate.type === 'pass_specialty') {
    return { action: { type: 'pass_specialty', actor } };
  }

  if (candidate.type === 'use_specialty') {
    if (candidate.toIssue !== undefined && !ISSUE_IDS.includes(candidate.toIssue as IssueId)) {
      return { error: 'use_specialty toIssue must be a valid Issue' };
    }
    if (candidate.fromIssues !== undefined) {
      if (!Array.isArray(candidate.fromIssues)
          || !candidate.fromIssues.every((entry) => ISSUE_IDS.includes(entry as IssueId))) {
        return { error: 'use_specialty fromIssues must be valid Issues' };
      }
    }
    return {
      action: {
        type: 'use_specialty',
        actor,
        ...(candidate.toIssue === undefined ? {} : { toIssue: candidate.toIssue as IssueId }),
        ...(candidate.fromIssues === undefined
          ? {}
          : { fromIssues: candidate.fromIssues as IssueId[] }),
      },
    };
  }

  if (candidate.type === 'commit_split') {
    if (!isValidThreeThreeSplit(candidate.groups)) {
      return { error: 'commit_split requires two disjoint groups of three covering slots 1-6' };
    }
    return { action: { type: 'commit_split', actor, groups: candidate.groups } };
  }

  if (candidate.type === 'choose_brief') {
    if (candidate.briefIndex !== 0 && candidate.briefIndex !== 1) {
      return { error: 'choose_brief requires briefIndex 0 or 1' };
    }
    return { action: { type: 'choose_brief', actor, briefIndex: candidate.briefIndex } };
  }

  if (candidate.type === 'play_docket_card') {
    if (!SLOTS.includes(candidate.slot as (typeof SLOTS)[number])) {
      return { error: 'play_docket_card requires a valid Docket slot' };
    }
    if (!ISSUE_IDS.includes(candidate.chosenIssue as IssueId)) {
      return { error: 'play_docket_card requires a valid Issue' };
    }
    if (candidate.focusAction !== undefined
        && candidate.focusAction !== 'lead'
        && candidate.focusAction !== 'co_counsel') {
      return { error: 'focusAction must be Lead or Co-Counsel when supplied' };
    }
    if (candidate.useSpecialty !== undefined && typeof candidate.useSpecialty !== 'boolean') {
      return { error: 'useSpecialty must be a boolean when supplied' };
    }
    const focusAction = candidate.focusAction as CaseActionType | undefined;
    return {
      action: {
        type: 'play_docket_card',
        actor,
        slot: candidate.slot as (typeof SLOTS)[number],
        chosenIssue: candidate.chosenIssue as IssueId,
        ...(focusAction === undefined ? {} : { focusAction }),
        ...(candidate.useSpecialty ? { useSpecialty: true } : {}),
      },
    };
  }

  return { error: 'Unknown action type' };
}

function bothSidesSubmittedSplits(state: GameState): boolean {
  return SIDE_IDS.every((side) => state.briefs[side].submittedSplit !== null);
}

function bothSidesChoseBriefs(state: GameState): boolean {
  return SIDE_IDS.every((side) => state.briefs[side].chosenBriefIndex !== null);
}

function assignBriefs(state: GameState): void {
  for (const side of SIDE_IDS) {
    const brief = state.briefs[side];
    const split = brief.submittedSplit;
    const chosenIndex = brief.chosenBriefIndex;
    if (!split || chosenIndex === null) throw new Error(`Cannot assign incomplete ${side} briefs`);
    const dividerIndex: 0 | 1 = chosenIndex === 0 ? 1 : 0;
    brief.assignments = {
      [brief.chooser]: [...split[chosenIndex]],
      [brief.divider]: [...split[dividerIndex]],
    };
  }
}

function clockwiseFrom(start: SeatId): SeatId[] {
  const startIndex = SEAT_ORDER.indexOf(start);
  return SEAT_ORDER.map(
    (_, offset) => SEAT_ORDER[(startIndex + offset) % SEAT_ORDER.length] as SeatId,
  );
}

function finishVerdict(state: GameState): void {
  applySpecialtyBonuses(state);
  state.verdict = resolveVerdict(state);
  state.phase = 'complete';
  appendEvent(state, 'verdict_resolved', state.verdict);
}

function beginNextRound(state: GameState): void {
  for (const side of SIDE_IDS) {
    state.dividerBySide[side] = PARTNER_BY_SEAT[state.dividerBySide[side]];
    state.briefs[side] = createBriefState(state.dividerBySide[side], side);
  }
  state.startingPlayer = nextSeat(state.startingPlayer);
  state.activeSeat = null;
  state.actionsResolvedThisRound = 0;
  state.round += 1;
  state.phase = 'round_split_commit';
  revealNextDocket(state);
}

function finishScoringSequence(state: GameState): void {
  if (state.provisionalVerdict !== null) {
    finishVerdict(state);
    return;
  }

  appendEvent(state, 'round_completed', { round: state.round });
  if (state.round === state.rules.rounds) resolveClosingAndVerdict(state);
  else beginNextRound(state);
}

function scorePendingIssue(state: GameState): void {
  const pending = state.pendingIssueScores.shift();
  if (!pending) throw new Error('No pending Issue to score');
  scoreIssue(state, pending.issueId, pending.source);
  advanceIssueScoring(state);
}

function advanceIssueScoring(state: GameState): void {
  const pending = state.pendingIssueScores[0];
  if (!pending) {
    finishScoringSequence(state);
    return;
  }

  const eligible = clockwiseFrom(state.startingPlayer).filter((seat) => {
    const specialty = getSeatSpecialty(state, seat);
    return hasUnusedPower(state, seat)
      && specialty?.powerTiming === 'before_issue_scores'
      && specialty.powerIssue === pending.issueId;
  });
  if (eligible.length === 0) {
    scorePendingIssue(state);
    return;
  }

  state.activeSeat = null;
  state.phase = 'specialty_power_window';
  state.specialtyWindow = {
    kind: 'before_issue_scores',
    issueId: pending.issueId,
    pendingSeats: eligible,
  };
  appendEvent(state, 'specialty_window_opened', {
    kind: 'before_issue_scores',
    issueId: pending.issueId,
    eligible,
  });
}

function beginClosingScores(state: GameState): void {
  state.specialtyWindow = null;
  state.phase = 'closing_scoring';
  state.pendingIssueScores = GAME_DATA.issueOrder
    .filter((issueId) => state.closingRevealed.includes(issueId))
    .map((issueId) => ({ issueId, source: 'closing' as LeadCreditSource }));
  advanceIssueScoring(state);
}

function resolveClosingAndVerdict(state: GameState): void {
  state.provisionalVerdict = resolveVerdict(state);
  appendEvent(state, 'normal_case_complete', {
    reputation: Object.fromEntries(Object.entries(state.players).map(([seat, player]) => [seat, player.reputation])),
    provisional: state.provisionalVerdict,
  });

  const revealed = Object.values(state.players).map((player) => player.closingArgumentIssue);
  state.closingRevealed = ISSUE_IDS.filter((issueId) => revealed.includes(issueId));
  appendEvent(state, 'closing_arguments_revealed', { issues: state.closingRevealed });

  const closers = clockwiseFrom(state.startingPlayer).filter((seat) => hasUnusedPower(state, seat)
    && getSeatSpecialty(state, seat)?.powerTiming === 'after_closing_reveal');
  if (closers.length > 0) {
    state.phase = 'specialty_power_window';
    state.specialtyWindow = {
      kind: 'after_closing_reveal',
      issueId: null,
      pendingSeats: closers,
    };
    appendEvent(state, 'specialty_window_opened', {
      kind: 'after_closing_reveal',
      eligible: closers,
    });
  } else {
    beginClosingScores(state);
  }
}

function finishRound(state: GameState): void {
  const hearings = state.hearingSchedule[state.round - 1];
  if (!hearings) throw new Error(`Missing Hearing schedule for Round ${state.round}`);
  state.pendingIssueScores = hearings.map((issueId) => ({ issueId, source: 'hearing' }));
  advanceIssueScoring(state);
}

function resolveSpecialtyWindowStep(state: GameState): void {
  const window = state.specialtyWindow;
  if (!window) throw new Error('Specialty window disappeared');
  window.pendingSeats.shift();
  if (window.pendingSeats.length > 0) return;
  state.specialtyWindow = null;
  if (window.kind === 'after_closing_reveal') beginClosingScores(state);
  else scorePendingIssue(state);
}

function validateCardResolution(
  state: GameState,
  action: Extract<GameAction, { type: 'play_docket_card' }>,
): {
  side: SideId;
  actionType: CaseActionType;
  chosenIssue: IssueId;
  retargeting: boolean;
} | ApplyActionResult {
  if (state.phase !== 'round_argue') return fail('wrong_phase', 'Case cards may only be played while arguing the case');
  if (state.activeSeat !== action.actor) return fail('not_active_player', `${action.actor} is not the active firm`);

  const retargeting = action.useSpecialty === true && canRetargetAnyIssue(state, action.actor);
  if (action.useSpecialty === true && !hasUnusedPower(state, action.actor)) {
    return fail('specialty_unavailable', `${action.actor} has no unused Specialty power`);
  }

  const side = SIDE_BY_SEAT[action.actor];
  const assigned = state.briefs[side].assignments[action.actor] ?? [];
  if (!assigned.includes(action.slot)) return fail('slot_not_assigned', `Docket slot ${action.slot} is not assigned to ${action.actor}`);

  const docketCard = state.docket.find((entry) => entry.slot === action.slot);
  if (!docketCard) return fail('unknown_slot', `Docket slot ${action.slot} does not exist`);
  if (docketCard.usedBy[side] !== null) return fail('slot_already_used', `${side} already used Docket slot ${action.slot}`);

  const card = CARD_BY_ID.get(docketCard.cardId);
  if (!card) return fail('unknown_card', `Unknown Case card ${docketCard.cardId}`);

  let actionType: CaseActionType;
  if (card.form === 'focus') {
    if (action.focusAction !== 'lead' && action.focusAction !== 'co_counsel') {
      return fail('focus_action_required', 'Focus cards require Lead or Co-Counsel selection');
    }
    if (action.chosenIssue !== card.issues[0] && !retargeting) {
      return fail('illegal_issue', 'Focus cards must use their printed Issue');
    }
    actionType = action.focusAction;
  } else {
    if (action.focusAction !== undefined) return fail('unexpected_focus_action', 'Dual-Issue cards have a fixed action type');
    if (!card.issues.includes(action.chosenIssue) && !retargeting) {
      return fail('illegal_issue', `${action.chosenIssue} is not printed on ${card.title}`);
    }
    if (card.action !== 'lead' && card.action !== 'co_counsel') return fail('invalid_card_data', `${card.id} has an invalid action`);
    actionType = card.action;
  }

  if (!state.rules.allowPlacementAfterSecondHearing
      && state.issues[action.chosenIssue].normalHearingsResolved >= 2) {
    return fail('issue_closed', `${action.chosenIssue} is closed after its second Hearing`);
  }

  return { side, actionType, chosenIssue: action.chosenIssue, retargeting };
}

export function applyAction(state: GameState, value: unknown): ApplyActionResult {
  const parsed = parseAction(value);
  if ('error' in parsed) return fail('invalid_action', parsed.error);
  const { action } = parsed;
  const next = cloneState(state);

  try {
    if (action.type === 'choose_specialty') {
      if (next.phase !== 'setup_specialty_choice') return fail('wrong_phase', 'Specialties are not being chosen now');
      const player = next.players[action.actor];
      if (player.specialtyId !== null) return fail('specialty_already_chosen', `${action.actor} already chose a Specialty`);
      if (!player.specialtyOptions.includes(action.specialtyId)) {
        return fail('specialty_not_offered', `${action.specialtyId} was not offered to ${action.actor}`);
      }

      player.specialtyId = action.specialtyId;
      if (next.recordTelemetry) next.actionHistory.push(action);
      appendEvent(next, 'specialty_chosen', { seat: action.actor }, action.actor);
      if (SEAT_ORDER.every((seat) => next.players[seat].specialtyId !== null)) {
        next.phase = 'round_split_commit';
        appendEvent(next, 'specialties_locked', { seats: [...SEAT_ORDER] });
        revealNextDocket(next);
      }
    } else if (action.type === 'use_specialty') {
      const window = next.specialtyWindow;
      if (next.phase !== 'specialty_power_window' || !window) {
        return fail('wrong_phase', 'There is no Specialty power window open');
      }
      if (window.pendingSeats[0] !== action.actor) {
        return fail('not_active_player', `${action.actor} is not acting in this Specialty window`);
      }
      if (!hasUnusedPower(next, action.actor)) {
        return fail('specialty_unavailable', `${action.actor} has no unused Specialty power`);
      }
      const specialty = getSeatSpecialty(next, action.actor);
      if (!specialty) return fail('specialty_unavailable', `${action.actor} has no Specialty`);

      if (window.kind === 'before_issue_scores') {
        if (specialty.powerTiming !== 'before_issue_scores'
            || specialty.powerIssue !== window.issueId) {
          return fail('specialty_not_applicable', 'This Specialty does not apply to the pending Issue score');
        }
        if (action.toIssue !== undefined || action.fromIssues !== undefined) {
          return fail('unexpected_specialty_options', 'This Specialty does not move markers');
        }
        applyBeforeIssueScoresPower(next, action.actor);
        if (next.recordTelemetry) next.actionHistory.push(action);
        resolveSpecialtyWindowStep(next);
      } else if (window.kind === 'after_closing_reveal') {
        if (specialty.powerTiming !== 'after_closing_reveal') {
          return fail('specialty_not_applicable', 'This Specialty cannot resolve after Closing reveal');
        }
        const toIssue = action.toIssue;
        const fromIssues = action.fromIssues ?? [];
        if (!toIssue || !next.closingRevealed.includes(toIssue)) {
          return fail('invalid_specialty_target', 'Closer must move markers into a revealed Issue');
        }
        if (fromIssues.length < 1 || fromIssues.length > 2) {
          return fail('invalid_specialty_target', 'Closer moves one or two Firm markers');
        }
        const available = unrevealedIssues(next);
        const counts = new Map<IssueId, number>();
        for (const issueId of fromIssues) {
          if (!available.includes(issueId)) {
            return fail('invalid_specialty_target', `${issueId} is not an unrevealed Issue`);
          }
          counts.set(issueId, (counts.get(issueId) ?? 0) + 1);
        }
        for (const [issueId, count] of counts) {
          if (next.issues[issueId].firmMarkers[action.actor] < count) {
            return fail('invalid_specialty_target', `${action.actor} has too few markers in ${issueId}`);
          }
        }
        applyCloserPower(next, action.actor, fromIssues, toIssue);
        if (next.recordTelemetry) next.actionHistory.push(action);
        resolveSpecialtyWindowStep(next);
      } else {
        return fail('specialty_not_standalone', 'This Specialty resolves with a Case card');
      }
    } else if (action.type === 'pass_specialty') {
      const window = next.specialtyWindow;
      if (next.phase !== 'specialty_power_window' || !window) {
        return fail('wrong_phase', 'There is no Specialty window open');
      }
      if (window.pendingSeats[0] !== action.actor) {
        return fail('specialty_unavailable', `${action.actor} has no pending Specialty window`);
      }
      if (next.recordTelemetry) next.actionHistory.push(action);
      appendEvent(next, 'specialty_passed', {
        kind: window.kind,
        issueId: window.issueId,
      }, action.actor);
      // A pass declines only this scoring opportunity. The card stays hidden
      // and can still be used before the same Issue scores later in the game.
      resolveSpecialtyWindowStep(next);
    } else if (action.type === 'commit_split') {
      if (next.phase !== 'round_split_commit') return fail('wrong_phase', 'Briefs are not being divided now');
      const side = SIDE_BY_SEAT[action.actor];
      const brief = next.briefs[side];
      if (brief.divider !== action.actor) return fail('not_divider', `${action.actor} is not this side's Divider`);
      if (brief.submittedSplit !== null) return fail('split_already_submitted', `${side} already submitted a split`);
      if (!isValidThreeThreeSplit(action.groups)) return fail('invalid_split', 'A split must be two disjoint groups of three covering slots 1-6');

      brief.submittedSplit = canonicalizeSplit(action.groups);
      if (next.recordTelemetry) next.actionHistory.push(action);
      appendEvent(next, 'split_committed', { side }, action.actor);
      if (bothSidesSubmittedSplits(next)) {
        next.phase = 'round_choose_commit';
        appendEvent(next, 'splits_revealed', {
          plaintiff: next.briefs.plaintiff.submittedSplit,
          defense: next.briefs.defense.submittedSplit,
        });
      }
    } else if (action.type === 'choose_brief') {
      if (next.phase !== 'round_choose_commit') return fail('wrong_phase', 'Briefs are not being chosen now');
      const side = SIDE_BY_SEAT[action.actor];
      const brief = next.briefs[side];
      if (brief.chooser !== action.actor) return fail('not_chooser', `${action.actor} is not this side's Chooser`);
      if (brief.chosenBriefIndex !== null) return fail('brief_already_chosen', `${side} already chose a brief`);

      brief.chosenBriefIndex = action.briefIndex;
      if (next.recordTelemetry) next.actionHistory.push(action);
      appendEvent(next, 'brief_choice_committed', { side }, action.actor);
      if (bothSidesChoseBriefs(next)) {
        assignBriefs(next);
        next.phase = 'round_argue';
        next.activeSeat = next.startingPlayer;
        appendEvent(next, 'brief_choices_revealed', {
          plaintiff: next.briefs.plaintiff.chosenBriefIndex,
          defense: next.briefs.defense.chosenBriefIndex,
          assignments: {
            plaintiff: next.briefs.plaintiff.assignments,
            defense: next.briefs.defense.assignments,
          },
        });
      }
    } else {
      const validated = validateCardResolution(next, action);
      if ('ok' in validated) return validated;

      const { side, actionType, chosenIssue, retargeting } = validated;
      const partner = PARTNER_BY_SEAT[action.actor];
      const issue = next.issues[chosenIssue];
      if (actionType === 'lead') {
        issue.firmMarkers[action.actor] += next.rules.leadOwnMarkers;
      } else {
        issue.firmMarkers[action.actor] += next.rules.coCounselOwnMarkers;
        issue.firmMarkers[partner] += next.rules.coCounselPartnerMarkers;
        issue.jointWork[side] += next.rules.coCounselJointWork;
      }

      if (action.useSpecialty === true) {
        if (retargeting) {
          markCardPowerSpent(next, action.actor, { slot: action.slot, chosenIssue });
        } else if (canBoostCaseCard(next, action.actor, chosenIssue)) {
          issue.firmMarkers[action.actor] += 1;
          markCardPowerSpent(next, action.actor, { slot: action.slot, chosenIssue });
        } else if (actionType === 'co_counsel' && canBoostCoCounsel(next, action.actor)) {
          issue.jointWork[side] += 1;
          markCardPowerSpent(next, action.actor, { slot: action.slot, chosenIssue });
        } else {
          return fail('specialty_not_applicable', 'This Specialty does not apply to that Case card');
        }
      }

      const docketCard = next.docket.find((entry) => entry.slot === action.slot);
      if (!docketCard) throw new Error(`Docket slot ${action.slot} disappeared`);
      docketCard.usedBy[side] = action.actor;
      docketCard.chosenIssueBy[side] = chosenIssue;
      docketCard.chosenActionBy[side] = actionType;
      next.actionsResolvedThisRound += 1;
      if (next.recordTelemetry) next.actionHistory.push(action);
      appendEvent(next, 'case_card_resolved', {
        slot: action.slot,
        cardId: docketCard.cardId,
        side,
        chosenIssue,
        actionType,
      }, action.actor);

      if (next.actionsResolvedThisRound === 12) {
        next.activeSeat = null;
        finishRound(next);
      } else {
        next.activeSeat = nextSeat(action.actor);
      }
    }

    assertGameInvariants(next);
    return { ok: true, state: next };
  } catch (error) {
    return fail('engine_error', error instanceof Error ? error.message : String(error));
  }
}

export function replayGame(initial: GameState, actions: readonly GameAction[]): GameState {
  let state = cloneState(initial);
  for (const action of actions) {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`Replay failed at ${action.type}: ${result.error.message}`);
    state = result.state;
  }
  return state;
}
