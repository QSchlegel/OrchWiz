import test from "node:test"
import assert from "node:assert/strict"
import { createStreamingRunCommand } from "./launch-logging"

test("createStreamingRunCommand streams stdout/stderr and returns captured output", async () => {
  const emitted: Array<{ level: string; source: string; stream?: string; lines: string[] }> = []
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: (entry) => emitted.push(entry),
  })

  const result = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('hello\\n'); process.stderr.write('oops\\n')",
  ])

  assert.equal(result.ok, true)
  assert.equal(result.exitCode, 0)
  assert.match(result.stdout, /hello/u)
  assert.match(result.stderr, /oops/u)

  const allLines = emitted.flatMap((entry) => entry.lines)
  assert.ok(allLines.some((line) => line.includes("hello")))
  assert.ok(allLines.some((line) => line.includes("oops")))
  assert.ok(allLines.some((line) => line.startsWith("$ ")))
})

test("createStreamingRunCommand times out and emits a timeout marker", async () => {
  const emitted: Array<{ level: string; source: string; stream?: string; lines: string[] }> = []
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: (entry) => emitted.push(entry),
  })

  const result = await runCommand(
    process.execPath,
    ["-e", "setTimeout(() => {}, 5000)"],
    { timeoutMs: 120 },
  )

  assert.equal(result.ok, false)
  assert.equal(result.exitCode, null)
  assert.match(result.error || "", /Timed out after 120ms/u)

  const allLines = emitted.flatMap((entry) => entry.lines)
  assert.ok(allLines.some((line) => line.includes("Timed out after 120ms")))
})

test("createStreamingRunCommand strips ANSI sequences", async () => {
  const emitted: Array<{ level: string; source: string; stream?: string; lines: string[] }> = []
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: (entry) => emitted.push(entry),
  })

  const result = await runCommand(process.execPath, [
    "-e",
    "process.stdout.write('\\u001b[31mred\\u001b[0m\\n')",
  ])

  assert.equal(result.ok, true)
  assert.equal(result.stdout, "red\n")

  const allLines = emitted.flatMap((entry) => entry.lines).join("\n")
  assert.match(allLines, /\bred\b/u)
  assert.doesNotMatch(allLines, /\u001b\[/u)
})

test("createStreamingRunCommand classifies non-warning stderr as debug", async () => {
  const emitted: Array<{ level: string; source: string; stream?: string; lines: string[] }> = []
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: (entry) => emitted.push(entry),
  })

  const result = await runCommand(process.execPath, [
    "-e",
    "process.stderr.write('transferring context: 1.2MB\\n')",
  ])

  assert.equal(result.ok, true)
  const stderrEntry = emitted.find((entry) =>
    entry.stream === "stderr"
    && entry.lines.some((line) => line.includes("transferring context")),
  )
  assert.ok(stderrEntry)
  assert.equal(stderrEntry?.level, "debug")
})

test("createStreamingRunCommand classifies warning-like stderr as warn", async () => {
  const emitted: Array<{ level: string; source: string; stream?: string; lines: string[] }> = []
  const runCommand = createStreamingRunCommand({
    source: "local-bootstrap",
    emitLaunchLog: (entry) => emitted.push(entry),
  })

  const result = await runCommand(process.execPath, [
    "-e",
    "process.stderr.write('warning: probe failed\\n')",
  ])

  assert.equal(result.ok, true)
  const stderrEntry = emitted.find((entry) =>
    entry.stream === "stderr"
    && entry.lines.some((line) => line.includes("warning: probe failed")),
  )
  assert.ok(stderrEntry)
  assert.equal(stderrEntry?.level, "warn")
})
