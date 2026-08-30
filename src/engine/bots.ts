import { GAME_DATA } from '../data/gameData.js';
import { getLegalActions, getPendingActors } from './legalActions.js';
import { createRandom, randomItem, shuffled, type RandomSource } from './random.js';
import { applyAction } from './reducer.js';
import { PARTNER_BY_SEAT, SIDE_BY_SEAT } from './selectors.js';
import { SPECIALTY_BY_ID } from './specialties.js';
import {
  ISSUE_IDS,
  SEAT_ORDER,
  type BotLevel,
  type GameAction,
  type GameState,
  type IssueId,
  type SeatId,
  type SideId,
  type Slot,
} from './types.js';

export type AutomatedBotLevel = Exclude<BotLevel, 'human'>;

export interface BotWeights {
  ownReputation: number;
  partnerReputation: number;
  sideFloor: number;
  opponentFloor: number;
  ownLead: number;
  currentHearing: number;
  nextHearing: number;
  futureHearing: number;
  knownClosing: number;
  sideStrength: number;
  personalLead: number;
  partnerParticipation: number;
  jointWork: number;
  overinvestment: number;
}

export const MEDIUM_BOT_WEIGHTS: Readonly<BotWeights> = {
  ownReputation: 7,
  partnerReputation: 4,
  sideFloor: 11,
  opponentFloor: 9,
  ownLead: 1.5,
  currentHearing: 6,
  nextHearing: 3,
  futureHearing: 1.25,
  knownClosing: 3.25,
  sideStrength: 1.2,
  personalLead: 0.8,
  partnerParticipation: 3.5,
  jointWork: 1.25,
  overinvestment: 0.8,
};

const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));
const HARD_SAMPLES = 3;
const HARD_LOOKAHEAD_ACTIONS = 1;
const SCORE_EPSILON = 1e-9;
const MEDIUM_NEAR_BEST_TOLERANCE = 8;
const MEDIUM_CANDIDATE_LIMIT = 3;

export interface ScoredBotAction {
  action: GameAction;
  score: number;
}

