import { generateObject } from "ai"
import { z } from "zod"

export const maxDuration = 60

const decisionSchema = z.object({
  decision: z.enum(["cooperate", "defect"]),
  reasoning: z.string().describe("Brief explanation of the decision strategy"),
})

export async function POST(req: Request) {
  try {
    const { agentName, personality, history, round, totalRounds, model } = await req.json()

    const modelToUse = model || "openai/gpt-4o-mini"
    console.log("[v0] Agent decision request:", { agentName, round, model: modelToUse })

    const { object } = await generateObject({
      model: modelToUse,
      schema: decisionSchema,
      prompt: `You are ${agentName}, an AI agent playing the Prisoner's Dilemma game.

Your personality/strategy: ${personality}

Game rules:
- Both cooperate: Each gets 3 points
- Both defect: Each gets 1 point  
- One cooperates, one defects: Cooperator gets 0, Defector gets 5

Current round: ${round} of ${totalRounds}

Previous rounds:
${history || "No previous rounds yet."}

Based on your personality and the game history, decide whether to COOPERATE or DEFECT.
Provide your decision and a brief reasoning (1-2 sentences).`,
    })

    console.log("[v0] Agent decision response:", { agentName, decision: object.decision })

    return Response.json(object)
  } catch (error) {
    console.error("[v0] Agent decision error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return Response.json(
      {
        error: "Failed to generate decision",
        details: errorMessage,
        // Fallback decision so the game can continue
        decision: "cooperate",
        reasoning: "Fallback due to API error - defaulting to cooperation",
      },
      { status: 200 }, // Return 200 so game continues with fallback
    )
  }
}
