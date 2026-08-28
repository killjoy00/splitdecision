import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  resolveVerdict,
  scoreIssue,
} from '../dist/index.js';

test('normal Hearing awards 3/2 to winning participating firms and clears first cycle', () => {
  const state = createGame({ seed: 'score-3-2' });
  state.round = 1;
  const issue = state.issues.witnesses;
  issue.firmMarkers.P1 = 3;
  issue.firmMarkers.P2 = 2;
  issue.jointWork.plaintiff = 1;
  issue.firmMarkers.D1 = 4;
  issue.firmMarkers.D2 = 1;

  const result = scoreIssue(state, 'witnesses', 'hearing');

  assert.equal(result.winningSide, 'plaintiff');
  assert.equal(result.leadFirm, 'P1');
  assert.equal(state.players.P1.reputation, 3);
  assert.equal(state.players.P2.reputation, 2);
  assert.equal(state.players.D1.reputation, 0);
  assert.equal(state.players.P1.leadCredits.length, 1);
  assert.deepEqual(issue.firmMarkers, { P1: 0, D1: 0, P2: 0, D2: 0 });
  assert.deepEqual(issue.jointWork, { plaintiff: 0, defense: 0 });
  assert.equal(issue.normalHearingsResolved, 1);
});

test('0-0 Hearing awards nothing and does not move tiebreakers', () => {
  const state = createGame({ seed: 'zero-zero' });
  const favor = state.courtFavor;
  const firstChair = structuredClone(state.firstChairBySide);

  const result = scoreIssue(state, 'evidence', 'hearing');

  assert.equal(result.winningSide, null);
  assert.equal(result.sideTieBreaker, 'unresolved');
  assert.deepEqual(
    Object.fromEntries(Object.entries(state.players).map(([seat, player]) => [seat, player.reputation])),
    { P1: 0, D1: 0, P2: 0, D2: 0 },
  );
  assert.equal(state.courtFavor, favor);
  assert.deepEqual(state.firstChairBySide, firstChair);
  assert.equal(state.issues.evidence.normalHearingsResolved, 1);
});

test('First Chair breaks an internal tie and then passes', () => {
  const state = createGame({ seed: 'first-chair' });
  state.round = 4;
  state.firstChairBySide.plaintiff = 'P1';
  state.issues.jury.normalHearingsResolved = 1;
  const issue = state.issues.jury;
  issue.firmMarkers.P1 = 2;
  issue.firmMarkers.P2 = 2;
  issue.firmMarkers.D1 = 1;

  const result = scoreIssue(state, 'jury', 'hearing');

  assert.equal(result.leadFirm, 'P1');
  assert.equal(result.leadTieBreaker, 'first_chair');
  assert.equal(state.players.P1.reputation, 3);
  assert.equal(state.players.P2.reputation, 2);
  assert.equal(state.firstChairBySide.plaintiff, 'P2');
  assert.equal(issue.firmMarkers.P1, 2, 'second-cycle markers remain');
});

test('stronger lower-scoring firm selects the side before the individual winner', () => {
  const state = createGame({ seed: 'verdict' });
  state.players.P1.reputation = 21;
  state.players.P2.reputation = 17;
  state.players.D1.reputation = 20;
  state.players.D2.reputation = 18;

  const result = resolveVerdict(state);
  assert.equal(result.winningSide, 'defense');
  assert.equal(result.winningFirm, 'D1');
  assert.deepEqual(result.sideFloor, {
    plaintiff: 17,
    defense: 18,
  });
});
