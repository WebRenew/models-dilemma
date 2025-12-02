import { cancelMatch } from "@/lib/match-registry"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const { matchId } = await req.json()

  if (!matchId) {
    return Response.json({ error: "matchId required" }, { status: 400 })
  }

  // Cancel in registry
  const cancelled = cancelMatch(matchId)

  // Update database status
  const supabase = await createServerClient()
  await supabase
    .from("matches")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", matchId)

  return Response.json({ success: true, cancelled })
}
