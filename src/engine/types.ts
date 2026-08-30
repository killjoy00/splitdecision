export const ISSUE_IDS = [
  'witnesses',
  'evidence',
  'experts',
  'judge',
  'jury',
  'case_law',
] as const;

export const SIDE_IDS = ['plaintiff', 'defense'] as const;
export const SEAT_ORDER = ['P1', 'D1', 'P2', 'D2'] as const;
export const SLOTS = [1, 2, 3, 4, 5, 6] as const;

export type IssueId = (typeof ISSUE_IDS)[number];
export type SideId = (typeof SIDE_IDS)[number];
export type SeatId = (typeof SEAT_ORDER)[number];
export type Slot = (typeof SLOTS)[number];
export type BotLevel = 'human' | 'easy' | 'medium' | 'hard';
export type FocusActionType = 'lead' | 'co_counsel';
export type CaseActionType = FocusActionType | 'citation' | 'second_chair';
export type CaseCardAction = CaseActionType | 'choose';
export type CaseCardForm = 'dual_issue' | 'focus' | 'citation';
export type LeadCreditSource = 'hearing' | 'closing';
export type SpecialtyPowerTiming =
  | 'before_issue_scores'
  | 'when_resolving_case_card'
  | 'when_resolving_co_counsel'
  | 'after_closing_reveal';

export interface IssueData {
  id: IssueId;
  name: string;
  abbr: string;
  description: string;
}

export interface CaseCardData {
  id: string;
  title: string;
  form: CaseCardForm;
  action: CaseCardAction;
  issues: IssueId[];
  rulesText: string;
}

export interface SpecialtyData {
  id: string;
  name: string;
  powerTiming: SpecialtyPowerTiming;
  powerIssue?: IssueId;
  powerIssues?: IssueId[];
  power: string;
  bonusPoints: number;
  bonus: string;
}

export interface GameData {
  schemaVersion: string;
  title: string;
  issues: IssueData[];
  caseCards: CaseCardData[];
  specialties: SpecialtyData[];
  issueOrder: IssueId[];
}

export interface RulesConfig {
  rounds: number;
  docketSize: number;
  briefSize: number;
  normalLeadPoints: number;
  normalPartnerPoints: number;
  closingLeadPoints: number;
  closingPartnerPoints: number;
  leadOwnMarkers: number;
  coCounselOwnMarkers: number;
  coCounselPartnerMarkers: number;
  coCounselJointWork: number;
  specialtiesEnabled: boolean;
  allowPlacementAfterSecondHearing: boolean;
}

export const DEFAULT_RULES: RulesConfig = {
  rounds: 6,
  docketSize: 6,
  briefSize: 3,
  normalLeadPoints: 3,
  normalPartnerPoints: 2,
  closingLeadPoints: 2,
  closingPartnerPoints: 1,
  leadOwnMarkers: 3,
  coCounselOwnMarkers: 2,
  coCounselPartnerMarkers: 1,
  coCounselJointWork: 1,
  specialtiesEnabled: true,
  allowPlacementAfterSecondHearing: true,
};

export interface LeadCredit {
  issueId: IssueId;
  source: LeadCreditSource;
  round: number;
}

export interface PlayerState {
  seatId: SeatId;
  sideId: SideId;
  partnerSeatId: SeatId;
  controller: BotLevel;
  reputation: number;
  leadCredits: LeadCredit[];
  closingArgumentIssue: IssueId;
  specialtyOptions: string[];
  specialtyId: string | null;
  specialtyUsed: boolean;
  specialtyRevealed: boolean;
  specialtyBonusAwarded: number;
}

export interface PendingIssueScore {
  issueId: IssueId;
  source: LeadCreditSource;
}

export interface SpecialtyWindowState {
  kind: 'before_issue_scores' | 'after_closing_reveal';
  issueId: IssueId | null;
  pendingSeats: SeatId[];
}

export interface IssueState {
  firmMarkers: Record<SeatId, number>;
  jointWork: Record<SideId, number>;
  normalHearingsResolved: 0 | 1 | 2;
}

