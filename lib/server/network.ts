import "server-only";
import { networkInterfaces } from "node:os";
import { serverEnv } from "@/lib/env.server";

/**
 * Phone-reachable origins for the host lobby (GET /api/network).
 *
 * A lecturer who runs `npm run dev` opens the projector at http://localhost:3000, but
 * phones cannot reach "localhost". The lobby asks the server for its LAN addresses
 * and shows http://<laptop-ip>:3000/join instead. APP_URL (the canonical address,
 * e.g. behind a reverse proxy) always comes first.
 *
 * Interface addresses are only revealed to a request that itself came in over the
 * loopback interface name (the lecturer's own machine): behind a proxy they would be
 * container addresses, useless to phones and not the internet's business.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Hostname and port the request was addressed to (the Host header). */
function requestHost(request: Request): { hostname: string; port: string } {
  const raw = request.headers.get("host") ?? new URL(request.url).host;
  try {
    const url = new URL(`http://${raw}`);
    return { hostname: url.hostname.toLowerCase(), port: url.port };
  } catch {
    return { hostname: "", port: "" };
  }
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

/** Virtual adapters (Docker, WSL, Hyper-V, VPN tunnels) that phones on the Wi-Fi cannot reach. */
const VIRTUAL_ADAPTER =
  /(docker|br-|veth|virbr|vethernet|wsl|hyper-v|vmware|virtualbox|vbox|utun|tun|tap|zt|tailscale|loopback)/i;

function rank(name: string, address: string): number {
  let score = 0;
  if (VIRTUAL_ADAPTER.test(name)) score += 10;
  // Typical classroom / home Wi-Fi ranges first.
  if (address.startsWith("192.168.")) score += 0;
  else if (address.startsWith("10.")) score += 1;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 2;
  else score += 3;
  return score;
}

/** Non-internal IPv4 addresses of this machine, the most phone-reachable first. */
export function lanAddresses(interfaces = networkInterfaces()): string[] {
  const found: { address: string; score: number }[] = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      const v4 = entry.family === "IPv4" || (entry.family as unknown) === 4;
      if (!v4 || entry.internal || entry.address.startsWith("169.254.")) continue;
      found.push({ address: entry.address, score: rank(name, entry.address) });
    }
  }
  return [...new Set(found.sort((a, b) => a.score - b.score).map((f) => f.address))];
}

export function phoneOrigins(request: Request, interfaces = networkInterfaces()): string[] {
  const origins: string[] = [];
  if (serverEnv.appUrl) origins.push(serverEnv.appUrl);
  const { hostname, port } = requestHost(request);
  if (isLoopbackHost(hostname)) {
    for (const address of lanAddresses(interfaces)) origins.push(`http://${address}${port ? `:${port}` : ""}`);
  }
  return [...new Set(origins)];
}
