import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_DATA,
  ISSUE_IDS,
  enumerateThreeThreeSplits,
  isValidThreeThreeSplit,
} from '../dist/index.js';

test('canonical deck contains 36 unique cards with balanced issue access', () => {
  assert.equal(GAME_DATA.caseCards.length, 36);
  assert.equal(new Set(GAME_DATA.caseCards.map((card) => card.id)).size, 36);

  for (const issue of ISSUE_IDS) {
    const appearances = GAME_DATA.caseCards.filter((card) =>
      card.issues.includes(issue),
    ).length;
    assert.equal(appearances, 11, `${issue} should appear on 11 cards`);
  }

  assert.equal(
    GAME_DATA.caseCards.filter((card) => card.form === 'focus').length,
    6,
  );
  assert.equal(
    GAME_DATA.caseCards.filter((card) => card.action === 'lead').length,
    15,
  );
  assert.equal(
    GAME_DATA.caseCards.filter((card) => card.action === 'co_counsel').length,
    15,
  );
});

test('six cards produce exactly ten unique legal 3/3 splits', () => {
  const splits = enumerateThreeThreeSplits();
  assert.equal(splits.length, 10);
  assert.equal(new Set(splits.map((split) => JSON.stringify(split))).size, 10);
  assert.ok(splits.every(isValidThreeThreeSplit));
});