export interface DocketCardState {
  slot: Slot;
  cardId: string;
  usedBy: Record<SideId, SeatId | null>;
  chosenIssueBy: Record<SideId, IssueId | null>;
  chosenActionBy: Record<SideId, CaseActionType | null>;
}

export type Split = [Slot[], Slot[]];

export interface BriefState {
  divider: SeatId;
  chooser: SeatId;
  submittedSplit: Split | null;
  chosenBriefIndex: 0 | 1 | null;
  assignments: Partial<Record<SeatId, Slot[]>>;
}

export type GamePhase =
  | 'setup_specialty_choice'
  | 'round_split_commit'
  | 'round_choose_commit'
  | 'round_argue'
  | 'specialty_power_window'
  | 'closing_scoring'
  | 'complete';

export interface HearingResult {
  issueId: IssueId;
  source: LeadCreditSource;
  winningSide: SideId | null;
  leadFirm: SeatId | null;
  supportFirm: SeatId | null;
  sideStrength: Record<SideId, number>;
  personalStrength: Record<SeatId, number>;
  pointsAwarded: Partial<Record<SeatId, number>>;
  sideTieBreaker: 'none' | 'joint_work' | 'courts_favor' | 'unresolved';
  leadTieBreaker: 'none' | 'first_chair' | 'unresolved';
}

export interface VerdictResult {
  winningSide: SideId;
  winningFirm: SeatId;
  sideFloor: Record<SideId, number>;
  sideTotal: Record<SideId, number>;
  sideTieBreaker: 'floor' | 'combined_reputation' | 'courts_favor';
  firmTieBreaker: 'reputation' | 'lead_credits' | 'closing_credits' | 'first_chair';
}

export interface SpecialtyBonusResult {
  seatId: SeatId;
  specialtyId: string;
  bonusPoints: number;
  earned: boolean;
}

export interface GameEvent {
  index: number;
  phase: GamePhase;
  round: number;
  actor: SeatId | null;
  type: string;
  payload: unknown;
  stateHash: string;
}

export interface GameState {
  recordTelemetry: boolean;
  schemaVersion: string;
  seed: string;
  rules: RulesConfig;
  phase: GamePhase;
  round: number;
  players: Record<SeatId, PlayerState>;
  issues: Record<IssueId, IssueState>;
  hearingSchedule: Array<[IssueId, IssueId]>;
  caseDeck: string[];
  caseDeckIndex: number;
  docket: DocketCardState[];
  briefs: Record<SideId, BriefState>;
  dividerBySide: Record<SideId, SeatId>;
  firstChairBySide: Record<SideId, SeatId>;
  courtFavor: SideId;
  startingPlayer: SeatId;
  activeSeat: SeatId | null;
  actionsResolvedThisRound: number;
  closingUndealt: IssueId[];
  closingRevealed: IssueId[];
  specialtyWindow: SpecialtyWindowState | null;
  pendingIssueScores: PendingIssueScore[];
  hearingResults: HearingResult[];
  provisionalVerdict: VerdictResult | null;
  specialtyBonuses: SpecialtyBonusResult[];
  verdict: VerdictResult | null;
  actionHistory: GameAction[];
  eventLog: GameEvent[];
}

export interface CreateGameOptions {
  seed: string;
  recordTelemetry?: boolean;
  rules?: Partial<RulesConfig>;
  controllers?: Partial<Record<SeatId, BotLevel>>;
}

export type GameAction =
  | { type: 'choose_specialty'; actor: SeatId; specialtyId: string }
  | {
      type: 'use_specialty';
      actor: SeatId;
      toIssue?: IssueId;
      fromIssues?: IssueId[];
    }
  | { type: 'pass_specialty'; actor: SeatId }
  | { type: 'commit_split'; actor: SeatId; groups: Split }
  | { type: 'choose_brief'; actor: SeatId; briefIndex: 0 | 1 }
  | {
      type: 'play_docket_card';
      actor: SeatId;
      slot: Slot;
      chosenIssue: IssueId;
      focusAction?: FocusActionType;
      citedSlot?: Slot;
      useSpecialty?: boolean;
    };

export interface RuleError {
  code: string;
  message: string;
}

export type ApplyActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: RuleError };
