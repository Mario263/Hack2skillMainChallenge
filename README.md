# Mindful — AI Mental Wellness Tracker

A production-ready wellness tracker for students preparing for high-pressure
exams (NEET, JEE, UPSC, CAT, GATE, CUET, Boards). Track mood and stress, log
triggers, journal, and receive AI-powered, non-clinical wellness insights —
with offline-first sync so nothing is lost when the connection drops.

Built with Next.js 16 (App Router), React 19, TypeScript, Prisma + PostgreSQL
(Neon), NextAuth v5, Zustand, Recharts, and OpenRouter.

---

## Architecture overview

```
Browser (React 19, Zustand, offline queue in localStorage)
   │  optimistic submit → persisted queue → auto-sync on reconnect
   ▼
Next.js Route Handlers  (serverless, one isolated service per domain)
   ├─ /api/mood        mood logs + attached triggers
   ├─ /api/triggers    trigger logging + frequency
   ├─ /api/journal     entries + AI sentiment   (+ /[id] PATCH/DELETE)
   ├─ /api/insights    AI wellness/burnout/weekly insights
   ├─ /api/analytics   trends, wellness score
   ├─ /api/user        profile + cascade delete
   └─ /api/health      liveness + db/ai status
   │
   ├─ Each handler: Zod validation → auth + ownership → rate limit → logic
   ▼
Prisma ORM ──► PostgreSQL (Neon)        OpenRouter AI (fallback chain)
                                          gpt-4o-mini → claude-3-haiku → gemini-flash
                                          timeout + retry + graceful degradation
```

Cross-cutting concerns live in `src/lib` (`api.ts`, `validators.ts`,
`rate-limit.ts`, `logger.ts`, `analytics.ts`) and `src/services/ai`. No route
handler imports another — shared logic is only in `lib`/`services`.

### Folder structure

```
src/
├── app/
│   ├── api/{mood,triggers,journal,insights,analytics,user,health,auth}/
│   ├── dashboard/        # protected app (layout guard + client orchestrator)
│   ├── login/            # Google OAuth + dev-login
│   ├── layout.tsx        # providers, analytics, metadata
│   └── page.tsx          # marketing landing
├── components/
│   ├── ui/               # Button, Card (shadcn-style, hand-rolled)
│   └── dashboard/        # mood, journal, insights, analytics panels
├── hooks/useOfflineSync.ts
├── lib/                  # api, auth, prisma, validators, rate-limit, logger, analytics
├── services/ai/openrouter.ts
├── store/offline-store.ts
├── types/
└── proxy.ts              # edge auth gate (Next 16 "proxy")
prisma/schema.prisma
```

---

## Local setup

Requirements: Node 20+ and a PostgreSQL database (Neon/Supabase).

```bash
npm install
cp .env.example .env        # fill in values (see below)
npx prisma migrate dev      # create tables
npm run dev                 # http://localhost:3000
```

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Pooled Postgres URL (runtime). |
| `DIRECT_URL` | ✅ | Direct Postgres URL (migrations). |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32`. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | ⛔️ optional | Google OAuth. Redirect URI: `{APP_URL}/api/auth/callback/google`. |
| `ENABLE_DEV_LOGIN` | ⛔️ optional | `true` enables passwordless email login for local/demo. **Must be `false` in production.** |
| `OPENROUTER_API_KEY` | ⛔️ optional | If empty, AI degrades to built-in guidance. |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public base URL. |

> If neither Google nor dev-login is configured, the login page explains how to
> enable one. With `ENABLE_DEV_LOGIN=true` you can sign in with any email and
> start using the app immediately.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + component) |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:deploy` | Prisma migrate deploy (prod) |
| `npm run db:studio` | Prisma Studio |

---

## Security

- **Auth**: Google OAuth via NextAuth v5 (JWT sessions, Prisma adapter).
- **Ownership**: every record is scoped to `userId`; mutations on others' rows
  return 403/404.
- **Validation**: all request bodies parsed with Zod before any DB write.
- **Rate limiting**: per-user fixed-window limits on mood/journal/trigger/AI
  endpoints (`src/lib/rate-limit.ts`; swap the Map for Upstash Redis at scale).
- **Headers**: CSP, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS (`next.config.ts`).
- **Secrets**: env-only; `.env` is gitignored.

## Offline-first sync

`useOfflineSync` writes each submission to a localStorage-persisted Zustand
queue with a stable `clientId`, then flushes in order when online. The server
de-duplicates by `(userId, clientId)`, so refreshes, tab closes, network
flapping, and repeated offline submissions never create duplicates.

## AI layer

`src/services/ai/openrouter.ts` tries `gpt-4o-mini → claude-3-haiku →
gemini-flash` with per-request timeout and bounded retry. On total failure (or
missing key) callers receive deterministic, safe wellness guidance — the app is
always usable.

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel (framework auto-detected as Next.js).
3. Add a Postgres database (Neon via the Vercel Marketplace, or paste your own).
4. Set env vars in **Project → Settings → Environment Variables**:
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`
   (= your production URL), and optionally `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`
   and `OPENROUTER_API_KEY`. Leave `ENABLE_DEV_LOGIN` unset/`false`.
5. The build command (`vercel.json`) runs
   `prisma generate && prisma migrate deploy && next build`, so migrations apply
   automatically on deploy.
6. For Google OAuth, add the redirect URI
   `https://YOUR-DOMAIN/api/auth/callback/google` in Google Cloud Console.

### Production checklist

- [ ] `AUTH_SECRET` set to a strong random value
- [ ] `ENABLE_DEV_LOGIN` unset or `false`
- [ ] `NEXT_PUBLIC_APP_URL` = production URL
- [ ] Google OAuth redirect URI registered
- [ ] `DATABASE_URL` pooled, `DIRECT_URL` direct
- [ ] `GET /api/health` returns `"status":"healthy"`
- [ ] CI green (lint, typecheck, test, build)

---

Mindful is a self-help tool, not a substitute for professional care.
In crisis in India, call **Tele-MANAS at 14416**.
