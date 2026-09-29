import { describe, expect, it } from "vitest";
import { isDatabaseMode, isProtectedPath, loginRedirectFor } from "@/lib/auth/proxy-rules";
import { config } from "@/proxy";

describe("isProtectedPath", () => {
  it.each([
    "/dashboard",
    "/dashboard/",
    "/quizzes",
    "/quizzes/new",
    "/quizzes/0b1c/edit",
    "/quizzes/0b1c/analytics",
    "/sessions",
    "/settings",
    "/host",
    "/host/session/2f1d",
    "/host/session/2f1d/lobby",
    "/host/session/demo-2",
    // The projector demo is lecturer-only in database mode (only lecturers can drive it).
    "/host/session/demo",
    "/host/session/demo/lobby",
    "/host/session/demo/podium",
  ])("%s is lecturer-only", (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/login",
    "/join",
    "/join/profile",
    "/room/482913/lobby",
    "/play/2f1d",
    "/api/health",
    "/dashboards",
    "/settingsx",
    "/design",
  ])("%s is public", (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});

describe("loginRedirectFor", () => {
  const base = { search: "", hasSessionCookie: false, databaseMode: true };

  it("sends cookie-less visitors of lecturer pages to /login with a back-link", () => {
    expect(loginRedirectFor({ ...base, pathname: "/dashboard" })).toBe("/login?next=%2Fdashboard");
    expect(loginRedirectFor({ ...base, pathname: "/quizzes/abc/edit", search: "?q=2" })).toBe(
      "/login?next=%2Fquizzes%2Fabc%2Fedit%3Fq%3D2",
    );
  });

  it("lets requests with a session cookie through (the page verifies it)", () => {
    expect(loginRedirectFor({ ...base, pathname: "/dashboard", hasSessionCookie: true })).toBeNull();
  });

  it("never redirects public pages", () => {
    expect(loginRedirectFor({ ...base, pathname: "/join" })).toBeNull();
    expect(loginRedirectFor({ ...base, pathname: "/login" })).toBeNull();
  });

  it("sends signed-out visitors of the projector demo to /login in database mode", () => {
    expect(loginRedirectFor({ ...base, pathname: "/host/session/demo/lobby" })).toBe(
      "/login?next=%2Fhost%2Fsession%2Fdemo%2Flobby",
    );
  });

  it("is a passthrough in memory mode", () => {
    expect(loginRedirectFor({ ...base, pathname: "/dashboard", databaseMode: false })).toBeNull();
    expect(loginRedirectFor({ ...base, pathname: "/host/session/2f1d", databaseMode: false })).toBeNull();
    expect(loginRedirectFor({ ...base, pathname: "/host/session/demo/lobby", databaseMode: false })).toBeNull();
  });
});

describe("isDatabaseMode", () => {
  it("follows DATABASE_URL", () => {
    expect(isDatabaseMode({})).toBe(false);
    expect(isDatabaseMode({ DATABASE_URL: "" })).toBe(false);
    expect(isDatabaseMode({ DATABASE_URL: "  " })).toBe(false);
    expect(isDatabaseMode({ DATABASE_URL: "postgres://nq:nq@db:5432/nusaquest" })).toBe(true);
  });
});

describe("proxy matcher", () => {
  it("only runs the proxy on lecturer areas (never static assets or the API)", () => {
    expect(config.matcher).toEqual([
      "/dashboard/:path*",
      "/quizzes/:path*",
      "/sessions/:path*",
      "/settings/:path*",
      "/analytics/:path*",
      "/host/:path*",
    ]);
  });
});
