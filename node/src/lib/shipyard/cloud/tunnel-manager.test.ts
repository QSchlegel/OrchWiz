import assert from "node:assert/strict"
import test from "node:test"
import {
  buildAutosshArgs,
  checkManagedTunnelHealth,
  type TunnelManagerRuntime,
} from "@/lib/shipyard/cloud/tunnel-manager"

test("buildAutosshArgs builds expected local forward command", () => {
  const args = buildAutosshArgs({
    definition: {
      tunnelId: "shipyard-1",
      localHost: "127.0.0.1",
      localPort: 16443,
      remoteHost: "10.0.0.10",
      remotePort: 6443,
      sshHost: "203.0.113.1",
      sshPort: 22,
      sshUser: "root",
      privateKeyPem: "dummy",
    },
    keyFilePath: "/tmp/key",
    controlSocketPath: "/tmp/control.sock",
    knownHostsPath: "/tmp/known_hosts",
  })

  assert.ok(args.includes("-M"))
  assert.ok(args.includes("0"))
  assert.ok(args.includes("-N"))
  assert.ok(args.includes("-L"))
  assert.ok(args.includes("127.0.0.1:16443:10.0.0.10:6443"))
  assert.ok(args.includes("root@203.0.113.1"))
})

function createMockRuntime(overrides: Partial<TunnelManagerRuntime>): TunnelManagerRuntime {
  return {
    mkdir: async () => undefined,
    writeFile: async () => undefined,
    chmod: async () => undefined,
    readFile: async () => "",
    unlink: async () => undefined,
    spawnDetached: async () => 123,
    processAlive: () => true,
    killProcess: () => undefined,
    sleep: async () => undefined,
    isPortReachable: async () => true,
    ...overrides,
  }
}

test("checkManagedTunnelHealth reports healthy when process and port are up", async () => {
  const runtime = createMockRuntime({
    processAlive: () => true,
    isPortReachable: async () => true,
  })

  const health = await checkManagedTunnelHealth({
    localHost: "127.0.0.1",
    localPort: 16443,
    pid: 123,
    runtime,
  })

  assert.equal(health.healthy, true)
  assert.equal(health.processAlive, true)
  assert.equal(health.portReachable, true)
})

test("checkManagedTunnelHealth reports unhealthy when process is down", async () => {
  const runtime = createMockRuntime({
    processAlive: () => false,
  })

  const health = await checkManagedTunnelHealth({
    localHost: "127.0.0.1",
    localPort: 16443,
    pid: 123,
    runtime,
  })

  assert.equal(health.healthy, false)
  assert.equal(health.processAlive, false)
  assert.match(health.message || "", /not running/i)
})

test("checkManagedTunnelHealth reports unhealthy when port is unreachable", async () => {
  const runtime = createMockRuntime({
    processAlive: () => true,
    isPortReachable: async () => false,
  })

  const health = await checkManagedTunnelHealth({
    localHost: "127.0.0.1",
    localPort: 16443,
    pid: 123,
    runtime,
  })

  assert.equal(health.healthy, false)
  assert.equal(health.processAlive, true)
  assert.equal(health.portReachable, false)
  assert.match(health.message || "", /not reachable/i)
})
