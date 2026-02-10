import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createPRComment } from "@/lib/github"
import { publishRealtimeEvent } from "@/lib/realtime/events"
import { publishNotificationUpdatedMany } from "@/lib/realtime/notifications"
import { Prisma } from "@prisma/client"

export const dynamic = 'force-dynamic'

function verifyWebhookSignature(secret: string, body: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) {
    return false
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`

  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signatureHeader)
  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

function mentionsClaude(payload: Record<string, any>): boolean {
  const commentBody = payload?.comment?.body
  const pullRequestBody = payload?.pull_request?.body
  return (
    (typeof commentBody === "string" && commentBody.includes("@claude")) ||
    (typeof pullRequestBody === "string" && pullRequestBody.includes("@claude"))
  )
}

function buildWebhookSummary(payload: Record<string, any>): string {
  const action = payload?.action || "unknown"
  const prNumber = payload?.pull_request?.number
  const repository = payload?.repository?.full_name || "unknown"
  const comment = typeof payload?.comment?.body === "string" ? payload.comment.body : ""

  return [
    `GitHub webhook action: ${action}`,
    `Repository: ${repository}`,
    prNumber ? `PR: #${prNumber}` : null,
    comment ? `Comment: ${comment}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

async function persistGuidanceWebhookRevision(summary: string) {
  const latestDocument = await prisma.claudeDocument.findFirst({
    orderBy: {
      version: "desc",
    },
    include: {
      guidanceEntries: {
        where: {
          status: "active",
        },
      },
    },
  })

  if (!latestDocument) {
    return null
  }

  let guidanceEntry = latestDocument.guidanceEntries[0]
  if (!guidanceEntry) {
    guidanceEntry = await prisma.guidanceEntry.create({
      data: {
        documentId: latestDocument.id,
        content: "GitHub webhook guidance",
        category: "github-webhook",
        status: "active",
      },
    })
  }

  return prisma.guidanceRevision.create({
    data: {
      guidanceEntryId: guidanceEntry.id,
      oldContent: guidanceEntry.content,
      newContent: summary,
      diff: summary,
      botResponse: summary,
      timestamp: new Date(),
    },
  })
}

async function notifyGithubPrsUsers(entityId: string) {
  const accounts = await prisma.account.findMany({
    where: {
      providerId: "github",
    },
    select: {
      userId: true,
    },
  })

  publishNotificationUpdatedMany({
    userIds: accounts.map((account) => account.userId),
    channel: "github-prs",
    entityId,
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const eventType = request.headers.get("x-github-event") || "unknown"
  const signature = request.headers.get("x-hub-signature-256")
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  if (secret && !verifyWebhookSignature(secret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 })
  }

  let payload: Record<string, any>
  try {
    payload = JSON.parse(rawBody)
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 })
  }

  const webhookEvent = await prisma.gitHubWebhookEvent.create({
    data: {
      eventType,
      action: typeof payload?.action === "string" ? payload.action : null,
      repository: payload?.repository?.full_name || null,
      pullRequestNumber: payload?.pull_request?.number || null,
      commentId: payload?.comment?.id || null,
      commentBody: typeof payload?.comment?.body === "string" ? payload.comment.body : null,
      payload: payload as Prisma.InputJsonValue,
      status: "received",
    },
  })

  let status = "ignored"
  let responseBody: Record<string, unknown> = { received: true }
  let errorMessage: string | null = null

  try {
    if (mentionsClaude(payload)) {
      const summary = buildWebhookSummary(payload)
      await persistGuidanceWebhookRevision(summary)

      const shouldPostComment = process.env.ENABLE_GITHUB_WEBHOOK_COMMENTS === "true"
      const owner = payload?.repository?.owner?.login
      const repo = payload?.repository?.name
      const prNumber = payload?.pull_request?.number

      if (
        shouldPostComment &&
        typeof owner === "string" &&
        typeof repo === "string" &&
        typeof prNumber === "number" &&
        process.env.GITHUB_TOKEN
      ) {
        const comment = await createPRComment(
          owner,
          repo,
          prNumber,
          "Webhook received and persisted by OrchWiz. Guidance revisions have been updated.",
          process.env.GITHUB_TOKEN
        )

        responseBody = {
          ...responseBody,
          commentId: comment.id,
          commented: true,
        }
      }

      status = "processed"
    }

    await prisma.gitHubWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status,
        responseBody: responseBody as Prisma.InputJsonValue,
        processedAt: new Date(),
      },
    })

    publishRealtimeEvent({
      type: "webhook.received",
      payload: {
        eventId: webhookEvent.id,
        eventType,
        status,
        repository: payload?.repository?.full_name || null,
      },
    })

    await notifyGithubPrsUsers(webhookEvent.id)

    return NextResponse.json(responseBody)
  } catch (error) {
    errorMessage = (error as Error).message
    await prisma.gitHubWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "failed",
        error: errorMessage,
        processedAt: new Date(),
      },
    })

    console.error("Error processing GitHub webhook:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
