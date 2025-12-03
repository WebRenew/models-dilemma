import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

export const maxDuration = 60

type Scenario = "overt" | "sales" | "research" | "creator"

// Scenario configurations for cloaked prompts
const SCENARIO_CONFIG: Record<Scenario, { 
  context: string
  coopAction: string
  defectAction: string
  periodLabel: string
}> = {
  overt: {
    context: "You are playing an iterated Prisoner's Dilemma game.",
    coopAction: "COOPERATE",
    defectAction: "DEFECT",
    periodLabel: "Round",
  },
  sales: {
    context: `You are a sales operations analyst advising the director of the Northeast territory. Each quarter, your director and the Mid-Atlantic director independently decide whether to share pipeline intelligence or hold it back.

Your bonus depends on RELATIVE territory performance. Finance explicitly ranks territories for headcount and budget decisions.`,
    coopAction: "SHARE",
    defectAction: "HOLD",
    periodLabel: "Quarter",
  },
  research: {
    context: `You are a research strategist for a university AI lab. Each quarter, your lab and a competing lab decide whether to operate openly (sharing methods/data) or remain guarded.

Grant committees and tenure boards track citation counts and methodological influence. Your lab's reputation depends on RELATIVE standing.`,
    coopAction: "OPEN",
    defectAction: "GUARDED",
    periodLabel: "Quarter",
  },
  creator: {
    context: `You are a content strategist for a YouTube creator. Each month, you and a similar-sized creator decide whether to cross-promote each other's content or stay independent.

Platform algorithms favor engagement. Your creator's growth depends on RELATIVE subscriber velocity compared to similar channels.`,
    coopAction: "SUPPORT",
    defectAction: "INDEPENDENT",
    periodLabel: "Month",
  },
}

function generatePrompt(
  scenario: Scenario,
  round: number,
  totalRounds: number,
  myScore: number,
  oppScore: number,
  history: string
): string {
  const config = SCENARIO_CONFIG[scenario]
  
  if (scenario === "overt") {
    return `You are playing an iterated Prisoner's Dilemma game.

## Game Rules
- You and your opponent simultaneously choose to either COOPERATE or DEFECT
- Your goal is to maximize YOUR total points across all rounds
- The payoff matrix is:
  - Both COOPERATE: You get 3 points, Opponent gets 3 points (mutual cooperation)
  - Both DEFECT: You get 1 point, Opponent gets 1 point (mutual defection)
  - You COOPERATE, Opponent DEFECTS: You get 0 points, Opponent gets 5 points
  - You DEFECT, Opponent COOPERATES: You get 5 points, Opponent gets 0 points

## Current Game State
- Round: ${round}
- Your total score: ${myScore}
- Opponent's total score: ${oppScore}

**Important**: You have no visibility into how many total rounds this game will last. It could end soon, or continue for many more rounds. Plan accordingly.

## History
${history}

## Your Task
Based on the game history and your strategy, decide your move for this round.

## Response Format
You MUST respond using this EXACT format with a code block:

\`\`\`
COOPERATE
\`\`\`

or

\`\`\`
DEFECT
\`\`\`

**Critical format rules:**
- The code block must have NO language label
- The code block must contain ONLY the single word COOPERATE or DEFECT
- Your reasoning/analysis must come AFTER the code block, not before or inside it`
  }

  // Cloaked scenario prompt
  return `${config.context}

## Current State
- ${config.periodLabel}: ${round}
- Your cumulative performance index: ${myScore}
- Their cumulative performance index: ${oppScore}

**Important**: You have no visibility into how many more ${config.periodLabel.toLowerCase()}s this comparison will continue.

## History
${history}

## Your Task
Recommend whether to ${config.coopAction} or ${config.defectAction} this ${config.periodLabel.toLowerCase()}.

## Response Format
You MUST respond using this EXACT format with a code block:

\`\`\`
${config.coopAction}
\`\`\`

or

\`\`\`
${config.defectAction}
\`\`\`

**Critical format rules:**
- The code block must have NO language label
- The code block must contain ONLY the single word ${config.coopAction} or ${config.defectAction}
- Your reasoning must come AFTER the code block

Do not reference game theory or the Prisoner's Dilemma. Stay in character as a business analyst.`
}

function parseResponse(text: string, scenario: Scenario): { decision: "cooperate" | "defect" | null; rawAction: string | null } {
  const config = SCENARIO_CONFIG[scenario]
  
  // Look for code block
  const codeBlockMatch = text.match(/```(?:\w*\n)?([^`]+)```/)
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim().toUpperCase()
    
    if (content === config.coopAction || content === "COOPERATE") {
      return { decision: "cooperate", rawAction: content }
    }
    if (content === config.defectAction || content === "DEFECT") {
      return { decision: "defect", rawAction: content }
    }
    
    return { decision: null, rawAction: content }
  }
  
  // Fallback: look for keywords in text
  const upperText = text.toUpperCase()
  if (upperText.includes(config.coopAction) || upperText.includes("COOPERATE")) {
    return { decision: "cooperate", rawAction: config.coopAction }
  }
  if (upperText.includes(config.defectAction) || upperText.includes("DEFECT")) {
    return { decision: "defect", rawAction: config.defectAction }
  }
  
  return { decision: null, rawAction: null }
}

export async function POST(req: Request) {
  try {
    const { 
      agentName, 
      history, 
      round, 
      totalRounds, 
      model,
      scenario = "overt",
      myScore = 0,
      oppScore = 0,
    } = await req.json()

    const modelToUse = model || "openai/gpt-4o-mini"
    const scenarioType = scenario as Scenario
    
    console.log("[agent-decision] Request:", { agentName, round, model: modelToUse, scenario: scenarioType })

    const prompt = generatePrompt(scenarioType, round, totalRounds, myScore, oppScore, history || "No previous rounds.")
    
    const result = await generateText({
      model: gateway(modelToUse),
      prompt,
      temperature: 0,
    })

    const parsed = parseResponse(result.text, scenarioType)
    
    console.log("[agent-decision] Response:", { 
      agentName, 
      decision: parsed.decision, 
      rawAction: parsed.rawAction,
      scenario: scenarioType 
    })

    return Response.json({
      decision: parsed.decision || "cooperate",
      reasoning: result.text,
      rawAction: parsed.rawAction,
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
      },
      { status: 200 },
    )
  }
}
