/**
 * GET /api/signaling/room/:roomId
 * Returns compact room snapshot or errors:
 * 200 { room snapshot }
 * 404 { error: "not_found" }
 * 410 { error: "gone" }
 */
import { getRoom } from "../../lib/rooms";

export default function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET") return res.status(400).json({ error: "invalid_method" });

  // Vercel dynamic route: roomId is available in req.query.roomId
  const roomId = (req.query && req.query.roomId) || (req.params && req.params.roomId) || null;
  if (!roomId || typeof roomId !== "string") return res.status(400).json({ error: "roomId_required" });

  const r = getRoom(roomId);
  if ("error" in r) {
    if (r.error === "not_found") return res.status(404).json({ error: "not_found" });
    if (r.error === "gone") return res.status(410).json({ error: "gone" });
    return res.status(500).json({ error: "server_error" });
  }

  return res.status(200).json(r);
}