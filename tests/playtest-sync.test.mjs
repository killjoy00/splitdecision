import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCloudflareTelemetryQuery,
  cloudflareEvents,
  extractCloudflarePlaytestEvents,
  mergePlaytestEvents,
  normalizeStoredPlaytestState,
} from '../scripts/playtest-sync-lib.mjs';

const summary = {
  event: 'split_decision_playtest_summary',
  telemetryVersion: 1,
  outcome: 'completed',
  matchNumber: 1,
  humanSeatsAtStart: 4,
  caseActionCounts: { citation: 1, second_chair: 1 },
};

test('builds an event query with bounded pagination', () => {
  const query = buildCloudflareTelemetryQuery({ from: 1000, to: 2000, limit: 50, offset: 'cursor-1' });
  assert.equal(query.view, 'events');
  assert.equal(query.limit, 50);
  assert.equal(query.offset, 'cursor-1');
  assert.equal(query.offsetDirection, 'next');
  assert.equal(query.parameters.needle.value, 'split_decision_playtest_summary');
});

test('reads events from Cloudflare API result envelopes', () => {
  const events = [{ '$metadata': { id: 'evt-1' } }];
  assert.deepEqual(cloudflareEvents({ success: true, result: { events: { events } } }), events);
  assert.deepEqual(cloudflareEvents({ events: { events } }), events);
});

test('extracts only the privacy-safe summary and event identity', () => {
  const event = {
    '$metadata': {
      id: 'evt-123',
      timestamp: 1_725_000_000_000,
      message: JSON.stringify(summary),
      service: 'split-decision-remote',
    },
    source: { request: { url: 'https://sensitive.example/should-not-be-stored' } },
  };

  const extracted = extractCloudflarePlaytestEvents([event]);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].id, 'evt-123');
  assert.equal(extracted[0].timestamp, 1_725_000_000_000);
  assert.deepEqual(extracted[0].summary, summary);
  assert.equal(JSON.stringify(extracted).includes('sensitive.example'), false);
});

test('deduplicates overlapping Cloudflare retention windows', () => {
  const existing = {
    version: 1,
    updatedAt: '2026-09-14T00:00:00.000Z',
    events: [{ id: 'evt-1', timestamp: 1000, summary }],
  };
  const incoming = [
    { id: 'evt-1', timestamp: 1000, summary },
    { id: 'evt-2', timestamp: 2000, summary: { ...summary, matchNumber: 2 } },
  ];

  const merged = mergePlaytestEvents(existing, incoming, '2026-09-14T06:00:00.000Z');
  assert.equal(merged.added, 1);
  assert.equal(merged.total, 2);
  assert.deepEqual(merged.state.events.map((entry) => entry.id), ['evt-1', 'evt-2']);
});

test('rejects malformed stored state instead of trusting arbitrary data', () => {
  assert.deepEqual(normalizeStoredPlaytestState({ version: 99, events: [{ nope: true }] }), {
    version: 1,
    updatedAt: null,
    events: [],
  });
});
