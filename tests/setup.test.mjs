import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA,
  assertGameInvariants,
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

test('setup deals every firm a private, distinct pair of Specialty options', () => {
  const state = createGame({ seed: 'specialty-draft' });
  assert.equal(state.phase, 'setup_specialty_choice');

  const dealt = [];
  for (const seat of ['P1', 'D1', 'P2', 'D2']) {
    const options = state.players[seat].specialtyOptions;
    assert.equal(options.length, 2);
    assert.equal(state.players[seat].specialtyId, null);
    dealt.push(...options);
  }
  assert.equal(new Set(dealt).size, dealt.length, 'no Specialty may be offered twice');

  const canonical = new Set(GAME_DATA.specialties.map((entry) => entry.id));
  assert.ok(dealt.every((id) => canonical.has(id)));
});

test('disabling the Specialty module skips the draft entirely', () => {
  const state = createGame({ seed: 'no-specialty', rules: { specialtiesEnabled: false } });
  assert.equal(state.phase, 'round_split_commit');
  for (const seat of ['P1', 'D1', 'P2', 'D2']) {
    assert.equal(state.players[seat].specialtyId, null);
    assert.deepEqual(state.players[seat].specialtyOptions, []);
  }
});

test('invariants reject noncanonical decks and incomplete Hearing schedules', () => {
  const badDeck = createGame({ seed: 'bad-deck' });
  badDeck.caseDeck[badDeck.caseDeck.length - 1] = 'C99';
  assert.throws(() => assertGameInvariants(badDeck), /canonical cards/);

  const badSchedule = createGame({ seed: 'bad-schedule' });
  badSchedule.hearingSchedule[0][0] = badSchedule.hearingSchedule[0][1];
  badSchedule.hearingSchedule[3][0] = badSchedule.hearingSchedule[0][0];
  assert.throws(() => assertGameInvariants(badSchedule), /each Issue once/);
});
