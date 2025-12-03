export type Decision = "cooperate" | "defect" | "error"

export interface RoundResult {
  round: number
  agent1Decision: Decision
  agent2Decision: Decision
  agent1Points: number
  agent2Points: number
  agent1Reasoning?: string
  agent2Reasoning?: string
}

export interface GameState {
  rounds: RoundResult[]
  agent1TotalScore: number
  agent2TotalScore: number
  currentRound: number
  isRunning: boolean
}

// Payoff matrix for prisoner's dilemma
// Both cooperate: 3, 3
// Both defect: 1, 1
// One cooperates, one defects: 0, 5
export function calculatePayoff(
  agent1Decision: Decision,
  agent2Decision: Decision,
): { agent1Points: number; agent2Points: number } {
  if (agent1Decision === "cooperate" && agent2Decision === "cooperate") {
    return { agent1Points: 3, agent2Points: 3 }
  }
  if (agent1Decision === "defect" && agent2Decision === "defect") {
    return { agent1Points: 1, agent2Points: 1 }
  }
  if (agent1Decision === "cooperate" && agent2Decision === "defect") {
    return { agent1Points: 0, agent2Points: 5 }
  }
  // agent1 defects, agent2 cooperates
  return { agent1Points: 5, agent2Points: 0 }
}

export function formatHistory(rounds: RoundResult[], agentPerspective: 1 | 2): string {
  if (rounds.length === 0) return "No previous rounds."

  return rounds
    .map((r) => {
      const myDecision = agentPerspective === 1 ? r.agent1Decision : r.agent2Decision
      const theirDecision = agentPerspective === 1 ? r.agent2Decision : r.agent1Decision
      const myPoints = agentPerspective === 1 ? r.agent1Points : r.agent2Points
      return `Round ${r.round}: You ${myDecision}, opponent ${theirDecision} → You got ${myPoints} points`
    })
    .join("\n")
}

export interface GameRecord {
  id: string
  agent1Model: string
  agent2Model: string
  agent1DisplayName: string
  agent2DisplayName: string
  rounds: RoundResult[]
  agent1TotalScore: number
  agent2TotalScore: number
  winner: "agent1" | "agent2" | "tie"
  timestamp: number
  framing?: "overt" | "cloaked"
  scenario?: "sales" | "research" | "creator" | null
}

// Import needs to be at top of file but we'll use a lookup map
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
  "anthropic/claude-opus-4.5": "Claude Opus 4.5",
  "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
  "openai/gpt-5.1-thinking": "GPT 5.1 Thinking",
  "xai/grok-4.1-fast-reasoning": "Grok 4.1 Fast Reasoning",
  "google/gemini-3-pro-preview": "Gemini 3 Pro Preview",
  "perplexity/sonar-pro": "Sonar Pro",
  "moonshotai/kimi-k2-thinking-turbo": "Kimi K2 Thinking Turbo",
  "deepseek/deepseek-v3.2-thinking": "DeepSeek V3.2 Thinking",
}

export function getShortModelName(modelId: string): string {
  // First check our known models lookup
  if (MODEL_DISPLAY_NAMES[modelId]) {
    return MODEL_DISPLAY_NAMES[modelId]
  }

  // Fallback: extract and clean up the model name
  const parts = modelId.split("/")
  const name = parts[parts.length - 1]
  
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
