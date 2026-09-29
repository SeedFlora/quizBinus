import type { NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { seeOther } from "@/lib/auth/redirect";
import { destroyAuthSession } from "@/lib/auth/session";

/** Hosts this app is reachable under, as seen by the browser. */
function ownHosts(request: NextRequest): Set<string> {
  const hosts = new Set([request.nextUrl.host]);
  for (const header of ["host", "x-forwarded-host"]) {
    const value = request.headers.get(header);
    if (value) hosts.add(value.split(",")[0]!.trim());
  }
  if (serverEnv.appUrl) hosts.add(new URL(serverEnv.appUrl).host);
  return hosts;
}

/**
 * Signs the lecturer out on THIS device (other devices stay signed in) and returns
 * to /login.
 *
 * POST only (a GET could be triggered by link prefetching or an <img>), and only
 * from our own pages: a cross-site form cannot log a lecturer out mid-class.
 * Use it as `<form action="/auth/signout" method="post">`.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  // Browsers send Origin on every form POST; "null" (sandboxed frames) counts as foreign.
  const origin = request.headers.get("origin");
  if (origin) {
    let host = "";
    try {
      host = origin === "null" ? "" : new URL(origin).host;
    } catch {
      /* malformed Origin: treated as foreign */
    }
    if (!ownHosts(request).has(host)) return Response.json({ error: "forbidden" }, { status: 403 });
  }

  await destroyAuthSession();
  // 303 turns the POST into a GET of /login.
  return seeOther("/login");
}
