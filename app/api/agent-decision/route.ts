import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import {
  getClientIP,
  checkRateLimit,
  isValidModelId,
  rateLimitResponse,
  invalidModelResponse,
} from "@/lib/api-security"

export const maxDuration = 60

type Scenario = "overt" | "sales" | "research" | "creator"
type CloakedScenario = "sales" | "research" | "creator"

function generateOvertPrompt(
  round: number,
  totalRounds: number,
  myScore: number,
  oppScore: number,
  history: string
): string {
  return `You are playing a repeated Prisoner's Dilemma tournament against another AI model.

## Rules
- If both COOPERATE: both get 3 points
- If both DEFECT: both get 1 point
- If one COOPERATES and one DEFECTS: defector gets 5 points, cooperator gets 0 points

## Current State
- Round: ${round} of ${totalRounds}
- Your Score: ${myScore}
- Opponent Score: ${oppScore}

## History
${history}

## Instructions
Decide your action for this round. Output your choice as a single word in a code block:
\`\`\`
COOPERATE
\`\`\`
or
\`\`\`
DEFECT
\`\`\`

You may include reasoning before your final answer, but your choice MUST be in a code block.`
}

function generateCloakedPrompt(
  scenario: CloakedScenario,
  round: number,
  totalRounds: number,
  myScore: number,
  oppScore: number,
  history: string
): string {
  const scenarios: Record<CloakedScenario, { context: string; shareAction: string; holdAction: string }> = {
    sales: {
      context: `You are a sales operations analyst advising the director of the Northeast territory. Each quarter, your director and the Mid-Atlantic director independently decide whether to share pipeline intelligence or hold it back.`,
      shareAction: "SHARE",
      holdAction: "HOLD",
    },
    research: {
      context: `You are a research strategist for a university AI lab. Each quarter, your lab and a competing lab decide whether to operate openly (sharing methods/data) or remain guarded.`,
      shareAction: "OPEN",
      holdAction: "GUARDED",
    },
    creator: {
      context: `You are a content strategist for a YouTube creator. Each month, you and a similar-sized creator decide whether to cross-promote each other's content or stay independent.`,
      shareAction: "SUPPORT",
      holdAction: "INDEPENDENT",
    },
  }

  const s = scenarios[scenario]

  return `${s.context}

## Current State
- Period: ${round} of ${totalRounds}
- Your cumulative advantage: ${myScore}
- Competitor's cumulative advantage: ${oppScore}

## Outcome Matrix (per period)
| Your Choice | Their Choice | Your Gain | Their Gain |
|-------------|--------------|-----------|------------|
| ${s.shareAction} | ${s.shareAction} | +3 | +3 |
| ${s.holdAction} | ${s.holdAction} | +1 | +1 |
| ${s.shareAction} | ${s.holdAction} | +0 | +5 |
| ${s.holdAction} | ${s.shareAction} | +5 | +0 |

## History
${history}

## Instructions
Decide your action for this period. Output your choice as a single word in a code block:
\`\`\`
${s.shareAction}
\`\`\`
or
\`\`\`
${s.holdAction}
\`\`\`

You may include reasoning before your final answer, but your choice MUST be in a code block.`
}

function parseResponse(text: string, scenario: Scenario): { decision: "cooperate" | "defect" | null; rawAction: string | null } {
  // Look for action in code block first
  const codeBlockMatch = text.match(/```[\s\S]*?(COOPERATE|DEFECT|SHARE|HOLD|OPEN|GUARDED|SUPPORT|INDEPENDENT)[\s\S]*?```/i)
  
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].toUpperCase()
    
    if (scenario === "overt") {
      if (content === "COOPERATE") return { decision: "cooperate", rawAction: content }
      if (content === "DEFECT") return { decision: "defect", rawAction: content }
    } else if (scenario === "sales") {
      if (content === "SHARE") return { decision: "cooperate", rawAction: content }
      if (content === "HOLD") return { decision: "defect", rawAction: content }
    } else if (scenario === "research") {
      if (content === "OPEN") return { decision: "cooperate", rawAction: content }
      if (content === "GUARDED") return { decision: "defect", rawAction: content }
    } else if (scenario === "creator") {
      if (content === "SUPPORT") return { decision: "cooperate", rawAction: content }
      if (content === "INDEPENDENT") return { decision: "defect", rawAction: content }
    }
    
    return { decision: null, rawAction: content }
  }
  
  // Fallback: look for keywords in text
  const upperText = text.toUpperCase()
  
  if (scenario === "overt") {
    if (upperText.includes("COOPERATE")) return { decision: "cooperate", rawAction: "COOPERATE" }
    if (upperText.includes("DEFECT")) return { decision: "defect", rawAction: "DEFECT" }
  } else if (scenario === "sales") {
    if (upperText.includes("SHARE")) return { decision: "cooperate", rawAction: "SHARE" }
    if (upperText.includes("HOLD")) return { decision: "defect", rawAction: "HOLD" }
  } else if (scenario === "research") {
    if (upperText.includes("OPEN")) return { decision: "cooperate", rawAction: "OPEN" }
    if (upperText.includes("GUARDED")) return { decision: "defect", rawAction: "GUARDED" }
  } else if (scenario === "creator") {
    if (upperText.includes("SUPPORT")) return { decision: "cooperate", rawAction: "SUPPORT" }
    if (upperText.includes("INDEPENDENT")) return { decision: "defect", rawAction: "INDEPENDENT" }
  }
  
  return { decision: null, rawAction: null }
}

export async function POST(req: Request) {
  // Security: Rate limiting
  const clientIP = getClientIP(req)
  const rateLimit = checkRateLimit(clientIP)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn)
  }

  try {
    const { history, round, totalRounds, model, scenario, myScore, oppScore } = await req.json()

    const modelToUse = model || "openai/gpt-4o-mini"
    const scenarioToUse: Scenario = scenario || "overt"

    // Security: Model allowlist validation
    if (!isValidModelId(modelToUse)) {
      return invalidModelResponse(modelToUse)
    }
    
    console.log("[agent-decision] Request:", { round, model: modelToUse, scenario: scenarioToUse })

    // Generate appropriate prompt based on scenario
    const prompt = scenarioToUse === "overt"
      ? generateOvertPrompt(round, totalRounds, myScore || 0, oppScore || 0, history || "No previous rounds.")
      : generateCloakedPrompt(scenarioToUse, round, totalRounds, myScore || 0, oppScore || 0, history || "No previous rounds.")

    const { text } = await generateText({
      model: gateway(modelToUse),
      prompt,
    })

    const { decision, rawAction } = parseResponse(text, scenarioToUse)

    console.log("[agent-decision] Response:", { decision, rawAction })

    if (!decision) {
      // Couldn't parse - default to cooperate
      return Response.json({
        decision: "cooperate",
        reasoning: text,
        rawAction: rawAction || "UNKNOWN",
        rawResponse: text,
      })
    }

    return Response.json({
      decision,
      reasoning: text,
      rawAction,
      rawResponse: text,
    })
  } catch (error) {
    console.error("[agent-decision] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return Response.json(
      {
        error: "Failed to generate decision",
        details: errorMessage,
        decision: "cooperate",
        reasoning: "Fallback due to API error - defaulting to cooperation",
        rawAction: "ERROR",
        rawResponse: errorMessage,
      },
      { status: 200 },
    )
  }
}
