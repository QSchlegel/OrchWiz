export interface SubagentContextInput {
  id: string
  name: string
  content: string
  description?: string | null
  path?: string | null
  isShared?: boolean
}

export type ContextSectionType =
  | "role"
  | "goals"
  | "context"
  | "constraints"
  | "tools"
  | "memory"
  | "handoff"
  | "output"
  | "examples"
  | "instructions"

export interface ContextSection {
  id: string
  type: ContextSectionType
  label: string
  title: string
  content: string
  wordCount: number
  coverage: number
}

export interface ContextRisk {
  id: string
  level: "info" | "warning"
  message: string
}

export interface SubagentContextAnalysis {
  subagentId: string
  subagentName: string
  wordCount: number
  summary: string
  sections: ContextSection[]
  dependencies: string[]
  risks: ContextRisk[]
  compositionScore: number
}

interface SectionTypeConfig {
  type: ContextSectionType
  label: string
  patterns: RegExp[]
}

interface ContentSegment {
  title: string
  body: string
}

const SECTION_CONFIG: SectionTypeConfig[] = [
  {
    type: "role",
    label: "Role & Persona",
    patterns: [/\brole\b/i, /\bpersona\b/i, /\byou are\b/i, /\bidentity\b/i],
  },
  {
    type: "goals",
    label: "Goals",
    patterns: [/\bgoal\b/i, /\bobjective\b/i, /\bmission\b/i, /\btask\b/i, /\bpurpose\b/i],
  },
  {
    type: "context",
    label: "Context Inputs",
    patterns: [/\bcontext\b/i, /\bbackground\b/i, /\binput\b/i, /\breference\b/i, /\bknowledge\b/i],
  },
  {
    type: "constraints",
    label: "Constraints",
    patterns: [/\bconstraint\b/i, /\bguardrail\b/i, /\brule\b/i, /\bmust not\b/i, /\bdo not\b/i, /\bnever\b/i],
  },
  {
    type: "tools",
    label: "Tools",
    patterns: [/\btools?\b/i, /\bapi\b/i, /\bfunction\b/i, /\bcommand\b/i, /\bintegration\b/i],
  },
  {
    type: "memory",
    label: "Memory",
    patterns: [/\bmemory\b/i, /\bhistory\b/i, /\bstate\b/i, /\bsession\b/i],
  },
  {
    type: "handoff",
    label: "Handoffs",
    patterns: [/\bhandoff\b/i, /\bdelegate\b/i, /\broute to\b/i, /\bcoordinate\b/i, /\bescalate\b/i],
  },
  {
    type: "output",
    label: "Output Contract",
    patterns: [/\boutput\b/i, /\bresponse\b/i, /\bdeliverable\b/i, /\bformat\b/i, /\bschema\b/i],
  },
  {
    type: "examples",
    label: "Examples",
    patterns: [/\bexample\b/i, /\bfew-shot\b/i, /\bsample\b/i],
  },
  {
    type: "instructions",
    label: "Instructions",
    patterns: [],
  },
]

const SECTION_LABELS = new Map(SECTION_CONFIG.map((entry) => [entry.type, entry.label]))
const SECTION_PRIORITY: ContextSectionType[] = [
  "role",
  "goals",
  "context",
  "constraints",
  "tools",
  "memory",
  "handoff",
  "output",
  "examples",
  "instructions",
]

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").trim()
}

