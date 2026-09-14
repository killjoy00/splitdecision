const FRONTEND_URL = (process.env.SPLIT_DECISION_FRONTEND_URL
  ?? 'https://splitdecision.planitnow.us').replace(/\/$/, '');
const API_URL = (process.env.SPLIT_DECISION_API_URL
  ?? 'https://splitdecision-api.planitnow.us').replace(/\/$/, '');
const ORIGIN = new URL(FRONTEND_URL).origin;
const PROTOCOL_VERSION = 2;
const ROOM_SCHEMA_VERSION = 2;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function retry(label, operation, attempts = 8, delayMs = 4_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        console.log(`${label} attempt ${attempt}/${attempts} failed; retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}

async function fetchOk(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${options.method ?? 'GET'} ${url} returned ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

async function jsonOk(url, options = {}) {
  const response = await fetchOk(url, options);
  const result = await response.json();
  assert(result && typeof result === 'object' && result.ok === true, `${url} returned an API failure`);
  return { response, result };
}

function leaveRequest(token) {
  return {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  };
}

let session = null;
let cleanedUp = false;

try {
  const frontend = await retry('frontend', async () => {
    const response = await fetchOk(FRONTEND_URL);
    const html = await response.text();
    assert(html.includes('<div id="root"></div>'), 'production frontend is missing the React root');
    assert(html.includes('<title>Split Decision</title>'), 'production frontend has the wrong document title');
    const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"/);
    assert(scriptMatch, 'production frontend is missing its built JavaScript bundle');
    const bundleUrl = new URL(scriptMatch[1], FRONTEND_URL).toString();
    const bundle = await fetchOk(bundleUrl);
    const javascript = await bundle.text();
    assert(
      javascript.includes(new URL(API_URL).host),
      'production frontend bundle is not wired to the production remote API',
    );
    return response;
  });
  assert(frontend.headers.get('content-type')?.includes('text/html'), 'frontend did not return HTML');

  const health = await retry('remote health', async () => {
    const current = await jsonOk(`${API_URL}/api/health`, {
      headers: { Origin: ORIGIN },
    });
    assert(
      current.response.headers.get('access-control-allow-origin') === ORIGIN,
      'remote API did not allow the production frontend origin',
    );
    assert(current.result.value?.protocolVersion === PROTOCOL_VERSION, 'remote protocol version mismatch');
    assert(current.result.value?.roomSchemaVersion === ROOM_SCHEMA_VERSION, 'remote room schema mismatch');
    assert(current.result.value?.status === 'ok', 'remote health status is not ok');
    return current;
  });
  void health;

  const created = await jsonOk(`${API_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: '__splitdecision_smoke__' }),
  });
  assert(
    created.response.headers.get('access-control-allow-origin') === ORIGIN,
    'room creation response is missing production CORS',
  );
  session = created.result.value?.session ?? null;
  const snapshot = created.result.value?.snapshot ?? null;
  assert(session && /^[A-Z2-9]{6}$/.test(session.code), 'room creation returned an invalid room code');
  assert(typeof session.token === 'string' && session.token.length >= 20, 'room creation returned no seat token');
  assert(snapshot?.protocolVersion === PROTOCOL_VERSION, 'room snapshot protocol mismatch');
  assert(snapshot?.seat === 'P1', 'smoke room host did not receive P1');

  const lobby = await jsonOk(`${API_URL}/api/rooms/${session.code}/lobby`, {
    headers: { Origin: ORIGIN },
  });
  assert(lobby.result.value?.code === session.code, 'lobby lookup returned the wrong room');
  assert(lobby.result.value?.phase === 'lobby', 'new production room is not in the lobby phase');

  const state = await jsonOk(`${API_URL}/api/rooms/${session.code}/state`, {
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${session.token}`,
    },
  });
  assert(state.result.value?.protocolVersion === PROTOCOL_VERSION, 'authenticated state protocol mismatch');
  assert(state.result.value?.seat === 'P1', 'authenticated state returned the wrong seat');

  const left = await jsonOk(
    `${API_URL}/api/rooms/${session.code}/leave`,
    leaveRequest(session.token),
  );
  assert(left.result.value?.closed === true, 'smoke room did not cleanly close after the host left');
  cleanedUp = true;

  console.log('Production smoke passed: frontend, bundle wiring, CORS, health, room creation, lobby, auth, and cleanup.');
} finally {
  if (session && !cleanedUp) {
    await fetch(
      `${API_URL}/api/rooms/${session.code}/leave`,
      leaveRequest(session.token),
    ).catch(() => undefined);
  }
}
