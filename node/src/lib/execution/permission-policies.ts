import type {
  PermissionPolicy,
  PermissionPolicyRule,
  PermissionStatus,
  PermissionType,
  Prisma,
  SubagentPermissionPolicy,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { SYSTEM_PERMISSION_POLICY_PRESETS, type PermissionPolicyPreset, type PolicyPresetRule } from "./policy-presets"

export interface PermissionPolicyRuleInput {
  commandPattern: string
  type: PermissionType
  status: PermissionStatus
  sortOrder?: number
}

export interface PermissionPolicyCreateInput {
  name: string
  description?: string | null
  slug?: string | null
  rules: PermissionPolicyRuleInput[]
  ownerUserId?: string | null
}

export interface PermissionPolicyUpdateInput {
  name?: string
  description?: string | null
  slug?: string | null
  rules?: PermissionPolicyRuleInput[]
}

export interface SubagentPolicyAssignmentInput {
  policyId: string
  priority?: number
  enabled?: boolean
}

export interface PermissionPolicyWithRules extends PermissionPolicy {
  rules: PermissionPolicyRule[]
}

export interface PermissionPolicyWithRulesAndCounts extends PermissionPolicyWithRules {
  _count: {
    assignments: number
  }
}

export interface SubagentPolicyAssignmentWithPolicy extends SubagentPermissionPolicy {
  policy: PermissionPolicyWithRules
}

export interface PolicySubagentAssignment {
  subagentId: string
  policyId: string
  priority: number
  enabled: boolean
}

export interface FlattenedAssignedPolicyRule {
  policyId: string
  policyName: string
  commandPattern: string
  status: PermissionStatus
  type: PermissionType
  sortOrder: number
}

export class PermissionPolicyError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "PermissionPolicyError"
    this.status = status
  }
}

const ALLOWED_PERMISSION_TYPES: PermissionType[] = ["bash_command", "tool_command"]
const ALLOWED_PERMISSION_STATUSES: PermissionStatus[] = ["allow", "ask", "deny"]
const DEFAULT_PERSONAL_POLICY_SLUG = "safe-core"
const DEFAULT_PERSONAL_POLICY_PRIORITY = 100

let ensureSystemPermissionPoliciesPromise: Promise<void> | null = null

function isPermissionType(value: unknown): value is PermissionType {
  return typeof value === "string" && ALLOWED_PERMISSION_TYPES.includes(value as PermissionType)
}

function isPermissionStatus(value: unknown): value is PermissionStatus {
  return typeof value === "string" && ALLOWED_PERMISSION_STATUSES.includes(value as PermissionStatus)
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback
  }
  return Math.trunc(value)
}

function normalizePolicyName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PermissionPolicyError("name is required")
  }
  return value.trim()
}

function normalizePolicyDescription(value: unknown): string | null {
  if (value === undefined) {
    return null
  }
  if (value === null) {
    return null
  }
  if (typeof value !== "string") {
    throw new PermissionPolicyError("description must be a string or null")
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOwnerUserId(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== "string") {
    throw new PermissionPolicyError("ownerUserId must be a string or null")
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeProvidedSlug(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value !== "string") {
    throw new PermissionPolicyError("slug must be a string")
  }
  const normalized = slugify(value)
  if (!normalized) {
    throw new PermissionPolicyError("slug is invalid")
  }
  return normalized
}

function normalizeRuleInput(value: unknown, index: number): PolicyPresetRule {
  if (!value || typeof value !== "object") {
    throw new PermissionPolicyError("rules entries must be objects")
  }

  const input = value as Record<string, unknown>
  const commandPattern =
    typeof input.commandPattern === "string" ? input.commandPattern.trim() : ""

  if (!commandPattern) {
    throw new PermissionPolicyError("rules entries must include commandPattern")
  }

  if (!isPermissionType(input.type)) {
    throw new PermissionPolicyError("rules entries must include a valid type")
  }

  if (!isPermissionStatus(input.status)) {
    throw new PermissionPolicyError("rules entries must include a valid status")
  }

  return {
    commandPattern,
    type: input.type,
    status: input.status,
    sortOrder: toInt(input.sortOrder, (index + 1) * 10),
  }
}

function normalizeRulesInput(value: unknown): PolicyPresetRule[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PermissionPolicyError("rules is required and must contain at least one rule")
  }

  const rules = value.map((entry, index) => normalizeRuleInput(entry, index))
  return rules
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((rule, index) => ({
      ...rule,
      sortOrder: rule.sortOrder === undefined ? (index + 1) * 10 : rule.sortOrder,
    }))
}

function comparableRules(rules: Array<Pick<PolicyPresetRule, "commandPattern" | "type" | "status" | "sortOrder">>): string {
  return JSON.stringify(
    [...rules]
      .map((rule) => ({
        commandPattern: rule.commandPattern,
        type: rule.type,
        status: rule.status,
        sortOrder: toInt(rule.sortOrder, 0),
      }))
      .sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) {
          return left.sortOrder - right.sortOrder
        }
        if (left.commandPattern !== right.commandPattern) {
          return left.commandPattern.localeCompare(right.commandPattern)
        }
        if (left.type !== right.type) {
          return left.type.localeCompare(right.type)
        }
        return left.status.localeCompare(right.status)
      }),
  )
}

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let candidate = baseSlug
  let suffix = 2

  while (true) {
    const existing = await prisma.permissionPolicy.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing) {
      return candidate
    }
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }
}

