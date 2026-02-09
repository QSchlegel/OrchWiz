import express from "express"
import { registerV1 } from "./v1/routes.js"

const app = express()
app.use(express.json({ limit: "2mb" }))

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "wallet-enclave",
    ts: new Date().toISOString(),
  })
})

registerV1(app)

const host = process.env.WALLET_ENCLAVE_HOST || "127.0.0.1"
const port = Number(process.env.WALLET_ENCLAVE_PORT || "3377")

app.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`wallet-enclave listening on http://${host}:${port}`)
})
