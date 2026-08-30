import { GAME_DATA } from '../data/gameData.js';
import { appendEvent } from './events.js';
import { SEATS_BY_SIDE } from './selectors.js';
import {
  SEAT_ORDER,
  type GameState,
  type IssueId,
  type SeatId,
  type SpecialtyBonusResult,
  type SpecialtyData,
} from './types.js';

export const SPECIALTY_BY_ID = new Map(
  GAME_DATA.specialties.map((specialty) => [specialty.id, specialty]),
);

/** Specialty options dealt to each firm during setup. */
export const SPECIALTY_OPTIONS_PER_SEAT = 2;

export function getSpecialty(specialtyId: string): SpecialtyData {
  const specialty = SPECIALTY_BY_ID.get(specialtyId);
  if (!specialty) throw new Error(`Unknown Specialty ${specialtyId}`);
  return specialty;
}

export function getSeatSpecialty(state: GameState, seat: SeatId): SpecialtyData | null {
  const specialtyId = state.players[seat].specialtyId;
  return specialtyId === null ? null : getSpecialty(specialtyId);
}

/**
 * A firm may still spend its one-time power. Choosing a Specialty is a
 * prerequisite, so unchosen seats never hold a live power.
 */
export function hasUnusedPower(state: GameState, seat: SeatId): boolean {
  const player = state.players[seat];
  return state.rules.specialtiesEnabled
    && player.specialtyId !== null
    && !player.specialtyUsed;
}

/** Issues whose printed Closing Argument card is face down. */
export function unrevealedIssues(state: GameState): IssueId[] {
  return GAME_DATA.issueOrder.filter((issueId) => !state.closingRevealed.includes(issueId));
}

/**
 * Marks a Specialty spent. Spending always reveals the card, because every
 * power changes the public board in a way opponents can see.
 */
function spendPower(state: GameState, seat: SeatId, payload: unknown): void {
  const player = state.players[seat];
  player.specialtyUsed = true;
  player.specialtyRevealed = true;
  appendEvent(state, 'specialty_power_used', {
    specialtyId: player.specialtyId,
    ...(payload as Record<string, unknown>),
  }, seat);
}

/**
 * `before_issue_scores`: place one extra Firm marker in the Specialty's Issue.
 * Timing is the holder's choice, so this resolves on their own turn while the
 * Issue is still live.
 */
export function applyBeforeIssueScoresPower(state: GameState, seat: SeatId): void {
  const specialty = getSeatSpecialty(state, seat);
  if (!specialty?.powerIssue) throw new Error(`${seat} has no Issue-scoring Specialty power`);
  state.issues[specialty.powerIssue].firmMarkers[seat] += 1;
  spendPower(state, seat, { issueId: specialty.powerIssue });
}

/**
 * `after_closing_reveal` (Closer): move up to two Firm markers out of
 * unrevealed Issues into a single revealed Issue.
 */
export function applyCloserPower(
  state: GameState,
  seat: SeatId,
  fromIssues: readonly IssueId[],
  toIssue: IssueId,
): void {
  for (const issueId of fromIssues) state.issues[issueId].firmMarkers[seat] -= 1;
  state.issues[toIssue].firmMarkers[seat] += fromIssues.length;
  spendPower(state, seat, { fromIssues: [...fromIssues], toIssue });
}

/**
 * Extra Firm marker granted by Trial Lawyer, Technical Litigator, and Motion
 * Counsel when they resolve a Case card in one of their two printed Issues.
 */
export function canBoostCaseCard(
  state: GameState,
  seat: SeatId,
  chosenIssue: IssueId,
): boolean {
  if (!hasUnusedPower(state, seat)) return false;
  const specialty = getSeatSpecialty(state, seat);
  return specialty?.powerTiming === 'when_resolving_case_card'
    && (specialty.powerIssues?.includes(chosenIssue) ?? false);
}

/** Generalist may retarget a Case card to any Issue, keeping its action type. */
export function canRetargetAnyIssue(state: GameState, seat: SeatId): boolean {
  if (!hasUnusedPower(state, seat)) return false;
  return getSeatSpecialty(state, seat)?.id === 'generalist';
}

/** Team Builder adds one extra Joint Work marker when resolving Co-Counsel. */
export function canBoostCoCounsel(state: GameState, seat: SeatId): boolean {
  if (!hasUnusedPower(state, seat)) return false;
  return getSeatSpecialty(state, seat)?.powerTiming === 'when_resolving_co_counsel';
}

export function markCardPowerSpent(
  state: GameState,
  seat: SeatId,
  payload: Record<string, unknown>,
): void {
  spendPower(state, seat, payload);
}

function leadCreditsInIssue(state: GameState, seat: SeatId, issueId: IssueId): number {
  return state.players[seat].leadCredits.filter((credit) => credit.issueId === issueId).length;
}

function closingLeadCredits(state: GameState, seat: SeatId): number {
  return state.players[seat].leadCredits.filter((credit) => credit.source === 'closing').length;
}

function distinctLeadCreditIssues(state: GameState, seat: SeatId): number {
  return new Set(state.players[seat].leadCredits.map((credit) => credit.issueId)).size;
}

/**
 * Evaluates one endgame bonus. `baselineReputation` is every firm's Reputation
 * before any Specialty bonus is paid, so Team Builder's threshold cannot be met
 * by bonuses awarded earlier in the same pass.
 */
function isBonusEarned(
  state: GameState,
  seat: SeatId,
  specialty: SpecialtyData,
  baselineReputation: Record<SeatId, number>,
): boolean {
  if (specialty.powerTiming === 'before_issue_scores') {
    const issueId = specialty.powerIssue;
    if (!issueId) throw new Error(`${specialty.id} is missing its bonus Issue`);
    return leadCreditsInIssue(state, seat, issueId) >= 2;
  }

  if (specialty.id === 'generalist') return distinctLeadCreditIssues(state, seat) >= 3;
  if (specialty.id === 'closer') return closingLeadCredits(state, seat) >= 2;

  if (specialty.id === 'team_builder') {
    const side = state.players[seat].sideId;
    return SEATS_BY_SIDE[side].every((member) => (baselineReputation[member] ?? 0) >= 17);
  }

  const issues = specialty.powerIssues;
  if (!issues) throw new Error(`${specialty.id} is missing its bonus Issues`);
  return issues.every((issueId) => leadCreditsInIssue(state, seat, issueId) >= 1);
}

/**
 * Pays every earned endgame bonus. Runs after Closing Arguments score and
 * before the verdict, so bonuses count toward the team floor.
 */
export function applySpecialtyBonuses(state: GameState): SpecialtyBonusResult[] {
  if (!state.rules.specialtiesEnabled) return [];

  const baselineReputation = Object.fromEntries(
    SEAT_ORDER.map((seat) => [seat, state.players[seat].reputation]),
  ) as Record<SeatId, number>;

  const results: SpecialtyBonusResult[] = [];
  for (const seat of SEAT_ORDER) {
    const specialty = getSeatSpecialty(state, seat);
    if (!specialty) continue;
    const earned = isBonusEarned(state, seat, specialty, baselineReputation);
    const player = state.players[seat];
    player.specialtyRevealed = true;
    if (earned) {
      player.reputation += specialty.bonusPoints;
      player.specialtyBonusAwarded = specialty.bonusPoints;
    }
    results.push({
      seatId: seat,
      specialtyId: specialty.id,
      bonusPoints: specialty.bonusPoints,
      earned,
    });
  }

  state.specialtyBonuses = results;
  appendEvent(state, 'specialty_bonuses_scored', results);
  return results;
}
