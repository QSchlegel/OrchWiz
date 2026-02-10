import { execFile as execFileCallback } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { promisify } from "node:util"

const execFileAsync = promisify(execFileCallback)

export interface GeneratedSshKeyMaterial {
  name: string
  publicKey: string
  privateKey: string
  fingerprint: string
}

function parseFingerprint(output: string): string {
  const line = output.trim()
  if (!line) {
    throw new Error("Unable to parse SSH key fingerprint output.")
  }

  const segments = line.split(/\s+/u)
  if (segments.length < 2) {
    throw new Error("Invalid fingerprint output.")
  }

  return segments[1]
}

function normalizeKeyName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("SSH key name is required.")
  }

  const safeName = trimmed.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  if (!safeName) {
    throw new Error("SSH key name must include at least one alphanumeric character.")
  }

  return safeName.slice(0, 120)
}

export async function generateEd25519SshKeyPair(args: {
  name: string
  comment?: string
}): Promise<GeneratedSshKeyMaterial> {
  const normalizedName = normalizeKeyName(args.name)
  const keyComment = args.comment?.trim() || `orchwiz-${normalizedName}`

  const tempDir = await mkdtemp(join(tmpdir(), "orchwiz-ssh-key-"))
  const keyPath = join(tempDir, "id_ed25519")

  try {
    await execFileAsync("ssh-keygen", [
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      keyComment,
      "-f",
      keyPath,
      "-q",
    ])

    const [privateKey, publicKey, fingerprintOutput] = await Promise.all([
      readFile(keyPath, "utf8"),
      readFile(`${keyPath}.pub`, "utf8"),
      execFileAsync("ssh-keygen", ["-lf", `${keyPath}.pub`]),
    ])

    return {
      name: normalizedName,
      privateKey,
      publicKey: publicKey.trim(),
      fingerprint: parseFingerprint(fingerprintOutput.stdout || ""),
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

export function buildHetznerSshKeySubmissionSnippet(args: {
  keyName: string
  publicKey: string
}): {
  payload: {
    name: string
    public_key: string
  }
  curl: string
} {
  const payload = {
    name: args.keyName,
    public_key: args.publicKey,
  }

  const escapedPayload = JSON.stringify(payload).replaceAll("'", "'\\''")

  return {
    payload,
    curl: [
      "curl -X POST https://api.hetzner.cloud/v1/ssh_keys",
      "  -H 'Authorization: Bearer <HETZNER_API_TOKEN>'",
      "  -H 'Content-Type: application/json'",
      `  -d '${escapedPayload}'`,
    ].join(" \\\n"),
  }
}
