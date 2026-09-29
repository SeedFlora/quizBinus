import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER, SESSION_COOKIE, isDatabaseMode, loginRedirectFor } from "@/lib/auth/proxy-rules";

/**
 * Next.js 16 Proxy (formerly middleware). Database mode only: lecturer pages without
 * a session cookie go to /login?next=<path> before rendering anything. This is an
 * optimistic check; pages still verify the session (lib/auth/lecturer.ts).
 * Memory mode: passthrough (the demo lecturer needs no sign-in).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = loginRedirectFor({
    pathname,
    search,
    hasSessionCookie: request.cookies.has(SESSION_COOKIE),
    databaseMode: isDatabaseMode(process.env),
  });
  // Absolute for NextResponse; Next rewrites same-host redirects to a relative Location.
  if (target) return NextResponse.redirect(new URL(target, request.url));

  // Lets getLecturer() send an expired session back to /login with the same back-link.
  const forwarded = new Headers(request.headers);
  forwarded.set(REQUEST_PATH_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // Lecturer areas only, so static assets, player routes and the API never run the proxy.
  matcher: [
    "/dashboard/:path*",
    "/quizzes/:path*",
    "/sessions/:path*",
    "/settings/:path*",
    "/analytics/:path*",
    "/host/:path*",
  ],
};
