import { SELF, env, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
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

async function createRoom(name = 'Host') {
  const created = await api<{
    session: RemoteSession;
    snapshot: RemotePlayerSnapshot;
  }>('/api/rooms', { method: 'POST', body: { name } });
  expect(created.response.status).toBe(200);
  expect(created.result.ok).toBe(true);
  if (!created.result.ok) throw new Error(created.result.error);
  return created.result.value;
}

async function join(code: string, seat: string, name: string) {
  const joined = await api<{
    session: RemoteSession;
    snapshot: RemotePlayerSnapshot;
  }>(`/api/rooms/${code}/join`, {
    method: 'POST',
    body: { seat, name },
  });
  expect(joined.response.status).toBe(200);
  expect(joined.result.ok).toBe(true);
  if (!joined.result.ok) throw new Error(joined.result.error);
  return joined.result.value;
}

describe('remote game rooms', () => {
  it('allows only one player to claim a seat during a concurrent join', async () => {
    const host = await createRoom('Concurrency Host');
    const requests = await Promise.all([
      api(`/api/rooms/${host.session.code}/join`, {
        method: 'POST',
        body: { seat: 'D1', name: 'First Defense' },
      }),
      api(`/api/rooms/${host.session.code}/join`, {
        method: 'POST',
        body: { seat: 'D1', name: 'Second Defense' },
      }),
    ]);
    expect(requests.map(({ response }) => response.status).sort()).toEqual([200, 409]);
  });

  it('creates a lobby, claims seats, starts, and protects private views', async () => {
    const host = await createRoom('Plaintiff Host');
    const { code } = host.session;
    const d1 = await join(code, 'D1', 'Defense One');
    await join(code, 'P2', 'Plaintiff Two');
    await join(code, 'D2', 'Defense Two');

    const started = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/start`, {
      method: 'POST',
      token: host.session.token,
      body: { seed: 'remote-privacy-test' },
    });
    expect(started.result.ok).toBe(true);
    if (!started.result.ok || !started.result.value.game) throw new Error('game did not start');
    expect(started.result.value.legalActions.length).toBeGreaterThan(0);
    expect(started.result.value.game.players.P1.closingArgumentIssue).not.toBeNull();
    expect(started.result.value.game.players.D1.closingArgumentIssue).toBeNull();

    const firstAction = started.result.value.legalActions[0];
    expect(firstAction).toBeDefined();
    const acted = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/action`, {
      method: 'POST',
      token: host.session.token,
      body: { action: { ...firstAction, actor: 'D1' } },
    });
    expect(acted.result.ok).toBe(true);

    const defenseView = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/state`, {
      token: d1.session.token,
    });
    expect(defenseView.result.ok).toBe(true);
    if (!defenseView.result.ok || !defenseView.result.value.game) throw new Error('missing defense view');
    expect(defenseView.result.value.game.briefs.plaintiff.submittedSplit).toBeNull();
    expect(defenseView.result.value.game.players.P1.closingArgumentIssue).toBeNull();

    const rejected = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/state`, {
      token: 'not-a-real-token',
    });
    expect(rejected.response.status).toBe(401);
    expect(rejected.result.ok).toBe(false);
  });

  it('rejects browser requests from origins outside the allowlist', async () => {
    const response = await SELF.fetch('http://example.com/api/rooms', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Nope' }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('fills open seats with bots and reaches a verdict with one human', async () => {
    const host = await createRoom('Solo Human');
    const { code, token } = host.session;
    for (const seat of ['D1', 'P2', 'D2']) {
      const configured = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/bot`, {
        method: 'POST',
        token,
        body: { seat, enabled: true },
      });
      expect(configured.result.ok).toBe(true);
    }

    let current = await api<RemotePlayerSnapshot>(`/api/rooms/${code}/start`, {
      method: 'POST',
      token,
      body: { seed: 'remote-bot-game' },
    });
    expect(current.result.ok).toBe(true);
    for (let turn = 0; turn < 40; turn += 1) {
      if (!current.result.ok) throw new Error(current.result.error);
      if (current.result.value.game?.phase === 'complete') break;
      expect(current.result.value.pendingActor).toBe('P1');
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
    expect(current.result.value.game?.verdict).not.toBeNull();
  });

  it('expires room state when its alarm runs', async () => {
    const host = await createRoom('Temporary Host');
    const stub = env.ROOMS.getByName(host.session.code);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const lobby = await api(`/api/rooms/${host.session.code}/lobby`);
    expect(lobby.response.status).toBe(404);
  });
});
