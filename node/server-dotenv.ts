import dotenv from "dotenv"

const inKubernetes =
  typeof process.env.KUBERNETES_SERVICE_HOST === "string"
  && process.env.KUBERNETES_SERVICE_HOST.trim().length > 0

// Only load local `.env` when running outside Kubernetes. In-cluster config should come
// from Secrets/ConfigMaps, and a baked `.env` file can accidentally force localhost targets.
if (!inKubernetes) {
  dotenv.config()
}

