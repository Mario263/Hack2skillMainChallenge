import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge-safe auth gate (Next.js 16 "proxy" convention, formerly "middleware").
// Checks only for the presence of the Auth.js session cookie — no Prisma /
// Node APIs here. Full session validation happens in the Node.js route
// handlers and server components.
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSession(req: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => req.cookies.has(name));
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (!hasSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protect the authenticated app surface only.
  matcher: ["/dashboard/:path*"],
};
