import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlaytestReport,
  extractPlaytestSummaries,
  renderPlaytestMarkdown,
} from '../scripts/playtest-report-lib.mjs';

function summary(overrides = {}) {
  return {
    event: 'split_decision_playtest_summary',
    telemetryVersion: 1,
    protocolVersion: 2,
    outcome: 'completed',
    reason: 'verdict',
    matchNumber: 1,
    stage: 'complete',
    roomAgeMs: 1_000_000,
    gameDurationMs: 900_000,
    phaseDurationsMs: {
      setup_specialty_choice: 60_000,
      round_split_commit: 120_000,
      round_argue: 600_000,
      round_choose_commit: 120_000,
    },
    humanSeatsAtStart: 4,
    botSeatsAtStart: 0,
    specialtiesEnabled: true,
    humanActionCount: 40,
    actionCounts: {
      choose_specialty: 4,
      commit_split: 6,
      play_docket_card: 24,
      choose_brief: 6,
    },
    caseActionCounts: {
      lead: 8,
      co_counsel: 6,
      second_chair: 5,
      citation: 5,
    },
    issueSelectionCounts: {
      judge: 4,
      jury: 5,
      evidence: 6,
      witnesses: 5,
      experts: 4,
    },
    citationTargetCount: 5,
    citationCompanionPositions: { first: 3, second: 2, unknown: 0 },
    decisionTimingByAction: {
      play_docket_card: { count: 24, totalMs: 480_000, maxMs: 60_000 },
      choose_brief: { count: 6, totalMs: 60_000, maxMs: 15_000 },
    },
    seatRecoveryActions: 0,
    botReplacements: 0,
    hostTransfers: 0,
    reconnects: 1,
    hearings: { count: 12, sideTiebreaks: 2, closeMargins: 4, marginTotal: 36 },
    verdict: {
      winningSide: 'plaintiff',
      winningSeat: 'P1',
      sideTieBreaker: 'none',
      firmTieBreaker: 'reputation',
    },
    ...overrides,
  };
}

test('extractPlaytestSummaries handles JSON, nested strings, and decorated console lines', () => {
  const first = summary();
  const second = summary({ humanSeatsAtStart: 2, citationTargetCount: 1 });
  const nested = JSON.stringify({ logs: [{ message: JSON.stringify(first) }] });
  const decorated = `2026-09-14T12:00:00Z stdout ${JSON.stringify(second)}`;

  assert.equal(extractPlaytestSummaries(nested).length, 1);
  const decoratedResult = extractPlaytestSummaries(decorated);
  assert.equal(decoratedResult.length, 1);
  assert.equal(decoratedResult[0].humanSeatsAtStart, 2);
});

test('buildPlaytestReport aggregates mechanics, pace, competition, and lifecycle signals', () => {
  const summaries = [
    summary(),
    summary({
      humanSeatsAtStart: 2,
      botSeatsAtStart: 2,
      gameDurationMs: 1_100_000,
      caseActionCounts: { lead: 4, co_counsel: 4, second_chair: 5, citation: 7 },
      citationTargetCount: 7,
      citationCompanionPositions: { first: 2, second: 5, unknown: 0 },
      humanActionCount: 32,
      reconnects: 0,
      botReplacements: 1,
      hearings: { count: 12, sideTiebreaks: 1, closeMargins: 3, marginTotal: 48 },
      verdict: {
        winningSide: 'defense',
        winningSeat: 'D1',
        sideTieBreaker: 'floor',
        firmTieBreaker: 'first_chair',
      },
    }),
    summary({
      outcome: 'abandoned',
      reason: 'expired',
      matchNumber: 0,
      stage: 'lobby',
      gameDurationMs: null,
      phaseDurationsMs: {},
      humanSeatsAtStart: null,
      botSeatsAtStart: null,
      humanActionCount: 0,
      actionCounts: {},
      caseActionCounts: {},
      issueSelectionCounts: {},
      citationTargetCount: 0,
      citationCompanionPositions: { first: 0, second: 0, unknown: 0 },
      decisionTimingByAction: {},
      hearings: null,
      verdict: null,
    }),
  ];

  const report = buildPlaytestReport(summaries);
  assert.equal(report.samples.summaries, 3);
  assert.equal(report.samples.completed, 2);
  assert.equal(report.samples.abandoned, 1);
  assert.equal(report.samples.multiplayerCompleted, 2);
  assert.equal(report.samples.fullHumanCompleted, 1);
  assert.equal(report.samples.abandonmentReasons.expired, 1);
  assert.equal(report.mechanics.caseActionCounts.second_chair, 10);
  assert.equal(report.mechanics.caseActionCounts.citation, 12);
  assert.equal(report.mechanics.citationTargetCount, 12);
  assert.equal(report.mechanics.citationCompanionPositions.second, 7);
  assert.equal(report.competition.hearings.count, 24);
  assert.equal(report.competition.verdictSides.plaintiff, 1);
  assert.equal(report.competition.verdictSides.defense, 1);
  assert.equal(report.reliability.botReplacements, 1);
  assert.equal(report.reliability.reconnects, 1);
  assert.match(report.decisionGates.citation, /^REVIEW:/);
  assert.match(report.decisionGates.secondChair, /^REVIEW:/);
  assert.match(report.decisionGates.sample, /^HOLD:/);
});

test('mechanics filter can require multiplayer games without hiding lifecycle abandonment', () => {
  const report = buildPlaytestReport([
    summary({ humanSeatsAtStart: 1, caseActionCounts: { citation: 9 }, citationTargetCount: 9 }),
    summary({ humanSeatsAtStart: 4, caseActionCounts: { citation: 2 }, citationTargetCount: 2 }),
    summary({
      outcome: 'abandoned',
      reason: 'all_humans_left',
      matchNumber: 0,
      humanSeatsAtStart: null,
      gameDurationMs: null,
      caseActionCounts: {},
      citationTargetCount: 0,
      verdict: null,
      hearings: null,
    }),
  ], { minHumanSeats: 2 });

  assert.equal(report.samples.summaries, 3);
  assert.equal(report.samples.abandoned, 1);
  assert.equal(report.samples.mechanicsGames, 1);
  assert.equal(report.mechanics.citationTargetCount, 2);
});

test('markdown rendering surfaces the decision-oriented report sections', () => {
  const report = buildPlaytestReport([summary()]);
  const markdown = renderPlaytestMarkdown(report, { generatedAt: '2026-09-14T16:00:00.000Z' });

  assert.match(markdown, /# Split Decision playtest report/);
  assert.match(markdown, /## Mechanics/);
  assert.match(markdown, /### Citation/);
  assert.match(markdown, /Second Chair/);
  assert.match(markdown, /## Competitive shape/);
  assert.match(markdown, /## Reliability \/ friction/);
  assert.match(markdown, /## Decision gates/);
});
