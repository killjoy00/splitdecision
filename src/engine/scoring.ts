import { appendEvent } from './events.js';
import { SEATS_BY_SIDE } from './selectors.js';
import {
  SEAT_ORDER,
  type GameState,
  type HearingResult,
  type IssueId,
  type LeadCreditSource,
  type SeatId,
  type SideId,
} from './types.js';

function otherSide(side: SideId): SideId {
  return side === 'plaintiff' ? 'defense' : 'plaintiff';
}

function clearIssue(state: GameState, issueId: IssueId): void {
  const issue = state.issues[issueId];
  for (const seat of SEAT_ORDER) issue.firmMarkers[seat] = 0;
  issue.jointWork.plaintiff = 0;
  issue.jointWork.defense = 0;
}

export function scoreIssue(
  state: GameState,
  issueId: IssueId,
  source: LeadCreditSource,
): HearingResult {
  const issue = state.issues[issueId];
  const personalStrength = { ...issue.firmMarkers };
  const sideStrength: Record<SideId, number> = {
    plaintiff:
      personalStrength.P1 + personalStrength.P2 + issue.jointWork.plaintiff,
    defense:
      personalStrength.D1 + personalStrength.D2 + issue.jointWork.defense,
  };

  const base: HearingResult = {
    issueId,
    source,
    winningSide: null,
    leadFirm: null,
    supportFirm: null,
    sideStrength,
    personalStrength,
    pointsAwarded: {},
    sideTieBreaker: 'none',
    leadTieBreaker: 'none',
  };

  if (sideStrength.plaintiff === 0 && sideStrength.defense === 0) {
    base.sideTieBreaker = 'unresolved';
    base.leadTieBreaker = 'unresolved';
    if (source === 'hearing') {
      const priorCount = issue.normalHearingsResolved;
      issue.normalHearingsResolved = (priorCount + 1) as 1 | 2;
      if (priorCount === 0) clearIssue(state, issueId);
    }
    state.hearingResults.push(base);
    appendEvent(state, 'issue_unresolved', base);
    return base;
  }

  let winningSide: SideId;
  if (sideStrength.plaintiff !== sideStrength.defense) {
    winningSide = sideStrength.plaintiff > sideStrength.defense ? 'plaintiff' : 'defense';
  } else if (issue.jointWork.plaintiff !== issue.jointWork.defense) {
    winningSide = issue.jointWork.plaintiff > issue.jointWork.defense ? 'plaintiff' : 'defense';
    base.sideTieBreaker = 'joint_work';
  } else {
    winningSide = state.courtFavor;
    base.sideTieBreaker = 'courts_favor';
    state.courtFavor = otherSide(state.courtFavor);
  }

  const [firstFirm, secondFirm] = SEATS_BY_SIDE[winningSide];
  let leadFirm: SeatId;
  if (personalStrength[firstFirm] !== personalStrength[secondFirm]) {
    leadFirm = personalStrength[firstFirm] > personalStrength[secondFirm] ? firstFirm : secondFirm;
  } else {
    leadFirm = state.firstChairBySide[winningSide];
    base.leadTieBreaker = 'first_chair';
    state.firstChairBySide[winningSide] = leadFirm === firstFirm ? secondFirm : firstFirm;
  }
  const supportFirm = leadFirm === firstFirm ? secondFirm : firstFirm;

  const leadPoints = source === 'hearing'
    ? state.rules.normalLeadPoints
    : state.rules.closingLeadPoints;
  const supportPoints = source === 'hearing'
    ? state.rules.normalPartnerPoints
    : state.rules.closingPartnerPoints;

  state.players[leadFirm].reputation += leadPoints;
  state.players[leadFirm].leadCredits.push({ issueId, source, round: state.round });
  base.pointsAwarded[leadFirm] = leadPoints;

  if (personalStrength[supportFirm] > 0) {
    state.players[supportFirm].reputation += supportPoints;
    base.pointsAwarded[supportFirm] = supportPoints;
  }

  base.winningSide = winningSide;
  base.leadFirm = leadFirm;
  base.supportFirm = supportFirm;

  if (source === 'hearing') {
    const priorCount = issue.normalHearingsResolved;
    issue.normalHearingsResolved = (priorCount + 1) as 1 | 2;
    if (priorCount === 0) clearIssue(state, issueId);
  }

  state.hearingResults.push(base);
  appendEvent(state, source === 'hearing' ? 'hearing_scored' : 'closing_scored', base);
  return base;
}
