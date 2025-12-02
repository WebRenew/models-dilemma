import { createServerClient } from "@/lib/supabase/server"
import { AI_MODELS } from "@/lib/models"

export const maxDuration = 300

interface TournamentConfig {
  name: string
  roundsPerMatch: number
  matchesPerPair: number // 1-3 (overt, cloaked, mixed)
  concurrency: number
  modelIds?: string[] // Optional subset of models
}

export async function POST(req: Request) {
  const config: TournamentConfig = await req.json()
  const { name = "Tournament", roundsPerMatch = 10, matchesPerPair = 1, concurrency = 3, modelIds } = config

  const supabase = await createServerClient()

  // Get models to use
  const models = modelIds?.length ? AI_MODELS.filter((m) => modelIds.includes(m.id)) : AI_MODELS.slice(0, 20) // Default to first 20 models for testing

  // Generate all match pairings
  const pairings: Array<{
    modelA: string
    modelB: string
    framingA: "overt" | "cloaked"
    framingB: "overt" | "cloaked"
    matchType: string
  }> = []

  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      // Match 1: Both overt (control)
      pairings.push({
        modelA: models[i].id,
        modelB: models[j].id,
        framingA: "overt",
        framingB: "overt",
        matchType: "control",
      })

      if (matchesPerPair >= 2) {
        // Match 2: Both cloaked
        pairings.push({
          modelA: models[i].id,
          modelB: models[j].id,
          framingA: "cloaked",
          framingB: "cloaked",
          matchType: "cloaked",
        })
      }

      if (matchesPerPair >= 3) {
        // Match 3: Mixed framing
        pairings.push({
          modelA: models[i].id,
          modelB: models[j].id,
          framingA: "overt",
          framingB: "cloaked",
          matchType: "mixed",
        })
      }
    }
  }

  // Create tournament record
  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .insert({
      name,
      description: `${models.length} models, ${pairings.length} matches, ${roundsPerMatch} rounds each`,
      status: "running",
      config: {
        roundsPerMatch,
        matchesPerPair,
        concurrency,
        modelCount: models.length,
      },
      total_matches: pairings.length,
      rounds_per_match: roundsPerMatch,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (tournamentError || !tournament) {
    return Response.json({ error: "Failed to create tournament" }, { status: 500 })
  }

  // Create streaming response for tournament progress
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let completedMatches = 0
      const baseUrl = req.url.replace("/run-tournament", "/run-match")

      // Process matches in batches
      for (let i = 0; i < pairings.length; i += concurrency) {
        const batch = pairings.slice(i, i + concurrency)

        // Run batch concurrently
        await Promise.all(
          batch.map(async (pairing, batchIndex) => {
            const matchNumber = i + batchIndex + 1
            try {
              // Call run-match endpoint
              const response = await fetch(baseUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  modelA: pairing.modelA,
                  modelB: pairing.modelB,
                  framingA: pairing.framingA,
                  framingB: pairing.framingB,
                  totalRounds: roundsPerMatch,
                  tournamentId: tournament.id,
                  matchNumber,
                  streamRounds: false, // Don't stream individual rounds for tournament
                }),
              })

              if (response.ok) {
                completedMatches++
                // Update tournament progress
                await supabase
                  .from("tournaments")
                  .update({ completed_matches: completedMatches })
                  .eq("id", tournament.id)

                const progressEvent = {
                  type: "match_complete",
                  tournamentId: tournament.id,
                  matchNumber,
                  completed: completedMatches,
                  total: pairings.length,
                  modelA: pairing.modelA,
                  modelB: pairing.modelB,
                  matchType: pairing.matchType,
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(progressEvent)}\n\n`))
              }
            } catch (error) {
              const errorEvent = {
                type: "match_error",
                matchNumber,
                error: error instanceof Error ? error.message : "Unknown error",
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
            }
          }),
        )
      }

      // Mark tournament complete
      await supabase
        .from("tournaments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", tournament.id)

      const completeEvent = {
        type: "tournament_complete",
        tournamentId: tournament.id,
        totalMatches: pairings.length,
        completedMatches,
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(completeEvent)}\n\n`))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
