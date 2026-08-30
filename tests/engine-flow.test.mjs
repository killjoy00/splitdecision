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

/** Locks a Specialty for every seat so a test can reach the round phases. */
function completeSpecialtyDraft(state) {
  let next = state;
  while (next.phase === 'setup_specialty_choice') {
    const seat = ['P1', 'D1', 'P2', 'D2'].find(
      (candidate) => next.players[candidate].specialtyId === null,
    );
    assert.ok(seat);
    const action = getLegalActions(next, seat)[0];
    assert.ok(action);
    next = applyOrThrow(next, action);
  }
  return next;
}

function advanceToArgue(seed = 'flow') {
  let state = completeSpecialtyDraft(createGame({ seed }));
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
  let state = completeSpecialtyDraft(createGame({ seed: 'visibility' }));
  const divider = state.briefs.plaintiff.divider;
  const chooser = state.briefs.plaintiff.chooser;
  const splitAction = getLegalActions(state, divider)[0];
  state = applyOrThrow(state, splitAction);

  const dividerView = getPlayerView(state, divider);
  const chooserView = getPlayerView(state, chooser);
  assert.ok(dividerView.briefs.plaintiff.submittedSplit);
  assert.equal(chooserView.briefs.plaintiff.submittedSplit, null);
  assert.equal(chooserView.seed, null);
  assert.deepEqual(chooserView.caseDeck, state.caseDeck.slice(0, state.caseDeckIndex));
  assert.ok(chooserView.caseDeck.length < state.caseDeck.length);
  assert.deepEqual(chooserView.closingUndealt, []);
  assert.deepEqual(chooserView.actionHistory, []);
  const setupEvent = chooserView.eventLog.find((event) => event.type === 'setup_complete');
  assert.ok(setupEvent);
  assert.equal(Object.hasOwn(setupEvent.payload, 'seed'), false);
  assert.equal(
    chooserView.eventLog.some((event) => [
      'specialty_chosen',
      'split_committed',
      'brief_choice_committed',
      'specialty_passed',
      'specialty_window_opened',
    ].includes(event.type)),
    false,
  );

  for (const [seat, player] of Object.entries(chooserView.players)) {
    if (seat === chooser) {
      assert.ok(player.closingArgumentIssue);
    } else {
      assert.equal(player.closingArgumentIssue, null);
    }
  }
});

test('public hashes keep unrevealed Specialties private after Closing reveal', () => {
  const first = completeSpecialtyDraft(createGame({ seed: 'specialty-public-hash' }));
  first.closingRevealed = [first.players.P1.closingArgumentIssue];
  const second = structuredClone(first);
  const temporary = second.players.P1.specialtyId;
  second.players.P1.specialtyId = second.players.D1.specialtyId;
  second.players.D1.specialtyId = temporary;

  assert.notEqual(hashGameState(first), hashGameState(second));
  assert.equal(hashPublicGameState(first), hashPublicGameState(second));
});


test('public hashes do not reveal the assignment of secret Closing Arguments', () => {
  const first = completeSpecialtyDraft(createGame({ seed: 'public-hash' }));
  const second = structuredClone(first);
  const temporary = second.players.P1.closingArgumentIssue;
  second.players.P1.closingArgumentIssue = second.players.D1.closingArgumentIssue;
  second.players.D1.closingArgumentIssue = temporary;
  second.seed = 'different-private-seed';
  const firstFutureCard = second.caseDeckIndex;
  const secondFutureCard = firstFutureCard + 1;
  [second.caseDeck[firstFutureCard], second.caseDeck[secondFutureCard]] = [
    second.caseDeck[secondFutureCard],
    second.caseDeck[firstFutureCard],
  ];

  assert.notEqual(hashGameState(first), hashGameState(second));
  assert.equal(hashPublicGameState(first), hashPublicGameState(second));
});

test('malformed actions are rejected without mutating canonical state', () => {
  const state = completeSpecialtyDraft(createGame({ seed: 'invalid-actions' }));
  const before = hashGameState(state);
  const invalidActions = [
    null,
    { type: 'unknown', actor: 'P1' },
    { type: 'commit_split', actor: 'X1', groups: [[1, 2, 3], [4, 5, 6]] },
    { type: 'commit_split', actor: state.briefs.plaintiff.divider, groups: [[1, 2], [3, 4, 5, 6]] },
    { type: 'choose_brief', actor: state.briefs.plaintiff.chooser, briefIndex: 2 },
  ];

  for (const action of invalidActions) {
    const result = applyAction(state, action);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'invalid_action');
    assert.equal(hashGameState(state), before);
  }
});

test('legal actions exclude Issues closed by the optional placement rule', () => {
  const state = advanceToArgue('closed-issue');
  const actor = state.activeSeat;
  assert.ok(actor);
  const action = getLegalActions(state, actor).find(
    (candidate) => candidate.type === 'play_docket_card',
  );
  assert.ok(action);

  state.rules.allowPlacementAfterSecondHearing = false;
  state.issues[action.chosenIssue].normalHearingsResolved = 2;

  assert.equal(
    getLegalActions(state, actor).some(
      (candidate) => candidate.type === 'play_docket_card'
        && candidate.chosenIssue === action.chosenIssue,
    ),
    false,
  );
  const result = applyAction(state, action);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'issue_closed');
});
