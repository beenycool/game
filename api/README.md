# Signaling API smoke tests & curl examples

Implemented endpoints:
- [`api/signaling/create-room.ts`](api/signaling/create-room.ts:1)
- [`api/signaling/offer.ts`](api/signaling/offer.ts:1)
- [`api/signaling/answer.ts`](api/signaling/answer.ts:1)
- [`api/signaling/candidate.ts`](api/signaling/candidate.ts:1)
- [`api/signaling/close.ts`](api/signaling/close.ts:1)
- [`api/lib/rooms.ts`](api/lib/rooms.ts:1)
- [`api/signaling/room/[roomId].ts`](api/signaling/room/[roomId].ts:1)

Usage
1. Start local dev server:
```bash
vercel dev
```

2. Examples (replace \<roomId\> with the actual id returned by create-room)

Create a room
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"hostId":"host1"}' \
  http://localhost:3000/api/signaling/create-room | jq
```

Post an offer
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"roomId":"<roomId>","clientId":"clientA","sdp":"v=0 ..."}' \
  http://localhost:3000/api/signaling/offer | jq
```

Get room snapshot
```bash
curl -s http://localhost:3000/api/signaling/room/<roomId> | jq
```

Post an answer
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"roomId":"<roomId>","clientId":"clientB","sdp":"v=0 ..."}' \
  http://localhost:3000/api/signaling/answer | jq
```

Post a candidate
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"roomId":"<roomId>","clientId":"clientA","candidate":{"candidate":"candidate:1 1 UDP 2122260223 192.0.2.1 54400 typ host"}}' \
  http://localhost:3000/api/signaling/candidate | jq
```

Close a room
```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"roomId":"<roomId>","reason":"done"}' \
  http://localhost:3000/api/signaling/close | jq
```

TTL eviction demo (fast)
- The real service uses default TTL = 10 minutes and heartbeat extends TTL by 15s.
- For a quick local test create a short-lived room (ttl=2000 ms) and verify it's evicted after ~2.5s:

```bash
node - <<'NODE'
const fetch = global.fetch || require('node-fetch');
(async ()=>{
  const base = 'http://localhost:3000';
  const create = await fetch(base+'/api/signaling/create-room',{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({hostId:'t',ttl:2000})
  });
  const room = await create.json();
  console.log('created', room);
  await new Promise(r=>setTimeout(r,2500));
  const got = await fetch(base+'/api/signaling/room/'+room.roomId);
  console.log('status', got.status);
  console.log(await got.text());
})();
NODE
```

Notes
- All endpoints accept and return JSON (Content-Type: application/json).
- Status codes used: 201, 200, 400, 404, 409, 410.
- Implementation is in-memory only: see [`api/lib/rooms.ts`](api/lib/rooms.ts:1) for TTL and heartbeat details.