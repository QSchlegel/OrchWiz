import {
  OPEN_SOURCE_ATTRIBUTIONS as GENERATED_OPEN_SOURCE_ATTRIBUTIONS,
  type OpenSourceAttribution,
} from "./attributions.generated"

const manualAttributions: OpenSourceAttribution[] = [
  {
    name: "Outfit (Font)",
    description: "Primary display font used across the UI and open-graph assets.",
    license: "OFL-1.1",
    url: "https://github.com/Outfitio/Outfit-Fonts",
    occurrences: [
      {
        workspaceId: "fonts",
        workspaceLabel: "Fonts",
        kind: "dependency",
        requested: "bundled (TTF)",
        version: null,
      },
    ],
  },
  {
    name: "JetBrains Mono (Font)",
    description: "Monospace font used for code, readouts, and open-graph assets.",
    license: null,
    url: "https://github.com/JetBrains/JetBrainsMono",
    occurrences: [
      {
        workspaceId: "fonts",
        workspaceLabel: "Fonts",
        kind: "dependency",
        requested: "bundled (TTF) + Google Fonts",
        version: null,
      },
    ],
  },
  {
    name: "KubeView",
    description: "Vendored Kubernetes cluster visualizer used in infra tooling.",
    license: "MIT",
    url: "https://github.com/benc-uk/kubeview",
    occurrences: [
      {
        workspaceId: "infra",
        workspaceLabel: "Infra",
        kind: "dependency",
        requested: "vendored",
        version: null,
      },
    ],
  },
  {
    name: "FastAPI",
    description: "Python web framework used for auxiliary services.",
    license: null,
    url: "https://fastapi.tiangolo.com/",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: ">=0.115.0",
        version: null,
      },
    ],
  },
  {
    name: "Uvicorn",
    description: "ASGI server for FastAPI services.",
    license: null,
    url: "https://www.uvicorn.org/",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: ">=0.30.0",
        version: null,
      },
    ],
  },
  {
    name: "NumPy",
    description: "Numerical computing library used for audio and ML pipelines.",
    license: null,
    url: "https://numpy.org/",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: ">=1.24.0",
        version: null,
      },
    ],
  },
  {
    name: "SoundFile",
    description: "Audio I/O library used for reading and writing sound files in Python services.",
    license: null,
    url: "https://pypi.org/project/SoundFile/",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: ">=0.12.0",
        version: null,
      },
    ],
  },
  {
    name: "PyTorch",
    description: "Machine learning framework used for TTS model execution.",
    license: null,
    url: "https://pytorch.org/",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: ">=2.0.0",
        version: null,
      },
    ],
  },
  {
    name: "agentlightning",
    description: "Python service dependency for Agent Lightning Store.",
    license: null,
    url: "https://pypi.org/project/agentlightning/",
    occurrences: [
      {
        workspaceId: "agent-lightning-store",
        workspaceLabel: "Agent Lightning Store",
        kind: "dependency",
        requested: "==0.3.0",
        version: null,
      },
    ],
  },
  {
    name: "kugelaudio-open",
    description: "Open source KugelAudio runtime dependency for TTS.",
    license: null,
    url: "https://github.com/Kugelaudio/kugelaudio-open",
    occurrences: [
      {
        workspaceId: "kugelaudio-tts",
        workspaceLabel: "KugelAudio TTS",
        kind: "dependency",
        requested: "git dependency",
        version: null,
      },
    ],
  },
]

export const OPEN_SOURCE_ATTRIBUTIONS: OpenSourceAttribution[] = [
  ...GENERATED_OPEN_SOURCE_ATTRIBUTIONS,
  ...manualAttributions,
].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
