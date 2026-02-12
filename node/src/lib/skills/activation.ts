import { prisma } from "@/lib/prisma"
import {
  assertOwnerOrXo,
  resolveGovernanceActorContext,
  actingIdentityMetadata,
} from "@/lib/governance/chain-of-command"
import {
  createGovernanceGrantEvent,
  createGovernanceSecurityReportRecord,
} from "@/lib/governance/events"
import { writeGovernanceSecurityReport } from "@/lib/governance/reports"

export class SkillActivationError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = "SkillActivationError"
    this.status = status
  }
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function decideSkillCatalogActivationForOwner(args: {
  ownerUserId: string
  catalogEntryId: string
  decision: "approve" | "deny"
  rationale: string
  actingBridgeCrewId?: string | null
  reviewedByUserId: string
}) {
  const rationale = asNonEmptyString(args.rationale)
  if (!rationale) {
    throw new SkillActivationError("rationale is required", 400)
  }

  const context = await resolveGovernanceActorContext({
    ownerUserId: args.ownerUserId,
    actingBridgeCrewId: args.actingBridgeCrewId,
  })

  assertOwnerOrXo({
    context,
    action: "Skill activation approvals",
  })

  const entry = await prisma.skillCatalogEntry.findFirst({
    where: {
      id: args.catalogEntryId,
      ownerUserId: args.ownerUserId,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      source: true,
      activationStatus: true,
    },
  })

  if (!entry) {
    throw new SkillActivationError("Skill catalog entry not found", 404)
  }

  const approved = args.decision === "approve"
  const eventType = approved ? "skill_activation_approved" : "skill_activation_denied"

  const reportArtifact = approved
    ? await writeGovernanceSecurityReport({
        ownerUserId: args.ownerUserId,
        eventType,
        rationale,
        actor: {
          userId: args.reviewedByUserId,
          actingBridgeCrewId: context.actingBridgeCrewId,
          actingBridgeCrewRole: context.actingBridgeCrewRole,
          actingBridgeCrewCallsign: context.actingBridgeCrewCallsign,
        },
        resource: {
          catalogEntryId: entry.id,
          slug: entry.slug,
          name: entry.name,
          source: entry.source,
          previousActivationStatus: entry.activationStatus,
        },
        metadata: {
          decision: args.decision,
          ...actingIdentityMetadata(context),
        },
      })
    : null

  const result = await prisma.$transaction(async (tx) => {
    let reportRecordId: string | null = null

    if (reportArtifact) {
      const reportRecord = await createGovernanceSecurityReportRecord({
        ownerUserId: args.ownerUserId,
        eventType,
        rationale,
        reportPathMd: reportArtifact.reportPathMd || "",
        reportPathJson: reportArtifact.reportPathJson || "",
        createdByUserId: args.reviewedByUserId,
        createdByBridgeCrewId: context.actingBridgeCrewId,
        tx,
      })
      reportRecordId = reportRecord.id
    }

    const updated = await tx.skillCatalogEntry.update({
      where: {
        id: entry.id,
      },
      data: {
        activationStatus: approved ? "approved" : "denied",
        activationRationale: rationale,
        activatedAt: new Date(),
        activatedByUserId: args.reviewedByUserId,
        activatedByBridgeCrewId: context.actingBridgeCrewId,
        activationSecurityReportId: reportRecordId,
      },
    })

    await createGovernanceGrantEvent({
      ownerUserId: args.ownerUserId,
      createdByUserId: args.reviewedByUserId,
      eventType,
      skillCatalogEntryId: entry.id,
      actorBridgeCrewId: context.actingBridgeCrewId,
      securityReportId: reportRecordId,
      rationale,
      metadata: {
        decision: args.decision,
        ...actingIdentityMetadata(context),
      },
      tx,
    })

    return updated
  })

  return result
}
