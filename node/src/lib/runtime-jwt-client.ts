export async function mintRuntimeJwtCookie(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const response = await fetch("/api/runtime/jwt", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>

    if (response.ok && payload.ok === true) {
      return { ok: true }
    }

    const detail =
      typeof payload.detail === "string"
        ? payload.detail
        : typeof payload.error === "string"
          ? payload.error
          : `HTTP ${response.status}`

    return { ok: false, detail }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown error minting runtime JWT.",
    }
  }
}

