import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { BridgeChatUtility } from "@/components/bridge-chat/BridgeChatUtility"

export const dynamic = "force-dynamic"

export default async function BridgeChatPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/login")
  }

  return <BridgeChatUtility operatorLabel={session.user.email || "Operator"} />
}
