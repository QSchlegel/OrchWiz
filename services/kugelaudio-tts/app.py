import asyncio
import io
import os
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from kugelaudio_open import (
    KugelAudioForConditionalGenerationInference,
    KugelAudioProcessor,
)


def parse_positive_int(value: Optional[str], fallback: int) -> int:
    try:
        if value is None:
            return fallback
        parsed = int(value)
        if parsed <= 0:
            return fallback
        return parsed
    except (TypeError, ValueError):
        return fallback


def parse_positive_float(value: Optional[str], fallback: float) -> float:
    try:
        if value is None:
            return fallback
        parsed = float(value)
        if parsed <= 0:
            return fallback
        return parsed
    except (TypeError, ValueError):
        return fallback


MODEL_ID = os.getenv("KUGELAUDIO_MODEL_ID", "kugelaudio/kugelaudio-0-open").strip() or "kugelaudio/kugelaudio-0-open"
TEXT_MAX_CHARS = parse_positive_int(os.getenv("KUGELAUDIO_TEXT_MAX_CHARS"), 4000)
DEFAULT_CFG_SCALE = parse_positive_float(os.getenv("KUGELAUDIO_DEFAULT_CFG_SCALE"), 3.0)
DEFAULT_MAX_TOKENS = parse_positive_int(os.getenv("KUGELAUDIO_DEFAULT_MAX_TOKENS"), 2048)
DEFAULT_VOICE = (os.getenv("KUGELAUDIO_DEFAULT_VOICE") or "").strip() or None

MODEL: Optional[KugelAudioForConditionalGenerationInference] = None
PROCESSOR: Optional[KugelAudioProcessor] = None
DEVICE = "cpu"
GENERATE_LOCK = asyncio.Lock()


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1)
    voice: Optional[str] = None
    cfgScale: Optional[float] = None
    maxTokens: Optional[int] = None


def resolve_device() -> str:
    configured = (os.getenv("KUGELAUDIO_DEVICE") or "").strip().lower()
    if configured:
        if configured.startswith("cuda") and not torch.cuda.is_available():
            return "cpu"
        return configured
    return "cuda" if torch.cuda.is_available() else "cpu"


def ensure_loaded() -> None:
    global MODEL
    global PROCESSOR
    global DEVICE

    if MODEL is not None and PROCESSOR is not None:
        return

    DEVICE = resolve_device()
    dtype = torch.bfloat16 if DEVICE.startswith("cuda") else torch.float32

    model = KugelAudioForConditionalGenerationInference.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
    ).to(DEVICE)
    model.eval()
    model.model.strip_encoders()

    processor = KugelAudioProcessor.from_pretrained(MODEL_ID)

    MODEL = model
    PROCESSOR = processor


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_loaded()
    yield


app = FastAPI(
    title="Kugelaudio TTS Sidecar",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/healthz")
async def healthz():
    return {
        "ok": MODEL is not None and PROCESSOR is not None,
        "model": MODEL_ID,
        "device": DEVICE,
    }


@app.post("/v1/tts")
async def tts(payload: TtsRequest):
    if MODEL is None or PROCESSOR is None:
        raise HTTPException(status_code=503, detail="Model is not loaded")

    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text must not be empty")
    if len(text) > TEXT_MAX_CHARS:
        raise HTTPException(status_code=400, detail=f"text exceeds max length ({TEXT_MAX_CHARS})")

    voice = (payload.voice or "").strip() or DEFAULT_VOICE
    cfg_scale = payload.cfgScale if payload.cfgScale and payload.cfgScale > 0 else DEFAULT_CFG_SCALE
    max_tokens = payload.maxTokens if payload.maxTokens and payload.maxTokens > 0 else DEFAULT_MAX_TOKENS

    try:
        async with GENERATE_LOCK:
            inputs = PROCESSOR(
                text=text,
                voice=voice,
                return_tensors="pt",
            )
            inputs = {
                key: value.to(DEVICE) if isinstance(value, torch.Tensor) else value
                for key, value in inputs.items()
            }

            with torch.no_grad():
                outputs = MODEL.generate(
                    **inputs,
                    cfg_scale=float(cfg_scale),
                    max_new_tokens=int(max_tokens),
                )

        generated = outputs.speech_outputs[0]
        if isinstance(generated, torch.Tensor):
            audio = generated.float().detach().cpu().numpy()
        else:
            audio = np.asarray(generated, dtype=np.float32)

        audio = np.asarray(audio, dtype=np.float32).squeeze()
        sample_rate = int(getattr(PROCESSOR.audio_processor, "sampling_rate", 24000))

        output = io.BytesIO()
        sf.write(output, audio, sample_rate, format="WAV")
        return Response(content=output.getvalue(), media_type="audio/wav")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {error}") from error
