#!/usr/bin/env node
/**
 * End-to-end verification harness: auth, ownership (IDOR), validation,
 * rate-limiting, injection/XSS, and infrastructure/security headers.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/verify.mjs        # full (needs dev-login)
 *   BASE_URL=https://your-app.vercel.app node scripts/verify.mjs  # public/security subset
 *
 * Exits non-zero if any check fails.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
const rows = [];

function record(name, ok, detail = "") {
  rows.push({ name, ok, detail });
  if (ok) pass++;
  else fail++;
  const tag = ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

// --- tiny cookie jar over fetch ---------------------------------------------
function makeJar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    store(res) {
      const setCookies = res.headers.getSetCookie?.() ?? [];
      for (const c of setCookies) {
        const [pair] = c.split(";");
        const idx = pair.indexOf("=");
        cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
      return setCookies;
    },
  };
}

async function req(path, { method = "GET", body, jar, headers = {}, redirect = "manual" } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (jar) h["Cookie"] = jar.header();
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    redirect,
  });
  if (jar) jar.store(res);
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

async function devLogin(email, name = "Tester") {
  const jar = makeJar();
  const csrfRes = await req("/api/auth/csrf", { jar });
  const csrf = csrfRes.json?.csrfToken;
  if (!csrf) return null;
  const form = new URLSearchParams({ csrfToken: csrf, email, name, redirect: "false", json: "true" });
  const res = await fetch(BASE + "/api/auth/callback/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.header() },
    body: form.toString(),
    redirect: "manual",
  });
  jar.store(res);
  const session = await req("/api/auth/session", { jar });
  return session.json?.user?.id ? jar : null;
}

// ----------------------------------------------------------------------------
async function main() {
  console.log(`\n▶ Verifying ${BASE}\n`);

  // == SECTION A: infra / public / security (runs everywhere) ==
  console.log("A. Infrastructure & security headers");
  const health = await req("/api/health");
  record("health 200 + status healthy", health.status === 200 && health.json?.status === "healthy", `status=${health.json?.status} db=${health.json?.database}`);

  const landing = await req("/");
  record("landing renders (200)", landing.status === 200);

  const h = landing.headers;
  const csp = h.get("content-security-policy");
  record("CSP header present + frame-ancestors none", !!csp && csp.includes("frame-ancestors 'none'"));
  record("X-Frame-Options DENY", h.get("x-frame-options") === "DENY");
  record("X-Content-Type-Options nosniff", h.get("x-content-type-options") === "nosniff");
  record("Strict-Transport-Security present", !!h.get("strict-transport-security"));
  record("Referrer-Policy present", !!h.get("referrer-policy"));
  record("Permissions-Policy present", !!h.get("permissions-policy"));
  record("X-Powered-By hidden", !h.get("x-powered-by"));

  const dash = await req("/dashboard");
  record("/dashboard unauth → redirect to login", dash.status === 307 || dash.status === 302, `status=${dash.status}`);

  for (const p of ["/api/mood", "/api/journal", "/api/analytics", "/api/insights", "/api/user", "/api/triggers"]) {
    const r = await req(p);
    record(`${p} unauth → 401`, r.status === 401, `status=${r.status}`);
  }
  const postUnauth = await req("/api/mood", { method: "POST", body: { mood: 3, stress: 3 } });
  record("POST /api/mood unauth → 401", postUnauth.status === 401, `status=${postUnauth.status}`);

  const notFound = await req("/this-route-does-not-exist-" + Date.now());
  record("unknown route → 404", notFound.status === 404, `status=${notFound.status}`);

  // Is dev-login exposed here? (must be FALSE in production)
  const providers = await req("/api/auth/providers");
  const hasDevLogin = !!providers.json?.["dev-login"];
  const hasGoogle = !!providers.json?.google;
  const isProd = BASE.startsWith("https://");
  record("Google provider configured", hasGoogle);
  if (isProd) {
    record("dev-login DISABLED in production", !hasDevLogin, hasDevLogin ? "EXPOSED!" : "ok");
  }

  if (!hasDevLogin) {
    console.log("\n(dev-login unavailable here — skipping authenticated checks. Run against localhost for the full suite.)\n");
    return summary();
  }

  // == SECTION B: authenticated business logic & validation ==
  console.log("\nB. Authentication & session");
  const a = await devLogin("alice@verify.test", "Alice");
  record("dev-login establishes session", !!a);
  if (!a) return summary();

  // session cookie hardening
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  void csrfRes;

  console.log("\nC. Input validation (Zod)");
  const badMood = await req("/api/mood", { method: "POST", body: { mood: 9, stress: 5 }, jar: a });
  record("mood out of range (9) → 422", badMood.status === 422, `status=${badMood.status}`);
  const badStress = await req("/api/mood", { method: "POST", body: { mood: 3, stress: 99 }, jar: a });
  record("stress out of range (99) → 422", badStress.status === 422, `status=${badStress.status}`);
  const badJson = await req("/api/mood", { method: "POST", body: "{not json", jar: a });
  record("malformed JSON → 400", badJson.status === 400, `status=${badJson.status}`);
  const emptyJournal = await req("/api/journal", { method: "POST", body: { content: "" }, jar: a });
  record("empty journal → 422", emptyJournal.status === 422, `status=${emptyJournal.status}`);
  const hugeJournal = await req("/api/journal", { method: "POST", body: { content: "x".repeat(20001) }, jar: a });
  record("oversized journal (>20k) → 422", hugeJournal.status === 422, `status=${hugeJournal.status}`);

  console.log("\nD. Core flows & data integrity");
  const mood = await req("/api/mood", { method: "POST", body: { mood: 4, stress: 6, note: "ok", triggers: [{ label: "Exams", category: "exams" }], clientId: "verify-mood-1" }, jar: a });
  record("create mood (+trigger) → 201", mood.status === 201 && mood.json?.data?.triggers?.length === 1, `status=${mood.status}`);
  const dedup = await req("/api/mood", { method: "POST", body: { mood: 4, stress: 6, clientId: "verify-mood-1" }, jar: a });
  record("duplicate clientId → deduped (no new row)", dedup.json?.deduped === true);

  const injection = "Robert'); DROP TABLE users;-- ";
  const sqlTest = await req("/api/triggers", { method: "POST", body: { label: injection, category: "custom" }, jar: a });
  const stillHealthy = await req("/api/health");
  record("SQL-injection-like label stored safely (Prisma param)", sqlTest.status === 201 && sqlTest.json?.data?.label === injection && stillHealthy.json?.database === "ok");

  const xss = "<script>window.__pwned=1</script>";
  const xssJournal = await req("/api/journal", { method: "POST", body: { content: xss, clientId: "verify-xss-1" }, jar: a });
  record("XSS payload stored verbatim as text (escaped by React on render)", xssJournal.status === 201 && xssJournal.json?.data?.content === xss);

  const analytics = await req("/api/analytics?range=30", { jar: a });
  record("analytics returns wellnessScore", analytics.status === 200 && typeof analytics.json?.data?.wellnessScore === "number");

  const insight = await req("/api/insights", { method: "POST", body: { kind: "summary" }, jar: a, headers: {} });
  record("AI insight generated (200/201, graceful)", insight.status === 200 || insight.status === 201, `model=${insight.json?.data?.model ?? "degraded"}`);

  console.log("\nE. Authorization / IDOR (ownership)");
  const aJournal = await req("/api/journal", { method: "POST", body: { content: "alice private entry", clientId: "verify-idor-1" }, jar: a });
  const targetId = aJournal.json?.data?.id;
  const b = await devLogin("mallory@verify.test", "Mallory");
  record("second user session (Mallory)", !!b);
  if (b && targetId) {
    const idorPatch = await req(`/api/journal/${targetId}`, { method: "PATCH", body: { content: "hacked" }, jar: b });
    record("Mallory PATCH Alice's journal → 403", idorPatch.status === 403, `status=${idorPatch.status}`);
    const idorDelete = await req(`/api/journal/${targetId}`, { method: "DELETE", jar: b });
    record("Mallory DELETE Alice's journal → 403", idorDelete.status === 403, `status=${idorDelete.status}`);
    // confirm Alice's entry still exists
    const aList = await req("/api/journal?limit=50", { jar: a });
    const stillThere = aList.json?.data?.some((e) => e.id === targetId);
    record("Alice's journal intact after IDOR attempts", !!stillThere);
  }

  console.log("\nF. Rate limiting");
  // mood limit is 60/min; rate-limit is enforced BEFORE body parse, so empty
  // bodies count toward the window without creating rows.
  let got429 = false;
  let count = 0;
  for (let i = 0; i < 75; i++) {
    const r = await req("/api/mood", { method: "POST", body: {}, jar: a });
    count++;
    if (r.status === 429) {
      got429 = true;
      break;
    }
  }
  record("per-user rate limit triggers 429", got429, `after ${count} requests`);

  summary();
}

function summary() {
  console.log("\n" + "=".repeat(56));
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log("=".repeat(56) + "\n");
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Harness error:", e);
  process.exit(2);
});
