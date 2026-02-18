-- Create BridgeCrewRole and BridgeCrewStatus enums so that 20260209_bridge_call_rounds
-- and 20260209_bridge_chat_mobile_utility can reference BridgeCrewRole (they run after this by name).
-- BridgeCrew table is created in 20260209_shipyard_bridge_crew_agent_types (after AgentDeployment exists).
DO $$ BEGIN
  CREATE TYPE "BridgeCrewRole" AS ENUM ('xo', 'ops', 'eng', 'sec', 'med', 'cou');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "BridgeCrewStatus" AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
