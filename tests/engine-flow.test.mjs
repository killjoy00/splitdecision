import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA,
  SIDE_IDS,
  applyAction,
  createGame,
  getLegalActions,
  getPlayerView,
  hashGameState,
  hashPublicGameState,
} from '../dist/index.js';

const CARD_BY_ID = new Map(GAME_DATA.caseCards.map((card) => [card.id, card]));

function applyOrThrow(state, action) {
  const result = applyAction(state, action);
  assert.equal(result.ok, true, result.ok ? '' : result.error.message);
  return result.state;
}

function advanceToArgue(seed = 'flow') {
  let state = createGame({ seed });
  for (const side of SIDE_IDS) {
    const divider = state.briefs[side].divider;
    const action = getLegalActions(state, divider)[0];
    assert.ok(action);
    state = applyOrThrow(state, action);
  }
  assert.equal(state.phase, 'round_choose_commit');

  for (const side of SIDE_IDS) {
    const chooser = state.briefs[side].chooser;
    const action = getLegalActions(state, chooser)[0];
    assert.ok(action);
    state = applyOrThrow(state, action);
  }
  assert.equal(state.phase, 'round_argue');
  return state;
}

test('both sides divide the same Docket and every firm receives three slots', () => {
  const state = advanceToArgue();
  for (const side of SIDE_IDS) {
    const brief = state.briefs[side];
    assert.equal(brief.assignments[brief.divider].length, 3);
    assert.equal(brief.assignments[brief.chooser].length, 3);
    assert.deepEqual(
      [...brief.assignments[brief.divider], ...brief.assignments[brief.chooser]].sort(),
      [1, 2, 3, 4, 5, 6],
    );
  }
});

test('resolving a Docket card applies the printed action and records the side-specific use', () => {
  let state = advanceToArgue('placement');
  const actor = state.activeSeat;
  assert.ok(actor);
  const action = getLegalActions(state, actor)[0];
  assert.ok(action && action.type === 'play_docket_card');
  const docket = state.docket.find((entry) => entry.slot === action.slot);
  assert.ok(docket);
  const card = CARD_BY_ID.get(docket.cardId);
  assert.ok(card);
  const side = state.players[actor].sideId;
  const partner = state.players[actor].partnerSeatId;
  const before = structuredClone(state.issues[action.chosenIssue]);

  state = applyOrThrow(state, action);
  const after = state.issues[action.chosenIssue];
  const actionType = card.form === 'focus' ? action.focusAction : card.action;

  if (actionType === 'lead') {
    assert.equal(after.firmMarkers[actor] - before.firmMarkers[actor], 3);
    assert.equal(after.firmMarkers[partner] - before.firmMarkers[partner], 0);
    assert.equal(after.jointWork[side] - before.jointWork[side], 0);
  } else {
    assert.equal(after.firmMarkers[actor] - before.firmMarkers[actor], 2);
    assert.equal(after.firmMarkers[partner] - before.firmMarkers[partner], 1);
    assert.equal(after.jointWork[side] - before.jointWork[side], 1);
  }
  assert.equal(
    state.docket.find((entry) => entry.slot === action.slot).usedBy[side],
    actor,
  );
});

test('private Closing Argument and committed split information is redacted', () => {
  let state = createGame({ seed: 'visibility' });
  const divider = state.briefs.plaintiff.divider;
  const chooser = state.briefs.plaintiff.chooser;
  const splitAction = getLegalActions(state, divider)[0];
  state = applyOrThrow(state, splitAction);

  const dividerView = getPlayerView(state, divider);
  const chooserView = getPlayerView(state, chooser);
  assert.ok(dividerView.briefs.plaintiff.submittedSplit);
  assert.equal(chooserView.briefs.plaintiff.submittedSplit, null);
  assert.deepEqual(chooserView.closingUndealt, []);
  assert.deepEqual(chooserView.actionHistory, []);

  for (const [seat, player] of Object.entries(chooserView.players)) {
    if (seat === chooser) {
      assert.ok(player.closingArgumentIssue);
    } else {
      assert.equal(player.closingArgumentIssue, null);
    }
  }
});


test('public hashes do not reveal the assignment of secret Closing Arguments', () => {
  const first = createGame({ seed: 'public-hash' });
  const second = structuredClone(first);
  const temporary = second.players.P1.closingArgumentIssue;
  second.players.P1.closingArgumentIssue = second.players.D1.closingArgumentIssue;
  second.players.D1.closingArgumentIssue = temporary;

  assert.notEqual(hashGameState(first), hashGameState(second));
  assert.equal(hashPublicGameState(first), hashPublicGameState(second));
});
