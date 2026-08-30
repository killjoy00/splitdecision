import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA,
  CURRENT_CASE_CARD_IDS,
  LEGACY_CASE_CARD_IDS,
  ISSUE_IDS,
  enumerateThreeThreeSplits,
  createGame,
  isValidThreeThreeSplit,
} from '../dist/index.js';

test('current deck contains 36 unique cards with balanced issue access', () => {
  assert.equal(GAME_DATA.caseCards.length, 42, 'legacy definitions stay available for active rooms');
  assert.equal(new Set(GAME_DATA.caseCards.map((card) => card.id)).size, 42);
  assert.equal(CURRENT_CASE_CARD_IDS.length, 36);
  assert.equal(new Set(CURRENT_CASE_CARD_IDS).size, 36);
  assert.equal(LEGACY_CASE_CARD_IDS.length, 36);
  const currentCards = GAME_DATA.caseCards.filter((card) => CURRENT_CASE_CARD_IDS.includes(card.id));

  for (const issue of ISSUE_IDS) {
    const appearances = currentCards.filter((card) =>
      card.issues.includes(issue),
    ).length;
    assert.equal(appearances, 10, `${issue} should appear on 10 current cards`);
  }

  assert.equal(
    currentCards.filter((card) => card.form === 'focus').length,
    6,
  );
  assert.equal(
    currentCards.filter((card) => card.action === 'lead').length,
    12,
  );
  assert.equal(
    currentCards.filter((card) => card.action === 'co_counsel').length,
    12,
  );
  assert.equal(currentCards.filter((card) => card.action === 'citation').length, 3);
  assert.equal(currentCards.filter((card) => card.action === 'second_chair').length, 3);
});

test('Citation cards cannot create a dead three-Citation brief', () => {
  for (let index = 0; index < 250; index += 1) {
    const state = createGame({ seed: `citation-deal-safety:${index}` });
    for (let start = 0; start < state.caseDeck.length; start += 6) {
      const citationCount = state.caseDeck
        .slice(start, start + 6)
        .filter((cardId) => GAME_DATA.caseCards.find((card) => card.id === cardId)?.form === 'citation')
        .length;
      assert.ok(citationCount <= 2, `Docket ${start / 6 + 1} contains ${citationCount} Citations`);
    }
  }
});

test('six cards produce exactly ten unique legal 3/3 splits', () => {
  const splits = enumerateThreeThreeSplits();
  assert.equal(splits.length, 10);
  assert.equal(new Set(splits.map((split) => JSON.stringify(split))).size, 10);
  assert.ok(splits.every(isValidThreeThreeSplit));
});
