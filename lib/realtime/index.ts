"use client";

import type { RealtimeGameProvider } from "./types";
import { LocalRealtimeProvider } from "./local/provider";
import { ServerRealtimeProvider } from "./server/provider";
import { HybridDemoProvider, type DemoTransport } from "./demo-provider";
import { publicEnv } from "@/lib/env.public";
import { DEMO_ROOM_CODE, DEMO_SESSION_ID } from "@/lib/demo/simulate";

/**
 * Chooses the transport:
 *   - "server" (default) → ServerRealtimeProvider: the self-hosted game server in the
 *                          Next.js process (HTTP commands + Server-Sent Events), so
 *                          phones on the network play with the projector
 *   - "local"            → LocalRealtimeProvider: one browser only (BroadcastChannel),
 *                          for offline kiosks and tests (NEXT_PUBLIC_REALTIME_MODE=local)
 * The demo PIN / "demo" session goes through HybridDemoProvider: the server demo when
 * one is running, otherwise the offline solo demo, so the product is always explorable.
 */

let provider: RealtimeGameProvider | null = null;
let local: LocalRealtimeProvider | null = null;
let demo: RealtimeGameProvider | null = null;
let remoteFactory: (() => RealtimeGameProvider) | null = null;

/** Overrides the remote transport (tests, or an alternative such as Socket.IO). */
export function registerRemoteProvider(factory: () => RealtimeGameProvider) {
  remoteFactory = factory;
  provider = null;
  demo = null;
}

export function getLocalProvider(): LocalRealtimeProvider {
  local ??= new LocalRealtimeProvider();
  return local;
}

export function getGameProvider(): RealtimeGameProvider {
  if (provider) return provider;
  provider =
    publicEnv.realtimeMode === "local" ? getLocalProvider() : (remoteFactory?.() ?? new ServerRealtimeProvider());
  return provider;
}

export function getDemoProvider(): RealtimeGameProvider {
  if (demo) return demo;
  demo =
    publicEnv.realtimeMode === "local"
      ? getLocalProvider()
      : new HybridDemoProvider(getGameProvider(), getLocalProvider);
  return demo;
}

/** The provider for a session id or room PIN (the demo has its own). */
export function providerFor(sessionIdOrRoom: string): RealtimeGameProvider {
  if (sessionIdOrRoom === DEMO_SESSION_ID || sessionIdOrRoom === DEMO_ROOM_CODE) return getDemoProvider();
  return getGameProvider();
}

/**
 * /host/session/demo: starts (or reuses) the demo this browser will host and says
 * where it runs. "server" means phones on the network can join it.
 */
export async function ensureHostDemo(): Promise<DemoTransport> {
  const d = getDemoProvider();
  if (d instanceof HybridDemoProvider) return d.ensureHostDemo();
  await getLocalProvider().ensureHostDemo();
  return "local";
}
