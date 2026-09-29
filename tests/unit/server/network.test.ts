import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { lanAddresses, phoneOrigins } from "@/lib/server/network";

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal,
  cidr: `${address}/24`,
});

const INTERFACES: Record<string, NetworkInterfaceInfo[]> = {
  "vEthernet (WSL)": [v4("172.24.160.1")],
  lo: [v4("127.0.0.1", true)],
  "Wi-Fi": [v4("192.168.18.5"), { ...v4("fe80::1"), family: "IPv6", scopeid: 0 }],
  docker0: [v4("172.17.0.1")],
  eth1: [v4("169.254.10.2")],
  Ethernet: [v4("10.20.30.40")],
};

const at = (host: string) => new Request(`http://${host}/api/network`, { headers: { host } });

describe("phone-reachable origins", () => {
  it("lists real LAN IPv4 addresses first, virtual adapters last, never loopback or link-local", () => {
    expect(lanAddresses(INTERFACES)).toEqual(["192.168.18.5", "10.20.30.40", "172.24.160.1", "172.17.0.1"]);
  });

  it("uses the port the projector was opened on", () => {
    expect(phoneOrigins(at("localhost:3100"), INTERFACES)[0]).toBe("http://192.168.18.5:3100");
    expect(phoneOrigins(at("127.0.0.1"), INTERFACES)[0]).toBe("http://192.168.18.5");
  });

  it("reveals interface addresses only to a request made on the machine itself", () => {
    expect(phoneOrigins(at("quiz.binus.ac.id"), INTERFACES)).toEqual([]);
    expect(phoneOrigins(at("192.168.18.5:3100"), INTERFACES)).toEqual([]);
  });
});
