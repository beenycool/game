# Frontend — E2E & Local Dev

This frontend includes a Playwright E2E test that verifies serverless signaling + WebRTC DataChannel exchange.

Quick start:

1. Install dependencies:

   npm ci

2. Start dev server (default localhost:3000):

   npm run dev

3. Run E2E tests:

   npm run test:e2e

Environment variables for TURN (optional):

- NEXT_PUBLIC_TURN_URL — TURN server URL (e.g. "turn:turn.example.com:3478")
- NEXT_PUBLIC_TURN_USERNAME — TURN username
- NEXT_PUBLIC_TURN_CREDENTIAL — TURN credential

Troubleshooting:

- If Playwright reports missing browsers, run:

   npx playwright install --with-deps

- Playwright tests assume the dev server is reachable at http://localhost:3000. Override with BASE_URL env var when needed.
