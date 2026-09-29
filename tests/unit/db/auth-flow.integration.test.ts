import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_URL, createTestDatabase } from "./pg";

/**
 * The sign-in flow end to end against Postgres: the login Server Function, cookie
 * sessions, lecturer resolution and the account Server Functions. Next.js request
 * APIs are replaced by a tiny in-memory cookie jar + request headers.
 */

const req = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  sets: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
  headers: new Headers(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => req.headers,
  cookies: async () => ({
    get: (name: string) => (req.jar.has(name) ? { name, value: req.jar.get(name)! } : undefined),
    has: (name: string) => req.jar.has(name),
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      req.jar.set(name, value);
      req.sets.push({ name, value, options });
    },
    delete: (name: string) => {
      req.jar.delete(name);
    },
  }),
}));

type Redirect = Error & { url: string };

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  const err = (await run().then(
    () => null,
    (e: unknown) => e,
  )) as Redirect | null;
  if (!err || err.message !== "NEXT_REDIRECT") throw new Error(`expected a redirect, got ${String(err)}`);
  return err.url;
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

describe.skipIf(!TEST_DATABASE_URL)("Postgres integration: sign-in and accounts", () => {
  let drop: (() => Promise<void>) | null = null;
  let m: {
    login: typeof import("@/app/login/actions");
    lecturer: typeof import("@/lib/auth/lecturer");
    session: typeof import("@/lib/auth/session");
    admin: typeof import("@/lib/auth/admin-actions");
    users: typeof import("@/lib/db/users");
    client: typeof import("@/lib/db/client");
  };
  let ip = 1;

  /** A fresh request: its own client address, carrying the given session cookie. */
  function request(cookie?: string) {
    req.jar.clear();
    req.sets.length = 0;
    req.headers = new Headers({ "x-forwarded-for": `10.1.0.${ip++}`, "user-agent": "Vitest" });
    if (cookie) req.jar.set("nq_session", cookie);
  }

  async function signInAs(email: string, password: string, next = "/dashboard") {
    request();
    const url = await redirectOf(() => m.login.signIn({ status: "idle" }, form({ email, password, next })));
    return { url, cookie: req.jar.get("nq_session")! };
  }

  const sessionRows = async (email: string) =>
    (
      await m.client
        .getPool()!
        .query<{ n: number }>(
          "select count(*)::int as n from auth_sessions s join users u on u.id = s.user_id where u.email = $1",
          [email],
        )
    ).rows[0]!.n;

  beforeAll(async () => {
    const created = await createTestDatabase("auth");
    drop = created.drop;
    process.env.DATABASE_URL = created.url;
    process.env.ADMIN_EMAIL = "admin@binus.edu";
    process.env.ADMIN_PASSWORD = "sandi-admin-awal";
    const g = globalThis as Record<string, unknown>;
    delete g.__nqBoot;
    delete g.__nqRuntime;
    delete g.__nqLoginThrottle;
    vi.resetModules();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await (await import("@/lib/server/bootstrap")).ensureServerReady();
    info.mockRestore();
    m = {
      login: await import("@/app/login/actions"),
      lecturer: await import("@/lib/auth/lecturer"),
      session: await import("@/lib/auth/session"),
      admin: await import("@/lib/auth/admin-actions"),
      users: await import("@/lib/db/users"),
      client: await import("@/lib/db/client"),
    };
  }, 60_000);

  afterAll(async () => {
    await m?.client.closeDb();
    await drop?.();
    for (const name of ["DATABASE_URL", "ADMIN_EMAIL", "ADMIN_PASSWORD"]) delete process.env[name];
  });

  beforeEach(() => request());

  it("validates the form and answers every wrong combination with the same generic error", async () => {
    const signIn = (fields: Record<string, string>) => m.login.signIn({ status: "idle" }, form(fields));
    expect(await signIn({ email: "bukan-email", password: "x" })).toEqual({ status: "error", error: "invalidEmail" });
    expect(await signIn({ email: "admin@binus.edu", password: "" })).toEqual({
      status: "error",
      error: "passwordRequired",
    });
    expect(await signIn({ email: "admin@binus.edu", password: "salah" })).toEqual({
      status: "error",
      error: "invalidCredentials",
    });
    expect(await signIn({ email: "tidak.ada@binus.edu", password: "salah" })).toEqual({
      status: "error",
      error: "invalidCredentials",
    });
    expect(req.sets).toEqual([]);
  });

  it("signs in (email case-insensitive), sets a hashed-token cookie and honours a safe next", async () => {
    request();
    const url = await redirectOf(() =>
      m.login.signIn(
        { status: "idle" },
        form({ email: " ADMIN@Binus.edu ", password: "sandi-admin-awal", next: "/quizzes" }),
      ),
    );
    expect(url).toBe("/quizzes");
    const [cookie] = req.sets;
    expect(cookie).toMatchObject({
      name: "nq_session",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: 14 * 24 * 60 * 60 },
    });
    expect(cookie!.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await m.client
      .getPool()!
      .query("select token_hash, user_agent from auth_sessions where token_hash = encode(sha256($1::bytea), 'hex')", [
        cookie!.value,
      ]);
    expect(rows).toEqual([expect.objectContaining({ user_agent: "Vitest" })]);
    expect((await m.users.findUserByEmail("admin@binus.edu"))!.lastLoginAt).toBeInstanceOf(Date);

    // An open redirect is refused.
    expect((await signInAs("admin@binus.edu", "sandi-admin-awal", "https://evil.example")).url).toBe("/dashboard");
  });

  it("marks the cookie Secure behind an https proxy", async () => {
    request();
    req.headers.set("x-forwarded-proto", "https");
    await redirectOf(() =>
      m.login.signIn({ status: "idle" }, form({ email: "admin@binus.edu", password: "sandi-admin-awal" })),
    );
    expect(req.sets[0]!.options.secure).toBe(true);
  });

  it("resolves the lecturer from the cookie and redirects pages without one", async () => {
    const { cookie } = await signInAs("admin@binus.edu", "sandi-admin-awal");
    request(cookie);
    expect(await m.lecturer.getLecturerOrNull()).toMatchObject({
      email: "admin@binus.edu",
      role: "admin",
      source: "db",
      fullName: "Administrator",
    });

    request("not-a-real-token");
    expect(await m.lecturer.getLecturerOrNull()).toBeNull();
    request();
    req.headers.set("x-nq-path", "/quizzes/abc/edit?tab=2");
    expect(await redirectOf(() => m.lecturer.getLecturer())).toBe("/login?next=%2Fquizzes%2Fabc%2Fedit%3Ftab%3D2");
  });

  it("expires sessions and signs out on this device only", async () => {
    const a = await signInAs("admin@binus.edu", "sandi-admin-awal");
    const b = await signInAs("admin@binus.edu", "sandi-admin-awal");
    await m.client
      .getPool()!
      .query(
        "update auth_sessions set expires_at = now() - interval '1 second' where token_hash = encode(sha256($1::bytea), 'hex')",
        [a.cookie],
      );
    request(a.cookie);
    expect(await m.session.getAuthUser()).toBeNull();

    request(b.cookie);
    expect(await m.session.getAuthUser()).not.toBeNull();
    const before = await sessionRows("admin@binus.edu");
    await m.session.destroyAuthSession();
    expect(req.jar.has("nq_session")).toBe(false);
    expect(await sessionRows("admin@binus.edu")).toBe(before - 1);
    request(b.cookie);
    expect(await m.session.getAuthUser()).toBeNull();
  });

  it("lets an admin create a lecturer who signs in with the one-time password", async () => {
    const { cookie: adminCookie } = await signInAs("admin@binus.edu", "sandi-admin-awal");
    request(adminCookie);
    const created = await m.admin.createLecturer(
      { status: "idle" },
      form({ email: "Laras@Binus.edu", fullName: "Laras Wicaksono", salutation: "Bu", role: "lecturer" }),
    );
    expect(created).toMatchObject({ status: "created", email: "laras@binus.edu", fullName: "Laras Wicaksono" });
    const temp = (created as { password: string }).password;
    expect(temp).toMatch(/^\w{4}-\w{4}-\w{4}$/);

    request(adminCookie);
    expect(
      await m.admin.createLecturer(
        { status: "idle" },
        form({ email: "laras@binus.edu", fullName: "Lagi", salutation: "Bu", role: "lecturer" }),
      ),
    ).toMatchObject({ status: "error", error: "emailTaken" });
    request(adminCookie);
    expect(
      await m.admin.createLecturer(
        { status: "idle" },
        form({ email: "x", fullName: "L", salutation: "Bu", role: "lecturer" }),
      ),
    ).toMatchObject({ status: "error", error: "invalid" });
    request(adminCookie);
    const list = await m.admin.listLecturers();
    expect(list.map((a) => a.email)).toEqual(["admin@binus.edu", "laras@binus.edu"]);
    expect(list[1]).not.toHaveProperty("passwordHash");

    const { cookie } = await signInAs("laras@binus.edu", temp);
    request(cookie);
    expect(await m.lecturer.getLecturerOrNull()).toMatchObject({ role: "lecturer", salutation: "Bu" });
  });

  it("keeps account management admin-only", async () => {
    const lecturer = (await m.users.findUserByEmail("laras@binus.edu"))!;
    const admin = (await m.users.findUserByEmail("admin@binus.edu"))!;
    await m.users.setUserPassword(lecturer.id, "sandi-laras-1");
    const { cookie } = await signInAs("laras@binus.edu", "sandi-laras-1");

    request(cookie);
    expect(await m.admin.listLecturers()).toEqual([]);
    request(cookie);
    expect(
      await m.admin.createLecturer(
        { status: "idle" },
        form({ email: "baru@binus.edu", fullName: "Baru", salutation: "Pak", role: "admin" }),
      ),
    ).toMatchObject({ status: "error", error: "forbidden" });
    request(cookie);
    expect(await m.admin.setLecturerDisabled(admin.id, true)).toEqual({ ok: false, error: "forbidden" });
    request(cookie);
    expect(await m.admin.resetLecturerPassword(admin.id)).toEqual({ ok: false, error: "forbidden" });
    request();
    expect(await m.admin.resetLecturerPassword(admin.id)).toEqual({ ok: false, error: "forbidden" });
  });

  it("disables, re-enables and resets accounts, revoking their sessions", async () => {
    const lecturer = (await m.users.findUserByEmail("laras@binus.edu"))!;
    const admin = (await m.users.findUserByEmail("admin@binus.edu"))!;
    const { cookie: adminCookie } = await signInAs("admin@binus.edu", "sandi-admin-awal");
    const { cookie: laras } = await signInAs("laras@binus.edu", "sandi-laras-1");

    request(adminCookie);
    expect(await m.admin.setLecturerDisabled(admin.id, true)).toEqual({ ok: false, error: "self" });
    request(adminCookie);
    expect(await m.admin.resetLecturerPassword(admin.id)).toEqual({ ok: false, error: "self" });
    request(adminCookie);
    expect(await m.admin.setLecturerDisabled("nope", true)).toEqual({ ok: false, error: "notFound" });

    request(adminCookie);
    expect(await m.admin.setLecturerDisabled(lecturer.id, true)).toEqual({ ok: true });
    request(laras);
    expect(await m.lecturer.getLecturerOrNull()).toBeNull();
    request();
    expect(
      await m.login.signIn({ status: "idle" }, form({ email: "laras@binus.edu", password: "sandi-laras-1" })),
    ).toEqual({ status: "error", error: "invalidCredentials" });

    request(adminCookie);
    expect(await m.admin.setLecturerDisabled(lecturer.id, false)).toEqual({ ok: true });
    const again = await signInAs("laras@binus.edu", "sandi-laras-1");

    request(adminCookie);
    const reset = await m.admin.resetLecturerPassword(lecturer.id);
    expect(reset).toMatchObject({ ok: true, password: expect.stringMatching(/^\w{4}-\w{4}-\w{4}$/) });
    request(again.cookie);
    expect(await m.lecturer.getLecturerOrNull()).toBeNull();
    await signInAs("laras@binus.edu", (reset as { password: string }).password);
  });

  it("lets a lecturer change their own password, staying signed in on this device only", async () => {
    const lecturer = (await m.users.findUserByEmail("laras@binus.edu"))!;
    await m.users.setUserPassword(lecturer.id, "sementara-123");
    const other = await signInAs("laras@binus.edu", "sementara-123");
    const here = await signInAs("laras@binus.edu", "sementara-123");
    const change = (fields: Record<string, string>) => {
      request(here.cookie);
      return m.admin.changeOwnPassword({ status: "idle" }, form(fields));
    };

    expect(await change({ current: "salah", next: "baru-sandi-1", confirm: "baru-sandi-1" })).toMatchObject({
      error: "wrongPassword",
    });
    expect(await change({ current: "sementara-123", next: "pendek", confirm: "pendek" })).toMatchObject({
      error: "tooShort",
    });
    expect(await change({ current: "sementara-123", next: "baru-sandi-1", confirm: "baru-sandi-2" })).toMatchObject({
      error: "mismatch",
    });
    expect(await change({ current: "sementara-123", next: "baru-sandi-1", confirm: "baru-sandi-1" })).toMatchObject({
      status: "saved",
    });
    const fresh = req.jar.get("nq_session")!;
    expect(fresh).not.toBe(here.cookie);

    request(fresh);
    expect(await m.lecturer.getLecturerOrNull()).toMatchObject({ email: "laras@binus.edu" });
    request(other.cookie);
    expect(await m.lecturer.getLecturerOrNull()).toBeNull();
    await signInAs("laras@binus.edu", "baru-sandi-1");

    request();
    expect(
      await m.admin.changeOwnPassword({ status: "idle" }, form({ current: "a", next: "b", confirm: "b" })),
    ).toMatchObject({
      error: "forbidden",
    });
  });

  it("throttles repeated failures for an email from one address", async () => {
    request();
    const fixedIp = new Headers({ "x-forwarded-for": "10.9.9.9" });
    const attempt = (password: string) => {
      req.headers = fixedIp;
      return m.login.signIn({ status: "idle" }, form({ email: "admin@binus.edu", password }));
    };
    for (let i = 0; i < 5; i++) expect(await attempt("salah")).toMatchObject({ error: "invalidCredentials" });
    // Even the right password is refused while blocked…
    expect(await attempt("sandi-admin-awal")).toEqual({ status: "error", error: "rateLimited" });
    // …but only for this email + address.
    expect((await signInAs("admin@binus.edu", "sandi-admin-awal")).url).toBe("/dashboard");
  });
});
