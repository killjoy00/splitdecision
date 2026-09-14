import { GameRoom as BaseGameRoom } from './index.js';
import baseHandler from './index.js';
import type { RemotePlayerSnapshot } from '../../src/remote/protocol.js';
import { REMOTE_PROTOCOL_VERSION } from '../../src/remote/protocol.js';

const TELEMETRY_KEY = 'playtest-telemetry-v1';
const RECONNECT_GAP_MS = 15_000;

type DurationStat = {
  count: number;
  totalMs: number;
  maxMs: number;
};

interface PlaytestTelemetry {
  version: 1;
  roomCreatedAt: number;
  matchNumber: number;
  gameStartedAt: number | null;
  currentPhase: string | null;
  phaseStartedAt: number | null;
  phaseDurationsMs: Record<string, number>;
  lastHumanActionAt: number | null;
  humanActionCount: number;
  actionCounts: Record<string, number>;
  caseActionCounts: Record<string, number>;
  issueSelectionCounts: Record<string, number>;
  citationTargetCount: number;
  citationCompanionPositions: {
    first: number;
    second: number;
    unknown: number;
  };
  decisionTimingByAction: Record<string, DurationStat>;
  seatRecoveryActions: number;
  botReplacements: number;
  hostTransfers: number;
  reconnects: number;
  humanSeatsAtStart: number | null;
  botSeatsAtStart: number | null;
  specialtiesEnabled: boolean | null;
  summaryLogged: boolean;
}

