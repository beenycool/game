import { test, expect } from "@playwright/test";

/**
 * Playwright E2E: matchmaking + WebRTC DataChannel exchange
 *
 * This test expects the app to be running locally (default http://localhost:3000).
 * It:
 *  - Creates a signaling room via POST /api/signaling/create-room
 *  - Starts two browser pages (host and guest)
 *  - Each page runs an in-page WebRTC flow that uses the serverless signaling endpoints:
 *      /api/signaling/offer
 *      /api/signaling/answer
 *      /api/signaling/candidate
 *      /api/signaling/room/:roomId (polling)
 *  - Verifies a simple "hello" message is sent from guest -> host over the DataChannel
 *
 * Notes:
 *  - The test is intentionally defensive with polling/backoff so it can run against dev servers.
 *  - Start dev server before running: (from repo root)
 *      npm --prefix frontend run dev
 *
 * Usage in CI:
 *  - Start the app in background (or use vercel dev) and run playwright tests.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

test.setTimeout(60_000);

test("matchmaking: two peers connect and exchange hello", async ({ browser }) => {
  const hostId = `t-host-${Date.now()}`;
  const guestId = `t-guest-${Date.now()}`;

  // create room as host
  const createRes = await fetch(`${BASE}/api/signaling/create-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hostId }),
  });
  expect(createRes.ok).toBeTruthy();
  const room = await createRes.json();
  expect(room && room.roomId).toBeTruthy();
  const roomId = room.roomId;

  // create two isolated contexts/pages
  const ctxA = await browser.newContext();
  const pageHost = await ctxA.newPage();

  const ctxB = await browser.newContext();
  const pageGuest = await ctxB.newPage();

  // Helper: script executed in page to perform WebRTC signaling using the server endpoints.
  // It returns a promise that resolves when DataChannel open and "hello" message received (for host),
  // or when guest has sent "hello" and received optional ack.
  const hostScript = `
    (async ({ BASE, roomId, hostId }) => {
      const log = (...a) => console.debug("[e2e-host]", ...a);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      // basic poll helper
      async function pollRoom() {
        const res = await fetch(\`\${BASE}/api/signaling/room/\${encodeURIComponent(roomId)}\`);
        if (!res.ok) throw new Error('room fetch failed');
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // Add TURN servers if available
        ]
      });
      const dc = pc.createDataChannel("game");
      let applied = new Set();

      const pc = new RTCPeerConnection();
      let dc = null;
      let remoteClientId = null;
      const applied = new Set();

      pc.ondatachannel = (ev) => {
        dc = ev.channel;
        dc.onopen = () => log("dc open");
        dc.onmessage = (m) => log("dc msg", m.data);
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          fetch(\`\${BASE}/api/signaling/candidate\`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ roomId, clientId: hostId, candidate: ev.candidate.toJSON() })
          }).catch(e=>log('candidate post failed', e));
        }
      };

      // poll for offers
      let backoff = 200;
      const timeoutAt = Date.now() + 20_000;
      while (Date.now() < timeoutAt) {
        try {
          const snap = await pollRoom();
          const offers = snap.offers || [];
          const offerObj = offers.find(o => o.clientId && o.clientId !== hostId);
          if (offerObj) {
            remoteClientId = offerObj.clientId;
            log("offer found", remoteClientId);
            await pc.setRemoteDescription({ type: "offer", sdp: offerObj.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await fetch(\`\${BASE}/api/signaling/answer\`, {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ roomId, clientId: remoteClientId, sdp: answer.sdp })
            });
            log("posted answer");
            break;
          }
        } catch (e) {
          log("poll error", e);
        }
        await wait(backoff);
        backoff = Math.min(2000, backoff * 1.5);
      }

      // after answering, poll for remote candidates and apply them
      (async () => {
        let back = 200;
        let shouldPoll = true;
        const stopPolling = () => { shouldPoll = false; };
        // Stop polling when test completes or times out
        const maxPollTime = Date.now() + 30_000;
        while (shouldPoll && Date.now() < maxPollTime) {
          try {
            const snap = await pollRoom();
            const candidates = snap.candidates || [];
            if (remoteClientId) {
              const entry = candidates.find(c => c.clientId === remoteClientId);
              if (entry && entry.candidates) {
                for (const cand of entry.candidates) {
                  const key = JSON.stringify(cand);
                  if (!applied.has(key)) {
                    try {
                      await pc.addIceCandidate(cand);
                      applied.add(key);
                      log("applied candidate from guest");
                    } catch (e) {
                      log("addIceCandidate failed", e);
                    }
                  }
                }
              }
            }
          } catch (e) {
            // ignore
          }
          await wait(back);
          back = Math.min(2000, back * 1.2);
        }
      })();

      // resolve when we receive "hello" message from guest
      return new Promise((resolve, reject) => {
        const overall = setTimeout(() => reject(new Error('timeout waiting for hello on host')), 25_000);
        const checkMsg = (e) => {
          if (!e || !e.data) return;
          if (typeof e.data === 'string' && e.data === 'hello') {
            clearTimeout(overall);
            resolve({ ok: true, msg: 'hello-received' });
          }
        };
        // datachannel may not yet exist; set interval to attach listener
        // Set up listener immediately on ondatachannel
        pc.ondatachannel = (ev) => {
          dc = ev.channel;
          dc.onopen = () => log('dc open');
          dc.onmessage = (m) => {
            log('host got', m.data);
            checkMsg(m);
          };
        };
      });
    })
  `;

  const guestScript = `
    (async ({ BASE, roomId, guestId }) => {
      const log = (...a) => console.debug("[e2e-guest]", ...a);
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      async function pollRoom() {
        const res = await fetch(\`\${BASE}/api/signaling/room/\${encodeURIComponent(roomId)}\`);
        if (!res.ok) throw new Error('room fetch failed');
        return res.json();
      }

      const pc = new RTCPeerConnection();
      const dc = pc.createDataChannel("game");
      let applied = new Set();

      dc.onopen = () => log("dc open - sending hello");
      dc.onmessage = (m) => log("dc msg", m.data);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          fetch(\`\${BASE}/api/signaling/candidate\`, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ roomId, clientId: guestId, candidate: ev.candidate.toJSON() })
          }).catch(e=>log('candidate post failed', e));
        }
      };

      // create offer, post it, then poll for answer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await fetch(\`\${BASE}/api/signaling/offer\`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ roomId, clientId: guestId, sdp: offer.sdp })
      });

      let back = 200;
      const timeoutAt = Date.now() + 20_000;
      let answered = false;
      while (Date.now() < timeoutAt && !answered) {
        try {
          const snap = await pollRoom();
          const answers = snap.answers || [];
          const found = answers.find(a => a.clientId === guestId && a.sdp);
          if (found) {
            await pc.setRemoteDescription({ type: "answer", sdp: found.sdp });
            answered = true;
            break;
          }
          // apply host candidates
          const candidates = snap.candidates || [];
          const hostEntry = candidates.find(c => c.clientId && c.clientId !== guestId);
          if (hostEntry && hostEntry.candidates) {
            for (const cand of hostEntry.candidates) {
              const k = JSON.stringify(cand);
              if (!applied.has(k)) {
                try {
                  await pc.addIceCandidate(cand);
                  applied.add(k);
                } catch (e) { /* ignore */ }
              }
            }
          }
        } catch (e) {
          // ignore
        }
        await wait(back);
        back = Math.min(2000, back * 1.3);
      }

      // once datachannel open, send "hello" and resolve when it's sent
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout sending hello')), 25_000);
        dc.onopen = () => {
          try {
            dc.send("hello");
            clearTimeout(timer);
            resolve({ ok: true, msg: 'hello-sent' });
          } catch (e) {
            reject(e);
          }
        };
      });
    })
  `;

  try {
    // await both results
    const [hostRes, guestRes] = await Promise.all([hostPromise, guestPromise]);

    expect(hostRes && hostRes.ok).toBeTruthy();
    expect(guestRes && guestRes.ok).toBeTruthy();
  } finally {
    // cleanup
    await ctxA.close();
    await ctxB.close();
  }

  // await both results
  const [hostRes, guestRes] = await Promise.all([hostPromise, guestPromise]);

  expect(hostRes && hostRes.ok).toBeTruthy();
  expect(guestRes && guestRes.ok).toBeTruthy();

  // cleanup
  await ctxA.close();
  await ctxB.close();
});