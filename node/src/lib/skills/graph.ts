import type {
  SkillCatalogEntryDto,
  SkillGraphGroup,
  SkillGraphGroupId,
  SkillGraphResponse,
} from "@/lib/skills/types"

export const SKILL_GRAPH_GROUPS: SkillGraphGroup[] = [
  {
    id: "installed",
    label: "Installed",
    description: "Skills currently installed in your scoped Codex home.",
  },
  {
    id: "curated",
    label: "Curated Available",
    description: "Curated skills available from openai/skills.",
  },
  {
    id: "experimental",
    label: "Experimental Available",
    description: "Experimental skills when upstream source is reachable.",
  },
  {
    id: "custom",
    label: "Custom Imported",
    description: "Skills imported from custom GitHub locations or local-only entries.",
  },
  {
    id: "system",
    label: "System Skills",
    description: "Read-only baseline skills from the .system namespace.",
  },
]

function toSourceValue(source: SkillCatalogEntryDto["source"]): SkillCatalogEntryDto["source"] {
  return source
}

function classifyGroup(args: {
  source: SkillCatalogEntryDto["source"]
  isInstalled: boolean
  isSystem: boolean
}): SkillGraphGroupId {
  if (args.isSystem || args.source === "system") {
    return "system"
  }

  if (args.source === "custom_github" || args.source === "local") {
    return "custom"
  }

  if (args.isInstalled) {
    return "installed"
  }

  if (args.source === "experimental") {
    return "experimental"
  }

  if (args.source === "curated") {
    return "curated"
  }

  return "custom"
}

export function buildSkillGraph(entries: SkillCatalogEntryDto[]): SkillGraphResponse {
  const groupedCounts: Record<SkillGraphGroupId, number> = {
    installed: 0,
    curated: 0,
    experimental: 0,
    custom: 0,
    system: 0,
  }

  const nodes: SkillGraphResponse["nodes"] = SKILL_GRAPH_GROUPS.map((group) => ({
    id: `group:${group.id}`,
    nodeType: "group",
    label: group.label,
    groupId: group.id,
  }))

  const edges: SkillGraphResponse["edges"] = []

  for (const entry of entries) {
    const source = toSourceValue(entry.source)
    const groupId = classifyGroup({
      source,
      isInstalled: entry.isInstalled,
      isSystem: entry.isSystem,
    })

    groupedCounts[groupId] += 1

    const skillNodeId = `skill:${entry.id}`
    nodes.push({
      id: skillNodeId,
      nodeType: "skill",
      label: entry.name,
      groupId,
      skillId: entry.id,
      source,
      isInstalled: entry.isInstalled,
    })

    edges.push({
      id: `edge:${groupId}:${entry.id}`,
      source: `group:${groupId}`,
      target: skillNodeId,
      edgeType: "group-membership",
    })
  }

  nodes.sort((left, right) => {
    if (left.nodeType !== right.nodeType) {
      return left.nodeType === "group" ? -1 : 1
    }

    if (left.groupId !== right.groupId) {
      return left.groupId.localeCompare(right.groupId)
    }

    return left.label.localeCompare(right.label)
  })

  edges.sort((left, right) => left.id.localeCompare(right.id))

  return {
    groups: SKILL_GRAPH_GROUPS,
    nodes,
    edges,
    stats: {
      totalSkills: entries.length,
      installedCount: entries.filter((entry) => entry.isInstalled).length,
      systemCount: entries.filter((entry) => entry.isSystem || entry.source === "system").length,
      groupedCounts,
    },
  }
}
