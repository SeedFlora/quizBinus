import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bootstrap", () => ({ ensureServerReady: async () => undefined }));
vi.mock("@/lib/auth/lecturer", () => ({ getLecturerOrNull: vi.fn(async () => null) }));

import { isSameOriginRequest } from "@/lib/server/csrf";
import { POST as hostRoute } from "@/app/api/sessions/[id]/host/route";
import { POST as demoRoute } from "@/app/api/demo/host/route";
import { POST as createRoute } from "@/app/api/sessions/route";
import { ctx, resetServer } from "./helpers";

function request(headers: Record<string, string>, url = "http://localhost:3100/api/demo/host") {
  return new Request(url, {
    method: "POST",
    headers: { host: "localhost:3100", "content-type": "application/json", ...headers },
    body: "{}",
  });
}

beforeEach(() => resetServer());

describe("isSameOriginRequest", () => {
  it("trusts Sec-Fetch-Site from the browser", () => {
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "none" }))).toBe(true);
    expect(isSameOriginRequest(request({ "sec-fetch-site": "cross-site", origin: "http://localhost:3100" }))).toBe(
      false,
    );
    expect(isSameOriginRequest(request({ "sec-fetch-site": "same-site" }))).toBe(false);
  });

  it("falls back to Origin vs Host (or X-Forwarded-Host behind a proxy)", () => {
    expect(isSameOriginRequest(request({ origin: "http://localhost:3100" }))).toBe(true);
    expect(isSameOriginRequest(request({ origin: "http://192.168.1.5:3100", host: "192.168.1.5:3100" }))).toBe(true);
    expect(isSameOriginRequest(request({ origin: "https://evil.example" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "http://localhost:4000" }))).toBe(false);
    expect(isSameOriginRequest(request({ origin: "null" }))).toBe(false);
    expect(
      isSameOriginRequest(
        request({ origin: "https://quiz.binus.ac.id", host: "app:3000", "x-forwarded-host": "quiz.binus.ac.id" }),
      ),
    ).toBe(true);
  });

  it("lets non-browser clients (no Origin, no Sec-Fetch-Site) through", () => {
    expect(isSameOriginRequest(request({}))).toBe(true);
  });
});

describe("state-changing routes reject cross-site requests", () => {
  const evil = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

  it("host commands", async () => {
    const res = await hostRoute(request(evil, "http://localhost:3100/api/sessions/demo/host"), ctx({ id: "demo" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "cross_origin" });
  });

  it("creating sessions and the demo", async () => {
    expect((await createRoute(request(evil, "http://localhost:3100/api/sessions"), ctx({}))).status).toBe(403);
    expect((await demoRoute(request(evil), ctx({}))).status).toBe(403);
    // The same call from our own page goes through.
    const ok = await demoRoute(request({ origin: "http://localhost:3100", "sec-fetch-site": "same-origin" }), ctx({}));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sessionId: "demo", roomCode: "482913" });
  });
});
