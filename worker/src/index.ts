import { DurableObject } from 'cloudflare:workers';
import {
  SEAT_ORDER,
  applyAction,
  assertGameInvariants,
  chooseBotAction,
  createGame,
  createRandom,
  getLegalActions,
  getPendingActors,
  getPlayerView,
  type AutomatedBotLevel,
  type GameState,
  type SeatId,
} from '../../src/engine/index.js';
import type {
  RemoteApiFailure,
  RemoteApiResult,
  RemoteController,
  RemoteLobby,
  RemotePlayerSnapshot,
  RemoteSeat,
  RemoteSession,
} from '../../src/remote/protocol.js';

interface StoredSeat {
  name: string;
  controller: RemoteController;
  tokenHash: string | null;
}

interface StoredRoom {
  version: 1;
  code: string;
  revision: number;
  hostSeat: SeatId;
  seats: Record<SeatId, StoredSeat>;
  game: GameState | null;
  createdAt: number;
  updatedAt: number;
}

interface RoomRow extends Record<string, SqlStorageValue> {
  state: string;
}

const ROOM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 16_384;
const encoder = new TextEncoder();
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function failure(status: number, code: string, error: string): RemoteApiFailure {
  return { ok: false, status, code, error };
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 36 ? name : null;
}

function parseSeat(value: unknown): SeatId | null {
  return typeof value === 'string' && SEAT_ORDER.includes(value as SeatId)
    ? value as SeatId
    : null;
}

function parseController(value: unknown): RemoteController | null {
  return value === 'human' || value === 'easy' || value === 'medium' || value === 'hard'
    ? value
    : null;
}

function botName(level: AutomatedBotLevel, seat: SeatId): string {
  return `${level.charAt(0).toUpperCase()}${level.slice(1)} Bot ${seat}`;
}

function createRoomCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(values, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  return leftBytes.byteLength === rightBytes.byteLength
    && crypto.subtle.timingSafeEqual(leftBytes, rightBytes);
}

function lobbyFor(room: StoredRoom): RemoteLobby {
  const seats = SEAT_ORDER.map((seat): RemoteSeat => ({
    seat,
    name: room.seats[seat].name,
    controller: room.seats[seat].controller,
    claimed: room.seats[seat].controller !== 'human' || room.seats[seat].tokenHash !== null,
  }));
  return {
    code: room.code,
    revision: room.revision,
    hostSeat: room.hostSeat,
    phase: room.game?.phase === 'complete' ? 'complete' : room.game ? 'playing' : 'lobby',
    seats,
  };
}

async function readJson(request: Request): Promise<RemoteApiResult<Record<string, unknown>>> {
  if (!request.body) return { ok: true, value: {} };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      return failure(413, 'body_too_large', 'Request body is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failure(400, 'invalid_json', 'JSON body must be an object.');
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return failure(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  if (origin === env.FRONTEND_ORIGIN) return origin;
  try {
    const url = new URL(origin);
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1')
        && (url.protocol === 'http:' || url.protocol === 'https:')) {
      return origin;
    }
  } catch {
    return null;
  }
  return null;
}

function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function json<T>(result: RemoteApiResult<T>, origin: string | null): Response {
  const status = result.ok ? 200 : result.status;
  return withCors(Response.json(result, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  }), origin);
}

