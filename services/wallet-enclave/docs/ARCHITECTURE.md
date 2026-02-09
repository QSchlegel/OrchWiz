# Wallet Enclave Architecture

- Local-only sidecar/daemon that holds wallet secret material.
- Bridge agents access signing/crypto by capability endpoints only.
- Mnemonics never leave enclave process memory.
- Optional shared-secret header protects local socket against accidental cross-process access.
