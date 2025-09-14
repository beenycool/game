/**
 * POST /api/signaling/answer
 * body: { roomId: string, clientId: string, sdp: string }
 *
 * Responses:
 * 201 { ok: true }
 * 400 { error }
 * 404 { error: "not_found" }
 * 410 { error: "gone" }
 */
import { addAnswer } from "../lib/rooms";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") return res.status(400).json({ error: "invalid_method" });

  const body = req.body || {};
  const roomId = typeof body.roomId === "string" ? body.roomId.trim() : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const sdp = typeof body.sdp === "string" ? body.sdp : "";

  if (!roomId || !clientId || !sdp) return res.status(400).json({ error: "roomId_clientId_sdp_required" });

  const r = addAnswer(roomId, clientId, sdp);
  if ("error" in r) {
    switch (r.error) {
      case "invalid":
        return res.status(400).json({ error: "invalid" });
      case "not_found":
        return res.status(404).json({ error: "not_found" });
      case "gone":
        return res.status(410).json({ error: "gone" });
      default:
        return res.status(500).json({ error: "server_error" });
    }
  }

  return res.status(201).json({ ok: true });
}