export class GameRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)',
      );
    });
  }

  private readRoom(): StoredRoom | null {
    const row = this.ctx.storage.sql.exec<RoomRow>(
      'SELECT state FROM room_state WHERE id = 1',
    ).toArray()[0];
    return row ? JSON.parse(row.state) as StoredRoom : null;
  }

  private writeRoom(room: StoredRoom): void {
    room.revision += 1;
    room.updatedAt = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO room_state (id, state) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state',
      JSON.stringify(room),
    );
  }

  private async extendLifetime(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
  }

  private seatForToken(room: StoredRoom, tokenHash: string): SeatId | null {
    for (const seat of SEAT_ORDER) {
      const expected = room.seats[seat].tokenHash;
      if (expected && safeEqual(tokenHash, expected)) return seat;
    }
    return null;
  }

  private requireHost(room: StoredRoom, tokenHash: string): boolean {
    return this.seatForToken(room, tokenHash) === room.hostSeat;
  }

  private settleBots(room: StoredRoom): RemoteApiFailure | null {
    if (!room.game) return null;
    let steps = 0;
    while (room.game.phase !== 'complete') {
      const actor = getPendingActors(room.game)[0] ?? null;
      if (!actor || room.game.players[actor].controller === 'human') break;
      const level = room.game.players[actor].controller as AutomatedBotLevel;
      const random = createRandom(
        `${room.game.seed}:remote-bot:${room.game.actionHistory.length}`,
      );
      const action = chooseBotAction(room.game, actor, level, random);
      const result = applyAction(room.game, action);
      if (!result.ok) return failure(500, 'bot_action_failed', result.error.message);
      room.game = result.state;
      steps += 1;
      if (steps > 100) return failure(500, 'bot_loop', 'Bot action limit exceeded.');
    }
    return null;
  }

  private snapshot(room: StoredRoom, seat: SeatId): RemotePlayerSnapshot {
    const game = room.game ? getPlayerView(room.game, seat) : null;
    const pendingActor = room.game ? getPendingActors(room.game)[0] ?? null : null;
    const legalActions = room.game && pendingActor === seat
      ? getLegalActions(room.game, seat)
      : [];
    return { lobby: lobbyFor(room), seat, game, legalActions, pendingActor };
  }

  async initialize(code: string, nameValue: unknown): Promise<RemoteApiResult<{
    session: RemoteSession;
    snapshot: RemotePlayerSnapshot;
  }>> {
    const name = normalizeName(nameValue);
    if (!name) return failure(400, 'invalid_name', 'Enter a name between 1 and 36 characters.');
    const token = crypto.randomUUID();
    const tokenHash = await sha256Hex(token);
    if (this.readRoom()) return failure(409, 'room_exists', 'That room code is already in use.');
    const now = Date.now();
    const seats = Object.fromEntries(SEAT_ORDER.map((seat) => [
      seat,
      {
        name: seat === 'P1' ? name : `Open ${seat} seat`,
        controller: 'human',
        tokenHash: null,
      } satisfies StoredSeat,
    ])) as Record<SeatId, StoredSeat>;
    seats.P1.tokenHash = tokenHash;
    const room: StoredRoom = {
      version: 1,
      code,
      revision: 0,
      hostSeat: 'P1',
      seats,
      game: null,
      createdAt: now,
      updatedAt: now,
    };
    this.writeRoom(room);
    await this.extendLifetime();
    return {
      ok: true,
      value: {
        session: { code, seat: 'P1', token },
        snapshot: this.snapshot(room, 'P1'),
      },
    };
  }

  async getLobby(): Promise<RemoteApiResult<RemoteLobby>> {
    const room = this.readRoom();
    return room
      ? { ok: true, value: lobbyFor(room) }
      : failure(404, 'room_not_found', 'Room not found or expired.');
  }

  async join(nameValue: unknown, seatValue: unknown): Promise<RemoteApiResult<{
    session: RemoteSession;
    snapshot: RemotePlayerSnapshot;
  }>> {
    const name = normalizeName(nameValue);
    const seat = parseSeat(seatValue);
    if (!name || !seat) return failure(400, 'invalid_join', 'Choose an open seat and enter a valid name.');
    const token = crypto.randomUUID();
    const tokenHash = await sha256Hex(token);
    const room = this.readRoom();
    if (!room) return failure(404, 'room_not_found', 'Room not found or expired.');
    if (room.game) return failure(409, 'game_started', 'This game has already started.');
    const selected = room.seats[seat];
    if (selected.controller !== 'human' || selected.tokenHash) {
      return failure(409, 'seat_taken', 'That seat is no longer available.');
    }
    selected.name = name;
    selected.tokenHash = tokenHash;
    this.writeRoom(room);
    await this.extendLifetime();
    return {
      ok: true,
      value: {
        session: { code: room.code, seat, token },
        snapshot: this.snapshot(room, seat),
      },
    };
  }

  async setBot(token: string, seatValue: unknown, controllerValue: unknown): Promise<RemoteApiResult<RemotePlayerSnapshot>> {
    const tokenHash = await sha256Hex(token);
    const room = this.readRoom();
    if (!room) return failure(404, 'room_not_found', 'Room not found or expired.');
    if (room.game) return failure(409, 'game_started', 'Bot seats cannot change after the game starts.');
    if (!this.requireHost(room, tokenHash)) return failure(403, 'host_required', 'Only the host can configure bots.');
    const seat = parseSeat(seatValue);
    const controller = parseController(controllerValue);
    if (!seat || seat === room.hostSeat || !controller) {
      return failure(400, 'invalid_bot', 'Choose a non-host seat and a bot setting.');
    }
    const selected = room.seats[seat];
    if (selected.tokenHash) return failure(409, 'seat_taken', 'A player has already claimed that seat.');
    selected.controller = controller;
    selected.name = controller === 'human'
      ? `Open ${seat} seat`
      : botName(controller, seat);
    this.writeRoom(room);
    await this.extendLifetime();
    return { ok: true, value: this.snapshot(room, room.hostSeat) };
  }

  async start(token: string, seedValue: unknown): Promise<RemoteApiResult<RemotePlayerSnapshot>> {
    const tokenHash = await sha256Hex(token);
    const room = this.readRoom();
    if (!room) return failure(404, 'room_not_found', 'Room not found or expired.');
    if (room.game) return failure(409, 'game_started', 'This game has already started.');
    if (!this.requireHost(room, tokenHash)) return failure(403, 'host_required', 'Only the host can start the game.');
    const openSeat = SEAT_ORDER.find((seat) => {
      const candidate = room.seats[seat];
      return candidate.controller === 'human' && candidate.tokenHash === null;
    });
    if (openSeat) return failure(409, 'open_seats', `${openSeat} still needs a player or bot.`);
    const seed = typeof seedValue === 'string' && seedValue.trim()
      ? seedValue.trim().slice(0, 80)
      : `remote-${room.code}-${Date.now().toString(36)}`;
    const controllers = Object.fromEntries(SEAT_ORDER.map((seat) => [
      seat,
      room.seats[seat].controller,
    ]));
    room.game = createGame({ seed, controllers });
    const botFailure = this.settleBots(room);
    if (botFailure) return botFailure;
    assertGameInvariants(room.game);
    this.writeRoom(room);
    await this.extendLifetime();
    return { ok: true, value: this.snapshot(room, room.hostSeat) };
  }

  async getState(token: string): Promise<RemoteApiResult<RemotePlayerSnapshot>> {
    const tokenHash = await sha256Hex(token);
    const room = this.readRoom();
    if (!room) return failure(404, 'room_not_found', 'Room not found or expired.');
    const seat = this.seatForToken(room, tokenHash);
    if (!seat) return failure(401, 'invalid_session', 'This player session is not valid.');
    return { ok: true, value: this.snapshot(room, seat) };
  }

  async act(token: string, actionValue: unknown): Promise<RemoteApiResult<RemotePlayerSnapshot>> {
    const tokenHash = await sha256Hex(token);
    const room = this.readRoom();
    if (!room) return failure(404, 'room_not_found', 'Room not found or expired.');
    if (!room.game) return failure(409, 'not_started', 'The host has not started the game.');
    const seat = this.seatForToken(room, tokenHash);
    if (!seat) return failure(401, 'invalid_session', 'This player session is not valid.');
    const pendingActor = getPendingActors(room.game)[0] ?? null;
    if (pendingActor !== seat) return failure(409, 'not_your_turn', 'It is not your turn.');
    if (actionValue === null || typeof actionValue !== 'object' || Array.isArray(actionValue)) {
      return failure(400, 'invalid_action', 'Action must be an object.');
    }
    const action = { ...(actionValue as Record<string, unknown>), actor: seat };
    const result = applyAction(room.game, action);
    if (!result.ok) return failure(400, result.error.code, result.error.message);
    room.game = result.state;
    const botFailure = this.settleBots(room);
    if (botFailure) return botFailure;
    assertGameInvariants(room.game);
    this.writeRoom(room);
    await this.extendLifetime();
    return { ok: true, value: this.snapshot(room, seat) };
  }

  async alarm(): Promise<void> {
    this.ctx.storage.sql.exec('DELETE FROM room_state');
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const originHeader = request.headers.get('Origin');
    const origin = allowedOrigin(request, env);
    if (originHeader && !origin) {
      return json(failure(403, 'origin_forbidden', 'This origin is not allowed.'), null);
    }
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin);
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'rooms') {
      return json(failure(404, 'not_found', 'Endpoint not found.'), origin);
    }

    if (request.method === 'POST' && parts.length === 2) {
      const body = await readJson(request);
      if (!body.ok) return json(body, origin);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = createRoomCode();
        const result = await env.ROOMS.getByName(code).initialize(code, body.value.name);
        if (result.ok || result.code !== 'room_exists') return json(result, origin);
      }
      return json(failure(503, 'room_unavailable', 'Could not allocate a room. Try again.'), origin);
    }

    const code = parts[2]?.toUpperCase();
    if (!code || !/^[A-Z2-9]{6}$/.test(code)) {
      return json(failure(400, 'invalid_room', 'Enter a valid six-character room code.'), origin);
    }
    const room = env.ROOMS.getByName(code);
    const operation = parts[3] ?? 'lobby';

    if (request.method === 'GET' && operation === 'lobby') {
      return json(await room.getLobby(), origin);
    }
    if (request.method === 'GET' && operation === 'state') {
      const token = bearerToken(request);
      return json(token
        ? await room.getState(token)
        : failure(401, 'missing_session', 'Player session is required.'), origin);
    }
    if (request.method !== 'POST') {
      return json(failure(405, 'method_not_allowed', 'Method not allowed.'), origin);
    }

    const body = await readJson(request);
    if (!body.ok) return json(body, origin);
    if (operation === 'join') {
      return json(await room.join(body.value.name, body.value.seat), origin);
    }

    const token = bearerToken(request);
    if (!token) return json(failure(401, 'missing_session', 'Player session is required.'), origin);
    if (operation === 'bot') {
      const controller = body.value.controller
        ?? (body.value.enabled === true ? 'easy' : body.value.enabled === false ? 'human' : undefined);
      return json(await room.setBot(token, body.value.seat, controller), origin);
    }
    if (operation === 'start') {
      return json(await room.start(token, body.value.seed), origin);
    }
    if (operation === 'action') {
      return json(await room.act(token, body.value.action), origin);
    }
    return json(failure(404, 'not_found', 'Endpoint not found.'), origin);
  },
} satisfies ExportedHandler<Env>;
