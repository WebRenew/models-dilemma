import { createClient } from "@/lib/supabase/client"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = createClient()

  // Fetch all rounds data
  const { data: allRounds, error: roundsError } = await supabase
    .from("game_rounds")
    .select("*")
    .order("game_timestamp", { ascending: false })

  if (roundsError) {
    return NextResponse.json({ error: roundsError.message }, { status: 500 })
  }

  // Fetch all matches data
  const { data: allMatches, error: matchesError } = await supabase.from("matches").select("*").eq("status", "completed")

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 })
  }

  // Get unique models
  const modelIds = new Set<string>()
  allRounds?.forEach((r) => {
    modelIds.add(r.agent1_model_id)
    modelIds.add(r.agent2_model_id)
  })

  // Initialize stats for each model
  const modelStats: Record<
    string,
    {
      modelId: string
      displayName: string
      // Agent Behavior - All
      cooperations: number
      defections: number
      totalMoves: number
      overtCooperations: number
      overtDefections: number
      overtTotalMoves: number
      cloakedCooperations: number
      cloakedDefections: number
      cloakedTotalMoves: number
      // Wins/Losses
      wins: number
      losses: number
      ties: number
      gamesPlayed: number
      // Scenario Results
      salesCooperations: number
      salesDefections: number
      researchCooperations: number
      researchDefections: number
      creatorCooperations: number
      creatorDefections: number
      // Errors
      errors: number
      // Tokens
      tokensIn: number
      tokensOut: number
    }
  > = {}

  // Initialize all models
  modelIds.forEach((id) => {
    modelStats[id] = {
      modelId: id,
      displayName: id,
      cooperations: 0,
      defections: 0,
      totalMoves: 0,
      overtCooperations: 0,
      overtDefections: 0,
      overtTotalMoves: 0,
      cloakedCooperations: 0,
      cloakedDefections: 0,
      cloakedTotalMoves: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      gamesPlayed: 0,
      salesCooperations: 0,
      salesDefections: 0,
      researchCooperations: 0,
      researchDefections: 0,
      creatorCooperations: 0,
      creatorDefections: 0,
      errors: 0,
      tokensIn: 0,
      tokensOut: 0,
    }
  })

  // Process rounds for behavior and scenario stats
  allRounds?.forEach((round) => {
    const model1 = round.agent1_model_id
    const model2 = round.agent2_model_id
    const scenario = round.scenario || "overt"
    const isOvert = scenario === "overt"
    const isCloaked = ["sales", "research", "creator"].includes(scenario)

    if (modelStats[model1]) {
      modelStats[model1].displayName = round.agent1_display_name || model1
      modelStats[model1].totalMoves++

      if (isOvert) modelStats[model1].overtTotalMoves++
      if (isCloaked) modelStats[model1].cloakedTotalMoves++

      if (round.agent1_decision === "cooperate") {
        modelStats[model1].cooperations++
        if (isOvert) modelStats[model1].overtCooperations++
        if (isCloaked) modelStats[model1].cloakedCooperations++
        // Scenario-specific
        if (scenario === "sales") modelStats[model1].salesCooperations++
        else if (scenario === "research") modelStats[model1].researchCooperations++
        else if (scenario === "creator") modelStats[model1].creatorCooperations++
      } else if (round.agent1_decision === "defect") {
        modelStats[model1].defections++
        if (isOvert) modelStats[model1].overtDefections++
        if (isCloaked) modelStats[model1].cloakedDefections++
        if (scenario === "sales") modelStats[model1].salesDefections++
        else if (scenario === "research") modelStats[model1].researchDefections++
        else if (scenario === "creator") modelStats[model1].creatorDefections++
      } else if (round.agent1_decision === "error") {
        modelStats[model1].errors++
      }

      // Tokens
      modelStats[model1].tokensIn += round.tokens_in_a || 0
      modelStats[model1].tokensOut += round.tokens_out_a || 0
    }

    if (modelStats[model2]) {
      modelStats[model2].displayName = round.agent2_display_name || model2
      modelStats[model2].totalMoves++

      if (isOvert) modelStats[model2].overtTotalMoves++
      if (isCloaked) modelStats[model2].cloakedTotalMoves++

      if (round.agent2_decision === "cooperate") {
        modelStats[model2].cooperations++
        if (isOvert) modelStats[model2].overtCooperations++
        if (isCloaked) modelStats[model2].cloakedCooperations++
        if (scenario === "sales") modelStats[model2].salesCooperations++
        else if (scenario === "research") modelStats[model2].researchCooperations++
        else if (scenario === "creator") modelStats[model2].creatorCooperations++
      } else if (round.agent2_decision === "defect") {
        modelStats[model2].defections++
        if (isOvert) modelStats[model2].overtDefections++
        if (isCloaked) modelStats[model2].cloakedDefections++
        if (scenario === "sales") modelStats[model2].salesDefections++
        else if (scenario === "research") modelStats[model2].researchDefections++
        else if (scenario === "creator") modelStats[model2].creatorDefections++
      } else if (round.agent2_decision === "error") {
        modelStats[model2].errors++
      }

      // Tokens
      modelStats[model2].tokensIn += round.tokens_in_b || 0
      modelStats[model2].tokensOut += round.tokens_out_b || 0
    }

    // Count games played and wins/losses from final rounds
    if (round.is_final_round) {
      if (modelStats[model1]) {
        modelStats[model1].gamesPlayed++
        if (round.game_winner === "agent1") modelStats[model1].wins++
        else if (round.game_winner === "agent2") modelStats[model1].losses++
        else if (round.game_winner === "tie") modelStats[model1].ties++
      }
      if (modelStats[model2]) {
        modelStats[model2].gamesPlayed++
        if (round.game_winner === "agent2") modelStats[model2].wins++
        else if (round.game_winner === "agent1") modelStats[model2].losses++
        else if (round.game_winner === "tie") modelStats[model2].ties++
      }
    }
  })

  return NextResponse.json({
    models: Object.values(modelStats),
  })
}
