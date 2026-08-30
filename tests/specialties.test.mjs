import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA,
  SEAT_ORDER,
  applyAction,
  applySpecialtyBonuses,
  createGame,
  getLegalActions,
  getPlayerView,
} from '../dist/index.js';

function applyOrThrow(state, action) {
  const result = applyAction(state, action);
  assert.equal(result.ok, true, result.ok ? '' : result.error.message);
  return result.state;
}

/**
 * Locks a specific Specialty on each seat. Options are overwritten first so the
 * draft still accepts the choice, which keeps these tests independent of the
 * seeded deal.
 */
function draftSpecialties(state, assignments) {
  let next = state;
  for (const seat of SEAT_ORDER) {
    const specialtyId = assignments[seat];
    next = structuredClone(next);
    next.players[seat].specialtyOptions = [specialtyId];
    next = applyOrThrow(next, { type: 'choose_specialty', actor: seat, specialtyId });
  }
  return next;
}

function advanceToArgue(state) {
  let next = state;
  for (const side of ['plaintiff', 'defense']) {
    const divider = next.briefs[side].divider;
    next = applyOrThrow(next, getLegalActions(next, divider)[0]);
  }
  for (const side of ['plaintiff', 'defense']) {
    const chooser = next.briefs[side].chooser;
    next = applyOrThrow(next, getLegalActions(next, chooser)[0]);
  }
  assert.equal(next.phase, 'round_argue');
  return next;
}

function setup(assignments, seed = 'specialty-test') {
  return advanceToArgue(draftSpecialties(createGame({ seed }), assignments));
}

/**
 * Builds a game where the firm that acts first holds `specialtyId`, so a
 * turn-timed power can be exercised without depending on the seeded seat order.
 */
function setupWithActiveHolder(specialtyId, filler, seed = 'active-holder') {
  const base = createGame({ seed });
  const holder = base.startingPlayer;
  const spare = GAME_DATA.specialties
    .map((entry) => entry.id)
    .filter((id) => id !== specialtyId && !filler.includes(id));

  let spareIndex = 0;
  const assignments = {};
  for (const seat of SEAT_ORDER) {
    assignments[seat] = seat === holder ? specialtyId : spare[spareIndex++];
  }
  return { state: advanceToArgue(draftSpecialties(base, assignments)), holder };
}

function advanceToIssueWindow(state, issueId, occurrence = 1) {
  let next = state;
  let seen = 0;
  for (let guard = 0; guard < 500; guard += 1) {
    if (next.phase === 'specialty_power_window'
        && next.specialtyWindow?.kind === 'before_issue_scores'
        && next.specialtyWindow.issueId === issueId) {
      seen += 1;
      if (seen === occurrence) return next;
      next = applyOrThrow(next, getLegalActions(next, next.specialtyWindow.pendingSeats[0])[0]);
      continue;
    }
    const actor = SEAT_ORDER.find((seat) => getLegalActions(next, seat).length > 0);
    assert.ok(actor, `no actor available while seeking ${issueId} window in ${next.phase}`);
    next = applyOrThrow(next, getLegalActions(next, actor)[0]);
  }
  assert.fail(`did not reach ${issueId} Specialty window`);
}

const ALL_GENERALIST = {
  P1: 'generalist',
  D1: 'trial_lawyer',
  P2: 'team_builder',
  D2: 'closer',
};

