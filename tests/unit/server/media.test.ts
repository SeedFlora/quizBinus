import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/bootstrap", () => ({ ensureServerReady: async () => undefined }));

/** One temp UPLOAD_DIR for this file; the upload handler reads it from serverEnv. */
const dirs = vi.hoisted(() => ({ upload: "" }));
vi.mock("@/lib/env.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env.server")>();
  return {
    ...actual,
    serverEnv: new Proxy(actual.serverEnv, {
      get: (target, key) => (key === "uploadDir" ? dirs.upload : target[key as keyof typeof target]),
    }),
  };
});
// No Postgres here: the media row insert is skipped when getDb() is null.
vi.mock("@/lib/db/client", () => ({ getDb: () => null, checkDb: async () => false }));

import {
  MAX_UPLOAD_BYTES,
  MediaError,
  readMedia,
  resolveMediaPath,
  sniffImage,
  storeMedia,
} from "@/lib/server/media-store";
import { uploadMedia } from "@/lib/server/creator-api";
import { GET as mediaRoute } from "@/app/api/media/[file]/route";
import { resetServer } from "./helpers";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]);
const GIF = new TextEncoder().encode("GIF89a\x01\x00\x01\x00");
const WEBP = Uint8Array.from([
  ...new TextEncoder().encode("RIFF"),
  26,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBPVP8 "),
]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const HTML_AS_PNG = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const LECTURER = {
  id: "11111111-1111-4111-8111-111111111111",
  fullName: "Budi",
  salutation: "Pak",
  role: "lecturer" as const,
  source: "db" as const,
};

beforeAll(async () => {
  dirs.upload = await mkdtemp(path.join(tmpdir(), "nq-media-"));
});
afterAll(async () => {
  await rm(dirs.upload, { recursive: true, force: true });
});
beforeEach(() => resetServer());

describe("media: magic bytes", () => {
  it("recognises PNG, JPEG, GIF and WebP by content, nothing else", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPEG)).toBe("jpg");
    expect(sniffImage(GIF)).toBe("gif");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(HTML_AS_PNG)).toBeNull();
    expect(sniffImage(new Uint8Array([0x89, 0x50]))).toBeNull();
    // RIFF but not WebP (e.g. a WAV file)
    expect(
      sniffImage(
        Uint8Array.from([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WAVE")]),
      ),
    ).toBeNull();
  });

  it("stores under a random name with the sniffed extension and rejects everything else", async () => {
    const stored = await storeMedia(PNG, dirs.upload);
    expect(stored.fileName).toMatch(/^[a-f0-9]{32}\.png$/);
    expect(stored).toMatchObject({ mime: "image/png", bytes: PNG.byteLength });
    expect((await readMedia(stored.fileName, dirs.upload))?.mime).toBe("image/png");

    await expect(storeMedia(SVG, dirs.upload)).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(storeMedia(new Uint8Array(), dirs.upload)).rejects.toBeInstanceOf(MediaError);
    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    huge.set(PNG);
    await expect(storeMedia(huge, dirs.upload)).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("media: path traversal", () => {
  it("only resolves names it issued, strictly inside the upload directory", async () => {
    const good = `${"a".repeat(32)}.png`;
    expect(resolveMediaPath(good, dirs.upload)).toBe(path.join(path.resolve(dirs.upload), good));
    for (const name of [
      "../secret.png",
      "..%2Fsecret.png",
      `../${"a".repeat(32)}.png`,
      `${"a".repeat(32)}.svg`,
      `${"a".repeat(32)}.png/../../etc/passwd`,
      `${"A".repeat(32)}.png`,
      "/etc/passwd",
      "C:\\Windows\\win.ini",
      `${"a".repeat(32)}.png\u0000.txt`,
      "",
    ]) {
      expect(resolveMediaPath(name, dirs.upload), name).toBeNull();
    }
    // A real file one level up is never served.
    const outside = path.join(path.dirname(path.resolve(dirs.upload)), `${"b".repeat(32)}.png`);
    await writeFile(outside, PNG);
    try {
      expect(await readMedia(`../${path.basename(outside)}`, dirs.upload)).toBeNull();
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("GET /api/media/[file] serves stored images with safe headers and 404s everything else", async () => {
    const stored = await storeMedia(JPEG, dirs.upload);
    const res = await mediaRoute(new Request(`http://localhost/api/media/${stored.fileName}`), {
      params: Promise.resolve({ file: stored.fileName }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);

    for (const file of ["../package.json", "..%2F..%2Fpackage.json", `${"c".repeat(32)}.jpg`]) {
      const miss = await mediaRoute(new Request("http://localhost/api/media/x"), { params: Promise.resolve({ file }) });
      expect(miss.status, file).toBe(404);
    }
  });
});

describe("media: upload handler", () => {
  function upload(body: FormData | string, headers: Record<string, string> = {}) {
    return new Request("http://localhost:3100/api/media", { method: "POST", body, headers });
  }

  it("accepts one real image and returns its URL", async () => {
    const form = new FormData();
    form.set("file", new Blob([GIF], { type: "image/png" }), "lies.png"); // declared type and name are ignored
    const res = await uploadMedia(upload(form), LECTURER);
    expect(res.status).toBe(201);
    const url = (res.body as { url: string }).url;
    expect(url).toMatch(/^\/api\/media\/[a-f0-9]{32}\.gif$/);
    expect(await readdir(dirs.upload)).toContain(url.split("/").pop());
  });

  it("rejects non-images, missing files, non-multipart bodies and oversized uploads", async () => {
    const svg = new FormData();
    svg.set("file", new Blob([SVG], { type: "image/svg+xml" }), "x.svg");
    expect(await uploadMedia(upload(svg), LECTURER)).toMatchObject({
      status: 415,
      body: { error: "unsupported_type" },
    });

    const disguised = new FormData();
    disguised.set("file", new Blob([HTML_AS_PNG], { type: "image/png" }), "x.png");
    expect((await uploadMedia(upload(disguised), LECTURER)).status).toBe(415);

    const none = new FormData();
    none.set("other", "x");
    expect(await uploadMedia(upload(none), LECTURER)).toMatchObject({ status: 400, body: { error: "missing_file" } });

    expect((await uploadMedia(upload("{}", { "content-type": "application/json" }), LECTURER)).status).toBe(400);

    const big = new FormData();
    const bytes = new Uint8Array(MAX_UPLOAD_BYTES + 200 * 1024);
    bytes.set(PNG);
    big.set("file", new Blob([bytes]), "big.png");
    await expect(uploadMedia(upload(big), LECTURER)).rejects.toMatchObject({ code: "payload_too_large", status: 413 });
  });
});
