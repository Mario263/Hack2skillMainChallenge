# Evaluation Metrics

Snapshot of the quality gates at audit time. Reproduce with the commands shown.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Build | `npm run build` | ✅ Pass (12 routes, Turbopack) |
| Lint | `npm run lint` | ✅ 0 errors, 3 warnings* |
| Types | `npm run typecheck` | ✅ 0 errors |
| Unit/component tests | `npm test` | ✅ 31 passed / 7 files |
| End-to-end (local) | `BASE_URL=http://localhost:3000 node scripts/verify.mjs` | ✅ 36/36 |
| End-to-end (prod) | `BASE_URL=https://mindful-wellness-tracker.vercel.app node scripts/verify.mjs` | ✅ 20/20 |

\* The 3 warnings are the `react-hooks/set-state-in-effect` rule on intentional
data-fetching / hydration effects, deliberately downgraded to warnings in
`eslint.config.mjs`.

## Test coverage (`npm run test:coverage`)

Core business logic (unit-tested):

| File | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `lib/api-client.ts` | 95.0 | 87.5 | 66.7 | 100 |
| `store/offline-store.ts` | 85.7 | 100 | 81.8 | 83.3 |
| `lib/rate-limit.ts` | 77.8 | 70.0 | 50.0 | 82.4 |
| `services/ai/openrouter.ts` | 47.9 | 38.5 | 57.9 | 51.3 |

> `openrouter.ts` lower coverage is by design: its network/model-call branches
> are validated by the live e2e harness (real OpenRouter calls), not mocked
> units. Pure logic in it (crisis detection, state classification, guidance) is
> fully unit-tested in `services/ai/__tests__/coaching.test.ts`.

UI components are validated through the e2e harness and a representative
component unit test (`Button`), not via exhaustive render snapshots.

## Test inventory (7 files / 31 tests)

| File | Focus |
|---|---|
| `lib/__tests__/validators.test.ts` | Zod schema boundaries |
| `lib/__tests__/rate-limit.test.ts` | window limit + key isolation |
| `lib/__tests__/api-client.test.ts` | HTTP error / timeout / network mapping |
| `store/__tests__/offline-store.test.ts` | offline queue dedup / dequeue |
| `services/ai/__tests__/sentiment.test.ts` | degraded keyword sentiment |
| `services/ai/__tests__/coaching.test.ts` | crisis detection, state classification, guidance |
| `components/ui/__tests__/button.test.tsx` | render + click + disabled |

## Security posture

| Control | Status |
|---|---|
| Zod validation on all writes | ✅ |
| Ownership / IDOR checks (403) | ✅ |
| SQL injection (Prisma params) | ✅ |
| XSS (React escaping, no raw HTML) | ✅ |
| Security headers (CSP/XFO/HSTS/…) | ✅ |
| Session cookies (`__Host-`, HttpOnly, Secure, SameSite) | ✅ |
| Per-user rate limiting | ✅ |
| Secrets out of VCS + deploy bundle | ✅ |
| dev-login disabled in production | ✅ |
