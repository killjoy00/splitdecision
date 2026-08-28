import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyAction,
  chooseEasyAction,
  createGame,
  createRandom,
  getPendingActors,
  hashGameState,
  replayGame,
  simulateGames,
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
});
