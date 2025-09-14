/**
 * POST /api/signaling/create-room
 * body: { hostId: string, ttl?: number (ms) }
 * success: 201 { roomId, roomCode, expiresAt }
 * errors: 400, 500
 *
 * NOTE: keep this file dependency-free (no @vercel/node types) to avoid build issues.
 */
import { createRoom } from "../lib/rooms";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    return res.status(400).json({ error: "invalid_method" });
  }

  const body = req.body || {};
  const hostId = typeof body.hostId === "string" ? body.hostId.trim() : "";
  const ttl = body.ttl !== undefined ? Number(body.ttl) : undefined;

  if (!hostId) return res.status(400).json({ error: "hostId_required" });
  if (ttl !== undefined && (!Number.isFinite(ttl) || ttl <= 0)) {
    return res.status(400).json({ error: "invalid_ttl" });
  }

  try {
    const room = createRoom(hostId, ttl ? { ttl } : undefined);
    return res.status(201).json(room);
  } catch (err: any) {
    return res.status(500).json({ error: "server_error", message: String(err?.message || err) });
  }
}