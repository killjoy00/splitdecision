import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  chooseHardAction,
  chooseEasyAction,
  chooseMediumAction,
  createGame,
  createRandom,
  getPendingActors,
  hashGameState,
  replayGame,
  runBotGame,
  simulateGames,
  simulateMatchup,
} from '../dist/index.js';

function playGame(seed) {
  const initial = createGame({
    seed,
    controllers: { P1: 'easy', D1: 'easy', P2: 'easy', D2: 'easy' },
  });
  let state = initial;
  const random = createRandom(`${seed}:test-bots`);
  const actions = [];
  let guard = 0;

  while (state.phase !== 'complete') {
    guard += 1;
    assert.ok(guard < 500, 'game exceeded action guard');
    const actor = getPendingActors(state)[0];
    assert.ok(actor);
    const action = chooseEasyAction(state, actor, random);
    const result = applyAction(state, action);
    assert.equal(result.ok, true, result.ok ? '' : result.error.message);
    actions.push(action);
    state = result.state;
  }

  return { initial, state, actions };
}

test('a random legal game reaches a verdict and consumes every Case card once', () => {
  const game = playGame('complete-game');
  assert.equal(game.state.phase, 'complete');
  assert.ok(game.state.verdict);
  assert.equal(game.actions.length, 96);
  assert.equal(game.state.caseDeckIndex, 36);

  const docketEvents = game.state.eventLog.filter(
    (event) => event.type === 'docket_revealed',
  );
  assert.equal(docketEvents.length, 6);
  const cardIds = docketEvents.flatMap((event) => event.payload.cardIds);
  assert.equal(cardIds.length, 36);
  assert.equal(new Set(cardIds).size, 36);
});

test('recorded actions replay to the same deterministic final state', () => {
  const game = playGame('replayable');
  const replayed = replayGame(game.initial, game.actions);
  assert.equal(hashGameState(replayed), hashGameState(game.state));
  assert.deepEqual(replayed.verdict, game.state.verdict);
  assert.deepEqual(
    replayed.eventLog.map((event) => event.stateHash),
    game.state.eventLog.map((event) => event.stateHash),
  );
});

test('batch simulations return complete aggregate metrics', () => {
  const summary = simulateGames(100, 'batch');
  assert.equal(summary.sideWins.plaintiff + summary.sideWins.defense, 100);
  assert.equal(
    summary.firmWins.P1 + summary.firmWins.D1 + summary.firmWins.P2 + summary.firmWins.D2,
    100,
  );
  assert.ok(Math.abs(summary.leadRate + summary.coCounselRate - 1) < 1e-12);
  assert.ok(summary.sideTieRate >= 0 && summary.sideTieRate <= 1);
  assert.ok(summary.internalTieRate >= 0 && summary.internalTieRate <= 1);
  assert.ok(summary.scheduledIssueRate >= 0 && summary.scheduledIssueRate <= 1);
  assert.ok(summary.knownClosingRate >= 0 && summary.knownClosingRate <= 1);
});

test('Medium and Hard bots complete deterministic legal games', () => {
  const controllers = { P1: 'hard', D1: 'medium', P2: 'hard', D2: 'medium' };
  const first = runBotGame('skilled-bot-game', controllers);
  const second = runBotGame('skilled-bot-game', controllers);
  assert.deepEqual(first, second);
  assert.equal(first.actions, 96);
});

test('Medium and Hard choices do not depend on opponents\' Closing Arguments', () => {
  let state = createGame({
    seed: 'bot-secret-boundary',
    controllers: { P1: 'hard', D1: 'hard', P2: 'hard', D2: 'hard' },
  });
  const setupRandom = createRandom('bot-secret-boundary:setup');
  while (!(state.round === 6 && state.phase === 'round_argue' && state.actionsResolvedThisRound === 11)) {
    const nextActor = getPendingActors(state)[0];
    assert.ok(nextActor);
    const result = applyAction(state, chooseEasyAction(state, nextActor, setupRandom));
    assert.equal(result.ok, true, result.ok ? '' : result.error.message);
    state = result.state;
  }
  const actor = getPendingActors(state)[0];
  assert.ok(actor);
  const altered = structuredClone(state);
  const otherSeats = ['P1', 'D1', 'P2', 'D2'].filter((seat) => seat !== actor);
  const originalIssues = otherSeats.map((seat) => altered.players[seat].closingArgumentIssue);
  otherSeats.forEach((seat, index) => {
    altered.players[seat].closingArgumentIssue = originalIssues[(index + 1) % originalIssues.length];
  });

  assert.deepEqual(
    chooseMediumAction(state, actor, createRandom('medium-secret-test')),
    chooseMediumAction(altered, actor, createRandom('medium-secret-test')),
  );
  assert.deepEqual(
    chooseHardAction(state, actor, createRandom('hard-secret-test')),
    chooseHardAction(altered, actor, createRandom('hard-secret-test')),
  );
});

test('difficulty matchups establish a deterministic skill gradient', () => {
  const medium = simulateMatchup(20, 'medium', 'easy', 'gradient-medium-easy');
  const hard = simulateMatchup(20, 'hard', 'medium', 'gradient-hard-medium');
  assert.ok(medium.challengerWinRate >= 0.65, JSON.stringify(medium));
  assert.ok(hard.challengerWinRate >= 0.55, JSON.stringify(hard));
});
