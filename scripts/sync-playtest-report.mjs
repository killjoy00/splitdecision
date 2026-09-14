import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  buildPlaytestReport,
  renderPlaytestMarkdown,
} from './playtest-report-lib.mjs';
import {
  DEFAULT_LOOKBACK_HOURS,
  DEFAULT_QUERY_LIMIT,
  buildCloudflareTelemetryQuery,
  cloudflareEvents,
  cloudflareRunStatus,
  extractCloudflarePlaytestEvents,
  mergePlaytestEvents,
  normalizeStoredPlaytestState,
} from './playtest-sync-lib.mjs';

const STATE_PATH = resolve('data/telemetry-summaries.json');
const REPORT_PATH = resolve('docs/PLAYTEST_REPORT.md');
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const LOOKBACK_HOURS = Number.parseInt(
  process.env.PLAYTEST_LOOKBACK_HOURS ?? String(DEFAULT_LOOKBACK_HOURS),
  10,
);
const MIN_HUMANS = Number.parseInt(process.env.PLAYTEST_MIN_HUMANS ?? '2', 10);

function assertConfiguration() {
  if (!ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID is required');
  if (!API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is required');
  if (!Number.isInteger(LOOKBACK_HOURS) || LOOKBACK_HOURS <= 0 || LOOKBACK_HOURS > 168) {
    throw new Error('PLAYTEST_LOOKBACK_HOURS must be an integer from 1 to 168');
  }
  if (!Number.isInteger(MIN_HUMANS) || MIN_HUMANS < 0 || MIN_HUMANS > 4) {
    throw new Error('PLAYTEST_MIN_HUMANS must be an integer from 0 to 4');
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function cloudflareQuery(body) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Cloudflare telemetry query returned non-JSON (${response.status}): ${text.slice(0, 500)}`);
  }

  if (!response.ok || payload?.success === false) {
    const details = Array.isArray(payload?.errors)
      ? payload.errors.map((entry) => entry?.message ?? JSON.stringify(entry)).join('; ')
      : text.slice(0, 500);
    throw new Error(`Cloudflare telemetry query failed (${response.status}): ${details}`);
  }

  return payload;
}

async function queryPage(body) {
  let payload = await cloudflareQuery(body);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (cloudflareRunStatus(payload) !== 'STARTED') return payload;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    payload = await cloudflareQuery(body);
  }
  return payload;
}

async function fetchRecentPlaytestEvents(from, to) {
  const collected = [];
  let offset = null;

  for (let page = 0; page < 100; page += 1) {
    const query = buildCloudflareTelemetryQuery({
      from,
      to,
      limit: DEFAULT_QUERY_LIMIT,
      offset,
    });
    const payload = await queryPage(query);
    const events = cloudflareEvents(payload);
    collected.push(...extractCloudflarePlaytestEvents(events));

    if (events.length < DEFAULT_QUERY_LIMIT) break;
    const last = events.at(-1);
    const nextOffset = last?.$metadata?.id;
    if (typeof nextOffset !== 'string' || !nextOffset || nextOffset === offset) {
      throw new Error('Cloudflare telemetry pagination returned a full page without a usable next cursor');
    }
    offset = nextOffset;
  }

  return collected;
}

function automatedHeader({ from, to, added, total }) {
  return [
    '> **Automated report.** SplitDecision refreshes this from Cloudflare Worker telemetry every six hours; no manual export or report generation is required.',
    `> Last sync window: ${new Date(from).toISOString()} to ${new Date(to).toISOString()}. New summaries: ${added}. Cumulative summaries: ${total}.`,
    '',
  ].join('\n');
}

async function main() {
  assertConfiguration();
  const now = Date.now();
  const from = now - LOOKBACK_HOURS * 60 * 60 * 1_000;
  const existing = normalizeStoredPlaytestState(await readJson(STATE_PATH, null));
  const incoming = await fetchRecentPlaytestEvents(from, now);
  const merged = mergePlaytestEvents(existing, incoming, new Date(now).toISOString());
  const summaries = merged.state.events.map((entry) => entry.summary);
  const report = buildPlaytestReport(summaries, { minHumanSeats: MIN_HUMANS });
  const markdown = renderPlaytestMarkdown(report, { generatedAt: new Date(now).toISOString() });

  await mkdir(dirname(STATE_PATH), { recursive: true });
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(merged.state, null, 2)}\n`, 'utf8');
  await writeFile(
    REPORT_PATH,
    `${automatedHeader({ from, to: now, added: merged.added, total: merged.total })}${markdown}`,
    'utf8',
  );

  console.log(`Playtest sync complete: ${incoming.length} summaries fetched, ${merged.added} new, ${merged.total} cumulative.`);
}

await main();