function otherSide(side: SideId): SideId {
  return side === 'plaintiff' ? 'defense' : 'plaintiff';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function actionKey(action: GameAction): string {
  if (action.type === 'commit_split') {
    return `split:${action.groups.map((group) => group.join('')).join('|')}`;
  }
  if (action.type === 'choose_brief') return `brief:${action.briefIndex}`;
  if (action.type === 'choose_specialty') return `specialty:${action.specialtyId}`;
  if (action.type === 'pass_specialty') return 'specialty:pass';
  if (action.type === 'use_specialty') {
    return `specialty:use:${action.toIssue ?? 'self'}:${(action.fromIssues ?? []).join(',')}`;
  }
  return `play:${action.slot}:${action.chosenIssue}:${action.focusAction ?? 'fixed'}:${action.useSpecialty ? 'power' : 'plain'}`;
}

function preClosingReputation(state: GameState): Record<SeatId, number> {
  if (state.phase === 'complete') {
    for (let index = state.eventLog.length - 1; index >= 0; index -= 1) {
      const event = state.eventLog[index];
      if (event?.type !== 'normal_case_complete' || !event.payload || typeof event.payload !== 'object') {
        continue;
      }
      const reputation = (event.payload as { reputation?: unknown }).reputation;
      if (!reputation || typeof reputation !== 'object') break;
      const values = reputation as Partial<Record<SeatId, unknown>>;
      if (SEAT_ORDER.every((seat) => typeof values[seat] === 'number')) {
        return Object.fromEntries(SEAT_ORDER.map((seat) => [seat, values[seat] as number])) as Record<SeatId, number>;
      }
      break;
    }
  }
  return Object.fromEntries(
    SEAT_ORDER.map((seat) => [seat, state.players[seat].reputation]),
  ) as Record<SeatId, number>;
}

function roundsUntilHearing(state: GameState, issueId: IssueId): number | null {
  if (state.phase === 'complete') return null;
  for (let scheduleIndex = state.round - 1; scheduleIndex < state.hearingSchedule.length; scheduleIndex += 1) {
    if (state.hearingSchedule[scheduleIndex]?.includes(issueId)) return scheduleIndex - (state.round - 1);
  }
  return null;
}

function hearingWeight(state: GameState, issueId: IssueId): number {
  const distance = roundsUntilHearing(state, issueId);
  if (distance === 0) return MEDIUM_BOT_WEIGHTS.currentHearing;
  if (distance === 1) return MEDIUM_BOT_WEIGHTS.nextHearing;
  if (distance !== null) return MEDIUM_BOT_WEIGHTS.futureHearing / distance;
  return 0;
}

function positionUtility(
  state: GameState,
  actor: SeatId,
  knownClosingIssue: IssueId | null,
): number {
  const side = SIDE_BY_SEAT[actor];
  const opponentSide = otherSide(side);
  const partner = PARTNER_BY_SEAT[actor];
  const opponentSeats = SEAT_ORDER.filter((seat) => SIDE_BY_SEAT[seat] === opponentSide);
  const reputation = preClosingReputation(state);
  const ownFloor = Math.min(reputation[actor], reputation[partner]);
  const opponentFloor = Math.min(...opponentSeats.map((seat) => reputation[seat]));
  const ownLeadWeight = ownFloor >= opponentFloor - 1 ? MEDIUM_BOT_WEIGHTS.ownLead : 0.2;

  let utility = reputation[actor] * MEDIUM_BOT_WEIGHTS.ownReputation
    + reputation[partner] * MEDIUM_BOT_WEIGHTS.partnerReputation
    + ownFloor * MEDIUM_BOT_WEIGHTS.sideFloor
    - opponentFloor * MEDIUM_BOT_WEIGHTS.opponentFloor
    + (reputation[actor] - reputation[partner]) * ownLeadWeight;

  for (const issueId of ISSUE_IDS) {
    const issue = state.issues[issueId];
    const ownMarkers = issue.firmMarkers[actor];
    const partnerMarkers = issue.firmMarkers[partner];
    const ownStrength = ownMarkers + partnerMarkers + issue.jointWork[side];
    const opponentStrength = opponentSeats.reduce(
      (total, seat) => total + issue.firmMarkers[seat],
      issue.jointWork[opponentSide],
    );
    const weight = hearingWeight(state, issueId)
      + (knownClosingIssue === issueId ? MEDIUM_BOT_WEIGHTS.knownClosing : 0);
    if (weight === 0) continue;

    const sideAdvantage = ownStrength - opponentStrength;
    utility += clamp(sideAdvantage, -5, 5) * weight * MEDIUM_BOT_WEIGHTS.sideStrength;
    utility += clamp(ownMarkers - partnerMarkers, -4, 4) * weight * MEDIUM_BOT_WEIGHTS.personalLead;
    utility += issue.jointWork[side] * weight * MEDIUM_BOT_WEIGHTS.jointWork;
    if (ownStrength >= opponentStrength && partnerMarkers > 0) {
      const partnerNeed = reputation[partner] <= reputation[actor] ? 1 : 0.45;
      utility += weight * MEDIUM_BOT_WEIGHTS.partnerParticipation * partnerNeed;
    }
    utility -= Math.max(0, sideAdvantage - 4) * weight * MEDIUM_BOT_WEIGHTS.overinvestment;
  }
  return utility;
}

function teamPositionUtility(state: GameState, actor: SeatId): number {
  const side = SIDE_BY_SEAT[actor];
  const opponentSide = otherSide(side);
  const partner = PARTNER_BY_SEAT[actor];
  const opponentSeats = SEAT_ORDER.filter((seat) => SIDE_BY_SEAT[seat] === opponentSide);
  const reputation = preClosingReputation(state);
  const ownFloor = Math.min(reputation[actor], reputation[partner]);
  const opponentFloor = Math.min(...opponentSeats.map((seat) => reputation[seat]));
  let utility = ownFloor * 18
    - opponentFloor * 15
    + (reputation[actor] + reputation[partner]) * 3
    - opponentSeats.reduce((total, seat) => total + reputation[seat], 0) * 1.5;

  for (const issueId of ISSUE_IDS) {
    const weight = hearingWeight(state, issueId);
    if (weight === 0) continue;
    const issue = state.issues[issueId];
    const ownStrength = issue.firmMarkers[actor]
      + issue.firmMarkers[partner]
      + issue.jointWork[side];
    const opponentStrength = opponentSeats.reduce(
      (total, seat) => total + issue.firmMarkers[seat],
      issue.jointWork[opponentSide],
    );
    utility += clamp(ownStrength - opponentStrength, -5, 5) * weight * 2.2;
    if (ownStrength >= opponentStrength
        && issue.firmMarkers[actor] > 0
        && issue.firmMarkers[partner] > 0) {
      utility += weight * 4;
    }
    utility -= Math.max(0, ownStrength - opponentStrength - 4) * weight;
  }
  return utility;
}

function issueOpportunityValue(
  state: GameState,
  actor: SeatId,
  issueId: IssueId,
  knownClosingIssue: IssueId | null,
): number {
  const side = SIDE_BY_SEAT[actor];
  const partner = PARTNER_BY_SEAT[actor];
  const opponentSide = otherSide(side);
  const issue = state.issues[issueId];
  const sideStrength = issue.firmMarkers[actor]
    + issue.firmMarkers[partner]
    + issue.jointWork[side];
  const opponentStrength = SEAT_ORDER
    .filter((seat) => SIDE_BY_SEAT[seat] === opponentSide)
    .reduce((total, seat) => total + issue.firmMarkers[seat], issue.jointWork[opponentSide]);
  const timing = hearingWeight(state, issueId)
    + (knownClosingIssue === issueId ? MEDIUM_BOT_WEIGHTS.knownClosing : 0.15);
  const competitive = 3.5 - Math.min(3.5, Math.abs(sideStrength - opponentStrength) * 0.55);
  return timing + competitive;
}

function cardOpportunityValue(
  state: GameState,
  actor: SeatId,
  slot: Slot,
  knownClosingIssue: IssueId | null,
): number {
  const docketCard = state.docket.find((entry) => entry.slot === slot);
  const card = docketCard ? CARD_BY_ID.get(docketCard.cardId) : null;
  if (!card) return -100;
  const issueValue = Math.max(
    ...card.issues.map((issueId) => issueOpportunityValue(state, actor, issueId, knownClosingIssue)),
  );
  const actionValue = card.action === 'co_counsel' ? 0.8 : card.action === 'choose' ? 1.1 : 0;
  return issueValue + actionValue;
}

function groupOpportunityValue(
  state: GameState,
  actor: SeatId,
  slots: readonly Slot[],
  knownClosingIssue: IssueId | null,
): number {
  let value = slots.reduce(
    (total, slot) => total + cardOpportunityValue(state, actor, slot, knownClosingIssue),
    0,
  );
  const currentHearings = state.hearingSchedule[state.round - 1] ?? [];
  for (const issueId of currentHearings) {
    const covered = slots.some((slot) => {
      const docketCard = state.docket.find((entry) => entry.slot === slot);
      const card = docketCard ? CARD_BY_ID.get(docketCard.cardId) : null;
      return card?.issues.includes(issueId) ?? false;
    });
    if (covered) value += 4;
  }
  return value;
}

function splitOpportunityValue(
  state: GameState,
  actor: SeatId,
  groups: [Slot[], Slot[]],
  knownClosingIssue: IssueId,
  modeledPartnerClosing: IssueId | null,
): number {
  const partner = PARTNER_BY_SEAT[actor];
  const actorValues: [number, number] = [
    groupOpportunityValue(state, actor, groups[0], knownClosingIssue),
    groupOpportunityValue(state, actor, groups[1], knownClosingIssue),
  ];
  const partnerValues: [number, number] = [
    groupOpportunityValue(state, partner, groups[0], modeledPartnerClosing),
    groupOpportunityValue(state, partner, groups[1], modeledPartnerClosing),
  ];
  const partnerChoice: 0 | 1 = partnerValues[1] > partnerValues[0] ? 1 : 0;
  const retainedIndex: 0 | 1 = partnerChoice === 0 ? 1 : 0;
  const balance = -Math.abs(actorValues[0] - actorValues[1]) * 0.35;
  return actorValues[retainedIndex] * 1.35 + partnerValues[partnerChoice] * 0.7 + balance;
}

/**
 * Values a Specialty at setup, where the board is still empty and an
 * apply-and-measure delta would score every option identically. Cards are
 * ranked by how reachable their endgame bonus is: Issues that score early are
 * easier to build Lead Credits in, and the holder's own Closing Argument Issue
 * is a guaranteed extra scoring opportunity.
 */
function specialtyDraftValue(state: GameState, actor: SeatId, specialtyId: string): number {
  const specialty = SPECIALTY_BY_ID.get(specialtyId);
  if (!specialty) return -Infinity;
  const ownClosing = state.players[actor].closingArgumentIssue;

  const issueReach = (issueId: IssueId): number => {
    const distance = roundsUntilHearing(state, issueId);
    const timing = distance === null ? 0 : clamp(6 - distance, 1, 6);
    return timing + (issueId === ownClosing ? 4 : 0);
  };

  if (specialty.powerTiming === 'before_issue_scores') {
    const issueId = specialty.powerIssue;
    if (!issueId) return 0;
    // One guaranteed marker plus a two-credit bonus concentrated in one Issue.
    return issueReach(issueId) * 1.6 + specialty.bonusPoints;
  }

  if (specialty.id === 'generalist') {
    // Full board flexibility; its three-Issue bonus is the easiest to reach.
    return 12 + specialty.bonusPoints;
  }

  if (specialty.id === 'team_builder') {
    return 8 + specialty.bonusPoints;
  }

  if (specialty.id === 'closer') {
    // Repositioning after the reveal is strong, but two Closing Lead Credits
    // out of a maximum of four is a demanding bonus.
    return 9 + specialty.bonusPoints * 0.6;
  }

  const issues = specialty.powerIssues ?? [];
  const reach = issues.reduce((total, issueId) => total + issueReach(issueId), 0);
  return reach * 0.9 + specialty.bonusPoints;
}

/**
 * Discourages spending a `before_issue_scores` power early. The marker only
 * matters in the Hearing that is about to resolve, or in a Closing Argument
 * Issue the holder already knows will be revealed.
 */
function powerTimingAdjustment(state: GameState, actor: SeatId, action: GameAction): number {
  if (action.type !== 'use_specialty' || state.phase !== 'round_argue') return 0;
  const specialtyId = state.players[actor].specialtyId;
  const specialty = specialtyId === null ? undefined : SPECIALTY_BY_ID.get(specialtyId);
  const issueId = specialty?.powerIssue;
  if (!issueId) return 0;

  const distance = roundsUntilHearing(state, issueId);
  if (distance === 0) return 0;
  if (issueId === state.players[actor].closingArgumentIssue) return -4;
  return -28;
}

function scoreMediumActionWithClosing(
  state: GameState,
  actor: SeatId,
  action: GameAction,
  knownClosingIssue: IssueId | null,
): number {
  if (action.type === 'commit_split') {
    return splitOpportunityValue(
      state,
      actor,
      action.groups,
      knownClosingIssue ?? state.players[actor].closingArgumentIssue,
      null,
    );
  }
  if (action.type === 'choose_brief') {
    const split = state.briefs[SIDE_BY_SEAT[actor]].submittedSplit;
    if (!split) return -Infinity;
    return groupOpportunityValue(state, actor, split[action.briefIndex], knownClosingIssue);
  }
  if (action.type === 'choose_specialty') {
    return specialtyDraftValue(state, actor, action.specialtyId);
  }

  const result = applyAction(state, action);
  if (!result.ok) return -Infinity;
  return positionUtility(result.state, actor, knownClosingIssue)
    - positionUtility(state, actor, knownClosingIssue)
    + powerTimingAdjustment(state, actor, action);
}

export function scoreMediumAction(
  state: GameState,
  actor: SeatId,
  action: GameAction,
): number {
  return scoreMediumActionWithClosing(
    state,
    actor,
    action,
    state.players[actor].closingArgumentIssue,
  );
}

function sampledUnknownClosings(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): Partial<Record<SeatId, IssueId>> {
  const ownClosing = state.players[actor].closingArgumentIssue;
  const candidates = shuffled(ISSUE_IDS.filter((issueId) => issueId !== ownClosing), random);
  const result: Partial<Record<SeatId, IssueId>> = { [actor]: ownClosing };
  let candidateIndex = 0;
  for (const seat of SEAT_ORDER) {
    if (seat === actor) continue;
    result[seat] = candidates[candidateIndex] as IssueId;
    candidateIndex += 1;
  }
  return result;
}

function chooseModeledAction(
  state: GameState,
  actor: SeatId,
  knownClosingIssue: IssueId | null,
  random: RandomSource,
): GameAction | null {
  const legalActions = getLegalActions(state, actor);
  if (legalActions.length === 0) return null;
  const scored = legalActions.map((action) => ({
    action,
    score: scoreMediumActionWithClosing(state, actor, action, knownClosingIssue),
  })).sort((left, right) => right.score - left.score);
  const best = scored[0]?.score ?? -Infinity;
  const plausible = scored.filter((entry) => entry.score >= best - 0.75).slice(0, 3);
  return randomItem(plausible, random).action;
}

function hardRolloutValue(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): number {
  const sampledClosings = sampledUnknownClosings(state, actor, random);
  let rollout = state;
  for (let depth = 0; depth < HARD_LOOKAHEAD_ACTIONS && rollout.phase !== 'complete'; depth += 1) {
    const nextActor = getPendingActors(rollout)[0] ?? null;
    if (!nextActor) break;
    const action = chooseModeledAction(
      rollout,
      nextActor,
      sampledClosings[nextActor] ?? null,
      random,
    );
    if (!action) break;
    const result = applyAction(rollout, action);
    if (!result.ok) break;
    rollout = result.state;
  }
  return positionUtility(rollout, actor, state.players[actor].closingArgumentIssue);
}

function scoreHardAction(
  state: GameState,
  actor: SeatId,
  action: GameAction,
  random: RandomSource,
): number {
  const ownClosing = state.players[actor].closingArgumentIssue;
  const mediumScore = scoreMediumActionWithClosing(state, actor, action, ownClosing);
  if (action.type === 'choose_specialty') return mediumScore;
  if (action.type === 'commit_split') {
    let sampledScore = 0;
    for (let sample = 0; sample < HARD_SAMPLES; sample += 1) {
      const modeled = sampledUnknownClosings(state, actor, random)[PARTNER_BY_SEAT[actor]] ?? null;
      sampledScore += splitOpportunityValue(state, actor, action.groups, ownClosing, modeled);
    }
    return mediumScore * 0.35 + (sampledScore / HARD_SAMPLES) * 0.65;
  }

  const result = applyAction(state, action);
  if (!result.ok) return -Infinity;
  const immediatePosition = positionUtility(result.state, actor, ownClosing);
  const teamDelta = teamPositionUtility(result.state, actor) - teamPositionUtility(state, actor);
  let futurePosition = 0;
  for (let sample = 0; sample < HARD_SAMPLES; sample += 1) {
    futurePosition += hardRolloutValue(result.state, actor, random);
  }
  const expectedFutureDelta = futurePosition / HARD_SAMPLES - immediatePosition;
  return mediumScore * 0.65 + teamDelta * 0.65 + expectedFutureDelta * 0.12;
}

export function rankBotActions(
  state: GameState,
  actor: SeatId,
  level: Exclude<AutomatedBotLevel, 'easy'> = 'medium',
  random?: RandomSource,
): ScoredBotAction[] {
  const legalActions = getLegalActions(state, actor);
  const hardRandom = random ?? createRandom(
    `${state.seed}:hard-evaluation:${state.eventLog.length}:${actor}`,
  );
  return legalActions.map((action) => ({
    action,
    score: level === 'hard'
      ? scoreHardAction(state, actor, action, hardRandom)
      : scoreMediumAction(state, actor, action),
  })).sort((left, right) => right.score - left.score || actionKey(left.action).localeCompare(actionKey(right.action)));
}

function chooseTopRanked(scored: ScoredBotAction[], random: RandomSource): GameAction {
  const best = scored[0];
  if (!best) throw new Error('Bot has no scored legal actions');
  const tied = scored.filter((entry) => Math.abs(entry.score - best.score) <= SCORE_EPSILON);
  return randomItem(tied, random).action;
}

export function chooseEasyAction(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): GameAction {
  const legalActions = getLegalActions(state, actor);
  if (legalActions.length === 0) throw new Error(`Easy Bot ${actor} has no legal actions in ${state.phase}`);
  return randomItem(legalActions, random);
}

export function chooseMediumAction(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): GameAction {
  const ranked = rankBotActions(state, actor, 'medium');
  const best = ranked[0];
  if (!best) throw new Error(`Medium Bot ${actor} has no legal actions in ${state.phase}`);
  const nearBest = ranked
    .filter((entry) => entry.score >= best.score - MEDIUM_NEAR_BEST_TOLERANCE)
    .slice(0, MEDIUM_CANDIDATE_LIMIT);
  return randomItem(nearBest, random).action;
}

export function chooseHardAction(
  state: GameState,
  actor: SeatId,
  random: RandomSource,
): GameAction {
  return chooseTopRanked(rankBotActions(state, actor, 'hard', random), random);
}

export function chooseBotAction(
  state: GameState,
  actor: SeatId,
  level: AutomatedBotLevel,
  random: RandomSource,
): GameAction {
  if (level === 'easy') return chooseEasyAction(state, actor, random);
  if (level === 'medium') return chooseMediumAction(state, actor, random);
  return chooseHardAction(state, actor, random);
}
