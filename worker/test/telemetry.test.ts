import { SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import type {
  RemoteApiResult,
  RemotePlayerSnapshot,
  RemoteSession,
} from '../../src/remote/protocol.js';

const ORIGIN = 'http://localhost:5173';

async function api<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: Record<string, unknown> } = {},
): Promise<{ response: Response; result: RemoteApiResult<T> }> {
  const response = await SELF.fetch(`http://example.com${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Origin: ORIGIN,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return {
    response,
    result: await response.json<RemoteApiResult<T>>(),
  };
}

async function createRoom(name = 'Telemetry Host') {
  const created = await api<{
    session: RemoteSession;
    snapshot: RemotePlayerSnapshot;
  }>('/api/rooms', { method: 'POST', body: { name } });
  expect(created.result.ok).toBe(true);
  if (!created.result.ok) throw new Error(created.result.error);
  return created.result.value;
}

function parsedPlaytestSummaries(logs: string[]) {
  return logs
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((value): value is Record<string, unknown> =>
      value?.event === 'split_decision_playtest_summary');
}

describe('playtest telemetry', () => {
  it('logs aggregate completion metrics without room or player secrets', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value) => {
      logs.push(String(value));
    });

    try {
      const host = await createRoom();
      const { code, token } = host.session;
      for (const seat of ['D1', 'P2', 'D2']) {
        const configured = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/bot`, {
          method: 'POST',
          token,
          body: { seat, controller: 'easy' },
        });
        expect(configured.result.ok).toBe(true);
      }

      let current = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/start`, {
        method: 'POST',
        token,
        body: { seed: 'telemetry-complete-test' },
      });
      expect(current.result.ok).toBe(true);

      for (let turn = 0; turn < 40; turn += 1) {
        if (!current.result.ok) throw new Error(current.result.error);
        if (current.result.value.game?.phase === 'complete') break;
        const action = current.result.value.legalActions[0];
        expect(action).toBeDefined();
        current = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/action`, {
          method: 'POST',
          token,
          body: { action },
        });
      }

      expect(current.result.ok).toBe(true);
      if (!current.result.ok) throw new Error(current.result.error);
      expect(current.result.value.game?.phase).toBe('complete');

      const summaries = parsedPlaytestSummaries(logs);
      expect(summaries).toHaveLength(1);
      const summary = summaries[0];
      expect(summary.outcome).toBe('completed');
      expect(summary.reason).toBe('verdict');
      expect(summary.humanActionCount).toEqual(expect.any(Number));
      expect(summary.humanActionCount as number).toBeGreaterThan(0);
      expect(summary.actionCounts).toEqual(expect.any(Object));
      expect(summary.caseActionCounts).toEqual(expect.any(Object));
      expect(summary.issueSelectionCounts).toEqual(expect.any(Object));
      expect(summary.phaseDurationsMs).toEqual(expect.any(Object));
      expect(summary.gameDurationMs).toEqual(expect.any(Number));
      expect(summary.hearings).toEqual(expect.any(Object));
      expect(summary.verdict).toEqual(expect.any(Object));

      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain(code);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain('Telemetry Host');
      expect(serialized).not.toContain('telemetry-complete-test');
      expect(serialized).not.toContain('seed');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('name');
    } finally {
      spy.mockRestore();
    }
  });

  it('logs an abandoned lobby when the last human leaves', async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value) => {
      logs.push(String(value));
    });

    try {
      const host = await createRoom('Leaving Host');
      const left = await api<{ protocolVersion: 2; closed: boolean }>(
        `/api/rooms/${host.session.code}/leave`,
        { method: 'POST', token: host.session.token },
      );
      expect(left.result).toEqual({
        ok: true,
        value: { protocolVersion: 2, closed: true },
      });

      const summaries = parsedPlaytestSummaries(logs);
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        outcome: 'abandoned',
        reason: 'all_humans_left',
        stage: 'lobby',
      });
    } finally {
      spy.mockRestore();
    }
  });
});
