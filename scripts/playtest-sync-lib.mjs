import { createHash } from 'node:crypto';
import { extractPlaytestSummaries } from './playtest-report-lib.mjs';

export const PLAYTEST_EVENT_NAME = 'split_decision_playtest_summary';
export const DEFAULT_LOOKBACK_HOURS = 72;
export const DEFAULT_QUERY_LIMIT = 2000;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

export function buildCloudflareTelemetryQuery({
  from,
  to,
  limit = DEFAULT_QUERY_LIMIT,
  offset = null,
} = {}) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new Error('Cloudflare telemetry query requires a valid from/to timeframe');
  }
  if (!Number.isInteger(limit) || limit <= 0 || limit > 2000) {
    throw new Error('Cloudflare telemetry query limit must be an integer from 1 to 2000');
  }

  return {
    queryId: 'splitdecision-playtest-automation',
    timeframe: { from: Number(from), to: Number(to) },
    view: 'events',
    limit,
    ...(offset ? { offset, offsetDirection: 'next' } : {}),
    parameters: {
      needle: {
        value: PLAYTEST_EVENT_NAME,
        isRegex: false,
        matchCase: true,
      },
    },
  };
}

function cloudflareResult(payload) {
  if (!isRecord(payload)) return payload;
  if ('result' in payload && isRecord(payload.result)) return payload.result;
  return payload;
}

export function cloudflareEvents(payload) {
  const result = cloudflareResult(payload);
  if (!isRecord(result) || !isRecord(result.events) || !Array.isArray(result.events.events)) {
    return [];
  }
  return result.events.events;
}

export function cloudflareRunStatus(payload) {
  const result = cloudflareResult(payload);
  return isRecord(result?.run) && typeof result.run.status === 'string'
    ? result.run.status
    : null;
}

function eventMetadata(event) {
  return isRecord(event?.$metadata) ? event.$metadata : {};
}

function eventTimestamp(event) {
  const metadata = eventMetadata(event);
  return asFiniteNumber(metadata.timestamp)
    ?? asFiniteNumber(metadata.startTime)
    ?? asFiniteNumber(metadata.endTime)
    ?? null;
}

function fallbackId(summary, timestamp, position) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify({ summary, timestamp, position }))
    .digest('hex')}`;
}

export function extractCloudflarePlaytestEvents(events) {
  const extracted = [];
  for (const [eventIndex, event] of events.entries()) {
    const metadata = eventMetadata(event);
    const summaries = extractPlaytestSummaries(JSON.stringify(event));
    for (const [summaryIndex, summary] of summaries.entries()) {
      const timestamp = eventTimestamp(event);
      const baseId = typeof metadata.id === 'string' && metadata.id
        ? metadata.id
        : fallbackId(summary, timestamp, eventIndex);
      extracted.push({
        id: summaries.length > 1 ? `${baseId}:${summaryIndex}` : baseId,
        timestamp,
        summary,
      });
    }
  }
  return extracted;
}

export function normalizeStoredPlaytestState(value) {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.events)) {
    return { version: 1, updatedAt: null, events: [] };
  }

  const events = value.events.filter((entry) =>
    isRecord(entry)
    && typeof entry.id === 'string'
    && isRecord(entry.summary)
    && entry.summary.event === PLAYTEST_EVENT_NAME);

  return {
    version: 1,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
    events,
  };
}

export function mergePlaytestEvents(existingState, incomingEvents, updatedAt = new Date().toISOString()) {
  const normalized = normalizeStoredPlaytestState(existingState);
  const byId = new Map(normalized.events.map((entry) => [entry.id, entry]));
  let added = 0;

  for (const entry of incomingEvents) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !isRecord(entry.summary)) continue;
    if (entry.summary.event !== PLAYTEST_EVENT_NAME) continue;
    if (!byId.has(entry.id)) added += 1;
    byId.set(entry.id, {
      id: entry.id,
      timestamp: asFiniteNumber(entry.timestamp),
      summary: entry.summary,
    });
  }

  const events = [...byId.values()].sort((a, b) => {
    const aTime = asFiniteNumber(a.timestamp) ?? Number.MAX_SAFE_INTEGER;
    const bTime = asFiniteNumber(b.timestamp) ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  });

  return {
    state: { version: 1, updatedAt, events },
    added,
    total: events.length,
  };
}
