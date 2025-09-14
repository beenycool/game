/**
 * Minimal WebRTC client adapter for serverless signaling.
 *
 * Exposes: createPeer(host: boolean, roomId: string, clientId: string) => PeerHandle
 *
 * PeerHandle:
 *  - connect(): Promise<void>
 *  - send(obj: any): void
 *  - onMessage(cb): void
 *  - onStateChange(cb): void
 *  - close(): void
 *
 * Notes:
 *  - Uses the serverless endpoints under /api/signaling/*
 *  - Polls GET /api/signaling/room/:roomId for offers/answers/candidates with backoff.
 *  - Sends heartbeat via POST /api/signaling/candidate with { heartbeat: true }.
 */

type SignalState = "idle" | "connecting" | "connected" | "closed" | "error";

export type PeerHandle = {
  connect(): Promise<void>;
  send(obj: any): void;
  sendInput(input: any, playerId: string, tick: number): void;
  onMessage(cb: (msg: any) => void): void;
  onStateChange(cb: (s: SignalState) => void): void;
  close(): void;
};

function log(...args: any[]) {
  // keep namespace clear
  console.debug("[webrtc]", ...args);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function createPeer(host: boolean, roomId: string, clientId: string): PeerHandle {
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let state: SignalState = "idle";
  const messageCbs: ((m: any) => void)[] = [];
  const stateCbs: ((s: SignalState) => void)[] = [];
  let stopped = false;

  // context-aware logger (includes roomId + clientId)
  const ctxLog = (...args: any[]) => console.debug("[webrtc]", `[${roomId}:${clientId}]`, ...args);

  // simple backoff params
  const base = 500;
  const maxBackoff = 3000;

  // keep remote client id (the other peer we talk to)
  let remoteClientId: string | null = null;

  // track candidates we've already applied from server snapshot
  const appliedCandidates = new Set<string>();

  function setState(s: SignalState) {
    state = s;
    for (const cb of stateCbs) cb(s);
    ctxLog("state", s);
  }

  function onMessageFromChannel(ev: MessageEvent) {
    try {
      const obj = JSON.parse(ev.data);
      for (const cb of messageCbs) cb(obj);
    } catch (err) {
      console.error("invalid json message", ev.data);
    }
  }

  function setupDataChannel(channel: RTCDataChannel) {
    dc = channel;
    dc.onopen = () => {
      ctxLog("datachannel open");
      setState("connected");
    };
    dc.onclose = () => {
      ctxLog("datachannel closed");
      setState("closed");
    };
    dc.onerror = (e) => {
      ctxLog("datachannel error", e);
      setState("error");
    };
    dc.onmessage = onMessageFromChannel;
  }

  async function postJson(path: string, body: any, retries = 3) {
    async function attempt(remaining: number): Promise<any> {
      try {
        const res = await fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`http ${res.status} ${txt}`);
        }
        return res.json().catch(() => ({}));
      } catch (err) {
        if (remaining <= 0) {
          ctxLog("postJson failed, no retries left", path, err);
          throw err;
        }
        const backoffMs = Math.min(2000, 200 * Math.pow(2, 3 - remaining));
        ctxLog("postJson error, retrying", path, "in", backoffMs, "ms", err);
        await wait(backoffMs);
        return attempt(remaining - 1);
      }
    }
    return attempt(retries);
  }

  function getIceConfig(): RTCConfiguration {
    try {
      const win: any = window as any;
      // runtime-check multiple common places for TURN URL / creds:
      const turnUrl =
        win.__TURN_URL__ ||
        win.__NEXT_PUBLIC_TURN_URL ||
        (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_TURN_URL);
      const username =
        (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_TURN_USERNAME) ||
        win.__NEXT_PUBLIC_TURN_USERNAME ||
        win.__TURN_USERNAME;
      const credential =
        (typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_TURN_CREDENTIAL) ||
        win.__NEXT_PUBLIC_TURN_CREDENTIAL ||
        win.__TURN_CREDENTIAL;

      if (turnUrl) {
        const server: any = { urls: turnUrl };
        if (username) server.username = username;
        if (credential) server.credential = credential;
        ctxLog("using TURN server", server);
        return { iceServers: [server] };
      }
    } catch (e) {
      ctxLog("getIceConfig failed", e);
    }
    return {};
  }

  async function getRoomSnapshot() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const res = await fetch(`/api/signaling/room/${encodeURIComponent(roomId)}`, {
        method: "GET",
        signal: controller.signal
      });
      clearTimeout(timeout);

      const ok = res.ok;
      const json = await res.json().catch(() => null);
      if (!ok) {
        const error = new Error(`Room snapshot failed: ${res.status}`);
        (error as any).status = res.status;
        (error as any).body = json;
        throw error;
      }
      return json;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Room snapshot request timed out');
      }
      throw err;
    }
  }

  async function sendCandidate(candidate: any) {
    try {
      await postJson("/api/signaling/candidate", { roomId, clientId, candidate });
      ctxLog("candidate posted", candidate && candidate.type ? candidate.type : candidate);
    } catch (err) {
      ctxLog("candidate post failed", err);
    }
  }

  // applyRemoteCandidates: shared helper to apply ICE candidates from server snapshot
  async function applyRemoteCandidates(
    pcParam: RTCPeerConnection | null,
    candidatesArr: Array<{ clientId: string; candidates: any[] }>,
    remoteClientIdParam: string | null
  ) {
    // early-return if we don't have a remote client or a valid PeerConnection
    if (!remoteClientIdParam || !pcParam) return;

    const entry = candidatesArr.find((c: any) => c.clientId === remoteClientIdParam);
    if (entry && entry.candidates) {
      for (const cand of entry.candidates) {
        const key = `${remoteClientIdParam}:${JSON.stringify(cand)}`;
        if (!appliedCandidates.has(key)) {
          try {
            await pcParam.addIceCandidate(cand);
            appliedCandidates.add(key);
            // log message should reflect whether this peer is host or guest
            ctxLog(host ? "applied remote candidate from client" : "applied remote candidate from host");
          } catch (e) {
            ctxLog("addIceCandidate failed", e);
          }
        }
      }
    }
  }

  // heartbeat to keep room alive
  let heartbeatTimer: number | null = null;
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(() => {
      // reuse candidate endpoint as heartbeat (server will accept any candidate)
      postJson("/api/signaling/candidate", { roomId, clientId, candidate: { heartbeat: true } })
        .then(() => ctxLog("heartbeat sent"))
        .catch((e) => ctxLog("heartbeat failed", e));
    }, 15000); // server HEARTBEAT_EXTEND = 15s
  }
  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function connect(): Promise<void> {
    if (stopped) throw new Error("peer closed");
    setState("connecting");
    pc = new RTCPeerConnection(await getIceConfig());

    // post local ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendCandidate(ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate);
      }
    };

    // if host, wait for incoming datachannel
    if (host) {
      pc.ondatachannel = (ev) => {
        log("ondatachannel");
        setupDataChannel(ev.channel);
      };
    } else {
      // non-host creates datachannel
      const channel = pc.createDataChannel("game");
      setupDataChannel(channel);
    }

    // attach basic monitor
    pc.onconnectionstatechange = () => {
      ctxLog("pc connectionState", pc?.connectionState);
      if (pc?.connectionState === "disconnected" || pc?.connectionState === "failed") setState("error");
      if (pc?.connectionState === "connected") setState("connected");
    };

    startHeartbeat();

    if (!host) {
      // guest: create offer, post it, wait for answer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ctxLog("offer created, posting");
      await postJson("/api/signaling/offer", { roomId, clientId, sdp: offer.sdp });
      ctxLog("offer posted");

      // poll for answer for this clientId
      let backoff = base;
      let answered = false;
      while (!answered && !stopped) {
        try {
          const snap = await getRoomSnapshot();
          // set remote client (host) if available
          if (!remoteClientId && snap.hostId && snap.hostId !== clientId) {
            remoteClientId = snap.hostId;
            ctxLog("remoteClientId set to hostId", remoteClientId);
          }
          // look for answer matching our clientId
          const answers: Array<{ clientId: string; sdp: string }> = snap.answers || [];
          const found = answers.find((a) => a.clientId === clientId);
          if (found && found.sdp && typeof found.sdp === 'string' && found.sdp.length > 0) {
            ctxLog("answer received");
            try {
              await pc.setRemoteDescription({ type: "answer", sdp: found.sdp });
            } catch (err) {
              ctxLog("Failed to set remote description", err);
              throw new Error("Invalid answer SDP received");
            }
            answered = true;
            break;
          }
          // also apply any remote candidates posted by the host
          await applyRemoteCandidates(pc, snap.candidates || [], remoteClientId);
        } catch (err: any) {
          log("poll error (answer)", err);
        }
        await wait(backoff);
        backoff = Math.min(maxBackoff, backoff * 1.5);
      }
    } else {
      // host: poll for offers from clients then answer the first found
      let backoff = base;
      let answeredOnce = false;
      while (!answeredOnce && !stopped) {
        try {
          const snap = await getRoomSnapshot();
          // snap.offers = [{clientId,sdp}, ...]
          const offers: Array<{ clientId: string; sdp: string }> = snap.offers || [];
          // pick an offer where clientId !== host's clientId
          const offerObj = offers.find((o) => o.clientId && o.clientId !== clientId);
          if (offerObj) {
            remoteClientId = offerObj.clientId;
            ctxLog("offer found from client", remoteClientId);
            // set remote desc and create+post answer
            await pc.setRemoteDescription({ type: "offer", sdp: offerObj.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await postJson("/api/signaling/answer", { roomId, clientId: remoteClientId, sdp: answer.sdp });
            ctxLog("posted answer for", remoteClientId);
            answeredOnce = true;
            // after answering, we should also start applying incoming candidates for that client
            break;
          }
        } catch (err: any) {
          log("poll error (offer)", err);
        }
        await wait(backoff);
        backoff = Math.min(maxBackoff, backoff * 1.5);
      }

      // after answering, poll for that client's candidates and apply them
      let backoff2 = base;
      while (!stopped) {
        try {
          const snap = await getRoomSnapshot();
          await applyRemoteCandidates(pc, snap.candidates || [], remoteClientId);
        } catch (err) {
          log("poll candidates error", err);
        }
        await wait(backoff2);
        backoff2 = Math.min(maxBackoff, backoff2 * 1.3);
      }
    }

    // also poll for any remote candidates for whichever remoteClientId is known
    // NOTE: for guests we already apply candidates during answer waiting loop
    // for hosts we applied candidates in loop above. This is just a safety net.
    setState("connecting");
  }

  function send(obj: any) {
    if (!dc || dc.readyState !== "open") {
      throw new Error("datachannel not open");
    }
    try {
      dc.send(JSON.stringify(obj));
    } catch (err) {
      console.error("send failed", err);
    }
  }

  // Lightweight helper to send input messages
  function sendInput(input: any, playerId: string, tick: number) {
    const inputMessage = { type: 'input', playerId, tick, input };
    send(inputMessage);
  }

  function onMessage(cb: (m: any) => void) {
    messageCbs.push(cb);
  }

  // Add snapshot message handler to the existing message callback
  onMessage((msg) => {
    if (msg && msg.type === 'snapshot' && typeof msg.tick === 'number' && msg.state) {
      // Forward snapshot messages to any registered callbacks
      for (const cb of messageCbs) {
        try {
          cb(msg);
        } catch (e) {
          console.error("snapshot callback error", e);
        }
      }
    }
  });

  function onStateChange(cb: (s: SignalState) => void) {
    stateCbs.push(cb);
  }

  function close() {
    stopped = true;
    stopHeartbeat();
    if (dc) {
      try {
        dc.close();
      } catch {}
      dc = null;
    }
    if (pc) {
      try {
        pc.close();
      } catch {}
      pc = null;
    }
    setState("closed");
  }

  return { connect, send, sendInput, onMessage, onStateChange, close };
}