function buildSummary(content: string): string {
  const plain = content
    .replace(/[`#>*_~|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!plain) {
    return "No prompt content available."
  }

  if (plain.length <= 180) {
    return plain
  }

  return `${plain.slice(0, 177).trimEnd()}...`
}

function classifySectionType(title: string, body: string): ContextSectionType {
  const source = `${title}\n${body.slice(0, 420)}`
  for (const section of SECTION_CONFIG) {
    if (section.type === "instructions") {
      continue
    }
    if (section.patterns.some((pattern) => pattern.test(source))) {
      return section.type
    }
  }
  return "instructions"
}

function splitContentIntoSegments(content: string): ContentSegment[] {
  const normalized = normalizeContent(content)
  if (!normalized) {
    return []
  }

  const lines = normalized.split("\n")
  const headingRegex = /^\s{0,3}(#{1,6})\s+(.+?)\s*$/
  const containsHeadings = lines.some((line) => headingRegex.test(line))

  if (containsHeadings) {
    const segments: ContentSegment[] = []
    let currentTitle = "Core Instructions"
    let currentBody: string[] = []

    const flush = () => {
      const body = currentBody.join("\n").trim()
      if (!body) {
        return
      }
      segments.push({ title: currentTitle, body })
    }

    for (const line of lines) {
      const match = line.match(headingRegex)
      if (match) {
        flush()
        currentTitle = match[2].trim()
        currentBody = []
        continue
      }
      currentBody.push(line)
    }

    flush()

    if (segments.length > 0) {
      return segments
    }
  }

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  if (blocks.length === 0) {
    return [{ title: "Core Instructions", body: normalized }]
  }

  return blocks.map((block, index) => {
    const blockLines = block.split("\n")
    const firstLine = blockLines[0]?.trim() || ""
    const labeledLine = firstLine.match(/^([A-Za-z][A-Za-z0-9 /_-]{2,40}):\s*(.*)$/)

    if (labeledLine) {
      const title = labeledLine[1].trim()
      const remainder = [labeledLine[2], ...blockLines.slice(1)].join("\n").trim()
      return {
        title,
        body: remainder || block,
      }
    }

    return {
      title: index === 0 ? "Core Instructions" : `Context Block ${index + 1}`,
      body: block,
    }
  })
}

function inferDependencies(agent: SubagentContextInput, subagents: SubagentContextInput[]): string[] {
  const dependencies = new Set<string>()
  const source = normalizeContent(agent.content)
  if (!source) {
    return []
  }

  for (const candidate of subagents) {
    if (candidate.id === agent.id) {
      continue
    }

    const name = candidate.name.trim()
    if (!name) {
      continue
    }

    const escapedName = escapeRegExp(name)
    const patterns = [
      new RegExp(`@${escapedName}\\b`, "i"),
      new RegExp(`\\b(?:agent|subagent)\\s+${escapedName}\\b`, "i"),
      new RegExp(`\\b${escapedName}\\b\\s+(?:agent|subagent)\\b`, "i"),
      new RegExp(`\\b(?:handoff(?:\\s+to)?|delegate\\s+to|escalate\\s+to|consult|coordinate\\s+with|route\\s+to)\\s+${escapedName}\\b`, "i"),
    ]

    if (patterns.some((pattern) => pattern.test(source))) {
      dependencies.add(candidate.id)
    }
  }

  return [...dependencies]
}

function calculateCompositionScore(sectionTypes: Set<ContextSectionType>, wordCount: number): number {
  let score = 30
  if (sectionTypes.has("role")) score += 14
  if (sectionTypes.has("goals")) score += 14
  if (sectionTypes.has("context")) score += 12
  if (sectionTypes.has("constraints")) score += 16
  if (sectionTypes.has("tools")) score += 8
  if (sectionTypes.has("memory")) score += 8
  if (sectionTypes.has("handoff")) score += 8
  if (sectionTypes.has("output")) score += 18
  if (sectionTypes.has("examples")) score += 6

  if (wordCount < 60) {
    score -= 18
  } else if (wordCount < 120) {
    score -= 8
  }

  return clamp(Math.round(score), 0, 100)
}

function buildRisks(params: {
  sectionTypes: Set<ContextSectionType>
  wordCount: number
  sectionCount: number
  dependencyCount: number
  hasPeers: boolean
}): ContextRisk[] {
  const risks: ContextRisk[] = []
  const { sectionTypes, wordCount, sectionCount, dependencyCount, hasPeers } = params

  if (wordCount < 60) {
    risks.push({
      id: "prompt-too-short",
      level: "warning",
      message: "Prompt is short and may under-specify behavior under edge cases.",
    })
  }

  if (!sectionTypes.has("constraints")) {
    risks.push({
      id: "missing-constraints",
      level: "warning",
      message: "No explicit constraints found, so safety and scope boundaries are unclear.",
    })
  }

  if (!sectionTypes.has("output")) {
    risks.push({
      id: "missing-output-contract",
      level: "warning",
      message: "No output contract detected. Results may be inconsistent across runs.",
    })
  }

  if (sectionCount < 3) {
    risks.push({
      id: "low-structure",
      level: "info",
      message: "Prompt structure is shallow. Add sectioned context to improve composability.",
    })
  }

  if (hasPeers && dependencyCount === 0) {
    risks.push({
      id: "no-handoff-paths",
      level: "info",
      message: "No handoff dependencies were found between this agent and peers.",
    })
  }

  return risks
}

export function analyzeSubagentContexts(subagents: SubagentContextInput[]): SubagentContextAnalysis[] {
  const hasPeers = subagents.length > 1

  return subagents.map((subagent) => {
    const normalizedContent = normalizeContent(subagent.content)
    const totalWordCount = countWords(normalizedContent)
    const segments = splitContentIntoSegments(normalizedContent)

    const sections: ContextSection[] = segments.map((segment, index) => {
      const type = classifySectionType(segment.title, segment.body)
      const wordCount = countWords(segment.body)

      return {
        id: `${subagent.id}-section-${index}`,
        type,
        label: SECTION_LABELS.get(type) || "Instructions",
        title: segment.title,
        content: segment.body,
        wordCount,
        coverage: totalWordCount === 0 ? 0 : clamp(wordCount / totalWordCount, 0, 1),
      }
    })

    const sortedSections = [...sections].sort((left, right) => {
      const leftPriority = SECTION_PRIORITY.indexOf(left.type)
      const rightPriority = SECTION_PRIORITY.indexOf(right.type)
      if (leftPriority === rightPriority) {
        return left.title.localeCompare(right.title)
      }
      return leftPriority - rightPriority
    })

    const sectionTypes = new Set(sortedSections.map((section) => section.type))
    const summarySource =
      sortedSections.find((section) => section.type === "goals")
        || sortedSections.find((section) => section.type === "role")
        || sortedSections[0]

    const dependencies = inferDependencies(subagent, subagents)
    const compositionScore = calculateCompositionScore(sectionTypes, totalWordCount)
    const risks = buildRisks({
      sectionTypes,
      wordCount: totalWordCount,
      sectionCount: sortedSections.length,
      dependencyCount: dependencies.length,
      hasPeers,
    })

    return {
      subagentId: subagent.id,
      subagentName: subagent.name,
      wordCount: totalWordCount,
      summary: buildSummary(summarySource?.content || normalizedContent),
      sections: sortedSections,
      dependencies,
      risks,
      compositionScore,
    }
  })
}
