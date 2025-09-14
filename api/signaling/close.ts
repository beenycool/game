/**
 * POST /api/signaling/close
 * body: { roomId: string, reason?: string }
 *
 * Responses:
 * 200 { ok: true }
 * 400 { error }
 * 404 { error: "not_found" }
 */
import { closeRoom } from "../lib/rooms";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(400).json({ error: "invalid_method" });

  const body = req.body || {};
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason : undefined;

  if (!roomId) return res.status(400).json({ error: "roomId_required" });

  const r = closeRoom(roomId, reason);
  if ("error" in r) {
    if (r.error === "not_found") return res.status(404).json({ error: "not_found" });
    return res.status(500).json({ error: "server_error" });
  }

  return res.status(200).json({ ok: true });
}