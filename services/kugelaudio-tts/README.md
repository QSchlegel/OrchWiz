# Kugelaudio TTS Sidecar

Optional self-hosted TTS sidecar for Bridge Call and Bridge Chat.

## Endpoints

- `GET /healthz`
- `POST /v1/tts`
  - JSON body: `{ "text": "...", "voice": "default", "cfgScale": 3.0, "maxTokens": 2048 }`
  - Response: `audio/wav`

## Local Run

```bash
cd services/kugelaudio-tts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
```

## Docker Run

```bash
cd services/kugelaudio-tts
docker build -t orchwiz-kugelaudio-tts .
docker run --rm -p 8080:8080 \
  -e KUGELAUDIO_MODEL_ID=kugelaudio/kugelaudio-0-open \
  -e KUGELAUDIO_DEFAULT_VOICE=default \
  orchwiz-kugelaudio-tts
```

## Environment Variables

- `KUGELAUDIO_MODEL_ID` (default: `kugelaudio/kugelaudio-0-open`)
- `KUGELAUDIO_DEVICE` (optional, e.g. `cuda`, `cuda:0`, `cpu`)
- `KUGELAUDIO_DEFAULT_VOICE` (default: `default`)
- `KUGELAUDIO_DEFAULT_CFG_SCALE` (default: `3.0`)
- `KUGELAUDIO_DEFAULT_MAX_TOKENS` (default: `2048`)
- `KUGELAUDIO_TEXT_MAX_CHARS` (default: `4000`)
