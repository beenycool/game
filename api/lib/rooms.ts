/**
 * Lightweight in-memory room store for signaling.
 * - Default idle TTL = 10 minutes (600_000 ms)
 * - heartbeat extends TTL by 15s (15_000 ms)
 *
 * Small, dependency-free, designed for Vercel serverless usage.
 */

type Candidate = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

type RoomInternal = {
  roomId: string;
  roomCode: string;
  hostId: string;
  createdAt: number;
  expiresAt: number;
  ttl: number;
  offers: Map<string, string>;
  answers: Map<string, string>;
  candidates: Map<string, Candidate[]>;
  timer?: NodeJS.Timeout;
  closed?: boolean;
  closeReason?: string;
};

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_EXTEND = 15 * 1000; // 15 seconds

const rooms = new Map<string, RoomInternal>();

function now() {
  return Date.now();
}

function makeId(len = 16) {
  // simple random hex id (no external deps)
  const bytes = new Uint8Array(len / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import { randomInt } from 'crypto';

function makeCode() {
  // Generate a 6-character room code using secure random
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[randomInt(0, chars.length)];
  }
  return code;
}

function scheduleEviction(r: RoomInternal) {
  if (r.timer) clearTimeout(r.timer);
  const ms = Math.max(0, r.expiresAt - now());
  r.timer = setTimeout(() => {
    // remove room on expiry
export function createRoom(hostId: string, opts?: { ttl?: number }) {
  if (!hostId) throw new Error("hostId required");
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  let roomId: string;
  let attempts = 0;
  do {
    roomId = makeId(16);
    if (++attempts > 10) {
      throw new Error("Failed to generate unique room ID");
    }
  } while (rooms.has(roomId));
  const roomCode = makeCode();
  const createdAt = now();
  const expiresAt = createdAt + ttl;
  const room: RoomInternal = {
    roomId,
    roomCode,
    hostId,
    createdAt,
    expiresAt,
    ttl,
    offers: new Map(),
    answers: new Map(),
    candidates: new Map(),
  };
  rooms.set(roomId, room);
  scheduleEviction(room);
  return { roomId, roomCode, expiresAt };
}
    answers: new Map(),
    candidates: new Map(),
  };
  rooms.set(roomId, room);
  scheduleEviction(room);
  return { roomId, roomCode, expiresAt };
}

function ensureRoom(roomId: string) {
  const r = rooms.get(roomId);
  if (!r) return { error: "not_found" as const };
  if (r.closed) return { error: "gone" as const };
  if (r.expiresAt <= now()) {
    rooms.delete(roomId);
    return { error: "gone" as const };
  }
  return { room: r };
}

/**
 * getRoom(roomId)
 * returns a compact JSON-serializable snapshot (no timers)
 */
export function getRoom(roomId: string) {
  const res = ensureRoom(roomId);
  if ("error" in res) return { error: res.error };
  const r = res.room;
  return {
    roomId: r.roomId,
    roomCode: r.roomCode,
    hostId: r.hostId,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    offers: Array.from(r.offers.entries()).map(([clientId, sdp]) => ({ clientId, sdp })),
    answers: Array.from(r.answers.entries()).map(([clientId, sdp]) => ({ clientId, sdp })),
    candidates: Array.from(r.candidates.entries()).map(([clientId, list]) => ({ clientId, candidates: list })),
  };
}

/**
 * addOffer(roomId, clientId, sdp)
 */
export function addOffer(roomId: string, clientId: string, sdp: string) {
  if (!clientId || !sdp) return { error: "invalid" as const };
  const res = ensureRoom(roomId);
  if ("error" in res) return { error: res.error };
  const r = res.room;
  if (r.offers.has(clientId)) return { error: "conflict" as const };
  r.offers.set(clientId, sdp);
  heartbeat(roomId, clientId);
  return { ok: true };
}

/**
 * addAnswer(roomId, clientId, sdp)
 */
export function addAnswer(roomId: string, clientId: string, sdp: string) {
  if (!clientId || !sdp) return { error: "invalid" as const };
  const res = ensureRoom(roomId);
  if ("error" in res) return { error: res.error };
  const r = res.room;
  r.answers.set(clientId, sdp);
  heartbeat(roomId, clientId);
  return { ok: true };
}

/**
 * addCandidate(roomId, clientId, candidate)
 */
export function addCandidate(roomId: string, clientId: string, candidate: Candidate) {
  if (!clientId || candidate == null) return { error: "invalid" as const };
  const res = ensureRoom(roomId);
  if ("error" in res) return { error: res.error };
  const r = res.room;
  const list = r.candidates.get(clientId) || [];
  list.push(candidate);
  r.candidates.set(clientId, list);
  heartbeat(roomId, clientId);
  return { ok: true };
}

/**
 * heartbeat(roomId, clientId) -> extends TTL by HEARTBEAT_EXTEND
 */
export function heartbeat(roomId: string, clientId?: string) {
  const res = ensureRoom(roomId);
  if ("error" in res) return { error: res.error };
  const r = res.room;
  // extend expiresAt by HEARTBEAT_EXTEND
  r.expiresAt = Math.max(r.expiresAt, now()) + HEARTBEAT_EXTEND;
  scheduleEviction(r);
  return { ok: true, expiresAt: r.expiresAt };
}

/**
 * closeRoom(roomId, reason)
 */
export function closeRoom(roomId: string, reason?: string) {
  const r = rooms.get(roomId);
  if (!r) return { error: "not_found" as const };
  if (r.timer) clearTimeout(r.timer);
  r.closed = true;
  r.closeReason = reason;
  rooms.delete(roomId);
  return { ok: true };
}

/**
 * (export internal helpers for tests)
 */
export function _listRoomsForDebug() {
  return Array.from(rooms.keys());
}