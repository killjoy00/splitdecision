import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
  buildPlaytestReport,
  extractPlaytestSummaries,
  renderPlaytestMarkdown,
} from './playtest-report-lib.mjs';

function valueAfter(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function positionalInput() {
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--format' || arg === '--out' || arg === '--min-humans') {
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) return arg;
  }
  return '-';
}

function integerOption(flag, fallback) {
  const raw = valueAfter(flag, String(fallback));
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const inputPath = positionalInput();
const format = valueAfter('--format', 'markdown');
const outputPath = valueAfter('--out');
const minHumanSeats = integerOption('--min-humans', 1);

if (!['markdown', 'json'].includes(format)) {
  throw new Error('--format must be markdown or json');
}

const input = inputPath === '-' ? await readStdin() : await readFile(inputPath, 'utf8');
const summaries = extractPlaytestSummaries(input);
if (!summaries.length) {
  throw new Error('No split_decision_playtest_summary events were found in the input.');
}

const report = buildPlaytestReport(summaries, { minHumanSeats });
const output = format === 'json'
  ? `${JSON.stringify(report, null, 2)}\n`
  : renderPlaytestMarkdown(report);

if (outputPath) {
  await writeFile(outputPath, output, 'utf8');
  console.error(`Wrote ${summaries.length} playtest summaries to ${outputPath}`);
} else {
  process.stdout.write(output);
}