function initialTelemetry(now: number): PlaytestTelemetry {
  return {
    version: 1,
    roomCreatedAt: now,
    matchNumber: 0,
    gameStartedAt: null,
    currentPhase: null,
    phaseStartedAt: null,
    phaseDurationsMs: {},
    lastHumanActionAt: null,
    humanActionCount: 0,
    actionCounts: {},
    caseActionCounts: {},
    issueSelectionCounts: {},
    citationTargetCount: 0,
    citationCompanionPositions: { first: 0, second: 0, unknown: 0 },
    decisionTimingByAction: {},
    seatRecoveryActions: 0,
    botReplacements: 0,
    hostTransfers: 0,
    reconnects: 0,
    humanSeatsAtStart: null,
    botSeatsAtStart: null,
    specialtiesEnabled: null,
    summaryLogged: false,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function addDurationStat(record: Record<string, DurationStat>, key: string, elapsedMs: number): void {
  const previous = record[key] ?? { count: 0, totalMs: 0, maxMs: 0 };
  previous.count += 1;
  previous.totalMs += elapsedMs;
  previous.maxMs = Math.max(previous.maxMs, elapsedMs);
  record[key] = previous;
}

function updatePhase(telemetry: PlaytestTelemetry, phase: string | null, now: number): void {
  if (!phase) return;
  if (!telemetry.currentPhase) {
    telemetry.currentPhase = phase;
    telemetry.phaseStartedAt = now;
    return;
  }
  if (telemetry.currentPhase === phase) return;
  if (telemetry.phaseStartedAt !== null && telemetry.currentPhase !== 'complete') {
    const elapsedMs = Math.max(0, now - telemetry.phaseStartedAt);
    telemetry.phaseDurationsMs[telemetry.currentPhase] =
      (telemetry.phaseDurationsMs[telemetry.currentPhase] ?? 0) + elapsedMs;
  }
  telemetry.currentPhase = phase;
  telemetry.phaseStartedAt = now;
}

function finalizeCurrentPhase(telemetry: PlaytestTelemetry, now: number): void {
  if (!telemetry.currentPhase || telemetry.currentPhase === 'complete' || telemetry.phaseStartedAt === null) return;
  const elapsedMs = Math.max(0, now - telemetry.phaseStartedAt);
  telemetry.phaseDurationsMs[telemetry.currentPhase] =
    (telemetry.phaseDurationsMs[telemetry.currentPhase] ?? 0) + elapsedMs;
  telemetry.phaseStartedAt = now;
}

function telemetryForGame(
  previous: PlaytestTelemetry | null,
  snapshot: RemotePlayerSnapshot,
  now: number,
): PlaytestTelemetry {
  const base = initialTelemetry(previous?.roomCreatedAt ?? now);
  const game = snapshot.game;
  base.matchNumber = (previous?.matchNumber ?? 0) + 1;
  base.gameStartedAt = now;
  base.currentPhase = game?.phase ?? null;
  base.phaseStartedAt = game ? now : null;
  base.lastHumanActionAt = now;
  base.seatRecoveryActions = previous?.gameStartedAt === null
    ? previous.seatRecoveryActions
    : 0;
  base.hostTransfers = previous?.gameStartedAt === null
    ? previous.hostTransfers
    : 0;
  base.humanSeatsAtStart = snapshot.lobby.seats.filter((seat) => seat.controller === 'human').length;
  base.botSeatsAtStart = snapshot.lobby.seats.length - base.humanSeatsAtStart;
  base.specialtiesEnabled = game?.rules.specialtiesEnabled ?? null;
  return base;
}

function hearingSummary(snapshot: RemotePlayerSnapshot): Record<string, number> | null {
  const game = snapshot.game;
  if (!game) return null;
  const hearings = game.hearingResults.filter((result) => result.source === 'hearing');
  const margins = hearings.map((result) => Math.abs(
    result.sideStrength.plaintiff - result.sideStrength.defense,
  ));
  return {
    count: hearings.length,
    sideTiebreaks: hearings.filter((result) => result.sideTieBreaker !== 'none').length,
    closeMargins: margins.filter((margin) => margin <= 1).length,
    marginTotal: margins.reduce((sum, margin) => sum + margin, 0),
  };
}

function logSummary(
  telemetry: PlaytestTelemetry,
  outcome: 'completed' | 'abandoned',
  reason: string,
  snapshot: RemotePlayerSnapshot | null,
  now: number,
): void {
  if (telemetry.summaryLogged) return;
  finalizeCurrentPhase(telemetry, now);
  const game = snapshot?.game ?? null;
  console.log(JSON.stringify({
    event: 'split_decision_playtest_summary',
    telemetryVersion: telemetry.version,
    protocolVersion: REMOTE_PROTOCOL_VERSION,
    outcome,
    reason,
    matchNumber: telemetry.matchNumber,
    stage: game?.phase ?? telemetry.currentPhase ?? 'lobby',
    roomAgeMs: Math.max(0, now - telemetry.roomCreatedAt),
    gameDurationMs: telemetry.gameStartedAt === null
      ? null
      : Math.max(0, now - telemetry.gameStartedAt),
    phaseDurationsMs: telemetry.phaseDurationsMs,
    humanSeatsAtStart: telemetry.humanSeatsAtStart,
    botSeatsAtStart: telemetry.botSeatsAtStart,
    specialtiesEnabled: telemetry.specialtiesEnabled,
    humanActionCount: telemetry.humanActionCount,
    actionCounts: telemetry.actionCounts,
    caseActionCounts: telemetry.caseActionCounts,
    issueSelectionCounts: telemetry.issueSelectionCounts,
    citationTargetCount: telemetry.citationTargetCount,
    citationCompanionPositions: telemetry.citationCompanionPositions,
    decisionTimingByAction: telemetry.decisionTimingByAction,
    seatRecoveryActions: telemetry.seatRecoveryActions,
    botReplacements: telemetry.botReplacements,
    hostTransfers: telemetry.hostTransfers,
    reconnects: telemetry.reconnects,
    hearings: snapshot ? hearingSummary(snapshot) : null,
    verdict: game?.verdict ? {
      winningSide: game.verdict.winningSide,
      winningSeat: game.verdict.winningFirm,
      sideTieBreaker: game.verdict.sideTieBreaker,
      firmTieBreaker: game.verdict.firmTieBreaker,
    } : null,
  }));
  telemetry.summaryLogged = true;
}

function recordHumanAction(
  telemetry: PlaytestTelemetry,
  snapshot: RemotePlayerSnapshot,
  actionValue: unknown,
  now: number,
): void {
  const action = asRecord(actionValue);
  if (!action || typeof action.type !== 'string') return;
  telemetry.humanActionCount += 1;
  increment(telemetry.actionCounts, action.type);

  if (telemetry.lastHumanActionAt !== null) {
    addDurationStat(
      telemetry.decisionTimingByAction,
      action.type,
      Math.max(0, now - telemetry.lastHumanActionAt),
    );
  }
  telemetry.lastHumanActionAt = now;

  if (action.type !== 'play_docket_card') return;
  if (typeof action.chosenIssue === 'string') {
    increment(telemetry.issueSelectionCounts, action.chosenIssue);
  }

  const game = snapshot.game;
  if (!game) return;
  const side = snapshot.seat.startsWith('P') ? 'plaintiff' : 'defense';
  const docket = game.docket.find((entry) => entry.slot === action.slot);
  const caseAction = docket?.chosenActionBy[side];
  if (caseAction) increment(telemetry.caseActionCounts, caseAction);

  if (caseAction !== 'citation') return;
  telemetry.citationTargetCount += 1;
  const assignment = game.briefs[side].assignments[snapshot.seat] ?? [];
  const companions = assignment.filter((slot) => slot !== action.slot);
  const companionIndex = companions.findIndex((slot) => slot === action.citedSlot);
  if (companionIndex === 0) telemetry.citationCompanionPositions.first += 1;
  else if (companionIndex === 1) telemetry.citationCompanionPositions.second += 1;
  else telemetry.citationCompanionPositions.unknown += 1;
}

export class GameRoom extends BaseGameRoom {
  private readonly telemetryState: DurableObjectState;
  private readonly lastSeenAt = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.telemetryState = ctx;
  }

  private async readTelemetry(): Promise<PlaytestTelemetry | null> {
    return await this.telemetryState.storage.get<PlaytestTelemetry>(TELEMETRY_KEY) ?? null;
  }

  private async writeTelemetry(telemetry: PlaytestTelemetry): Promise<void> {
    await this.telemetryState.storage.put(TELEMETRY_KEY, telemetry);
  }

  private async ensureTelemetry(snapshot: RemotePlayerSnapshot, now: number): Promise<PlaytestTelemetry> {
    const existing = await this.readTelemetry();
    if (existing) return existing;
    const telemetry = telemetryForGame(null, snapshot, now);
    await this.writeTelemetry(telemetry);
    return telemetry;
  }

  async initialize(code: string, nameValue: unknown) {
    const result = await super.initialize(code, nameValue);
    if (result.ok) {
      this.lastSeenAt.clear();
      await this.writeTelemetry(initialTelemetry(Date.now()));
    }
    return result;
  }

  async start(token: string, seedValue: unknown, specialtiesEnabledValue: unknown) {
    const previous = await this.readTelemetry();
    const result = await super.start(token, seedValue, specialtiesEnabledValue);
    if (result.ok && result.value.game) {
      const now = Date.now();
      const telemetry = telemetryForGame(previous, result.value, now);
      await this.writeTelemetry(telemetry);
    }
    return result;
  }

  async getState(token: string) {
    const result = await super.getState(token);
    if (!result.ok) return result;

    const now = Date.now();
    const seat = result.value.seat;
    const previousSeenAt = this.lastSeenAt.get(seat);
    this.lastSeenAt.set(seat, now);
    if (previousSeenAt !== undefined && now - previousSeenAt >= RECONNECT_GAP_MS) {
      const telemetry = await this.readTelemetry();
      if (telemetry && telemetry.gameStartedAt !== null && !telemetry.summaryLogged) {
        telemetry.reconnects += 1;
        await this.writeTelemetry(telemetry);
      }
    }
    return result;
  }

  async act(token: string, actionValue: unknown) {
    const result = await super.act(token, actionValue);
    if (!result.ok) return result;

    const now = Date.now();
    const telemetry = await this.ensureTelemetry(result.value, now);
    recordHumanAction(telemetry, result.value, actionValue, now);
    updatePhase(telemetry, result.value.game?.phase ?? null, now);
    if (result.value.game?.phase === 'complete') {
      logSummary(telemetry, 'completed', 'verdict', result.value, now);
    }
    await this.writeTelemetry(telemetry);
    return result;
  }

  async release(token: string, seatValue: unknown, controllerValue: unknown) {
    const result = await super.release(token, seatValue, controllerValue);
    if (!result.ok) return result;

    const now = Date.now();
    const telemetry = await this.ensureTelemetry(result.value, now);
    telemetry.seatRecoveryActions += 1;
    if (result.value.game?.phase !== 'complete' && controllerValue !== 'human') {
      telemetry.botReplacements += 1;
    }
    updatePhase(telemetry, result.value.game?.phase ?? null, now);
    if (result.value.game?.phase === 'complete') {
      logSummary(telemetry, 'completed', 'verdict', result.value, now);
    }
    await this.writeTelemetry(telemetry);
    return result;
  }

  async leave(token: string) {
    const before = await super.getState(token);
    const result = await super.leave(token);
    if (!result.ok) return result;

    const now = Date.now();
    const telemetry = await this.readTelemetry();
    if (!telemetry) return result;

    if (before.ok) {
      const gameWasLive = before.value.game !== null && before.value.game.phase !== 'complete';
      if (gameWasLive) telemetry.botReplacements += 1;
      if (!result.value.closed && before.value.seat === before.value.lobby.hostSeat) {
        telemetry.hostTransfers += 1;
      }
    }

    if (result.value.closed) {
      if (before.ok && before.value.game?.phase !== 'complete') {
        logSummary(telemetry, 'abandoned', 'all_humans_left', before.value, now);
      }
      await this.telemetryState.storage.delete(TELEMETRY_KEY);
      this.lastSeenAt.clear();
      return result;
    }

    await this.writeTelemetry(telemetry);
    return result;
  }

  async alarm(): Promise<void> {
    const telemetry = await this.readTelemetry();
    if (telemetry && !telemetry.summaryLogged) {
      logSummary(telemetry, 'abandoned', 'expired', null, Date.now());
    }
    await this.telemetryState.storage.delete(TELEMETRY_KEY);
    this.lastSeenAt.clear();
    await super.alarm();
  }
}

export default baseHandler;
