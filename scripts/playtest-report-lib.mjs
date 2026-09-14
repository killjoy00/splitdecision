const EVENT_NAME = 'split_decision_playtest_summary';
const CASE_ACTION_ORDER = ['lead', 'co_counsel', 'second_chair', 'citation'];
const ISSUE_ORDER = ['judge', 'jury', 'evidence', 'witnesses', 'experts'];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberOrZero(value) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function sumRecord(target, source) {
  if (!isRecord(source)) return;
  for (const [key, value] of Object.entries(source)) {
    if (Number.isFinite(value)) target[key] = (target[key] ?? 0) + Number(value);
  }
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(part, whole) {
  return whole > 0 ? (part / whole) * 100 : null;
}

function collectSummaries(value, summaries) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes(EVENT_NAME)) return;
    try {
      collectSummaries(JSON.parse(trimmed), summaries);
    } catch {
      const markerIndex = trimmed.indexOf(`\"event\":\"${EVENT_NAME}\"`);
      if (markerIndex < 0) return;
      const start = trimmed.lastIndexOf('{', markerIndex);
      const end = trimmed.lastIndexOf('}');
      if (start >= 0 && end > start) {
        try {
          collectSummaries(JSON.parse(trimmed.slice(start, end + 1)), summaries);
        } catch {
          // Ignore unparseable log decoration.
        }
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) collectSummaries(entry, summaries);
    return;
  }

  if (!isRecord(value)) return;
  if (value.event === EVENT_NAME) {
    summaries.push(value);
    return;
  }
  for (const nested of Object.values(value)) collectSummaries(nested, summaries);
}

export function extractPlaytestSummaries(text) {
  const summaries = [];
  const trimmed = text.trim();
  if (!trimmed) return summaries;

  try {
    collectSummaries(JSON.parse(trimmed), summaries);
    if (summaries.length) return summaries;
  } catch {
    // NDJSON, console output, and copied log lines are handled below.
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.includes(EVENT_NAME)) continue;
    collectSummaries(line, summaries);
  }
  return summaries;
}

function cleanSummary(summary) {
  if (!isRecord(summary) || summary.event !== EVENT_NAME) return null;
  return summary;
}

function mechanicsEligible(summary, minHumanSeats) {
  return Number.isFinite(summary.humanSeatsAtStart)
    && Number(summary.humanSeatsAtStart) >= minHumanSeats
    && Number(summary.matchNumber ?? 0) > 0;
}

function sortedEntries(record, preferredOrder = []) {
  const preferred = new Map(preferredOrder.map((key, index) => [key, index]));
  return Object.entries(record).sort(([a, aValue], [b, bValue]) => {
    const aIndex = preferred.has(a) ? preferred.get(a) : Number.MAX_SAFE_INTEGER;
    const bIndex = preferred.has(b) ? preferred.get(b) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    if (bValue !== aValue) return bValue - aValue;
    return a.localeCompare(b);
  });
}