test('the draft rejects a Specialty that was never offered to that firm', () => {
  const state = createGame({ seed: 'draft-guard' });
  const offered = state.players.P1.specialtyOptions;
  const notOffered = GAME_DATA.specialties
    .map((entry) => entry.id)
    .find((id) => !offered.includes(id));

  const result = applyAction(state, {
    type: 'choose_specialty',
    actor: 'P1',
    specialtyId: notOffered,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'specialty_not_offered');
});

test('a firm cannot change its Specialty once chosen', () => {
  const state = createGame({ seed: 'draft-lock' });
  const [first, second] = state.players.P1.specialtyOptions;
  const chosen = applyOrThrow(state, {
    type: 'choose_specialty',
    actor: 'P1',
    specialtyId: first,
  });
  const result = applyAction(chosen, {
    type: 'choose_specialty',
    actor: 'P1',
    specialtyId: second,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'specialty_already_chosen');
});

test('opponents cannot see dealt options or an unrevealed Specialty', () => {
  const state = createGame({ seed: 'draft-secrecy' });
  const view = getPlayerView(state, 'P1');

  assert.equal(view.players.P1.specialtyOptions.length, 2);
  for (const seat of ['D1', 'P2', 'D2']) {
    assert.deepEqual(view.players[seat].specialtyOptions, []);
    assert.equal(view.players[seat].specialtyId, null);
  }
});

test('the draft hides which opponents have already locked a Specialty', () => {
  let state = createGame({ seed: 'draft-simultaneous' });
  state = applyOrThrow(state, {
    type: 'choose_specialty',
    actor: 'D1',
    specialtyId: state.players.D1.specialtyOptions[0],
  });
  assert.equal(state.phase, 'setup_specialty_choice');

  const view = getPlayerView(state, 'P1');
  assert.equal(view.players.D1.specialtyId, null);
});

test('a before-scoring power resolves immediately before its matching Issue', () => {
  const base = createGame({ seed: 'before-score-window' });
  const actor = 'P1';
  const drafted = draftSpecialties(base, {
    P1: 'cross_examiner',
    D1: 'trial_lawyer',
    P2: 'generalist',
    D2: 'team_builder',
  });
  const state = advanceToIssueWindow(drafted, 'witnesses');
  const before = state.issues.witnesses.firmMarkers[actor];
  const resultsBefore = state.hearingResults.length;

  const used = applyOrThrow(state, { type: 'use_specialty', actor });
  assert.ok(used.hearingResults.length > resultsBefore, 'Witnesses scores after the decision');
  const scored = used.hearingResults.findLast((result) => result.issueId === 'witnesses');
  assert.ok(scored);
  assert.equal(scored.personalStrength[actor], before + 1, 'the marker is included in scoring');
  assert.equal(used.players[actor].specialtyUsed, true);
  assert.equal(used.players[actor].specialtyRevealed, true, 'spending is public');
});

test('passing a scoring window keeps the hidden power for the later Hearing', () => {
  const actor = 'P1';
  let state = draftSpecialties(createGame({ seed: 'pass-for-later' }), {
    P1: 'cross_examiner',
    D1: 'trial_lawyer',
    P2: 'generalist',
    D2: 'team_builder',
  });
  state = advanceToIssueWindow(state, 'witnesses');
  state = applyOrThrow(state, { type: 'pass_specialty', actor });
  assert.equal(state.players[actor].specialtyUsed, false);
  assert.equal(state.players[actor].specialtyRevealed, false);

  state = advanceToIssueWindow(state, 'witnesses');
  const before = state.issues.witnesses.firmMarkers[actor];
  state = applyOrThrow(state, { type: 'use_specialty', actor });
  assert.equal(state.issues.witnesses.firmMarkers[actor], before + 1);
  assert.equal(state.players[actor].specialtyUsed, true);
});

test('a scoring power is offered only to the designated Specialty holder', () => {
  const state = advanceToIssueWindow(draftSpecialties(createGame({ seed: 'window-guard' }), {
    P1: 'cross_examiner',
    D1: 'trial_lawyer',
    P2: 'generalist',
    D2: 'team_builder',
  }), 'witnesses');
  const holder = state.specialtyWindow.pendingSeats[0];
  const idle = SEAT_ORDER.find((seat) => seat !== holder);
  assert.deepEqual(getLegalActions(state, idle), []);
  const result = applyAction(state, { type: 'use_specialty', actor: idle });
  assert.equal(result.ok, false);
});

test('Generalist retargets a Case card to an Issue it does not print', () => {
  const { state, holder } = setupWithActiveHolder('generalist', [], 'generalist-seed');
  const printed = new Set(
    state.briefs[state.players[holder].sideId].assignments[holder]
      .flatMap((slot) => {
        const entry = state.docket.find((card) => card.slot === slot);
        return GAME_DATA.caseCards.find((card) => card.id === entry.cardId).issues;
      }),
  );

  const offBook = getLegalActions(state, holder).find(
    (candidate) => candidate.type === 'play_docket_card'
      && candidate.useSpecialty === true
      && !printed.has(candidate.chosenIssue),
  );
  assert.ok(offBook, 'Generalist must be able to reach an unprinted Issue');

  const before = state.issues[offBook.chosenIssue].firmMarkers[holder];
  const played = applyOrThrow(state, offBook);
  assert.ok(played.issues[offBook.chosenIssue].firmMarkers[holder] > before);
  assert.equal(played.players[holder].specialtyUsed, true);
});

test('a Case-card power cannot be spent on an Issue it does not cover', () => {
  const { state, holder } = setupWithActiveHolder('trial_lawyer', [], 'trial-lawyer');
  const offIssue = getLegalActions(state, holder).find(
    (candidate) => candidate.type === 'play_docket_card'
      && candidate.useSpecialty !== true
      && !['witnesses', 'jury'].includes(candidate.chosenIssue),
  );
  assert.ok(offIssue, 'expected a Case card outside Witnesses and Jury');

  const result = applyAction(state, { ...offIssue, useSpecialty: true });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'specialty_not_applicable');
});

test('Team Builder adds one Joint Work marker when resolving Co-Counsel', () => {
  // Not every seeded opening hand contains a Co-Counsel card, so scan for one.
  let state;
  let holder;
  let coCounsel;
  for (let attempt = 0; attempt < 25 && !coCounsel; attempt += 1) {
    const built = setupWithActiveHolder('team_builder', [], `team-builder-${attempt}`);
    coCounsel = getLegalActions(built.state, built.holder).find(
      (candidate) => candidate.type === 'play_docket_card' && candidate.useSpecialty === true,
    );
    ({ state, holder } = built);
  }
  assert.ok(coCounsel, 'expected a Co-Counsel line for Team Builder');

  const side = state.players[holder].sideId;
  const before = state.issues[coCounsel.chosenIssue].jointWork[side];
  const played = applyOrThrow(state, coCounsel);
  assert.equal(played.issues[coCounsel.chosenIssue].jointWork[side], before + 2);
});

test('a completed game scores every Specialty bonus exactly once', () => {
  let state = draftSpecialties(createGame({ seed: 'bonus-sweep' }), ALL_GENERALIST);
  const random = { next: () => 0.5, int: (max) => max - 1 };

  let guard = 0;
  while (state.phase !== 'complete') {
    const actor = SEAT_ORDER.find((seat) => getLegalActions(state, seat).length > 0);
    assert.ok(actor, `no actor available in ${state.phase}`);
    const actions = getLegalActions(state, actor);
    state = applyOrThrow(state, actions[random.int(actions.length)]);
    guard += 1;
    assert.ok(guard < 400, 'game failed to terminate');
  }

  assert.equal(state.specialtyBonuses.length, 4);
  assert.equal(new Set(state.specialtyBonuses.map((entry) => entry.seatId)).size, 4);
  for (const seat of SEAT_ORDER) {
    assert.equal(state.players[seat].specialtyRevealed, true, 'bonuses reveal every card');
  }
});

test('Closing Argument Lead Credits drive the Closer bonus', () => {
  const state = createGame({ seed: 'closer-bonus' });
  const crafted = structuredClone(state);
  crafted.players.P1.specialtyId = 'closer';
  crafted.players.P1.leadCredits = [
    { issueId: 'judge', source: 'closing', round: 6 },
    { issueId: 'jury', source: 'closing', round: 6 },
  ];
  const before = crafted.players.P1.reputation;

  const results = applySpecialtyBonuses(crafted);
  const closer = results.find((entry) => entry.seatId === 'P1');
  assert.equal(closer.earned, true);
  assert.equal(crafted.players.P1.reputation, before + closer.bonusPoints);
});

test('an unmet Specialty condition pays nothing', () => {
  const crafted = structuredClone(createGame({ seed: 'closer-miss' }));
  crafted.players.P1.specialtyId = 'closer';
  crafted.players.P1.leadCredits = [{ issueId: 'judge', source: 'closing', round: 6 }];
  const before = crafted.players.P1.reputation;

  const results = applySpecialtyBonuses(crafted);
  assert.equal(results.find((entry) => entry.seatId === 'P1').earned, false);
  assert.equal(crafted.players.P1.reputation, before);
});

test('Team Builder reads Reputation from before any Specialty bonus is paid', () => {
  const crafted = structuredClone(createGame({ seed: 'team-builder-bonus' }));
  crafted.players.P1.specialtyId = 'team_builder';
  crafted.players.P2.specialtyId = 'cross_examiner';
  // P2 only clears 17 once its own +3 lands, which must not count for P1.
  crafted.players.P1.reputation = 20;
  crafted.players.P2.reputation = 15;
  crafted.players.P2.leadCredits = [
    { issueId: 'witnesses', source: 'hearing', round: 1 },
    { issueId: 'witnesses', source: 'hearing', round: 4 },
  ];

  const results = applySpecialtyBonuses(crafted);
  assert.equal(results.find((entry) => entry.seatId === 'P2').earned, true);
  assert.equal(
    results.find((entry) => entry.seatId === 'P1').earned,
    false,
    'the partner was below 17 before bonuses',
  );
});

test('Generalist rewards Lead Credits spread across three Issues', () => {
  const crafted = structuredClone(createGame({ seed: 'generalist-bonus' }));
  crafted.players.D1.specialtyId = 'generalist';
  crafted.players.D1.leadCredits = [
    { issueId: 'judge', source: 'hearing', round: 1 },
    { issueId: 'jury', source: 'hearing', round: 2 },
    { issueId: 'evidence', source: 'closing', round: 6 },
  ];

  const results = applySpecialtyBonuses(crafted);
  assert.equal(results.find((entry) => entry.seatId === 'D1').earned, true);
});
