# Incident Response Runbook (OrchWiz)

- Owner: Platform Security (OrchWiz Maintainers)
- Last Updated: 2026-02-13
- Status: Draft baseline

This runbook describes how to use the OrchWiz Security "Incident Response" module, which stores incident cases in an Aurora IR-compatible `.fox` JSON format, supports evidence snapshots to `OWZ-Vault`, and provides v1 integrations for VirusTotal enrichment and MISP push.

## Feature Flag

The module is gated behind:

- `ENABLE_SECURITY_INCIDENTS=true`

Default behavior: enabled in dev when unset; opt-in in production.

## Create A New Incident

1. Go to `Security -> Incident Response` or open `/security/incidents`.
2. Enter a title and severity.
3. Click `Create`.
4. Add data in the relevant tabs (Timeline, Malware, Network, Evidence, Actions, Case Notes).
5. Click `Save` after editing.

## Import An Aurora `.fox` Case File

1. Open `/security/incidents`.
2. Click `Import .fox` and choose your `.fox` file.
3. OrchWiz will normalize the case file to the supported storage format and ensure each grid row has a numeric `recid`.

Notes:
- OrchWiz intentionally does not persist Aurora API keys (`mispapikey`, `vtapikey`) from imported files. Integration secrets are stored per-user in OrchWiz (encrypted when required).
- The `locked` field is normalized to `false` so exported cases do not open in Aurora read-only mode.

## Export A Case As `.fox`

1. Open an incident case page.
2. Click `Export .fox`.
3. The downloaded file should open in Aurora IR without losing data for the supported grids.

## Configure Integrations (Per-User)

1. Open `/security/integrations`.
2. Set:
   - MISP base URL and API key
   - VirusTotal API key
3. Click `Save`.

Secret storage:
- Secrets are stored per-user as an envelope.
- If wallet-enclave encryption is required by environment policy, OrchWiz will fail closed when the enclave is disabled/unreachable.

## VirusTotal Enrichment

Supported lookups:
- Malware grid: hash lookups via VT `/files/{id}`
- Network grid: IP via `/ip_addresses/{ip}` and domain via `/domains/{domain}`
- If a network "domainname" contains a full URL (`https://...`), OrchWiz will use VT `/urls/{id}`

How enrichment works:
1. Select a row in Malware or Network and click the VT button.
2. OrchWiz fetches the VT JSON response.
3. OrchWiz writes a raw JSON evidence blob to:
   - `OWZ-Vault/00-Inbox/Security-Incidents/security_incident_<incidentId>_<timestamp>_vt_<kind>.json`
4. OrchWiz appends an Aurora `evidence[]` entry pointing at that JSON file.
5. OrchWiz updates the row `vt` field to:
   - `infected` if malicious detections > 0
   - `clean` if malicious detections == 0
   - `noresult` if VT returns 404
   - `unknown` otherwise

## MISP Push (Export IOCs)

Push behavior (v1):
1. If the incident has no MISP event id, OrchWiz creates a new event with info:
   - `OrchWiz IR: <incident.title> (<incident.id>)`
2. OrchWiz pushes malware hashes and network indicators as attributes.
3. OrchWiz writes a raw JSON evidence blob to:
   - `OWZ-Vault/00-Inbox/Security-Incidents/security_incident_<incidentId>_<timestamp>_misp_push_<...>.json`
4. OrchWiz appends an Aurora `evidence[]` entry pointing at that JSON file.
5. OrchWiz stores `mispEventId` and `mispPushedAt` on the incident, and sets Aurora compatibility fields:
   - `caseFile.mispserver`
   - `caseFile.mispeventid`

Attribute mapping (v1 defaults):
- Malware:
  - 32-char hash -> `type=md5`, `category=Payload installation`
  - 40-char hash -> `type=sha1`, `category=Payload installation`
  - 64-char hash -> `type=sha256`, `category=Payload installation`
  - Other -> skipped and a Case Note is added
- Network:
  - `ip` -> `type=ip-dst`, `category=Network activity`
  - `domainname` -> `type=domain` (or `url` if it contains `://`), `category=Network activity`

## Vault Snapshots (Evidence Artifacts)

Use `Snapshot to Vault` to emit a markdown + JSON snapshot of the case:

- Markdown:
  - `OWZ-Vault/00-Inbox/Security-Incidents/security_incident_<incidentId>_<timestamp>.md`
- JSON:
  - `OWZ-Vault/00-Inbox/Security-Incidents/security_incident_<incidentId>_<timestamp>.json`

Snapshots contain:
- Incident metadata (status, severity, timestamps, MISP linkage, session linkage)
- Timeline, malware, network indicators, actions, notes, evidence lists
- The canonical Aurora case JSON

## Closure Checklist

Before closing an incident:
- Confirm containment and eradication steps are documented.
- Ensure Timeline includes key milestones (initial detection, scope confirmation, containment, recovery).
- Ensure Malware/Network indicators are enriched or intentionally marked as not checked.
- Push IOCs to MISP if required by your sharing policy.
- Run `Snapshot to Vault` and ensure the latest snapshot exists in `OWZ-Vault/00-Inbox/Security-Incidents/`.
- Set incident status to `closed` and add a final Case Note with closure summary.

