-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('captain', 'admin');

-- CreateEnum
CREATE TYPE "SecurityIncidentStatus" AS ENUM ('open', 'investigating', 'contained', 'eradicated', 'recovered', 'closed');

-- CreateEnum
CREATE TYPE "SecurityIncidentSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('planning', 'executing', 'completed', 'paused', 'failed');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('plan', 'auto_accept');

-- CreateEnum
CREATE TYPE "SessionSource" AS ENUM ('local', 'web', 'ios', 'terminal_handoff');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('user_input', 'ai_response', 'tool_use', 'error');

-- CreateEnum
CREATE TYPE "BridgeChatRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "BridgeMirrorDirection" AS ENUM ('thread_to_session', 'session_to_thread');

-- CreateEnum
CREATE TYPE "BridgeMirrorJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "BridgeAgentChatRoomType" AS ENUM ('dm', 'group');

-- CreateEnum
CREATE TYPE "BridgeAgentChatMessageKind" AS ENUM ('agent', 'system');

-- CreateEnum
CREATE TYPE "BridgeAgentChatReplyJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "MotionSupervisionMode" AS ENUM ('observation', 'production', 'off');

-- CreateEnum
CREATE TYPE "MotionStrictness" AS ENUM ('lenient', 'standard', 'strict');

-- CreateEnum
CREATE TYPE "MotionFailMode" AS ENUM ('fail_open_alert', 'fail_closed', 'fail_open_silent');

-- CreateEnum
CREATE TYPE "MotionEntityType" AS ENUM ('user', 'subagent', 'ship_subagent', 'ship_station');

-- CreateEnum
CREATE TYPE "MotionEventType" AS ENUM ('runtime_prompt', 'command_execution');

-- CreateEnum
CREATE TYPE "MotionDecision" AS ENUM ('allow', 'warn', 'block');

-- CreateEnum
CREATE TYPE "BridgeCallRoundSource" AS ENUM ('operator', 'system');

-- CreateEnum
CREATE TYPE "BridgeCallRoundStatus" AS ENUM ('pending', 'running', 'completed', 'partial', 'failed');

-- CreateEnum
CREATE TYPE "BridgeCallOfficerResultStatus" AS ENUM ('success', 'offline', 'failed');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "SubagentType" AS ENUM ('general', 'bridge_crew', 'exocomp');

-- CreateEnum
CREATE TYPE "AgentSyncTrigger" AS ENUM ('manual', 'nightly');

-- CreateEnum
CREATE TYPE "AgentSyncScope" AS ENUM ('selected_agent', 'bridge_crew');

-- CreateEnum
CREATE TYPE "AgentSyncRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AgentSyncSignalSource" AS ENUM ('command', 'verification', 'bridge_call');

-- CreateEnum
CREATE TYPE "AgentSyncSuggestionRisk" AS ENUM ('low', 'high');