export function buildPlaytestReport(rawSummaries, options = {}) {
  const minHumanSeats = Number.isInteger(options.minHumanSeats) ? options.minHumanSeats : 1;
  if (minHumanSeats < 0 || minHumanSeats > 4) {
    throw new Error('minHumanSeats must be an integer from 0 to 4');
  }

  const summaries = rawSummaries.map(cleanSummary).filter(Boolean);
  const completed = summaries.filter((summary) => summary.outcome === 'completed');
  const abandoned = summaries.filter((summary) => summary.outcome === 'abandoned');
  const mechanics = summaries.filter((summary) => mechanicsEligible(summary, minHumanSeats));
  const mechanicsCompleted = mechanics.filter((summary) => summary.outcome === 'completed');
  const multiplayerCompleted = completed.filter((summary) => Number(summary.humanSeatsAtStart) >= 2);
  const fullHumanCompleted = completed.filter((summary) => Number(summary.humanSeatsAtStart) === 4);

  const seatMix = { lobby_or_unknown: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const summary of summaries) {
    const humans = summary.humanSeatsAtStart;
    if (Number.isFinite(humans) && humans >= 1 && humans <= 4) seatMix[humans] += 1;
    else seatMix.lobby_or_unknown += 1;
  }

  const reasons = {};
  for (const summary of abandoned) {
    const reason = typeof summary.reason === 'string' ? summary.reason : 'unknown';
    reasons[reason] = (reasons[reason] ?? 0) + 1;
  }

  const gameDurationsMs = mechanicsCompleted
    .map((summary) => summary.gameDurationMs)
    .filter(Number.isFinite)
    .map(Number);
  const roomAgesMs = summaries
    .map((summary) => summary.roomAgeMs)
    .filter(Number.isFinite)
    .map(Number);

  const phaseSamples = {};
  const actionCounts = {};
  const caseActionCounts = {};
  const issueSelectionCounts = {};
  const decisionTimingByAction = {};
  const citationCompanionPositions = { first: 0, second: 0, unknown: 0 };
  let citationTargetCount = 0;
  let humanActionCount = 0;
  let seatRecoveryActions = 0;
  let botReplacements = 0;
  let hostTransfers = 0;
  let reconnects = 0;
  let hearingCount = 0;
  let hearingSideTiebreaks = 0;
  let hearingCloseMargins = 0;
  let hearingMarginTotal = 0;

  for (const summary of mechanics) {
    humanActionCount += numberOrZero(summary.humanActionCount);
    sumRecord(actionCounts, summary.actionCounts);
    sumRecord(caseActionCounts, summary.caseActionCounts);
    sumRecord(issueSelectionCounts, summary.issueSelectionCounts);
    citationTargetCount += numberOrZero(summary.citationTargetCount);
    sumRecord(citationCompanionPositions, summary.citationCompanionPositions);
    seatRecoveryActions += numberOrZero(summary.seatRecoveryActions);
    botReplacements += numberOrZero(summary.botReplacements);
    hostTransfers += numberOrZero(summary.hostTransfers);
    reconnects += numberOrZero(summary.reconnects);

    if (isRecord(summary.phaseDurationsMs)) {
      for (const [phase, duration] of Object.entries(summary.phaseDurationsMs)) {
        if (!Number.isFinite(duration)) continue;
        (phaseSamples[phase] ??= []).push(Number(duration));
      }
    }

    if (isRecord(summary.decisionTimingByAction)) {
      for (const [action, stat] of Object.entries(summary.decisionTimingByAction)) {
        if (!isRecord(stat)) continue;
        const target = decisionTimingByAction[action] ?? { count: 0, totalMs: 0, maxMs: 0 };
        target.count += numberOrZero(stat.count);
        target.totalMs += numberOrZero(stat.totalMs);
        target.maxMs = Math.max(target.maxMs, numberOrZero(stat.maxMs));
        decisionTimingByAction[action] = target;
      }
    }

    if (isRecord(summary.hearings)) {
      hearingCount += numberOrZero(summary.hearings.count);
      hearingSideTiebreaks += numberOrZero(summary.hearings.sideTiebreaks);
      hearingCloseMargins += numberOrZero(summary.hearings.closeMargins);
      hearingMarginTotal += numberOrZero(summary.hearings.marginTotal);
    }
  }

  const verdictSides = {};
  const verdictSeats = {};
  const sideTiebreaks = {};
  const firmTiebreaks = {};
  for (const summary of mechanicsCompleted) {
    if (!isRecord(summary.verdict)) continue;
    if (typeof summary.verdict.winningSide === 'string') {
      verdictSides[summary.verdict.winningSide] = (verdictSides[summary.verdict.winningSide] ?? 0) + 1;
    }
    if (typeof summary.verdict.winningSeat === 'string') {
      verdictSeats[summary.verdict.winningSeat] = (verdictSeats[summary.verdict.winningSeat] ?? 0) + 1;
    }
    if (typeof summary.verdict.sideTieBreaker === 'string') {
      sideTiebreaks[summary.verdict.sideTieBreaker] = (sideTiebreaks[summary.verdict.sideTieBreaker] ?? 0) + 1;
    }
    if (typeof summary.verdict.firmTieBreaker === 'string') {
      firmTiebreaks[summary.verdict.firmTieBreaker] = (firmTiebreaks[summary.verdict.firmTieBreaker] ?? 0) + 1;
    }
  }

  const phaseDurations = Object.fromEntries(Object.entries(phaseSamples).map(([phase, values]) => [phase, {
    samples: values.length,
    averageMs: average(values),
    medianMs: percentile(values, 0.5),
    p90Ms: percentile(values, 0.9),
  }]));

  const caseActionTotal = Object.values(caseActionCounts).reduce((sum, value) => sum + value, 0);
  const issueSelectionTotal = Object.values(issueSelectionCounts).reduce((sum, value) => sum + value, 0);
  const citationCompanionTotal = Object.values(citationCompanionPositions).reduce((sum, value) => sum + value, 0);
  const completionRate = percent(completed.length, summaries.length);

  let sampleConfidence = 'early';
  if (multiplayerCompleted.length >= 25) sampleConfidence = 'stable';
  else if (multiplayerCompleted.length >= 10) sampleConfidence = 'directional';

  const decisionGates = {
    sample: sampleConfidence === 'stable'
      ? 'STABLE: at least 25 completed multiplayer games; balance changes can use telemetry as strong evidence.'
      : sampleConfidence === 'directional'
        ? 'DIRECTIONAL: at least 10 completed multiplayer games; use telemetry with player comments before changing balance.'
        : `HOLD: only ${multiplayerCompleted.length} completed multiplayer games; do not make balance changes from telemetry alone.`,
    citation: citationTargetCount >= 10
      ? `REVIEW: ${citationTargetCount} human Citation uses are enough for a directional UX/rule read.`
      : `COLLECT: ${citationTargetCount} human Citation uses; target at least 10 before judging Citation.`,
    secondChair: numberOrZero(caseActionCounts.second_chair) >= 10
      ? `REVIEW: ${numberOrZero(caseActionCounts.second_chair)} human Second Chair uses are enough for a directional read.`
      : `COLLECT: ${numberOrZero(caseActionCounts.second_chair)} human Second Chair uses; target at least 10 before judging it.`,
    reliability: summaries.length < 10
      ? 'COLLECT: fewer than 10 room summaries; operational rates are still noisy.'
      : completionRate !== null && completionRate >= 80
        ? `HEALTHY: ${completionRate.toFixed(0)}% of logged rooms reached a verdict.`
        : `WATCH: ${completionRate?.toFixed(0) ?? 0}% of logged rooms reached a verdict; inspect abandonment reasons before balance work.`,
  };

  return {
    telemetryVersion: 1,
    minHumanSeatsForMechanics: minHumanSeats,
    samples: {
      summaries: summaries.length,
      completed: completed.length,
      abandoned: abandoned.length,
      completionRate,
      mechanicsGames: mechanics.length,
      mechanicsCompleted: mechanicsCompleted.length,
      multiplayerCompleted: multiplayerCompleted.length,
      fullHumanCompleted: fullHumanCompleted.length,
      sampleConfidence,
      seatMix,
      abandonmentReasons: reasons,
    },
    pace: {
      gameDurationMs: {
        samples: gameDurationsMs.length,
        averageMs: average(gameDurationsMs),
        medianMs: percentile(gameDurationsMs, 0.5),
        p90Ms: percentile(gameDurationsMs, 0.9),
      },
      roomAgeMs: {
        samples: roomAgesMs.length,
        averageMs: average(roomAgesMs),
        medianMs: percentile(roomAgesMs, 0.5),
        p90Ms: percentile(roomAgesMs, 0.9),
      },
      phases: phaseDurations,
      decisionTimingByAction: Object.fromEntries(Object.entries(decisionTimingByAction).map(([action, stat]) => [action, {
        ...stat,
        averageMs: stat.count > 0 ? stat.totalMs / stat.count : null,
      }])),
    },
    mechanics: {
      humanActionCount,
      actionCounts,
      caseActionCounts,
      caseActionTotal,
      issueSelectionCounts,
      issueSelectionTotal,
      citationTargetCount,
      citationCompanionPositions,
      citationCompanionTotal,
    },
    competition: {
      verdictSides,
      verdictSeats,
      sideTiebreaks,
      firmTiebreaks,
      hearings: {
        count: hearingCount,
        sideTiebreaks: hearingSideTiebreaks,
        sideTiebreakRate: percent(hearingSideTiebreaks, hearingCount),
        closeMargins: hearingCloseMargins,
        closeMarginRate: percent(hearingCloseMargins, hearingCount),
        averageMargin: hearingCount > 0 ? hearingMarginTotal / hearingCount : null,
      },
    },
    reliability: {
      seatRecoveryActions,
      botReplacements,
      hostTransfers,
      reconnects,
      frictionEvents: seatRecoveryActions + botReplacements + hostTransfers + reconnects,
    },
    decisionGates,
  };
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function formatPercent(value) {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
}

function labelize(value) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function markdownCountTable(record, total, preferredOrder = []) {
  const entries = sortedEntries(record, preferredOrder);
  if (!entries.length) return '_No data yet._';
  const rows = entries.map(([key, count]) => `| ${labelize(key)} | ${count} | ${formatPercent(percent(count, total))} |`);
  return ['| Choice | Count | Share |', '| --- | ---: | ---: |', ...rows].join('\n');
}

export function renderPlaytestMarkdown(report, options = {}) {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sample = report.samples;
  const game = report.pace.gameDurationMs;
  const hearing = report.competition.hearings;
  const citation = report.mechanics.citationCompanionPositions;
  const citationTotal = report.mechanics.citationCompanionTotal;

  const phaseRows = sortedEntries(report.pace.phases).map(([phase, stat]) =>
    `| ${labelize(phase)} | ${stat.samples} | ${formatDuration(stat.averageMs)} | ${formatDuration(stat.medianMs)} | ${formatDuration(stat.p90Ms)} |`);
  const decisionRows = sortedEntries(report.pace.decisionTimingByAction).map(([action, stat]) =>
    `| ${labelize(action)} | ${stat.count} | ${formatDuration(stat.averageMs)} | ${formatDuration(stat.maxMs)} |`);

  return `# Split Decision playtest report

Generated ${generatedAt}. Mechanics/pacing metrics include games that started with at least **${report.minHumanSeatsForMechanics} human seat${report.minHumanSeatsForMechanics === 1 ? '' : 's'}**; lifecycle counts include every exported summary.

## Snapshot

| Metric | Result |
| --- | ---: |
| Logged room/match summaries | ${sample.summaries} |
| Completed | ${sample.completed} |
| Abandoned | ${sample.abandoned} |
| Completion rate | ${formatPercent(sample.completionRate)} |
| Completed multiplayer games (2+ humans) | ${sample.multiplayerCompleted} |
| Completed full-human games | ${sample.fullHumanCompleted} |
| Sample confidence | **${sample.sampleConfidence.toUpperCase()}** |
| Human actions analyzed | ${report.mechanics.humanActionCount} |
| Median completed game time | ${formatDuration(game.medianMs)} |
| P90 completed game time | ${formatDuration(game.p90Ms)} |

### Human seats at game start

| Human seats | Summaries |
| --- | ---: |
| 1 | ${sample.seatMix[1]} |
| 2 | ${sample.seatMix[2]} |
| 3 | ${sample.seatMix[3]} |
| 4 | ${sample.seatMix[4]} |
| Lobby / unknown | ${sample.seatMix.lobby_or_unknown} |

## Mechanics

### Case actions

${markdownCountTable(report.mechanics.caseActionCounts, report.mechanics.caseActionTotal, CASE_ACTION_ORDER)}

### Issue choices

${markdownCountTable(report.mechanics.issueSelectionCounts, report.mechanics.issueSelectionTotal, ISSUE_ORDER)}

### Citation

- Human Citation uses: **${report.mechanics.citationTargetCount}**
- First companion targeted: **${citation.first}** (${formatPercent(percent(citation.first, citationTotal))})
- Second companion targeted: **${citation.second}** (${formatPercent(percent(citation.second, citationTotal))})
- Unknown target position: **${citation.unknown}**

## Pace

### Phase duration

${phaseRows.length ? ['| Phase | Games | Average | Median | P90 |', '| --- | ---: | ---: | ---: | ---: |', ...phaseRows].join('\n') : '_No phase-duration data yet._'}

### Human decision timing

${decisionRows.length ? ['| Action | Decisions | Average | Slowest |', '| --- | ---: | ---: | ---: |', ...decisionRows].join('\n') : '_No decision-timing data yet._'}

## Competitive shape

### Verdict side

${markdownCountTable(report.competition.verdictSides, report.samples.mechanicsCompleted)}

### Hearings

- Hearings observed: **${hearing.count}**
- Average side-strength margin: **${hearing.averageMargin === null ? '—' : hearing.averageMargin.toFixed(2)}**
- Close hearings (margin ≤ 1): **${hearing.closeMargins}** (${formatPercent(hearing.closeMarginRate)})
- Side tiebreaks: **${hearing.sideTiebreaks}** (${formatPercent(hearing.sideTiebreakRate)})

## Reliability / friction

| Signal | Count |
| --- | ---: |
| Seat recovery actions | ${report.reliability.seatRecoveryActions} |
| Bot replacements | ${report.reliability.botReplacements} |
| Host transfers | ${report.reliability.hostTransfers} |
| Reconnects after a 15s+ gap | ${report.reliability.reconnects} |
| Total friction events | ${report.reliability.frictionEvents} |

### Abandonment reasons

${markdownCountTable(sample.abandonmentReasons, sample.abandoned)}

## Decision gates

- **Sample:** ${report.decisionGates.sample}
- **Citation:** ${report.decisionGates.citation}
- **Second Chair:** ${report.decisionGates.secondChair}
- **Reliability:** ${report.decisionGates.reliability}
`;
}
