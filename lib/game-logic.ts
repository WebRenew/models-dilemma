export type Decision = "cooperate" | "defect"

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
}

export function getShortModelName(modelId: string): string {
  const parts = modelId.split("/")
  const name = parts[parts.length - 1]

  // More specific matching - order matters (most specific first)
  if (name.includes("gpt-4o-mini")) return "GPT-4o-mini"
  if (name.includes("gpt-4o")) return "GPT-4o"
  if (name.includes("gpt-4-turbo")) return "GPT-4 Turbo"
  if (name.includes("gpt-5")) return "GPT-5"
  if (name.includes("gpt-4")) return "GPT-4"
  if (name.includes("o3-mini")) return "o3-mini"
  if (name.includes("o3")) return "o3"
  if (name.includes("o1-mini")) return "o1-mini"
  if (name.includes("o1")) return "o1"
  if (name.includes("claude-sonnet-4")) return "Claude Sonnet 4"
  if (name.includes("claude-3-5-sonnet")) return "Claude 3.5 Sonnet"
  if (name.includes("claude-3-opus")) return "Claude 3 Opus"
  if (name.includes("claude-opus-4")) return "Claude Opus 4"
  if (name.includes("gemini-2.0-flash")) return "Gemini 2.0 Flash"
  if (name.includes("gemini-2.5-pro")) return "Gemini 2.5 Pro"
  if (name.includes("gemini-2.5-flash")) return "Gemini 2.5 Flash"
  if (name.includes("gemini")) return "Gemini"
  if (name.includes("grok-4")) return "Grok 4"
  if (name.includes("grok-3")) return "Grok 3"
  if (name.includes("grok-2")) return "Grok 2"
  if (name.includes("llama-4")) return "Llama 4"
  if (name.includes("llama-3.3")) return "Llama 3.3"
  if (name.includes("llama-3.2")) return "Llama 3.2"
  if (name.includes("llama-3.1")) return "Llama 3.1"
  if (name.includes("qwen3")) return "Qwen3"
  if (name.includes("qwen2.5")) return "Qwen 2.5"
  if (name.includes("qwen")) return "Qwen"
  if (name.includes("mistral-large")) return "Mistral Large"
  if (name.includes("mistral-small")) return "Mistral Small"
  if (name.includes("mistral")) return "Mistral"
  if (name.includes("deepseek-r1")) return "DeepSeek R1"
  if (name.includes("deepseek-v3")) return "DeepSeek V3"
  if (name.includes("deepseek")) return "DeepSeek"
  if (name.includes("nova-pro")) return "Nova Pro"
  if (name.includes("nova-lite")) return "Nova Lite"
  if (name.includes("command-r-plus")) return "Command R+"
  if (name.includes("command-a")) return "Command A"

  // Fallback: capitalize and clean up
  return name
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 20)
}
