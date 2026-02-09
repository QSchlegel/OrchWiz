# wallet-enclave (OrchWiz)

Local-only capabilities API for bridge-agent wallet operations:

- Cardano address derivation per `keyRef`
- CIP-8 message signing (MeshJS)
- Context-derived encryption/decryption for private memory payloads

## Security boundary

- Bind to loopback by default (`127.0.0.1`)
- Never expose mnemonic/private keys over API
- Optional sidecar shared-secret header auth (`x-wallet-enclave-token`)
- Append-only audit log (`audit.jsonl`)

## Endpoints

- `GET /health`
- `POST /v1/addr`
- `POST /v1/sign-data`
- `POST /v1/crypto/encrypt`
- `POST /v1/crypto/decrypt`
