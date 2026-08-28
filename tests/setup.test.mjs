import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  hashGameState,
} from '../dist/index.js';

test('seeded setup creates mirrored hearings and unique Closing Arguments', () => {
  const state = createGame({ seed: 'setup-test' });
  assert.deepEqual(state.hearingSchedule.slice(3), state.hearingSchedule.slice(0, 3));
  assert.equal(state.docket.length, 6);
  assert.equal(state.caseDeck.length, 36);
  assert.equal(state.caseDeckIndex, 6);

  const closing = Object.values(state.players).map(
    (player) => player.closingArgumentIssue,
  );
  assert.equal(closing.length, 4);
  assert.equal(new Set(closing).size, 4);
  assert.equal(state.closingUndealt.length, 2);
});

test('same seed creates the same initial state', () => {
  const first = createGame({ seed: 'repeatable' });
  const second = createGame({ seed: 'repeatable' });
  assert.equal(hashGameState(first), hashGameState(second));
  assert.deepEqual(first.hearingSchedule, second.hearingSchedule);
  assert.deepEqual(first.docket, second.docket);
});

test('Milestone 0 rejects enabled Specialties instead of applying partial rules', () => {
  assert.throws(
    () => createGame({ seed: 'specialty', rules: { specialtiesEnabled: true } }),
    /not enabled|not implemented/i,
  );
});
