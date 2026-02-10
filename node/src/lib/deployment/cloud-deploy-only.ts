export function parseBooleanEnvFlag(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false
  }

  return value.trim().toLowerCase() === "true"
}

export function isCloudDeployOnlyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnvFlag(env.CLOUD_DEPLOY_ONLY)
}