-- CreateEnum
CREATE TYPE "AgentSyncSuggestionStatus" AS ENUM ('proposed', 'applied', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "AgentSyncFileSyncStatus" AS ENUM ('synced', 'filesystem_sync_failed', 'skipped');

-- CreateEnum
CREATE TYPE "GuidanceStatus" AS ENUM ('active', 'deprecated');

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('bash_command', 'tool_command');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('allow', 'ask', 'deny');

-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM ('global', 'workspace', 'user', 'subagent');

-- CreateEnum
CREATE TYPE "SkillCatalogSource" AS ENUM ('curated', 'experimental', 'custom_github', 'local', 'system');

-- CreateEnum
CREATE TYPE "SkillImportStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ToolCatalogSource" AS ENUM ('curated', 'custom_github', 'local', 'system');

-- CreateEnum
CREATE TYPE "RuntimeAdapterProtocol" AS ENUM ('internal', 'webhook', 'openai_compat', 'mcp_sse', 'mcp_stdio', 'cli_exec');

-- CreateEnum
CREATE TYPE "RuntimeAdapterBindingScope" AS ENUM ('global', 'profile', 'user', 'deployment', 'subagent');

-- CreateEnum
CREATE TYPE "ToolImportStatus" AS ENUM ('running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ShipToolGrantScope" AS ENUM ('ship', 'bridge_crew');

-- CreateEnum
CREATE TYPE "ShipToolAccessRequestStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "ShipToolRequestScopePreference" AS ENUM ('requester_only', 'ship');

-- CreateEnum
CREATE TYPE "CatalogActivationStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateEnum
CREATE TYPE "GovernanceEventType" AS ENUM ('ship_tool_grant_approved', 'ship_tool_grant_revoked', 'subagent_tool_granted', 'subagent_tool_revoked', 'tool_activation_approved', 'tool_activation_denied', 'runtime_activation_approved', 'runtime_activation_denied', 'skill_activation_approved', 'skill_activation_denied');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('slack', 'bigquery', 'sentry', 'other');

-- CreateEnum
CREATE TYPE "HookType" AS ENUM ('command', 'script', 'webhook');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('running', 'completed', 'failed', 'thinking');

-- CreateEnum
CREATE TYPE "TaskStrategy" AS ENUM ('background_agent', 'stop_hook', 'plugin');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('browser', 'bash', 'test_suite', 'app_test');

-- CreateEnum
CREATE TYPE "VaultRagScopeType" AS ENUM ('ship', 'fleet', 'global');

-- CreateEnum
CREATE TYPE "VaultRagSyncScope" AS ENUM ('ship', 'fleet', 'all');

-- CreateEnum
CREATE TYPE "VaultRagSyncTrigger" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "VaultRagSyncStatus" AS ENUM ('running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "DeploymentType" AS ENUM ('agent', 'ship');

-- CreateEnum
CREATE TYPE "DeploymentProfile" AS ENUM ('local_starship_build', 'lightweight_shuttle', 'cloud_shipyard');

-- CreateEnum
CREATE TYPE "CloudProvider" AS ENUM ('hetzner');

-- CreateEnum
CREATE TYPE "ShipyardBillingCurrency" AS ENUM ('eur');

-- CreateEnum
CREATE TYPE "ShipyardBillingTopupStatus" AS ENUM ('pending', 'completed', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "ShipyardBillingLedgerType" AS ENUM ('topup_credit', 'launch_debit', 'launch_refund', 'manual_adjustment');

-- CreateEnum
CREATE TYPE "ShipyardTunnelStatus" AS ENUM ('stopped', 'starting', 'running', 'failed');

-- CreateEnum
CREATE TYPE "ProvisioningMode" AS ENUM ('terraform_ansible', 'terraform_only', 'ansible_only');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('local', 'cloud', 'hybrid');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('pending', 'deploying', 'active', 'inactive', 'failed', 'updating');

-- CreateEnum
CREATE TYPE "BridgeCrewRole" AS ENUM ('xo', 'ops', 'eng', 'sec', 'med', 'cou');

-- CreateEnum
CREATE TYPE "BridgeCrewStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "BridgeConnectionProvider" AS ENUM ('telegram', 'discord', 'whatsapp');

-- CreateEnum
CREATE TYPE "BridgeDispatchSource" AS ENUM ('cou_auto', 'manual', 'test');

-- CreateEnum
CREATE TYPE "BridgeDispatchStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('docker', 'nodejs', 'python', 'static', 'n8n', 'custom');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('ai_agent', 'automation', 'tool', 'library', 'application', 'other');

-- CreateEnum
CREATE TYPE "NewsletterSubscriptionStatus" AS ENUM ('subscribed', 'unsubscribed');

-- CreateEnum
CREATE TYPE "ForwardingEventType" AS ENUM ('session', 'task', 'command_execution', 'verification', 'action', 'deployment', 'application', 'bridge_station', 'system_status');

-- CreateEnum
CREATE TYPE "ForwardingEventStatus" AS ENUM ('received', 'projected', 'duplicate', 'rejected');

-- CreateEnum
CREATE TYPE "ForwardingTargetStatus" AS ENUM ('active', 'paused', 'failed');

-- CreateEnum
CREATE TYPE "TreasuryBackend" AS ENUM ('mesh_multisig');

-- CreateEnum
CREATE TYPE "TreasuryNetwork" AS ENUM ('preview', 'preprod', 'mainnet');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "githubId" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'captain',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "aaguid" TEXT,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "prompt" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'planning',
    "mode" "SessionMode" NOT NULL DEFAULT 'plan',
    "source" "SessionSource" NOT NULL DEFAULT 'web',
    "projectName" TEXT,
    "branch" TEXT,
    "environment" TEXT,
    "userId" TEXT NOT NULL,
    "parentSessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionInteraction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeThread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "userId" TEXT,
    "stationKey" "BridgeCrewRole",
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIncident" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'open',
    "severity" "SecurityIncidentSeverity" NOT NULL DEFAULT 'medium',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "caseFile" JSONB NOT NULL,
    "sessionId" TEXT,
    "mispEventId" TEXT,
    "mispPushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityIntegrationSecrets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stored" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityIntegrationSecrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityLockdownConfig" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityLockdownConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotionSupervisionConfig" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "mode" "MotionSupervisionMode" NOT NULL DEFAULT 'observation',
    "strictness" "MotionStrictness" NOT NULL DEFAULT 'strict',
    "failMode" "MotionFailMode" NOT NULL DEFAULT 'fail_open_alert',
    "baselineMinSamples" INTEGER NOT NULL DEFAULT 10,
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotionSupervisionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotionBaseline" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "entityType" "MotionEntityType" NOT NULL,
    "entityKey" TEXT NOT NULL,
    "shipDeploymentId" TEXT,
    "subagentId" TEXT,
    "stationKey" "BridgeCrewRole",
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "promptCharsMean" DOUBLE PRECISION,
    "promptCharsM2" DOUBLE PRECISION,
    "promptCharsCount" INTEGER NOT NULL DEFAULT 0,
    "outputCharsMean" DOUBLE PRECISION,
    "outputCharsM2" DOUBLE PRECISION,
    "outputCharsCount" INTEGER NOT NULL DEFAULT 0,
    "durationMsMean" DOUBLE PRECISION,
    "durationMsM2" DOUBLE PRECISION,
    "durationMsCount" INTEGER NOT NULL DEFAULT 0,
    "inputCentroid" JSONB,
    "inputSimMean" DOUBLE PRECISION,
    "inputSimM2" DOUBLE PRECISION,
    "inputSimCount" INTEGER NOT NULL DEFAULT 0,
    "outputCentroid" JSONB,
    "outputSimMean" DOUBLE PRECISION,
    "outputSimM2" DOUBLE PRECISION,
    "outputSimCount" INTEGER NOT NULL DEFAULT 0,
    "toolBindingSlugCounts" JSONB,
    "skillPolicySlugCounts" JSONB,
    "shipGrantedToolSlugCounts" JSONB,
    "commandUsageCounts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotionBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotionSample" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "baselineId" TEXT,
    "entityType" "MotionEntityType" NOT NULL,
    "entityKey" TEXT NOT NULL,
    "eventType" "MotionEventType" NOT NULL,
    "decision" "MotionDecision" NOT NULL,
    "reasons" JSONB NOT NULL,
    "baselineReady" BOOLEAN NOT NULL DEFAULT false,
    "shipDeploymentId" TEXT,
    "subagentId" TEXT,
    "stationKey" "BridgeCrewRole",
    "bridgeCrewId" TEXT,
    "sessionId" TEXT,
    "interactionId" TEXT,
    "responseInteractionId" TEXT,
    "traceId" TEXT,
    "commandExecutionId" TEXT,
    "incidentId" TEXT,
    "runtimeProfile" TEXT,
    "executionKind" TEXT,
    "provider" TEXT,
    "promptChars" INTEGER,
    "outputChars" INTEGER,
    "durationMs" INTEGER,
    "inputSimilarity" DOUBLE PRECISION,
    "outputSimilarity" DOUBLE PRECISION,
    "toolBindingSlugs" JSONB,
    "skillPolicySlugs" JSONB,
    "shipGrantedToolSlugs" JSONB,
    "shipRequestableToolSlugs" JSONB,
    "commandId" TEXT,
    "commandName" TEXT,
    "commandPath" TEXT,
    "commandCandidates" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotionSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" "BridgeChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeMirrorLink" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeMirrorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeMirrorJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "direction" "BridgeMirrorDirection" NOT NULL,
    "status" "BridgeMirrorJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "threadId" TEXT,
    "sessionId" TEXT,
    "messageId" TEXT,
    "interactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeMirrorJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAgentChatRoom" (
    "id" TEXT NOT NULL,
    "shipDeploymentId" TEXT NOT NULL,
    "roomType" "BridgeAgentChatRoomType" NOT NULL,
    "title" TEXT NOT NULL,
    "dmKey" TEXT,
    "createdByBridgeCrewId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeAgentChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAgentChatMember" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "bridgeCrewId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeAgentChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAgentChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "kind" "BridgeAgentChatMessageKind" NOT NULL DEFAULT 'agent',
    "senderBridgeCrewId" TEXT,
    "content" TEXT NOT NULL,
    "inReplyToMessageId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeAgentChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeAgentChatReplyJob" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "shipDeploymentId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "recipientBridgeCrewId" TEXT NOT NULL,
    "recipientSessionId" TEXT NOT NULL,
    "status" "BridgeAgentChatReplyJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "outputMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BridgeAgentChatReplyJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCallRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shipDeploymentId" TEXT,
    "directive" TEXT NOT NULL,
    "source" "BridgeCallRoundSource" NOT NULL DEFAULT 'operator',
    "status" "BridgeCallRoundStatus" NOT NULL DEFAULT 'pending',
    "leadStationKey" "BridgeCrewRole",
    "summary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BridgeCallRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCallOfficerResult" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "stationKey" "BridgeCrewRole" NOT NULL,
    "callsign" TEXT NOT NULL,
    "status" "BridgeCallOfficerResultStatus" NOT NULL,
    "wasRetried" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "summary" TEXT,
    "threadId" TEXT,
    "sessionId" TEXT,
    "userInteractionId" TEXT,
    "aiInteractionId" TEXT,
    "provider" TEXT,
    "fallbackUsed" BOOLEAN,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BridgeCallOfficerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scriptContent" TEXT NOT NULL,
    "path" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandExecution" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "sessionId" TEXT,
    "subagentId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'running',
    "output" TEXT,
    "error" TEXT,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CommandExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subagent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subagentType" "SubagentType" NOT NULL DEFAULT 'general',
    "description" TEXT,
    "content" TEXT NOT NULL,
    "path" TEXT,
    "settings" JSONB,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subagent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSyncPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "nightlyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nightlyHour" INTEGER NOT NULL DEFAULT 2,
    "lastNightlyRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSyncPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "langfuseCloudUrl" TEXT,
    "langfuseCloudProject" TEXT,
    "langfuseCloudPublicKey" TEXT,
    "langfuseCloudSecretKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSyncSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subagentId" TEXT NOT NULL,
    "source" "AgentSyncSignalSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reward" DOUBLE PRECISION NOT NULL,
    "details" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentSyncSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subagentId" TEXT,
    "trigger" "AgentSyncTrigger" NOT NULL,
    "scope" "AgentSyncScope" NOT NULL,
    "status" "AgentSyncRunStatus" NOT NULL DEFAULT 'pending',
    "summary" TEXT,
    "error" TEXT,
    "fileSyncStatus" "AgentSyncFileSyncStatus" NOT NULL DEFAULT 'skipped',
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSyncSuggestion" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subagentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "risk" "AgentSyncSuggestionRisk" NOT NULL,
    "status" "AgentSyncSuggestionStatus" NOT NULL DEFAULT 'proposed',
    "reason" TEXT,
    "fileSyncStatus" "AgentSyncFileSyncStatus" NOT NULL DEFAULT 'skipped',
    "existingContent" TEXT,
    "suggestedContent" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AgentSyncSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaudeDocument" (
    "id" TEXT NOT NULL,
    "teamId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaudeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidanceEntry" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "status" "GuidanceStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuidanceRevision" (
    "id" TEXT NOT NULL,
    "guidanceEntryId" TEXT NOT NULL,
    "oldContent" TEXT,
    "newContent" TEXT,
    "diff" TEXT,
    "triggeredBy" TEXT,
    "commitHash" TEXT,
    "prLink" TEXT,
    "botResponse" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuidanceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "commandPattern" TEXT NOT NULL,
    "type" "PermissionType" NOT NULL,
    "status" "PermissionStatus" NOT NULL,
    "scope" "PermissionScope" NOT NULL,
    "subagentId" TEXT,
    "sourceFile" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionPolicy" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionPolicyRule" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "commandPattern" TEXT NOT NULL,
    "type" "PermissionType" NOT NULL,
    "status" "PermissionStatus" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionPolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubagentPermissionPolicy" (
    "id" TEXT NOT NULL,
    "subagentId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubagentPermissionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillCatalogEntry" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "SkillCatalogSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "repo" TEXT,
    "sourcePath" TEXT,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "isInstalled" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "installedPath" TEXT,
    "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'approved',
    "activationRationale" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "activatedByBridgeCrewId" TEXT,
    "activationSecurityReportId" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillImportRun" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "catalogEntryId" TEXT,
    "mode" TEXT NOT NULL,
    "source" "SkillCatalogSource",
    "skillSlug" TEXT,
    "repo" TEXT,
    "sourcePath" TEXT,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "status" "SkillImportStatus" NOT NULL DEFAULT 'running',
    "exitCode" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCatalogEntry" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "ToolCatalogSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "repo" TEXT,
    "sourcePath" TEXT,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "isInstalled" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "installedPath" TEXT,
    "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'approved',
    "activationRationale" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "activatedByBridgeCrewId" TEXT,
    "activationSecurityReportId" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeAdapterCatalogEntry" (
    "id" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "protocol" "RuntimeAdapterProtocol" NOT NULL,
    "endpoint" TEXT,
    "authRef" TEXT,
    "capabilities" JSONB,
    "metadata" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "activationStatus" "CatalogActivationStatus" NOT NULL DEFAULT 'pending',
    "activationRationale" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedByUserId" TEXT,
    "activatedByBridgeCrewId" TEXT,
    "activationSecurityReportId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeAdapterCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeAdapterBinding" (
    "id" TEXT NOT NULL,
    "runtimeAdapterId" TEXT NOT NULL,
    "scope" "RuntimeAdapterBindingScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeAdapterBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubagentToolBinding" (
    "id" TEXT NOT NULL,
    "subagentId" TEXT NOT NULL,
    "toolCatalogEntryId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubagentToolBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolImportRun" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "catalogEntryId" TEXT,
    "mode" TEXT NOT NULL,
    "source" "ToolCatalogSource",
    "toolSlug" TEXT,
    "repo" TEXT,
    "sourcePath" TEXT,
    "sourceRef" TEXT,
    "sourceUrl" TEXT,
    "status" "ToolImportStatus" NOT NULL DEFAULT 'running',
    "exitCode" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipToolGrant" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "shipDeploymentId" TEXT NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "scope" "ShipToolGrantScope" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "bridgeCrewId" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipToolGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipToolAccessRequest" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "shipDeploymentId" TEXT NOT NULL,
    "catalogEntryId" TEXT NOT NULL,
    "requesterBridgeCrewId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "scopePreference" "ShipToolRequestScopePreference" NOT NULL DEFAULT 'requester_only',
    "status" "ShipToolAccessRequestStatus" NOT NULL DEFAULT 'pending',
    "rationale" TEXT,
    "metadata" JSONB,
    "approvedGrantId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipToolAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCrewSubagentAssignment" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "shipDeploymentId" TEXT NOT NULL,
    "bridgeCrewId" TEXT NOT NULL,
    "subagentId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "assignedByBridgeCrewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCrewSubagentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceSecurityReport" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "eventType" "GovernanceEventType" NOT NULL,
    "rationale" TEXT NOT NULL,
    "reportPathMd" TEXT NOT NULL,
    "reportPathJson" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByBridgeCrewId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceSecurityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceGrantEvent" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "eventType" "GovernanceEventType" NOT NULL,
    "toolCatalogEntryId" TEXT,
    "runtimeAdapterCatalogEntryId" TEXT,
    "skillCatalogEntryId" TEXT,
    "shipDeploymentId" TEXT,
    "bridgeCrewId" TEXT,
    "subagentId" TEXT,
    "actorBridgeCrewId" TEXT,
    "securityReportId" TEXT,
    "rationale" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceGrantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "ActionType" NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "status" TEXT,
    "result" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hook" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matcher" TEXT NOT NULL,
    "type" "HookType" NOT NULL,
    "command" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HookExecution" (
    "id" TEXT NOT NULL,
    "hookId" TEXT NOT NULL,
    "sessionId" TEXT,
    "toolUseId" TEXT,
    "status" TEXT,
    "output" TEXT,
    "error" TEXT,
    "duration" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HookExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'running',
    "duration" INTEGER,
    "tokenCount" INTEGER,
    "strategy" "TaskStrategy",
    "permissionMode" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" TEXT,
    "result" JSONB,
    "iterations" INTEGER,
    "feedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDeployment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subagentId" TEXT,
    "nodeId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "deploymentType" "DeploymentType" NOT NULL DEFAULT 'agent',
    "deploymentProfile" "DeploymentProfile" NOT NULL DEFAULT 'local_starship_build',
    "provisioningMode" "ProvisioningMode" NOT NULL DEFAULT 'terraform_ansible',
    "nodeUrl" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'pending',
    "shipVersion" TEXT NOT NULL DEFAULT 'v1',
    "shipVersionUpdatedAt" TIMESTAMP(3),
    "config" JSONB,
    "metadata" JSONB,
    "deployedAt" TIMESTAMP(3),
    "lastHealthCheck" TIMESTAMP(3),
    "healthStatus" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeConnection" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "provider" "BridgeConnectionProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRelay" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "credentials" JSONB NOT NULL,
    "lastDeliveryAt" TIMESTAMP(3),
    "lastDeliveryStatus" "BridgeDispatchStatus",
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardSecretTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deploymentProfile" "DeploymentProfile" NOT NULL,
    "secrets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardSecretTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardCloudCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CloudProvider" NOT NULL,
    "tokenEnvelope" JSONB NOT NULL,
    "metadata" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardCloudCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardCloudSshKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CloudProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "privateKeyEnvelope" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardCloudSshKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardSshTunnel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deploymentId" TEXT,
    "provider" "CloudProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ShipyardTunnelStatus" NOT NULL DEFAULT 'stopped',
    "localHost" TEXT NOT NULL DEFAULT '127.0.0.1',
    "localPort" INTEGER NOT NULL,
    "remoteHost" TEXT NOT NULL,
    "remotePort" INTEGER NOT NULL,
    "sshHost" TEXT NOT NULL,
    "sshPort" INTEGER NOT NULL DEFAULT 22,
    "sshUser" TEXT NOT NULL DEFAULT 'root',
    "sshKeyId" TEXT,
    "pid" INTEGER,
    "pidFile" TEXT,
    "controlSocket" TEXT,
    "keyFilePath" TEXT,
    "lastHealthCheck" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardSshTunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "keyId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardBillingWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipyardBillingWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardBillingTopup" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
    "status" "ShipyardBillingTopupStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ShipyardBillingTopup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipyardBillingLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ShipyardBillingLedgerType" NOT NULL,
    "deltaCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER NOT NULL,
    "currency" "ShipyardBillingCurrency" NOT NULL DEFAULT 'eur',
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipyardBillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultRagDocument" (
    "id" TEXT NOT NULL,
    "joinedPath" TEXT NOT NULL,
    "physicalVaultId" TEXT NOT NULL,
    "physicalPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scopeType" "VaultRagScopeType" NOT NULL,
    "shipDeploymentId" TEXT,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultRagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultRagChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "joinedPath" TEXT NOT NULL,
    "scopeType" "VaultRagScopeType" NOT NULL,
    "shipDeploymentId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "embedding" JSONB,
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultRagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultRagSyncRun" (
    "id" TEXT NOT NULL,
    "trigger" "VaultRagSyncTrigger" NOT NULL,
    "scope" "VaultRagSyncScope" NOT NULL,
    "status" "VaultRagSyncStatus" NOT NULL DEFAULT 'running',
    "shipDeploymentId" TEXT,
    "initiatedByUserId" TEXT,
    "mode" TEXT,
    "documentsScanned" INTEGER NOT NULL DEFAULT 0,
    "documentsUpserted" INTEGER NOT NULL DEFAULT 0,
    "documentsRemoved" INTEGER NOT NULL DEFAULT 0,
    "chunksUpserted" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultRagSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPrivateRagDocument" (
    "id" TEXT NOT NULL,
    "joinedPath" TEXT NOT NULL,
    "physicalPath" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "mtime" TIMESTAMP(3) NOT NULL,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "lastIndexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPrivateRagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocalPrivateRagChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "joinedPath" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "normalizedContent" TEXT NOT NULL,
    "embedding" JSONB,
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalPrivateRagChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMemorySigner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyRef" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemorySigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeDispatchDelivery" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "source" "BridgeDispatchSource" NOT NULL,
    "status" "BridgeDispatchStatus" NOT NULL DEFAULT 'pending',
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "result" JSONB,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeDispatchDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCrew" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "role" "BridgeCrewRole" NOT NULL,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "status" "BridgeCrewStatus" NOT NULL DEFAULT 'active',
    "walletEnabled" BOOLEAN NOT NULL DEFAULT false,
    "walletAddress" TEXT,
    "walletKeyRef" TEXT,
    "walletEnclaveUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCrew_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BridgeCharacterAsset" (
    "id" TEXT NOT NULL,
    "role" "BridgeCrewRole" NOT NULL,
    "modelUrl" TEXT NOT NULL,
    "meshyTaskId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BridgeCharacterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDeployment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "applicationType" "ApplicationType" NOT NULL,
    "image" TEXT,
    "repository" TEXT,
    "branch" TEXT,
    "buildCommand" TEXT,
    "startCommand" TEXT,
    "port" INTEGER,
    "environment" JSONB,
    "shipDeploymentId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "deploymentProfile" "DeploymentProfile" NOT NULL DEFAULT 'local_starship_build',
    "provisioningMode" "ProvisioningMode" NOT NULL DEFAULT 'terraform_ansible',
    "nodeUrl" TEXT,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'pending',
    "config" JSONB,
    "metadata" JSONB,
    "deployedAt" TIMESTAMP(3),
    "lastHealthCheck" TIMESTAMP(3),
    "healthStatus" TEXT,
    "version" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "repository" TEXT,
    "website" TEXT,
    "readme" TEXT,
    "thumbnail" TEXT,
    "category" "ProjectCategory",
    "stars" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeSource" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "name" TEXT,
    "nodeType" "NodeType",
    "nodeUrl" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingEvent" (
    "id" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "eventType" "ForwardingEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ForwardingEventStatus" NOT NULL DEFAULT 'received',

    CONSTRAINT "ForwardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingNonce" (
    "id" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForwardingNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForwardingConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceNodeId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "targetApiKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "eventTypes" "ForwardingEventType"[],
    "status" "ForwardingTargetStatus" NOT NULL DEFAULT 'paused',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservabilityTrace" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "source" TEXT,
    "status" TEXT,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservabilityTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservabilityTraceDecryptAudit" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservabilityTraceDecryptAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagPerformanceSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "shipDeploymentId" TEXT,
    "route" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "requestedBackend" TEXT NOT NULL,
    "effectiveBackend" TEXT NOT NULL,
    "mode" TEXT,
    "scope" TEXT,
    "status" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL,
    "resultCount" INTEGER,
    "queryHash" TEXT,
    "queryLength" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RagPerformanceSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimePerformanceSample" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "source" TEXT NOT NULL,
    "runtimeProfile" TEXT,
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "executionKind" TEXT,
    "intelligenceTier" TEXT,
    "intelligenceDecision" TEXT,
    "resolvedModel" TEXT,
    "classifierModel" TEXT,
    "classifierConfidence" DOUBLE PRECISION,
    "thresholdBefore" DOUBLE PRECISION,
    "thresholdAfter" DOUBLE PRECISION,
    "rewardScore" DOUBLE PRECISION,
    "estimatedPromptTokens" INTEGER,
    "estimatedCompletionTokens" INTEGER,
    "estimatedTotalTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "estimatedCostEur" DOUBLE PRECISION,
    "baselineMaxCostUsd" DOUBLE PRECISION,
    "baselineMaxCostEur" DOUBLE PRECISION,
    "estimatedSavingsUsd" DOUBLE PRECISION,
    "estimatedSavingsEur" DOUBLE PRECISION,
    "currencyFxUsdToEur" DOUBLE PRECISION,
    "economicsEstimated" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuntimePerformanceSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeIntelligencePolicyState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "explorationRate" DOUBLE PRECISION NOT NULL,
    "learningRate" DOUBLE PRECISION NOT NULL,
    "targetReward" DOUBLE PRECISION NOT NULL,
    "emaReward" DOUBLE PRECISION NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "lastConsolidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeIntelligencePolicyState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "status" "NewsletterSubscriptionStatus" NOT NULL DEFAULT 'subscribed',
    "metadata" JSONB,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT,
    "repository" TEXT,
    "pullRequestNumber" INTEGER,
    "commentId" INTEGER,
    "commentBody" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "responseBody" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GitHubWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipTopology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "teamId" TEXT DEFAULT 'uss-k8s',
    "components" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "positions" JSONB,
    "hierarchy" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipTopology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "backend" "TreasuryBackend" NOT NULL DEFAULT 'mesh_multisig',
    "network" "TreasuryNetwork" NOT NULL DEFAULT 'preprod',
    "meshBaseUrl" TEXT NOT NULL,
    "meshWalletId" TEXT NOT NULL,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_providerId_idx" ON "Account"("providerId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialID_key" ON "Passkey"("credentialID");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "SessionInteraction_sessionId_idx" ON "SessionInteraction"("sessionId");

-- CreateIndex
CREATE INDEX "SessionInteraction_timestamp_idx" ON "SessionInteraction"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeThread_sessionId_key" ON "BridgeThread"("sessionId");

-- CreateIndex
CREATE INDEX "BridgeThread_userId_idx" ON "BridgeThread"("userId");

-- CreateIndex
CREATE INDEX "BridgeThread_stationKey_idx" ON "BridgeThread"("stationKey");

-- CreateIndex
CREATE INDEX "BridgeThread_updatedAt_idx" ON "BridgeThread"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeThread_userId_stationKey_key" ON "BridgeThread"("userId", "stationKey");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_dedupeKey_key" ON "SecurityIncident"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIncident_sessionId_key" ON "SecurityIncident"("sessionId");

-- CreateIndex
CREATE INDEX "SecurityIncident_ownerUserId_updatedAt_idx" ON "SecurityIncident"("ownerUserId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SecurityIncident_ownerUserId_status_severity_updatedAt_idx" ON "SecurityIncident"("ownerUserId", "status", "severity", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "SecurityIntegrationSecrets_userId_key" ON "SecurityIntegrationSecrets"("userId");

-- CreateIndex
CREATE INDEX "SecurityIntegrationSecrets_userId_idx" ON "SecurityIntegrationSecrets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityLockdownConfig_ownerUserId_key" ON "SecurityLockdownConfig"("ownerUserId");

-- CreateIndex
CREATE INDEX "SecurityLockdownConfig_ownerUserId_idx" ON "SecurityLockdownConfig"("ownerUserId");

-- CreateIndex
CREATE INDEX "SecurityLockdownConfig_enabled_idx" ON "SecurityLockdownConfig"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "MotionSupervisionConfig_ownerUserId_key" ON "MotionSupervisionConfig"("ownerUserId");

-- CreateIndex
CREATE INDEX "MotionSupervisionConfig_ownerUserId_idx" ON "MotionSupervisionConfig"("ownerUserId");

-- CreateIndex
CREATE INDEX "MotionSupervisionConfig_mode_idx" ON "MotionSupervisionConfig"("mode");

-- CreateIndex
CREATE INDEX "MotionBaseline_ownerUserId_entityType_idx" ON "MotionBaseline"("ownerUserId", "entityType");

-- CreateIndex
CREATE INDEX "MotionBaseline_ownerUserId_updatedAt_idx" ON "MotionBaseline"("ownerUserId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "MotionBaseline_shipDeploymentId_idx" ON "MotionBaseline"("shipDeploymentId");

-- CreateIndex
CREATE INDEX "MotionBaseline_subagentId_idx" ON "MotionBaseline"("subagentId");

-- CreateIndex
CREATE INDEX "MotionBaseline_stationKey_idx" ON "MotionBaseline"("stationKey");

-- CreateIndex
CREATE UNIQUE INDEX "MotionBaseline_ownerUserId_entityKey_key" ON "MotionBaseline"("ownerUserId", "entityKey");

-- CreateIndex
CREATE INDEX "MotionSample_ownerUserId_createdAt_idx" ON "MotionSample"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MotionSample_ownerUserId_decision_createdAt_idx" ON "MotionSample"("ownerUserId", "decision", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MotionSample_entityKey_createdAt_idx" ON "MotionSample"("entityKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MotionSample_baselineId_idx" ON "MotionSample"("baselineId");

-- CreateIndex
CREATE INDEX "MotionSample_sessionId_idx" ON "MotionSample"("sessionId");

-- CreateIndex
CREATE INDEX "MotionSample_subagentId_idx" ON "MotionSample"("subagentId");

-- CreateIndex
CREATE INDEX "MotionSample_stationKey_idx" ON "MotionSample"("stationKey");

-- CreateIndex
CREATE INDEX "MotionSample_commandExecutionId_idx" ON "MotionSample"("commandExecutionId");

-- CreateIndex
CREATE INDEX "MotionSample_incidentId_idx" ON "MotionSample"("incidentId");

-- CreateIndex
CREATE INDEX "MotionSample_shipDeploymentId_idx" ON "MotionSample"("shipDeploymentId");

-- CreateIndex
CREATE INDEX "BridgeMessage_threadId_createdAt_idx" ON "BridgeMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeMessage_createdAt_idx" ON "BridgeMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeMirrorLink_messageId_key" ON "BridgeMirrorLink"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeMirrorLink_interactionId_key" ON "BridgeMirrorLink"("interactionId");

-- CreateIndex
CREATE INDEX "BridgeMirrorLink_createdAt_idx" ON "BridgeMirrorLink"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeMirrorJob_dedupeKey_key" ON "BridgeMirrorJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_status_nextAttemptAt_idx" ON "BridgeMirrorJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_direction_idx" ON "BridgeMirrorJob"("direction");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_threadId_idx" ON "BridgeMirrorJob"("threadId");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_sessionId_idx" ON "BridgeMirrorJob"("sessionId");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_messageId_idx" ON "BridgeMirrorJob"("messageId");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_interactionId_idx" ON "BridgeMirrorJob"("interactionId");

-- CreateIndex
CREATE INDEX "BridgeMirrorJob_createdAt_idx" ON "BridgeMirrorJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeAgentChatRoom_dmKey_key" ON "BridgeAgentChatRoom"("dmKey");

-- CreateIndex
CREATE INDEX "BridgeAgentChatRoom_shipDeploymentId_updatedAt_idx" ON "BridgeAgentChatRoom"("shipDeploymentId", "updatedAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatRoom_shipDeploymentId_roomType_idx" ON "BridgeAgentChatRoom"("shipDeploymentId", "roomType");

-- CreateIndex
CREATE INDEX "BridgeAgentChatRoom_createdByBridgeCrewId_idx" ON "BridgeAgentChatRoom"("createdByBridgeCrewId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMember_bridgeCrewId_idx" ON "BridgeAgentChatMember"("bridgeCrewId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMember_sessionId_idx" ON "BridgeAgentChatMember"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeAgentChatMember_roomId_bridgeCrewId_key" ON "BridgeAgentChatMember"("roomId", "bridgeCrewId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeAgentChatMember_roomId_sessionId_key" ON "BridgeAgentChatMember"("roomId", "sessionId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMessage_roomId_createdAt_idx" ON "BridgeAgentChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMessage_senderBridgeCrewId_createdAt_idx" ON "BridgeAgentChatMessage"("senderBridgeCrewId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMessage_inReplyToMessageId_idx" ON "BridgeAgentChatMessage"("inReplyToMessageId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatMessage_createdAt_idx" ON "BridgeAgentChatMessage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeAgentChatReplyJob_dedupeKey_key" ON "BridgeAgentChatReplyJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_status_nextAttemptAt_idx" ON "BridgeAgentChatReplyJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_shipDeploymentId_createdAt_idx" ON "BridgeAgentChatReplyJob"("shipDeploymentId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_roomId_createdAt_idx" ON "BridgeAgentChatReplyJob"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_sourceMessageId_idx" ON "BridgeAgentChatReplyJob"("sourceMessageId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_recipientBridgeCrewId_idx" ON "BridgeAgentChatReplyJob"("recipientBridgeCrewId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_recipientSessionId_idx" ON "BridgeAgentChatReplyJob"("recipientSessionId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_outputMessageId_idx" ON "BridgeAgentChatReplyJob"("outputMessageId");

-- CreateIndex
CREATE INDEX "BridgeAgentChatReplyJob_createdAt_idx" ON "BridgeAgentChatReplyJob"("createdAt");

-- CreateIndex
CREATE INDEX "BridgeCallRound_userId_createdAt_idx" ON "BridgeCallRound"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeCallRound_userId_shipDeploymentId_createdAt_idx" ON "BridgeCallRound"("userId", "shipDeploymentId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeCallRound_shipDeploymentId_idx" ON "BridgeCallRound"("shipDeploymentId");

-- CreateIndex
CREATE INDEX "BridgeCallOfficerResult_roundId_idx" ON "BridgeCallOfficerResult"("roundId");

-- CreateIndex
CREATE INDEX "BridgeCallOfficerResult_stationKey_idx" ON "BridgeCallOfficerResult"("stationKey");

-- CreateIndex
CREATE INDEX "BridgeCallOfficerResult_status_idx" ON "BridgeCallOfficerResult"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCallOfficerResult_roundId_stationKey_key" ON "BridgeCallOfficerResult"("roundId", "stationKey");

-- CreateIndex
CREATE INDEX "Command_teamId_idx" ON "Command"("teamId");

-- CreateIndex
CREATE INDEX "Command_ownerUserId_idx" ON "Command"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Command_name_teamId_key" ON "Command"("name", "teamId");

-- CreateIndex
CREATE INDEX "CommandExecution_commandId_idx" ON "CommandExecution"("commandId");

-- CreateIndex
CREATE INDEX "CommandExecution_sessionId_idx" ON "CommandExecution"("sessionId");

-- CreateIndex
CREATE INDEX "CommandExecution_subagentId_idx" ON "CommandExecution"("subagentId");

-- CreateIndex
CREATE INDEX "CommandExecution_userId_idx" ON "CommandExecution"("userId");

-- CreateIndex
CREATE INDEX "Subagent_teamId_idx" ON "Subagent"("teamId");

-- CreateIndex
CREATE INDEX "Subagent_ownerUserId_idx" ON "Subagent"("ownerUserId");

-- CreateIndex
CREATE INDEX "Subagent_subagentType_idx" ON "Subagent"("subagentType");

-- CreateIndex
CREATE UNIQUE INDEX "Subagent_name_teamId_key" ON "Subagent"("name", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSyncPreference_userId_key" ON "AgentSyncPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key" ON "UserSetting"("userId");

-- CreateIndex
CREATE INDEX "UserSetting_userId_idx" ON "UserSetting"("userId");

-- CreateIndex
CREATE INDEX "AgentSyncSignal_userId_occurredAt_idx" ON "AgentSyncSignal"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "AgentSyncSignal_subagentId_occurredAt_idx" ON "AgentSyncSignal"("subagentId", "occurredAt");

-- CreateIndex
CREATE INDEX "AgentSyncSignal_source_occurredAt_idx" ON "AgentSyncSignal"("source", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSyncSignal_source_sourceId_subagentId_key" ON "AgentSyncSignal"("source", "sourceId", "subagentId");

-- CreateIndex
CREATE INDEX "AgentSyncRun_userId_createdAt_idx" ON "AgentSyncRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSyncRun_status_createdAt_idx" ON "AgentSyncRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSyncRun_subagentId_createdAt_idx" ON "AgentSyncRun"("subagentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSyncSuggestion_runId_idx" ON "AgentSyncSuggestion"("runId");

-- CreateIndex
CREATE INDEX "AgentSyncSuggestion_subagentId_createdAt_idx" ON "AgentSyncSuggestion"("subagentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSyncSuggestion_status_createdAt_idx" ON "AgentSyncSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ClaudeDocument_teamId_idx" ON "ClaudeDocument"("teamId");

-- CreateIndex
CREATE INDEX "GuidanceEntry_documentId_idx" ON "GuidanceEntry"("documentId");

-- CreateIndex
CREATE INDEX "GuidanceEntry_status_idx" ON "GuidanceEntry"("status");

-- CreateIndex
CREATE INDEX "GuidanceRevision_guidanceEntryId_idx" ON "GuidanceRevision"("guidanceEntryId");

-- CreateIndex
CREATE INDEX "GuidanceRevision_timestamp_idx" ON "GuidanceRevision"("timestamp");

-- CreateIndex
CREATE INDEX "Permission_commandPattern_idx" ON "Permission"("commandPattern");

-- CreateIndex
CREATE INDEX "Permission_scope_idx" ON "Permission"("scope");

-- CreateIndex
CREATE INDEX "Permission_subagentId_idx" ON "Permission"("subagentId");

-- CreateIndex
CREATE INDEX "Permission_ownerUserId_idx" ON "Permission"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionPolicy_slug_key" ON "PermissionPolicy"("slug");

-- CreateIndex
CREATE INDEX "PermissionPolicy_ownerUserId_idx" ON "PermissionPolicy"("ownerUserId");

-- CreateIndex
CREATE INDEX "PermissionPolicyRule_policyId_idx" ON "PermissionPolicyRule"("policyId");

-- CreateIndex
CREATE INDEX "PermissionPolicyRule_policyId_sortOrder_idx" ON "PermissionPolicyRule"("policyId", "sortOrder");

-- CreateIndex
CREATE INDEX "SubagentPermissionPolicy_subagentId_priority_idx" ON "SubagentPermissionPolicy"("subagentId", "priority");

-- CreateIndex
CREATE INDEX "SubagentPermissionPolicy_policyId_idx" ON "SubagentPermissionPolicy"("policyId");

-- CreateIndex
CREATE UNIQUE INDEX "SubagentPermissionPolicy_subagentId_policyId_key" ON "SubagentPermissionPolicy"("subagentId", "policyId");

-- CreateIndex
CREATE INDEX "SkillCatalogEntry_ownerUserId_source_idx" ON "SkillCatalogEntry"("ownerUserId", "source");

-- CreateIndex
CREATE INDEX "SkillCatalogEntry_ownerUserId_isInstalled_idx" ON "SkillCatalogEntry"("ownerUserId", "isInstalled");

-- CreateIndex
CREATE INDEX "SkillCatalogEntry_ownerUserId_slug_idx" ON "SkillCatalogEntry"("ownerUserId", "slug");

-- CreateIndex
CREATE INDEX "SkillCatalogEntry_ownerUserId_updatedAt_idx" ON "SkillCatalogEntry"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "SkillCatalogEntry_ownerUserId_activationStatus_idx" ON "SkillCatalogEntry"("ownerUserId", "activationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SkillCatalogEntry_ownerUserId_sourceKey_key" ON "SkillCatalogEntry"("ownerUserId", "sourceKey");

-- CreateIndex
CREATE INDEX "SkillImportRun_ownerUserId_createdAt_idx" ON "SkillImportRun"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SkillImportRun_ownerUserId_status_createdAt_idx" ON "SkillImportRun"("ownerUserId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SkillImportRun_catalogEntryId_idx" ON "SkillImportRun"("catalogEntryId");

-- CreateIndex
CREATE INDEX "ToolCatalogEntry_ownerUserId_source_idx" ON "ToolCatalogEntry"("ownerUserId", "source");

-- CreateIndex
CREATE INDEX "ToolCatalogEntry_ownerUserId_isInstalled_idx" ON "ToolCatalogEntry"("ownerUserId", "isInstalled");

-- CreateIndex
CREATE INDEX "ToolCatalogEntry_ownerUserId_slug_idx" ON "ToolCatalogEntry"("ownerUserId", "slug");

-- CreateIndex
CREATE INDEX "ToolCatalogEntry_ownerUserId_updatedAt_idx" ON "ToolCatalogEntry"("ownerUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "ToolCatalogEntry_ownerUserId_activationStatus_idx" ON "ToolCatalogEntry"("ownerUserId", "activationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ToolCatalogEntry_ownerUserId_sourceKey_key" ON "ToolCatalogEntry"("ownerUserId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeAdapterCatalogEntry_adapterId_key" ON "RuntimeAdapterCatalogEntry"("adapterId");

-- CreateIndex
CREATE INDEX "RuntimeAdapterCatalogEntry_activationStatus_idx" ON "RuntimeAdapterCatalogEntry"("activationStatus");

-- CreateIndex
CREATE INDEX "RuntimeAdapterCatalogEntry_isSystem_idx" ON "RuntimeAdapterCatalogEntry"("isSystem");

-- CreateIndex
CREATE INDEX "RuntimeAdapterBinding_scope_scopeKey_enabled_priority_idx" ON "RuntimeAdapterBinding"("scope", "scopeKey", "enabled", "priority");

-- CreateIndex
CREATE INDEX "RuntimeAdapterBinding_runtimeAdapterId_enabled_idx" ON "RuntimeAdapterBinding"("runtimeAdapterId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeAdapterBinding_runtimeAdapterId_scope_scopeKey_key" ON "RuntimeAdapterBinding"("runtimeAdapterId", "scope", "scopeKey");

-- CreateIndex
CREATE INDEX "SubagentToolBinding_subagentId_idx" ON "SubagentToolBinding"("subagentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubagentToolBinding_subagentId_toolCatalogEntryId_key" ON "SubagentToolBinding"("subagentId", "toolCatalogEntryId");

-- CreateIndex
CREATE INDEX "ToolImportRun_ownerUserId_createdAt_idx" ON "ToolImportRun"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToolImportRun_ownerUserId_status_createdAt_idx" ON "ToolImportRun"("ownerUserId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ToolImportRun_catalogEntryId_idx" ON "ToolImportRun"("catalogEntryId");

-- CreateIndex
CREATE INDEX "ShipToolGrant_ownerUserId_shipDeploymentId_scope_idx" ON "ShipToolGrant"("ownerUserId", "shipDeploymentId", "scope");

-- CreateIndex
CREATE INDEX "ShipToolGrant_bridgeCrewId_idx" ON "ShipToolGrant"("bridgeCrewId");

-- CreateIndex
CREATE INDEX "ShipToolGrant_catalogEntryId_idx" ON "ShipToolGrant"("catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipToolGrant_shipDeploymentId_catalogEntryId_scopeKey_key" ON "ShipToolGrant"("shipDeploymentId", "catalogEntryId", "scopeKey");

-- CreateIndex
CREATE INDEX "ShipToolAccessRequest_ownerUserId_shipDeploymentId_status_c_idx" ON "ShipToolAccessRequest"("ownerUserId", "shipDeploymentId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShipToolAccessRequest_requesterBridgeCrewId_idx" ON "ShipToolAccessRequest"("requesterBridgeCrewId");

-- CreateIndex
CREATE INDEX "ShipToolAccessRequest_catalogEntryId_idx" ON "ShipToolAccessRequest"("catalogEntryId");

-- CreateIndex
CREATE INDEX "ShipToolAccessRequest_approvedGrantId_idx" ON "ShipToolAccessRequest"("approvedGrantId");

-- CreateIndex
CREATE INDEX "BridgeCrewSubagentAssignment_ownerUserId_shipDeploymentId_idx" ON "BridgeCrewSubagentAssignment"("ownerUserId", "shipDeploymentId");

-- CreateIndex
CREATE INDEX "BridgeCrewSubagentAssignment_shipDeploymentId_bridgeCrewId_idx" ON "BridgeCrewSubagentAssignment"("shipDeploymentId", "bridgeCrewId");

-- CreateIndex
CREATE INDEX "BridgeCrewSubagentAssignment_subagentId_idx" ON "BridgeCrewSubagentAssignment"("subagentId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCrewSubagentAssignment_bridgeCrewId_subagentId_key" ON "BridgeCrewSubagentAssignment"("bridgeCrewId", "subagentId");

-- CreateIndex
CREATE INDEX "GovernanceSecurityReport_ownerUserId_createdAt_idx" ON "GovernanceSecurityReport"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GovernanceSecurityReport_eventType_createdAt_idx" ON "GovernanceSecurityReport"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GovernanceSecurityReport_createdByBridgeCrewId_idx" ON "GovernanceSecurityReport"("createdByBridgeCrewId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_ownerUserId_createdAt_idx" ON "GovernanceGrantEvent"("ownerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_eventType_createdAt_idx" ON "GovernanceGrantEvent"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_toolCatalogEntryId_idx" ON "GovernanceGrantEvent"("toolCatalogEntryId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_runtimeAdapterCatalogEntryId_idx" ON "GovernanceGrantEvent"("runtimeAdapterCatalogEntryId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_skillCatalogEntryId_idx" ON "GovernanceGrantEvent"("skillCatalogEntryId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_shipDeploymentId_idx" ON "GovernanceGrantEvent"("shipDeploymentId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_bridgeCrewId_idx" ON "GovernanceGrantEvent"("bridgeCrewId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_subagentId_idx" ON "GovernanceGrantEvent"("subagentId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_actorBridgeCrewId_idx" ON "GovernanceGrantEvent"("actorBridgeCrewId");

-- CreateIndex
CREATE INDEX "GovernanceGrantEvent_securityReportId_idx" ON "GovernanceGrantEvent"("securityReportId");

-- CreateIndex
CREATE INDEX "AgentAction_sessionId_idx" ON "AgentAction"("sessionId");

-- CreateIndex
CREATE INDEX "AgentAction_type_idx" ON "AgentAction"("type");

-- CreateIndex
CREATE INDEX "AgentAction_timestamp_idx" ON "AgentAction"("timestamp");

-- CreateIndex
CREATE INDEX "Hook_isActive_idx" ON "Hook"("isActive");

-- CreateIndex
CREATE INDEX "Hook_ownerUserId_idx" ON "Hook"("ownerUserId");

-- CreateIndex
CREATE INDEX "HookExecution_hookId_idx" ON "HookExecution"("hookId");

-- CreateIndex
CREATE INDEX "HookExecution_sessionId_idx" ON "HookExecution"("sessionId");

-- CreateIndex
CREATE INDEX "HookExecution_timestamp_idx" ON "HookExecution"("timestamp");

-- CreateIndex
CREATE INDEX "Task_sessionId_idx" ON "Task"("sessionId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "VerificationRun_sessionId_idx" ON "VerificationRun"("sessionId");

-- CreateIndex
CREATE INDEX "VerificationRun_type_idx" ON "VerificationRun"("type");

-- CreateIndex
CREATE INDEX "AgentDeployment_nodeId_idx" ON "AgentDeployment"("nodeId");

-- CreateIndex
CREATE INDEX "AgentDeployment_status_idx" ON "AgentDeployment"("status");

-- CreateIndex
CREATE INDEX "AgentDeployment_userId_idx" ON "AgentDeployment"("userId");

-- CreateIndex
CREATE INDEX "AgentDeployment_subagentId_idx" ON "AgentDeployment"("subagentId");

-- CreateIndex
CREATE INDEX "AgentDeployment_deploymentType_idx" ON "AgentDeployment"("deploymentType");

-- CreateIndex
CREATE INDEX "AgentDeployment_deploymentProfile_idx" ON "AgentDeployment"("deploymentProfile");

-- CreateIndex
CREATE INDEX "BridgeConnection_deploymentId_idx" ON "BridgeConnection"("deploymentId");

-- CreateIndex
CREATE INDEX "BridgeConnection_deploymentId_enabled_idx" ON "BridgeConnection"("deploymentId", "enabled");

-- CreateIndex
CREATE INDEX "BridgeConnection_provider_idx" ON "BridgeConnection"("provider");

-- CreateIndex
CREATE INDEX "BridgeConnection_updatedAt_idx" ON "BridgeConnection"("updatedAt");

-- CreateIndex
CREATE INDEX "ShipyardSecretTemplate_userId_idx" ON "ShipyardSecretTemplate"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardSecretTemplate_userId_deploymentProfile_key" ON "ShipyardSecretTemplate"("userId", "deploymentProfile");

-- CreateIndex
CREATE INDEX "ShipyardCloudCredential_userId_idx" ON "ShipyardCloudCredential"("userId");

-- CreateIndex
CREATE INDEX "ShipyardCloudCredential_provider_idx" ON "ShipyardCloudCredential"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardCloudCredential_userId_provider_key" ON "ShipyardCloudCredential"("userId", "provider");

-- CreateIndex
CREATE INDEX "ShipyardCloudSshKey_userId_provider_idx" ON "ShipyardCloudSshKey"("userId", "provider");

-- CreateIndex
CREATE INDEX "ShipyardCloudSshKey_fingerprint_idx" ON "ShipyardCloudSshKey"("fingerprint");

-- CreateIndex
CREATE INDEX "ShipyardCloudSshKey_name_idx" ON "ShipyardCloudSshKey"("name");

-- CreateIndex
CREATE INDEX "ShipyardSshTunnel_userId_provider_idx" ON "ShipyardSshTunnel"("userId", "provider");

-- CreateIndex
CREATE INDEX "ShipyardSshTunnel_deploymentId_idx" ON "ShipyardSshTunnel"("deploymentId");

-- CreateIndex
CREATE INDEX "ShipyardSshTunnel_status_idx" ON "ShipyardSshTunnel"("status");

-- CreateIndex
CREATE INDEX "ShipyardSshTunnel_sshKeyId_idx" ON "ShipyardSshTunnel"("sshKeyId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardApiKey_keyId_key" ON "ShipyardApiKey"("keyId");

-- CreateIndex
CREATE INDEX "ShipyardApiKey_userId_revokedAt_createdAt_idx" ON "ShipyardApiKey"("userId", "revokedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardApiKey_userId_idx" ON "ShipyardApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardBillingWallet_userId_key" ON "ShipyardBillingWallet"("userId");

-- CreateIndex
CREATE INDEX "ShipyardBillingWallet_userId_idx" ON "ShipyardBillingWallet"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardBillingTopup_stripeCheckoutSessionId_key" ON "ShipyardBillingTopup"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "ShipyardBillingTopup_walletId_createdAt_idx" ON "ShipyardBillingTopup"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingTopup_userId_createdAt_idx" ON "ShipyardBillingTopup"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingTopup_status_createdAt_idx" ON "ShipyardBillingTopup"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingLedgerEntry_walletId_createdAt_idx" ON "ShipyardBillingLedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingLedgerEntry_userId_createdAt_idx" ON "ShipyardBillingLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingLedgerEntry_type_createdAt_idx" ON "ShipyardBillingLedgerEntry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ShipyardBillingLedgerEntry_referenceType_referenceId_idx" ON "ShipyardBillingLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipyardBillingLedgerEntry_type_referenceType_referenceId_key" ON "ShipyardBillingLedgerEntry"("type", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultRagDocument_joinedPath_key" ON "VaultRagDocument"("joinedPath");

-- CreateIndex
CREATE INDEX "VaultRagDocument_scopeType_shipDeploymentId_idx" ON "VaultRagDocument"("scopeType", "shipDeploymentId");

-- CreateIndex
CREATE INDEX "VaultRagDocument_physicalVaultId_idx" ON "VaultRagDocument"("physicalVaultId");

-- CreateIndex
CREATE INDEX "VaultRagDocument_updatedAt_idx" ON "VaultRagDocument"("updatedAt");

-- CreateIndex
CREATE INDEX "VaultRagChunk_joinedPath_idx" ON "VaultRagChunk"("joinedPath");

-- CreateIndex
CREATE INDEX "VaultRagChunk_scopeType_shipDeploymentId_idx" ON "VaultRagChunk"("scopeType", "shipDeploymentId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultRagChunk_documentId_chunkIndex_key" ON "VaultRagChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "VaultRagSyncRun_status_createdAt_idx" ON "VaultRagSyncRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VaultRagSyncRun_scope_shipDeploymentId_createdAt_idx" ON "VaultRagSyncRun"("scope", "shipDeploymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LocalPrivateRagDocument_joinedPath_key" ON "LocalPrivateRagDocument"("joinedPath");

-- CreateIndex
CREATE INDEX "LocalPrivateRagDocument_updatedAt_idx" ON "LocalPrivateRagDocument"("updatedAt");

-- CreateIndex
CREATE INDEX "LocalPrivateRagChunk_joinedPath_idx" ON "LocalPrivateRagChunk"("joinedPath");

-- CreateIndex
CREATE UNIQUE INDEX "LocalPrivateRagChunk_documentId_chunkIndex_key" ON "LocalPrivateRagChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemorySigner_userId_key" ON "UserMemorySigner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemorySigner_keyRef_key" ON "UserMemorySigner"("keyRef");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeDispatchDelivery_dedupeKey_key" ON "BridgeDispatchDelivery"("dedupeKey");

-- CreateIndex
CREATE INDEX "BridgeDispatchDelivery_deploymentId_createdAt_idx" ON "BridgeDispatchDelivery"("deploymentId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeDispatchDelivery_connectionId_createdAt_idx" ON "BridgeDispatchDelivery"("connectionId", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeDispatchDelivery_status_nextAttemptAt_idx" ON "BridgeDispatchDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BridgeDispatchDelivery_source_createdAt_idx" ON "BridgeDispatchDelivery"("source", "createdAt");

-- CreateIndex
CREATE INDEX "BridgeCrew_deploymentId_idx" ON "BridgeCrew"("deploymentId");

-- CreateIndex
CREATE INDEX "BridgeCrew_walletEnabled_idx" ON "BridgeCrew"("walletEnabled");

-- CreateIndex
CREATE INDEX "BridgeCrew_walletKeyRef_idx" ON "BridgeCrew"("walletKeyRef");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCrew_deploymentId_role_key" ON "BridgeCrew"("deploymentId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCharacterAsset_role_key" ON "BridgeCharacterAsset"("role");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_shipDeploymentId_idx" ON "ApplicationDeployment"("shipDeploymentId");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_nodeId_idx" ON "ApplicationDeployment"("nodeId");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_status_idx" ON "ApplicationDeployment"("status");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_userId_idx" ON "ApplicationDeployment"("userId");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_applicationType_idx" ON "ApplicationDeployment"("applicationType");

-- CreateIndex
CREATE INDEX "ApplicationDeployment_deploymentProfile_idx" ON "ApplicationDeployment"("deploymentProfile");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_isPublic_idx" ON "Project"("isPublic");

-- CreateIndex
CREATE INDEX "Project_slug_idx" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_category_idx" ON "Project"("category");

-- CreateIndex
CREATE INDEX "NodeSource_ownerUserId_idx" ON "NodeSource"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeSource_ownerUserId_nodeId_key" ON "NodeSource"("ownerUserId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ForwardingEvent_dedupeKey_key" ON "ForwardingEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ForwardingEvent_sourceNodeId_idx" ON "ForwardingEvent"("sourceNodeId");

-- CreateIndex
CREATE INDEX "ForwardingEvent_eventType_idx" ON "ForwardingEvent"("eventType");

-- CreateIndex
CREATE INDEX "ForwardingEvent_occurredAt_idx" ON "ForwardingEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "ForwardingEvent_status_idx" ON "ForwardingEvent"("status");

-- CreateIndex
CREATE INDEX "ForwardingNonce_timestamp_idx" ON "ForwardingNonce"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ForwardingNonce_sourceNodeId_nonce_key" ON "ForwardingNonce"("sourceNodeId", "nonce");

-- CreateIndex
CREATE INDEX "ForwardingConfig_userId_idx" ON "ForwardingConfig"("userId");

-- CreateIndex
CREATE INDEX "ForwardingConfig_enabled_idx" ON "ForwardingConfig"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ObservabilityTrace_traceId_key" ON "ObservabilityTrace"("traceId");

-- CreateIndex
CREATE INDEX "ObservabilityTrace_userId_createdAt_idx" ON "ObservabilityTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ObservabilityTrace_sessionId_createdAt_idx" ON "ObservabilityTrace"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ObservabilityTrace_createdAt_idx" ON "ObservabilityTrace"("createdAt");

-- CreateIndex
CREATE INDEX "ObservabilityTraceDecryptAudit_traceId_createdAt_idx" ON "ObservabilityTraceDecryptAudit"("traceId", "createdAt");

-- CreateIndex
CREATE INDEX "ObservabilityTraceDecryptAudit_actorType_createdAt_idx" ON "ObservabilityTraceDecryptAudit"("actorType", "createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_createdAt_idx" ON "RagPerformanceSample"("createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_status_createdAt_idx" ON "RagPerformanceSample"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_effectiveBackend_createdAt_idx" ON "RagPerformanceSample"("effectiveBackend", "createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_route_operation_createdAt_idx" ON "RagPerformanceSample"("route", "operation", "createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_shipDeploymentId_createdAt_idx" ON "RagPerformanceSample"("shipDeploymentId", "createdAt");

-- CreateIndex
CREATE INDEX "RagPerformanceSample_userId_createdAt_idx" ON "RagPerformanceSample"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_createdAt_idx" ON "RuntimePerformanceSample"("createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_status_createdAt_idx" ON "RuntimePerformanceSample"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_provider_createdAt_idx" ON "RuntimePerformanceSample"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_runtimeProfile_createdAt_idx" ON "RuntimePerformanceSample"("runtimeProfile", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_source_createdAt_idx" ON "RuntimePerformanceSample"("source", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_userId_createdAt_idx" ON "RuntimePerformanceSample"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_executionKind_createdAt_idx" ON "RuntimePerformanceSample"("executionKind", "createdAt");

-- CreateIndex
CREATE INDEX "RuntimePerformanceSample_intelligenceTier_createdAt_idx" ON "RuntimePerformanceSample"("intelligenceTier", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeIntelligencePolicyState_userId_key" ON "RuntimeIntelligencePolicyState"("userId");

-- CreateIndex
CREATE INDEX "RuntimeIntelligencePolicyState_updatedAt_idx" ON "RuntimeIntelligencePolicyState"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscription_email_key" ON "NewsletterSubscription"("email");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_userId_createdAt_idx" ON "NewsletterSubscription"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NewsletterSubscription_status_createdAt_idx" ON "NewsletterSubscription"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GitHubWebhookEvent_eventType_idx" ON "GitHubWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "GitHubWebhookEvent_action_idx" ON "GitHubWebhookEvent"("action");

-- CreateIndex
CREATE INDEX "GitHubWebhookEvent_repository_idx" ON "GitHubWebhookEvent"("repository");

-- CreateIndex
CREATE INDEX "GitHubWebhookEvent_createdAt_idx" ON "GitHubWebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ShipTopology_userId_idx" ON "ShipTopology"("userId");

-- CreateIndex
CREATE INDEX "ShipTopology_teamId_idx" ON "ShipTopology"("teamId");

-- CreateIndex
CREATE INDEX "ShipTopology_isDefault_idx" ON "ShipTopology"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryConfig_key_key" ON "TreasuryConfig"("key");

-- CreateIndex
CREATE INDEX "TreasuryConfig_updatedAt_idx" ON "TreasuryConfig"("updatedAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_parentSessionId_fkey" FOREIGN KEY ("parentSessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInteraction" ADD CONSTRAINT "SessionInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeThread" ADD CONSTRAINT "BridgeThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeThread" ADD CONSTRAINT "BridgeThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityIntegrationSecrets" ADD CONSTRAINT "SecurityIntegrationSecrets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityLockdownConfig" ADD CONSTRAINT "SecurityLockdownConfig_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSupervisionConfig" ADD CONSTRAINT "MotionSupervisionConfig_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionBaseline" ADD CONSTRAINT "MotionBaseline_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionBaseline" ADD CONSTRAINT "MotionBaseline_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "MotionBaseline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_commandExecutionId_fkey" FOREIGN KEY ("commandExecutionId") REFERENCES "CommandExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotionSample" ADD CONSTRAINT "MotionSample_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMessage" ADD CONSTRAINT "BridgeMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "BridgeThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorLink" ADD CONSTRAINT "BridgeMirrorLink_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "BridgeMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorLink" ADD CONSTRAINT "BridgeMirrorLink_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "SessionInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorJob" ADD CONSTRAINT "BridgeMirrorJob_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "BridgeThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorJob" ADD CONSTRAINT "BridgeMirrorJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorJob" ADD CONSTRAINT "BridgeMirrorJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "BridgeMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeMirrorJob" ADD CONSTRAINT "BridgeMirrorJob_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "SessionInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatRoom" ADD CONSTRAINT "BridgeAgentChatRoom_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatRoom" ADD CONSTRAINT "BridgeAgentChatRoom_createdByBridgeCrewId_fkey" FOREIGN KEY ("createdByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMember" ADD CONSTRAINT "BridgeAgentChatMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMember" ADD CONSTRAINT "BridgeAgentChatMember_bridgeCrewId_fkey" FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMember" ADD CONSTRAINT "BridgeAgentChatMember_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMessage" ADD CONSTRAINT "BridgeAgentChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMessage" ADD CONSTRAINT "BridgeAgentChatMessage_senderBridgeCrewId_fkey" FOREIGN KEY ("senderBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatMessage" ADD CONSTRAINT "BridgeAgentChatMessage_inReplyToMessageId_fkey" FOREIGN KEY ("inReplyToMessageId") REFERENCES "BridgeAgentChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "BridgeAgentChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "BridgeAgentChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_recipientBridgeCrewId_fkey" FOREIGN KEY ("recipientBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_recipientSessionId_fkey" FOREIGN KEY ("recipientSessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeAgentChatReplyJob" ADD CONSTRAINT "BridgeAgentChatReplyJob_outputMessageId_fkey" FOREIGN KEY ("outputMessageId") REFERENCES "BridgeAgentChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCallRound" ADD CONSTRAINT "BridgeCallRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCallRound" ADD CONSTRAINT "BridgeCallRound_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCallOfficerResult" ADD CONSTRAINT "BridgeCallOfficerResult_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "BridgeCallRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandExecution" ADD CONSTRAINT "CommandExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "Command"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandExecution" ADD CONSTRAINT "CommandExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandExecution" ADD CONSTRAINT "CommandExecution_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandExecution" ADD CONSTRAINT "CommandExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subagent" ADD CONSTRAINT "Subagent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncPreference" ADD CONSTRAINT "AgentSyncPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncSignal" ADD CONSTRAINT "AgentSyncSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncSignal" ADD CONSTRAINT "AgentSyncSignal_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncRun" ADD CONSTRAINT "AgentSyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncRun" ADD CONSTRAINT "AgentSyncRun_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncSuggestion" ADD CONSTRAINT "AgentSyncSuggestion_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncSuggestion" ADD CONSTRAINT "AgentSyncSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSyncSuggestion" ADD CONSTRAINT "AgentSyncSuggestion_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidanceEntry" ADD CONSTRAINT "GuidanceEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ClaudeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidanceRevision" ADD CONSTRAINT "GuidanceRevision_guidanceEntryId_fkey" FOREIGN KEY ("guidanceEntryId") REFERENCES "GuidanceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuidanceRevision" ADD CONSTRAINT "GuidanceRevision_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionPolicy" ADD CONSTRAINT "PermissionPolicy_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionPolicyRule" ADD CONSTRAINT "PermissionPolicyRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PermissionPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentPermissionPolicy" ADD CONSTRAINT "SubagentPermissionPolicy_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentPermissionPolicy" ADD CONSTRAINT "SubagentPermissionPolicy_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PermissionPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillCatalogEntry" ADD CONSTRAINT "SkillCatalogEntry_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillCatalogEntry" ADD CONSTRAINT "SkillCatalogEntry_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillCatalogEntry" ADD CONSTRAINT "SkillCatalogEntry_activatedByBridgeCrewId_fkey" FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillCatalogEntry" ADD CONSTRAINT "SkillCatalogEntry_activationSecurityReportId_fkey" FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillImportRun" ADD CONSTRAINT "SkillImportRun_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillImportRun" ADD CONSTRAINT "SkillImportRun_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "SkillCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCatalogEntry" ADD CONSTRAINT "ToolCatalogEntry_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCatalogEntry" ADD CONSTRAINT "ToolCatalogEntry_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCatalogEntry" ADD CONSTRAINT "ToolCatalogEntry_activatedByBridgeCrewId_fkey" FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolCatalogEntry" ADD CONSTRAINT "ToolCatalogEntry_activationSecurityReportId_fkey" FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterCatalogEntry" ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterCatalogEntry" ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activatedByBridgeCrewId_fkey" FOREIGN KEY ("activatedByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterCatalogEntry" ADD CONSTRAINT "RuntimeAdapterCatalogEntry_activationSecurityReportId_fkey" FOREIGN KEY ("activationSecurityReportId") REFERENCES "GovernanceSecurityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterCatalogEntry" ADD CONSTRAINT "RuntimeAdapterCatalogEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterBinding" ADD CONSTRAINT "RuntimeAdapterBinding_runtimeAdapterId_fkey" FOREIGN KEY ("runtimeAdapterId") REFERENCES "RuntimeAdapterCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeAdapterBinding" ADD CONSTRAINT "RuntimeAdapterBinding_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentToolBinding" ADD CONSTRAINT "SubagentToolBinding_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubagentToolBinding" ADD CONSTRAINT "SubagentToolBinding_toolCatalogEntryId_fkey" FOREIGN KEY ("toolCatalogEntryId") REFERENCES "ToolCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolImportRun" ADD CONSTRAINT "ToolImportRun_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolImportRun" ADD CONSTRAINT "ToolImportRun_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolGrant" ADD CONSTRAINT "ShipToolGrant_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolGrant" ADD CONSTRAINT "ShipToolGrant_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolGrant" ADD CONSTRAINT "ShipToolGrant_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolGrant" ADD CONSTRAINT "ShipToolGrant_bridgeCrewId_fkey" FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolGrant" ADD CONSTRAINT "ShipToolGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "ToolCatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_requesterBridgeCrewId_fkey" FOREIGN KEY ("requesterBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipToolAccessRequest" ADD CONSTRAINT "ShipToolAccessRequest_approvedGrantId_fkey" FOREIGN KEY ("approvedGrantId") REFERENCES "ShipToolGrant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_bridgeCrewId_fkey" FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrewSubagentAssignment" ADD CONSTRAINT "BridgeCrewSubagentAssignment_assignedByBridgeCrewId_fkey" FOREIGN KEY ("assignedByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceSecurityReport" ADD CONSTRAINT "GovernanceSecurityReport_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceSecurityReport" ADD CONSTRAINT "GovernanceSecurityReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceSecurityReport" ADD CONSTRAINT "GovernanceSecurityReport_createdByBridgeCrewId_fkey" FOREIGN KEY ("createdByBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_toolCatalogEntryId_fkey" FOREIGN KEY ("toolCatalogEntryId") REFERENCES "ToolCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_runtimeAdapterCatalogEntryId_fkey" FOREIGN KEY ("runtimeAdapterCatalogEntryId") REFERENCES "RuntimeAdapterCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_skillCatalogEntryId_fkey" FOREIGN KEY ("skillCatalogEntryId") REFERENCES "SkillCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_bridgeCrewId_fkey" FOREIGN KEY ("bridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_actorBridgeCrewId_fkey" FOREIGN KEY ("actorBridgeCrewId") REFERENCES "BridgeCrew"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernanceGrantEvent" ADD CONSTRAINT "GovernanceGrantEvent_securityReportId_fkey" FOREIGN KEY ("securityReportId") REFERENCES "GovernanceSecurityReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hook" ADD CONSTRAINT "Hook_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookExecution" ADD CONSTRAINT "HookExecution_hookId_fkey" FOREIGN KEY ("hookId") REFERENCES "Hook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HookExecution" ADD CONSTRAINT "HookExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRun" ADD CONSTRAINT "VerificationRun_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDeployment" ADD CONSTRAINT "AgentDeployment_subagentId_fkey" FOREIGN KEY ("subagentId") REFERENCES "Subagent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDeployment" ADD CONSTRAINT "AgentDeployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeConnection" ADD CONSTRAINT "BridgeConnection_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSecretTemplate" ADD CONSTRAINT "ShipyardSecretTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardCloudCredential" ADD CONSTRAINT "ShipyardCloudCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardCloudSshKey" ADD CONSTRAINT "ShipyardCloudSshKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSshTunnel" ADD CONSTRAINT "ShipyardSshTunnel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSshTunnel" ADD CONSTRAINT "ShipyardSshTunnel_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardSshTunnel" ADD CONSTRAINT "ShipyardSshTunnel_sshKeyId_fkey" FOREIGN KEY ("sshKeyId") REFERENCES "ShipyardCloudSshKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardApiKey" ADD CONSTRAINT "ShipyardApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardBillingWallet" ADD CONSTRAINT "ShipyardBillingWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardBillingTopup" ADD CONSTRAINT "ShipyardBillingTopup_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ShipyardBillingWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardBillingTopup" ADD CONSTRAINT "ShipyardBillingTopup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardBillingLedgerEntry" ADD CONSTRAINT "ShipyardBillingLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "ShipyardBillingWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipyardBillingLedgerEntry" ADD CONSTRAINT "ShipyardBillingLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultRagChunk" ADD CONSTRAINT "VaultRagChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "VaultRagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocalPrivateRagChunk" ADD CONSTRAINT "LocalPrivateRagChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LocalPrivateRagDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemorySigner" ADD CONSTRAINT "UserMemorySigner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeDispatchDelivery" ADD CONSTRAINT "BridgeDispatchDelivery_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeDispatchDelivery" ADD CONSTRAINT "BridgeDispatchDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BridgeConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BridgeCrew" ADD CONSTRAINT "BridgeCrew_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDeployment" ADD CONSTRAINT "ApplicationDeployment_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDeployment" ADD CONSTRAINT "ApplicationDeployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeSource" ADD CONSTRAINT "NodeSource_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingEvent" ADD CONSTRAINT "ForwardingEvent_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingNonce" ADD CONSTRAINT "ForwardingNonce_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingConfig" ADD CONSTRAINT "ForwardingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForwardingConfig" ADD CONSTRAINT "ForwardingConfig_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "NodeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservabilityTrace" ADD CONSTRAINT "ObservabilityTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservabilityTrace" ADD CONSTRAINT "ObservabilityTrace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservabilityTraceDecryptAudit" ADD CONSTRAINT "ObservabilityTraceDecryptAudit_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "ObservabilityTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagPerformanceSample" ADD CONSTRAINT "RagPerformanceSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagPerformanceSample" ADD CONSTRAINT "RagPerformanceSample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagPerformanceSample" ADD CONSTRAINT "RagPerformanceSample_shipDeploymentId_fkey" FOREIGN KEY ("shipDeploymentId") REFERENCES "AgentDeployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimePerformanceSample" ADD CONSTRAINT "RuntimePerformanceSample_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimePerformanceSample" ADD CONSTRAINT "RuntimePerformanceSample_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuntimeIntelligencePolicyState" ADD CONSTRAINT "RuntimeIntelligencePolicyState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterSubscription" ADD CONSTRAINT "NewsletterSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipTopology" ADD CONSTRAINT "ShipTopology_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreasuryConfig" ADD CONSTRAINT "TreasuryConfig_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

