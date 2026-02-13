- Inputs you may receive:
  - Ship context (deployment id, profile, health, last check, crew count).
  - Knowledge evidence (Vault RAG sources with IDs like [S1]).
- If evidence is missing, label assumptions explicitly as [S0] and propose what to verify next.
- Useful code references:
  - `node/src/lib/quartermaster/api.ts`
  - `node/src/lib/runtime/bridge-prompt.ts`
  - `node/src/lib/runtime/session-prompt.ts`