function toPolicyRuleCreateData(policyId: string, rules: PolicyPresetRule[]): Prisma.PermissionPolicyRuleCreateManyInput[] {
  return rules.map((rule, index) => ({
    policyId,
    commandPattern: rule.commandPattern,
    type: rule.type,
    status: rule.status,
    sortOrder: toInt(rule.sortOrder, (index + 1) * 10),
  }))
}

function mapPolicyWithRules<T extends PermissionPolicy & { rules: PermissionPolicyRule[] }>(policy: T): PermissionPolicyWithRules {
  return {
    ...policy,
    rules: [...policy.rules].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }
      return left.createdAt.getTime() - right.createdAt.getTime()
    }),
  }
}

async function upsertSystemPolicyInTransaction(tx: Prisma.TransactionClient, preset: PermissionPolicyPreset) {
  const existing = await tx.permissionPolicy.findUnique({
    where: { slug: preset.slug },
    include: {
      rules: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  })

  if (!existing) {
    await tx.permissionPolicy.create({
      data: {
        slug: preset.slug,
        name: preset.name,
        description: preset.description,
        isSystem: true,
        rules: {
          createMany: {
            data: toPolicyRuleCreateData("", preset.rules).map((rule) => ({
              commandPattern: rule.commandPattern,
              type: rule.type,
              status: rule.status,
              sortOrder: rule.sortOrder,
            })),
          },
        },
      },
    })
    return
  }

  const metadataChanged =
    existing.name !== preset.name
    || existing.description !== preset.description
    || existing.isSystem !== true

  if (metadataChanged) {
    await tx.permissionPolicy.update({
      where: { id: existing.id },
      data: {
        name: preset.name,
        description: preset.description,
        isSystem: true,
      },
    })
  }

  const existingComparable = comparableRules(existing.rules)
  const presetComparable = comparableRules(preset.rules)
  if (existingComparable === presetComparable) {
    return
  }

  await tx.permissionPolicyRule.deleteMany({ where: { policyId: existing.id } })
  await tx.permissionPolicyRule.createMany({
    data: toPolicyRuleCreateData(existing.id, preset.rules),
  })
}

export async function ensureSystemPermissionPolicies(): Promise<void> {
  if (!ensureSystemPermissionPoliciesPromise) {
    ensureSystemPermissionPoliciesPromise = prisma.$transaction(async (tx) => {
      for (const preset of SYSTEM_PERMISSION_POLICY_PRESETS) {
        await upsertSystemPolicyInTransaction(tx, preset)
      }
    }).finally(() => {
      ensureSystemPermissionPoliciesPromise = null
    })
  }

  await ensureSystemPermissionPoliciesPromise
}

export async function ensureDefaultPolicyAssignmentForSubagent(args: {
  subagentId: string
  isShared: boolean
}): Promise<boolean> {
  if (args.isShared) {
    return false
  }

  await ensureSystemPermissionPolicies()

  const safeCorePolicy = await prisma.permissionPolicy.findUnique({
    where: { slug: DEFAULT_PERSONAL_POLICY_SLUG },
    select: { id: true },
  })

  if (!safeCorePolicy) {
    throw new PermissionPolicyError(
      `Default system policy not found: ${DEFAULT_PERSONAL_POLICY_SLUG}`,
      500,
    )
  }

  return prisma.$transaction(async (tx) => {
    const existingCount = await tx.subagentPermissionPolicy.count({
      where: {
        subagentId: args.subagentId,
      },
    })

    if (existingCount > 0) {
      return false
    }

    const created = await tx.subagentPermissionPolicy.createMany({
      data: [
        {
          subagentId: args.subagentId,
          policyId: safeCorePolicy.id,
          priority: DEFAULT_PERSONAL_POLICY_PRIORITY,
          enabled: true,
        },
      ],
      skipDuplicates: true,
    })

    return created.count > 0
  })
}

export async function listPermissionPolicies(): Promise<PermissionPolicyWithRulesAndCounts[]> {
  await ensureSystemPermissionPolicies()

  const policies = await prisma.permissionPolicy.findMany({
    include: {
      rules: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
      _count: {
        select: {
          assignments: true,
        },
      },
    },
    orderBy: [
      { isSystem: "desc" },
      { name: "asc" },
    ],
  })

  return policies.map((policy) => ({
    ...mapPolicyWithRules(policy),
    _count: policy._count,
  }))
}

export async function getPermissionPolicyById(id: string): Promise<PermissionPolicyWithRules | null> {
  await ensureSystemPermissionPolicies()

  const policy = await prisma.permissionPolicy.findUnique({
    where: { id },
    include: {
      rules: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  })

  if (!policy) {
    return null
  }

  return mapPolicyWithRules(policy)
}

export async function createCustomPermissionPolicy(input: PermissionPolicyCreateInput): Promise<PermissionPolicyWithRules> {
  await ensureSystemPermissionPolicies()

  const name = normalizePolicyName(input.name)
  const description = normalizePolicyDescription(input.description)
  const rules = normalizeRulesInput(input.rules)
  const requestedSlug = normalizeProvidedSlug(input.slug)
  const ownerUserId = normalizeOwnerUserId(input.ownerUserId)

  let slug = requestedSlug || slugify(name)
  if (!slug) {
    slug = "policy"
  }

  if (requestedSlug) {
    const existing = await prisma.permissionPolicy.findUnique({ where: { slug } })
    if (existing) {
      throw new PermissionPolicyError(`Policy slug already exists: ${slug}`, 409)
    }
  } else {
    slug = await ensureUniqueSlug(slug)
  }

  const created = await prisma.permissionPolicy.create({
    data: {
      slug,
      name,
      description,
      isSystem: false,
      ownerUserId,
      rules: {
        createMany: {
          data: toPolicyRuleCreateData("", rules).map((rule) => ({
            commandPattern: rule.commandPattern,
            type: rule.type,
            status: rule.status,
            sortOrder: rule.sortOrder,
          })),
        },
      },
    },
    include: {
      rules: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  })

  return mapPolicyWithRules(created)
}

export async function updateCustomPermissionPolicy(
  id: string,
  input: PermissionPolicyUpdateInput,
): Promise<PermissionPolicyWithRules> {
  await ensureSystemPermissionPolicies()

  const existing = await prisma.permissionPolicy.findUnique({
    where: { id },
    include: {
      rules: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },
    },
  })

  if (!existing) {
    throw new PermissionPolicyError("Permission policy not found", 404)
  }

  if (existing.isSystem) {
    throw new PermissionPolicyError("System policies are immutable", 403)
  }

  const hasAnyUpdate =
    input.name !== undefined
    || input.description !== undefined
    || input.slug !== undefined
    || input.rules !== undefined

  if (!hasAnyUpdate) {
    throw new PermissionPolicyError("No update fields provided")
  }

  const data: Prisma.PermissionPolicyUpdateInput = {}
  if (input.name !== undefined) {
    data.name = normalizePolicyName(input.name)
  }
  if (input.description !== undefined) {
    data.description = normalizePolicyDescription(input.description)
  }

  if (input.slug !== undefined) {
    const nextSlug = normalizeProvidedSlug(input.slug)
    if (!nextSlug) {
      throw new PermissionPolicyError("slug cannot be empty")
    }

    const conflicting = await prisma.permissionPolicy.findUnique({
      where: { slug: nextSlug },
      select: { id: true },
    })

    if (conflicting && conflicting.id !== existing.id) {
      throw new PermissionPolicyError(`Policy slug already exists: ${nextSlug}`, 409)
    }

    data.slug = nextSlug
  }

  const normalizedRules = input.rules !== undefined ? normalizeRulesInput(input.rules) : null

  const updated = await prisma.$transaction(async (tx) => {
    if (Object.keys(data).length > 0) {
      await tx.permissionPolicy.update({
        where: { id },
        data,
      })
    }

    if (normalizedRules) {
      await tx.permissionPolicyRule.deleteMany({ where: { policyId: id } })
      await tx.permissionPolicyRule.createMany({
        data: toPolicyRuleCreateData(id, normalizedRules),
      })
    }

    return tx.permissionPolicy.findUnique({
      where: { id },
      include: {
        rules: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },
      },
    })
  })

  if (!updated) {
    throw new PermissionPolicyError("Permission policy not found", 404)
  }

  return mapPolicyWithRules(updated)
}

export async function deleteCustomPermissionPolicy(id: string): Promise<void> {
  await ensureSystemPermissionPolicies()

  const existing = await prisma.permissionPolicy.findUnique({
    where: { id },
    select: {
      id: true,
      isSystem: true,
    },
  })

  if (!existing) {
    throw new PermissionPolicyError("Permission policy not found", 404)
  }

  if (existing.isSystem) {
    throw new PermissionPolicyError("System policies are immutable", 403)
  }

  await prisma.permissionPolicy.delete({
    where: { id },
  })
}

function normalizeAssignmentInput(value: unknown): SubagentPolicyAssignmentInput[] {
  if (!Array.isArray(value)) {
    throw new PermissionPolicyError("assignments must be an array")
  }

  const map = new Map<string, SubagentPolicyAssignmentInput>()
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      throw new PermissionPolicyError("assignments entries must be objects")
    }

    const input = entry as Record<string, unknown>
    const policyId = typeof input.policyId === "string" ? input.policyId.trim() : ""
    if (!policyId) {
      throw new PermissionPolicyError("assignments entries must include policyId")
    }

    const priority = toInt(input.priority, 100)
    const enabled = typeof input.enabled === "boolean" ? input.enabled : true

    map.set(policyId, {
      policyId,
      priority,
      enabled,
    })
  }

  return [...map.values()].sort((left, right) => {
    const leftPriority = left.priority ?? 100
    const rightPriority = right.priority ?? 100
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority
    }
    return left.policyId.localeCompare(right.policyId)
  })
}

