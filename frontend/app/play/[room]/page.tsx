'use client';

import React, { useEffect, useRef, useState } from "react";
import type { PeerHandle } from "../../../src/net/webrtc";
import { createPeer } from "../../../src/net/webrtc";
import { bootstrapGame } from "../../../src/game";

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

type ChatMsg = { from: string; text: string; when: number };

export default function Page({ params }: { params: { room: string } }) {
  const roomId = params.room;
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("username") || "Player";
    } catch {
      return "Player";
    }
  });
  const [clientId] = useState(() => {
    try {
      const existing = localStorage.getItem("clientId");
      if (existing) return existing;
      const id = makeId();
      localStorage.setItem("clientId", id);
      return id;
    } catch {
      return makeId();
    }
  });

  const [state, setState] = useState<"idle" | "connecting" | "connected" | "error" | "closed">("idle");
  const [peer, setPeer] = useState<PeerHandle | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<any>(null);

  useEffect(() => {
    localStorage.setItem("username", username);
  }, [username]);

  useEffect(() => {
    // cleanup on unmount
    return () => {
      if (peer) peer.close();
      if (gameRef.current) gameRef.current.destroy();
    };
  }, [peer]);

  async function handleConnect() {
    setState("connecting");
    try {
      // determine role by fetching room snapshot
      const res = await fetch(`/api/signaling/room/${encodeURIComponent(roomId)}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.debug("room fetch failed", res.status, txt);
        setState("error");
        return;
      }
      const snap = await res.json();
      // host if snapshot.hostId equals our clientId
      const isHost = !!(snap.hostId && snap.hostId === clientId);
      console.debug("creating peer, host=", isHost, "room=", roomId);
      const p = createPeer(isHost, roomId, clientId);
      setPeer(p);
      p.onStateChange((s) => {
        setState(s);
      });
      // message handling: hello / hello_ack
      const pendingHelloTs = new Map<number, number>();
      p.onMessage((rawMsg) => {
        // basic validation: must be a non-null object
        if (!rawMsg || typeof rawMsg !== "object") {
          console.warn("ignoring non-object message", rawMsg);
          return;
        }
        const msg: any = rawMsg;
        if (typeof msg.type !== "string") {
          console.warn("ignoring message with invalid or missing type", msg);
          return;
        }

        if (msg.type === "hello") {
          // require clientId (string) and ts (number)
          if (typeof msg.clientId !== "string" || typeof msg.ts !== "number") {
            console.warn("ignoring malformed hello message", msg);
            return;
          }
          const from = msg.clientId;
          const uname = typeof msg.username === "string" ? msg.username : undefined;
          setChat((c) => [
            ...c,
            { from, text: `HELLO ${from} ${uname ? "(" + uname + ")" : ""}`, when: Date.now() },
          ]);
          // reply ack - include origTs only if valid
          const orig = typeof msg.ts === "number" ? msg.ts : null;
          try {
            if (orig !== null) {
              p.send({ type: "hello_ack", clientId, origTs: orig });
            } else {
              p.send({ type: "hello_ack", clientId });
            }
          } catch (e) {
            console.error("failed to send hello_ack", e);
          }
        } else if (msg.type === "hello_ack") {
          const orig = typeof msg.origTs === "number" ? msg.origTs : null;
          if (typeof msg.clientId !== "string") {
            console.warn("received hello_ack with invalid clientId", msg);
          }
          if (orig !== null) {
            if (pendingHelloTs.has(orig)) {
              const rtt = Date.now() - orig;
              setPing(rtt);
              pendingHelloTs.delete(orig);
            }
          } else {
            console.warn("received hello_ack without valid origTs", msg);
          }
          const from = typeof msg.clientId === "string" ? msg.clientId : "unknown";
          setChat((c) => [
            ...c,
            { from, text: `HELLO_ACK from ${from}`, when: Date.now() },
          ]);
        } else {
          // unknown message: stringify safely
          let text: string;
          try {
            text = JSON.stringify(msg);
          } catch (e) {
            try {
              text = String(msg);
            } catch {
              text = "[unserializable message]";
            }
          }
          const from = typeof msg.clientId === "string" ? msg.clientId : "remote";
          setChat((c) => [...c, { from, text, when: Date.now() }]);
        }
      });

      // when connected, send hello with ts and track for RTT
      // when connected, send hello with ts and track for RTT
      p.onStateChange((s) => {
        if (s === "connected") {
          const ts = Date.now();
          try {
            p.send({ type: "hello", clientId, username, ts });
            pendingHelloTs.set(ts, Date.now());
            // Clean up after timeout
            setTimeout(() => {
              if (pendingHelloTs.has(ts)) {
                pendingHelloTs.delete(ts);
                console.warn("Hello ACK timeout for", ts);
              }
            }, 5000);
          } catch (e) {
            console.error("failed to send hello", e);
          }
        }
      });
      // mount minimal game UI
      if (canvasRef.current) {
        gameRef.current = bootstrapGame(canvasRef.current, {
          peer: {
            send: (obj: any) => {
              try {
                p.send(obj);
              } catch (e) {
                console.warn("peer send failed", e);
              }
            },
          },
        });
      }

      // actually connect (starts signaling)
      await p.connect();
      setState("connecting");
    } catch (err) {
      console.error("connect failed", err);
      setState("error");
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, Arial" }}>
      <h2>Lobby — room: {roomId}</h2>
      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Username:
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ marginLeft: 8 }}
          />
          <button
            onClick={handleConnect}
            disabled={state === "connecting" || state === "connected"}
            style={{ marginLeft: 12 }}
          >
            Connect
          </button>
        </label>
      </div>

      <div style={{ display: "flex", gap: 24 }}>
        <div style={{ minWidth: 320 }}>
          <div><strong>Client ID:</strong> {clientId}</div>
          <div><strong>State:</strong> {state}</div>
          <div><strong>Ping (ms):</strong> {ping ?? "—"}</div>

          <div style={{ marginTop: 12 }}>
            <strong>Chat / messages</strong>
            <div style={{ border: "1px solid #ccc", padding: 8, height: 160, overflow: "auto", background: "#fafafa" }}>
              {chat.map((m, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                  <div style={{ color: "#444" }}>[{new Date(m.when).toLocaleTimeString()}] <strong>{m.from}</strong></div>
                  <div style={{ color: "#111" }}>{m.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div><strong>Canvas / Game</strong></div>
          <div ref={canvasRef} style={{ width: 480, height: 320, border: "1px solid #666", background: "#000" }} />
        </div>
      </div>
    </div>
  );
}