function normalizeSubagentIdsInput(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new PermissionPolicyError("subagentIds must be an array")
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new PermissionPolicyError("subagentIds entries must be strings")
    }

    const subagentId = entry.trim()
    if (!subagentId) {
      throw new PermissionPolicyError("subagentIds entries must be non-empty strings")
    }

    if (!seen.has(subagentId)) {
      seen.add(subagentId)
      normalized.push(subagentId)
    }
  }

  return normalized
}

export async function listSubagentPermissionPolicyAssignments(
  subagentId: string,
): Promise<SubagentPolicyAssignmentWithPolicy[]> {
  await ensureSystemPermissionPolicies()

  const assignments = await prisma.subagentPermissionPolicy.findMany({
    where: { subagentId },
    include: {
      policy: {
        include: {
          rules: {
            orderBy: [
              { sortOrder: "asc" },
              { createdAt: "asc" },
            ],
          },
        },
      },
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  })

  return assignments.map((assignment) => ({
    ...assignment,
    policy: mapPolicyWithRules(assignment.policy),
  }))
}

export async function replaceSubagentPermissionPolicyAssignments(args: {
  subagentId: string
  assignments: unknown
}): Promise<SubagentPolicyAssignmentWithPolicy[]> {
  await ensureSystemPermissionPolicies()

  const normalizedAssignments = normalizeAssignmentInput(args.assignments)

  const policyIds = normalizedAssignments.map((entry) => entry.policyId)
  if (policyIds.length > 0) {
    const existingPolicies = await prisma.permissionPolicy.findMany({
      where: {
        id: {
          in: policyIds,
        },
      },
      select: {
        id: true,
      },
    })

    const existingSet = new Set(existingPolicies.map((policy) => policy.id))
    const missing = policyIds.filter((id) => !existingSet.has(id))
    if (missing.length > 0) {
      throw new PermissionPolicyError(`Unknown policyId values: ${missing.join(", ")}`)
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.subagentPermissionPolicy.deleteMany({
      where: {
        subagentId: args.subagentId,
      },
    })

    if (normalizedAssignments.length > 0) {
      await tx.subagentPermissionPolicy.createMany({
        data: normalizedAssignments.map((assignment) => ({
          subagentId: args.subagentId,
          policyId: assignment.policyId,
          priority: assignment.priority ?? 100,
          enabled: assignment.enabled ?? true,
        })),
      })
    }
  })

  return listSubagentPermissionPolicyAssignments(args.subagentId)
}

export async function listPolicySubagentAssignmentsForOwner(args: {
  policyId: string
  ownerUserId: string
}): Promise<PolicySubagentAssignment[]> {
  await ensureSystemPermissionPolicies()

  const assignments = await prisma.subagentPermissionPolicy.findMany({
    where: {
      policyId: args.policyId,
      subagent: {
        ownerUserId: args.ownerUserId,
        isShared: false,
      },
    },
    select: {
      subagentId: true,
      policyId: true,
      priority: true,
      enabled: true,
      createdAt: true,
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  })

  return assignments.map((assignment) => ({
    subagentId: assignment.subagentId,
    policyId: assignment.policyId,
    priority: assignment.priority,
    enabled: assignment.enabled,
  }))
}

export async function replacePolicySubagentAssignmentsForOwner(args: {
  policyId: string
  ownerUserId: string
  subagentIds: unknown
}): Promise<PolicySubagentAssignment[]> {
  await ensureSystemPermissionPolicies()

  const selectedSubagentIds = normalizeSubagentIdsInput(args.subagentIds)
  const selectedSet = new Set(selectedSubagentIds)

  const ownedSubagents = await prisma.subagent.findMany({
    where: {
      ownerUserId: args.ownerUserId,
      isShared: false,
    },
    select: {
      id: true,
    },
  })
  const ownedSubagentIds = ownedSubagents.map((subagent) => subagent.id)
  const ownedSet = new Set(ownedSubagentIds)

  for (const subagentId of selectedSubagentIds) {
    if (!ownedSet.has(subagentId)) {
      throw new PermissionPolicyError(`subagentId not found: ${subagentId}`, 404)
    }
  }

  const existingAssignments =
    ownedSubagentIds.length > 0
      ? await prisma.subagentPermissionPolicy.findMany({
          where: {
            policyId: args.policyId,
            subagentId: {
              in: ownedSubagentIds,
            },
          },
          select: {
            subagentId: true,
            priority: true,
            enabled: true,
          },
        })
      : []

  const existingBySubagentId = new Map(
    existingAssignments.map((assignment) => [assignment.subagentId, assignment]),
  )

  const subagentIdsToDelete = existingAssignments
    .filter((assignment) => !selectedSet.has(assignment.subagentId))
    .map((assignment) => assignment.subagentId)

  const subagentIdsToCreate = selectedSubagentIds.filter(
    (subagentId) => !existingBySubagentId.has(subagentId),
  )

  const subagentIdsToEnable = selectedSubagentIds.filter((subagentId) => {
    const existing = existingBySubagentId.get(subagentId)
    return Boolean(existing && !existing.enabled)
  })

  await prisma.$transaction(async (tx) => {
    if (subagentIdsToDelete.length > 0) {
      await tx.subagentPermissionPolicy.deleteMany({
        where: {
          policyId: args.policyId,
          subagentId: {
            in: subagentIdsToDelete,
          },
        },
      })
    }

    if (subagentIdsToCreate.length > 0) {
      await tx.subagentPermissionPolicy.createMany({
        data: subagentIdsToCreate.map((subagentId) => ({
          subagentId,
          policyId: args.policyId,
          priority: DEFAULT_PERSONAL_POLICY_PRIORITY,
          enabled: true,
        })),
      })
    }

    if (subagentIdsToEnable.length > 0) {
      await tx.subagentPermissionPolicy.updateMany({
        where: {
          policyId: args.policyId,
          subagentId: {
            in: subagentIdsToEnable,
          },
          enabled: false,
        },
        data: {
          enabled: true,
        },
      })
    }
  })

  return listPolicySubagentAssignmentsForOwner({
    policyId: args.policyId,
    ownerUserId: args.ownerUserId,
  })
}

export async function loadAssignedPolicyRulesForSubagent(args: {
  subagentId: string
  type: PermissionType
}): Promise<FlattenedAssignedPolicyRule[]> {
  const assignments = await prisma.subagentPermissionPolicy.findMany({
    where: {
      subagentId: args.subagentId,
      enabled: true,
    },
    include: {
      policy: {
        select: {
          id: true,
          name: true,
          rules: {
            where: {
              type: args.type,
            },
            orderBy: [
              { sortOrder: "asc" },
              { createdAt: "asc" },
            ],
          },
        },
      },
    },
    orderBy: [
      { priority: "asc" },
      { createdAt: "asc" },
    ],
  })

  const flattened: FlattenedAssignedPolicyRule[] = []

  for (const assignment of assignments) {
    for (const rule of assignment.policy.rules) {
      flattened.push({
        policyId: assignment.policy.id,
        policyName: assignment.policy.name,
        commandPattern: rule.commandPattern,
        status: rule.status,
        type: rule.type,
        sortOrder: rule.sortOrder,
      })
    }
  }

  return flattened
}
