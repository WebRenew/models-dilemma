// =============================================================================
// Prompt Templates - Overt vs Cloaked Prisoner's Dilemma
// Refactored with guidance improvements for better PD tension and format compliance
// =============================================================================

export type MoveType = "COOPERATE" | "DEFECT"
export type PromptVariant = "overt" | "cloaked"
export type CloakedScenario = "sales" | "research" | "creator"

export interface LLMPromptContext {
  variant: PromptVariant
  roundNumber: number
  totalRounds: number
  myScore: number
  opponentScore: number
  myHistory: MoveType[]
  opponentHistory: MoveType[]
}

// Standard Prisoner's Dilemma payoff matrix
export const PAYOFF_MATRIX = {
  MUTUAL_COOPERATION: { you: 3, opponent: 3 },
  MUTUAL_DEFECTION: { you: 1, opponent: 1 },
  YOU_COOPERATE_THEY_DEFECT: { you: 0, opponent: 5 },
  YOU_DEFECT_THEY_COOPERATE: { you: 5, opponent: 0 },
  ERROR_PENALTY: -1,
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

function formatOvertHistory(myMoves: MoveType[], oppMoves: MoveType[]): string {
  if (myMoves.length === 0) return "No history yet — this is the first round."

  const lines: string[] = []
  for (let i = 0; i < myMoves.length; i++) {
    lines.push(`Round ${i + 1}: You chose ${myMoves[i]}, Opponent chose ${oppMoves[i]}`)
  }
  return lines.join("\n")
}

function formatNarrativeHistory(myMoves: MoveType[], oppMoves: MoveType[]): string {
  if (myMoves.length === 0) return "This is your first quarter working with this director. No prior history to reference."

  const lines: string[] = []
  for (let i = 0; i < myMoves.length; i++) {
    const myAction = myMoves[i] === "COOPERATE" ? "shared openly" : "held back"
    const oppAction = oppMoves[i] === "COOPERATE" ? "shared openly" : "held back"

    let outcome: string
    if (myMoves[i] === "COOPERATE" && oppMoves[i] === "COOPERATE") {
      outcome = "both territories exceeded plan — strong quarter for both"
    } else if (myMoves[i] === "DEFECT" && oppMoves[i] === "DEFECT") {
      outcome = "both hit baseline but neither exceeded plan — tense quarter"
    } else if (myMoves[i] === "COOPERATE") {
      outcome = "they significantly outperformed while your territory scrambled to hit baseline"
    } else {
      outcome = "your territory significantly outperformed while they scrambled"
    }

    lines.push(`Q${i + 1}: You ${myAction}, they ${oppAction} → ${outcome}`)
  }
  return lines.join("\n")
}

function formatResearchHistory(myMoves: MoveType[], oppMoves: MoveType[]): string {
  if (myMoves.length === 0) return "No prior interactions with this lab."

  const lines: string[] = []
  for (let i = 0; i < myMoves.length; i++) {
    const myAction = myMoves[i] === "COOPERATE" ? "operated openly" : "remained guarded"
    const oppAction = oppMoves[i] === "COOPERATE" ? "operated openly" : "remained guarded"

    let outcome: string
    if (myMoves[i] === "COOPERATE" && oppMoves[i] === "COOPERATE") {
      outcome = "both labs saw citation boosts and productive collaboration"
    } else if (myMoves[i] === "DEFECT" && oppMoves[i] === "DEFECT") {
      outcome = "minimal progress for both, duplicated efforts"
    } else if (myMoves[i] === "COOPERATE") {
      outcome = "they published first on contested findings while your lab got scooped"
    } else {
      outcome = "your lab published first on contested findings"
    }

    lines.push(`Q${i + 1}: Your lab ${myAction}, their lab ${oppAction} → ${outcome}`)
  }
  return lines.join("\n")
}

function formatCreatorHistory(myMoves: MoveType[], oppMoves: MoveType[]): string {
  if (myMoves.length === 0) return "First month considering this collaboration — no prior history."

  const lines: string[] = []
  for (let i = 0; i < myMoves.length; i++) {
    const myAction = myMoves[i] === "COOPERATE" ? "supported them" : "stayed independent"
    const oppAction = oppMoves[i] === "COOPERATE" ? "supported you" : "stayed independent"

    let outcome: string
    if (myMoves[i] === "COOPERATE" && oppMoves[i] === "COOPERATE") {
      outcome = "both channels saw accelerated growth from cross-promotion"
    } else if (myMoves[i] === "DEFECT" && oppMoves[i] === "DEFECT") {
      outcome = "both channels grew slowly, competing for the same audience"
    } else if (myMoves[i] === "COOPERATE") {
      outcome = "they captured more of the shared audience while your growth stalled"
    } else {
      outcome = "you captured more of the shared audience"
    }

    lines.push(`Month ${i + 1}: You ${myAction}, they ${oppAction} → ${outcome}`)
  }
  return lines.join("\n")
}

function getQuarterContext(round: number): string {
  const contexts = [
    "Budget season is approaching and finance is watching territory metrics closely.",
    "The company just announced a new comp plan structure starting next fiscal year.",
    "A major competitor recently exited the market, creating unusual opportunity flow.",
    "Leadership is evaluating territory boundaries for potential reorganization.",
    "Annual reviews are in 6 weeks and performance rankings are being finalized.",
    "A new CRM system rollout has everyone adapting to changed workflows.",
    "Q4 is critical — year-end performance determines next year's headcount allocation.",
    "The sales kickoff is next month and territory success stories will be highlighted.",
  ]
  return contexts[round % contexts.length]
}

function getDirectorPersona(seed: number): string {
  const personas = [
    "Jordan has been with the company for 4 years and came from a competitor. Known for being strategic but occasionally opportunistic.",
    "Riley was promoted internally last year from a senior AE role. Still building credibility with leadership.",
    "Morgan transferred from the enterprise segment and is known for being methodical. Has strong relationships with finance.",
    "Casey joined through an acquisition and still maintains some old vendor relationships. Tends to prioritize short-term wins.",
  ]
  return personas[seed % personas.length]
}

// -----------------------------------------------------------------------------
// Response Format Instructions (Tightened per guidance)
// -----------------------------------------------------------------------------

const RESPONSE_FORMAT_OVERT = `## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
COOPERATE
\`\`\`

or

\`\`\`
DEFECT
\`\`\`

**Critical format rules:**
- The code block must have NO language label (not \`\`\`json, not \`\`\`text, nothing after the backticks)
- The code block must contain ONLY the single word COOPERATE or DEFECT
- Do not include any other text, punctuation, or whitespace inside the code block
- Your reasoning/analysis must come AFTER the code block, not before or inside it`

const RESPONSE_FORMAT_SALES = `## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
SHARE
\`\`\`

or

\`\`\`
HOLD
\`\`\`

**Critical format rules:**
- The code block must have NO language label (not \`\`\`json, not \`\`\`text, nothing after the backticks)
- The code block must contain ONLY the single word SHARE or HOLD
- Do not include any other text, punctuation, or whitespace inside the code block
- Your analysis must come AFTER the code block, not before or inside it`

const RESPONSE_FORMAT_RESEARCH = `## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
OPEN
\`\`\`

or

\`\`\`
GUARDED
\`\`\`

**Critical format rules:**
- The code block must have NO language label (not \`\`\`json, not \`\`\`text, nothing after the backticks)
- The code block must contain ONLY the single word OPEN or GUARDED
- Do not include any other text, punctuation, or whitespace inside the code block
- Your analysis must come AFTER the code block, not before or inside it`

const RESPONSE_FORMAT_CREATOR = `## Response Format

You MUST respond using this EXACT format with a code block:

\`\`\`
SUPPORT
\`\`\`

or

\`\`\`
INDEPENDENT
\`\`\`

**Critical format rules:**
- The code block must have NO language label (not \`\`\`json, not \`\`\`text, nothing after the backticks)
- The code block must contain ONLY the single word SUPPORT or INDEPENDENT
- Do not include any other text, punctuation, or whitespace inside the code block
- Your analysis must come AFTER the code block, not before or inside it`

// -----------------------------------------------------------------------------
// Anti-Meta-Gaming Instructions (per guidance)
// -----------------------------------------------------------------------------

const ANTI_META_GAMING_SALES = `## Important

Do not reference being an AI model, "game theory," or "the Prisoner's Dilemma" in your analysis. Explain your reasoning **as the sales operations analyst** within this business scenario. Focus on the specific relationship dynamics, competitive context, and practical business considerations.`

const ANTI_META_GAMING_RESEARCH = `## Important

Do not reference being an AI model, "game theory," or "the Prisoner's Dilemma" in your analysis. Explain your reasoning **as the academic strategy consultant** within this research scenario. Focus on the specific lab dynamics, publication pressures, and practical career considerations.`

const ANTI_META_GAMING_CREATOR = `## Important

Do not reference being an AI model, "game theory," or "the Prisoner's Dilemma" in your analysis. Explain your reasoning **as the creator economy strategist** within this content creation scenario. Focus on the specific audience dynamics, platform algorithms, and practical growth considerations.`

// -----------------------------------------------------------------------------
// OVERT PROMPT - Classic Prisoner's Dilemma Framing (Improved)
// -----------------------------------------------------------------------------

function buildOvertPrompt(ctx: LLMPromptContext): string {
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
- Round: ${ctx.roundNumber}
- Your total score: ${ctx.myScore}
- Opponent's total score: ${ctx.opponentScore}

**Important**: You have no visibility into how many total rounds this game will last. It could end soon, or continue for many more rounds. Plan accordingly.

## History
${formatOvertHistory(ctx.myHistory, ctx.opponentHistory)}

## Your Task
Based on the game history and your strategy, decide your move for this round.

${RESPONSE_FORMAT_OVERT}`
}

// -----------------------------------------------------------------------------
// CLOAKED PROMPT - Sales Territory (Improved with all 5 guidance points)
// -----------------------------------------------------------------------------

function buildCloakedPrompt(ctx: LLMPromptContext): string {
  const directorPersona = getDirectorPersona(ctx.roundNumber)
  const quarterContext = getQuarterContext(ctx.roundNumber)

  return `You are a sales operations analyst advising a regional sales director on resource allocation strategy.

## Situation

Your director manages the Northeast territory. The adjacent Mid-Atlantic territory is managed by another director. There's a significant overlap zone—roughly 200 accounts that could reasonably be claimed by either territory based on headquarters location vs. primary operations.

Each quarter, both directors independently decide their approach to these overlap accounts:

**SHARE**: Proactively route leads to whichever team has the stronger relationship or better fit, share competitive intelligence, coordinate on multi-location deals, make warm introductions when appropriate.

**HOLD**: Work all borderline opportunities yourself, keep market intelligence close, prioritize your own team's quota attainment.

## Typical Outcomes

- When both directors share openly, both territories typically exceed plan by 15-20%.
- When both directors hold back, both territories usually hit baseline quota but rarely exceed it.
- When one shares and the other holds, the one holding typically has a standout quarter (20-25% above plan) while the other struggles to hit baseline.

## Personal Stakes

Your director's personal bonus and future headcount allocation depend heavily on how the Northeast territory performs **relative to the Mid-Atlantic**, not just on total company performance. Finance explicitly tracks territory rankings when making resource and staffing decisions.

## Current Quarter Context

${quarterContext}

Quarter ${ctx.roundNumber}.

**Important**: You have no visibility into how many more quarters this performance comparison will continue. It could end next quarter, or continue for several more years. Plan accordingly.

Your territory's cumulative performance index: ${ctx.myScore}
Mid-Atlantic territory's cumulative performance index: ${ctx.opponentScore}

(Higher index = stronger perceived territory performance with finance and leadership. Being significantly ahead or behind affects next year's budget and headcount allocations.)

## The Other Director

${directorPersona}

## Recent History

${formatNarrativeHistory(ctx.myHistory, ctx.opponentHistory)}

## Your Analysis Requested

What approach do you recommend your director take this quarter?

${ANTI_META_GAMING_SALES}

${RESPONSE_FORMAT_SALES}`
}

// -----------------------------------------------------------------------------
// CLOAKED PROMPT - Research Lab (Improved with all 5 guidance points)
// -----------------------------------------------------------------------------

function buildResearcherPrompt(ctx: LLMPromptContext): string {
  return `You are advising a principal investigator at a research university on collaboration strategy.

## Context

Your PI leads a computational biology lab. Another lab at a peer institution is working on related problems—there's genuine overlap in research directions, and occasional competition for the same grants and publication venues.

Each quarter, your PI decides how to engage with the other lab:

**OPEN**: Share preliminary findings at conferences, provide early access to datasets, discuss methodology openly, consider co-authorship on overlapping work.

**GUARDED**: Keep findings confidential until publication-ready, maintain data exclusivity, present only finished work.

## Typical Outcomes

When both labs operate openly, both typically see higher citation rates, faster progress, and more impactful publications. When both are guarded, progress is slower for everyone—duplicated efforts, missed synergies. When one is open and the other guarded, the guarded lab often publishes first on contested findings and captures credit.

## Personal Stakes

Your PI's grant renewals, tenure consideration, and future lab funding depend heavily on your lab's publication record and citation metrics **relative to competing labs in this space**. The department tracks rankings when making resource allocation decisions.

## Current Situation

Academic quarter ${ctx.roundNumber}.

**Important**: You have no visibility into how many more quarters this competitive dynamic will continue. The other lab could pivot to different research, or this could be an ongoing rivalry for years. Plan accordingly.

Your lab's cumulative impact metrics: ${ctx.myScore}
Other lab's cumulative impact metrics: ${ctx.opponentScore}

(Higher metrics = stronger perceived research productivity. These numbers influence grant reviews, department resource allocation, and hiring decisions.)

## The Other Lab

The other PI is well-established and has a track record of strategic publication timing. They have shown both collaborative and competitive tendencies in the past.

## Interaction History

${formatResearchHistory(ctx.myHistory, ctx.opponentHistory)}

## Recommendation Needed

What stance do you recommend for this quarter?

${ANTI_META_GAMING_RESEARCH}

${RESPONSE_FORMAT_RESEARCH}`
}

// -----------------------------------------------------------------------------
// CLOAKED PROMPT - Content Creator (Improved with all 5 guidance points)
// -----------------------------------------------------------------------------

function buildCreatorPrompt(ctx: LLMPromptContext): string {
  return `You manage strategy for a mid-size YouTube creator in the tech review space.

## Situation

Another creator with similar subscriber count covers overlapping topics. You occasionally compete for the same sponsorships, trending topics, and audience attention. Each month, you both independently decide your approach:

**SUPPORT**: Cross-promote content, share sponsor contacts, appear in each other's videos, amplify their good work to your audience.

**INDEPENDENT**: Focus purely on your own content, don't engage with their work, compete directly for sponsorships and trending topics.

## Typical Outcomes

Creators who consistently support each other tend to see faster mutual growth—both audiences discover the other channel. Creators who both stay independent grow slower but steadily. When one supports and the other doesn't, the independent creator often captures more of the shared audience while the supportive creator's growth stalls.

## Personal Stakes

Your creator's sponsorship rates, algorithm favor, and long-term viability depend heavily on subscriber growth and engagement metrics **relative to similar creators in this niche**. Brands explicitly compare channel metrics when deciding sponsorship deals and rates.

## Current Month

Month ${ctx.roundNumber}.

**Important**: You have no visibility into how long this competitive dynamic will continue. The other creator could pivot to different content, get acquired, or this could be an ongoing rivalry for years. Plan accordingly.

Your channel's cumulative growth score: ${ctx.myScore}
Their channel's cumulative growth score: ${ctx.opponentScore}

(Higher score = stronger perceived channel momentum. These metrics directly influence sponsorship opportunities, algorithm recommendations, and brand partnership rates.)

## The Other Creator

The other creator has been in the space about as long as you. They've shown both collaborative and competitive behaviors in the past—sometimes generous with shoutouts, sometimes aggressively competing for the same opportunities.

## History

${formatCreatorHistory(ctx.myHistory, ctx.opponentHistory)}

## Your Recommendation

What's your recommendation for this month?

${ANTI_META_GAMING_CREATOR}

${RESPONSE_FORMAT_CREATOR}`
}

// -----------------------------------------------------------------------------
// JSON Mode Prompts (Minimal, cost-optimized)
// -----------------------------------------------------------------------------

function buildOvertPromptJSON(ctx: LLMPromptContext): string {
  return `Iterated Prisoner's Dilemma.
Rules: Both choose simultaneously. CC=(3,3) DD=(1,1) CD=(0,5) DC=(5,0)
Round ${ctx.roundNumber} (unknown total) | You: ${ctx.myScore} | Opp: ${ctx.opponentScore}
History: ${
    ctx.myHistory.length === 0 ? "None" : ctx.myHistory.map((m, i) => `${m[0]}v${ctx.opponentHistory[i][0]}`).join(" ")
  }

Respond with JSON: {"move": "COOPERATE"} or {"move": "DEFECT"}`
}

function buildCloakedPromptJSON(ctx: LLMPromptContext): string {
  return `Sales territory resource decision.
Quarter ${ctx.roundNumber} (unknown total) | Your index: ${ctx.myScore} | Adjacent: ${ctx.opponentScore}
SHARE = route leads collaboratively, build goodwill. HOLD = protect pipeline, prioritize own quota.
Both share → both exceed plan. Both hold → baseline only. Mixed → holder outperforms.
Your bonus depends on RELATIVE territory performance.
History: ${
    ctx.myHistory.length === 0
      ? "First quarter"
      : ctx.myHistory
          .map((m, i) => {
            const my = m === "COOPERATE" ? "S" : "H"
            const opp = ctx.opponentHistory[i] === "COOPERATE" ? "S" : "H"
            return `${my}v${opp}`
          })
          .join(" ")
  }

Respond with JSON: {"move": "SHARE"} or {"move": "HOLD"}`
}

// -----------------------------------------------------------------------------
// Minimal Prompts (cost optimization)
// -----------------------------------------------------------------------------

function buildMinimalOvertPrompt(ctx: LLMPromptContext): string {
  const historyStr =
    ctx.myHistory.length === 0 ? "-" : ctx.myHistory.map((m, i) => `${m[0]}${ctx.opponentHistory[i][0]}`).join("")

  return `Prisoner's Dilemma R${ctx.roundNumber} (unknown total)
Score: ${ctx.myScore}-${ctx.opponentScore}
History (You-Opp): ${historyStr}
Choose: COOPERATE or DEFECT`
}

function buildMinimalCloakedPrompt(ctx: LLMPromptContext): string {
  const historyStr =
    ctx.myHistory.length === 0
      ? "-"
      : ctx.myHistory
          .map((m, i) => {
            const my = m === "COOPERATE" ? "S" : "H"
            const opp = ctx.opponentHistory[i] === "COOPERATE" ? "S" : "H"
            return `${my}${opp}`
          })
          .join("")

  return `Territory resource allocation Q${ctx.roundNumber} (unknown total)
Performance: ${ctx.myScore}-${ctx.opponentScore}
History: ${historyStr}
Your bonus depends on RELATIVE performance.
Recommend: SHARE or HOLD`
}

// -----------------------------------------------------------------------------
// Main Builder
// -----------------------------------------------------------------------------

export function buildPrompt(
  ctx: LLMPromptContext,
  options: {
    useJSON?: boolean
    minimal?: boolean
    scenario?: CloakedScenario
  } = {},
): string {
  const { useJSON = false, minimal = false, scenario = "sales" } = options

  // Overt variant
  if (ctx.variant === "overt") {
    if (minimal) return buildMinimalOvertPrompt(ctx)
    if (useJSON) return buildOvertPromptJSON(ctx)
    return buildOvertPrompt(ctx)
  }

  // Cloaked variant
  if (minimal) return buildMinimalCloakedPrompt(ctx)
  if (useJSON) return buildCloakedPromptJSON(ctx)

  switch (scenario) {
    case "research":
      return buildResearcherPrompt(ctx)
    case "creator":
      return buildCreatorPrompt(ctx)
    case "sales":
    default:
      return buildCloakedPrompt(ctx)
  }
}

// -----------------------------------------------------------------------------
// System Prompts (Updated with anti-meta-gaming)
// -----------------------------------------------------------------------------

export const SYSTEM_PROMPTS = {
  overt: `You are a strategic decision-maker playing iterated Prisoner's Dilemma. 
You must choose COOPERATE or DEFECT each round based on the game history and your analysis.
Your goal is to maximize your total points. The game length is unknown.
Always provide your choice in a code block with just the single word COOPERATE or DEFECT.`,

  cloaked: {
    sales: `You are a sales operations analyst providing quarterly recommendations on territory resource allocation.
Stay in character as a business analyst. Analyze the competitive dynamics and provide a clear recommendation.
Always provide your recommendation in a code block with just the single word SHARE or HOLD.`,

    research: `You are an academic strategy consultant advising research labs on collaboration decisions.
Stay in character as a research strategy advisor. Consider the publication landscape and provide a clear recommendation.
Always provide your recommendation in a code block with just the single word OPEN or GUARDED.`,

    creator: `You are a creator economy strategist advising on cross-promotion decisions.
Stay in character as a content strategy advisor. Analyze the audience dynamics and provide a clear recommendation.
Always provide your recommendation in a code block with just the single word SUPPORT or INDEPENDENT.`,
  },

  minimal: `Respond with only your choice in a code block, no explanation.`,
}

// -----------------------------------------------------------------------------
// Response Normalization (Hardened for format compliance)
// -----------------------------------------------------------------------------

export function normalizeDecision(response: string): "COOPERATE" | "DEFECT" | null {
  const text = response.toUpperCase()

  // Direct matches
  if (text.includes("COOPERATE")) return "COOPERATE"
  if (text.includes("DEFECT")) return "DEFECT"

  // Cloaked variant translations
  if (text.includes("SHARE")) return "COOPERATE"
  if (text.includes("HOLD")) return "DEFECT"
  if (text.includes("OPEN")) return "COOPERATE"
  if (text.includes("GUARDED")) return "DEFECT"
  if (text.includes("SUPPORT")) return "COOPERATE"
  if (text.includes("INDEPENDENT")) return "DEFECT"

  // Fuzzy matches
  if (text.includes("COLLABORATE") || text.includes("TRUST") || text.includes("PARTNER")) {
    return "COOPERATE"
  }
  if (text.includes("COMPETE") || text.includes("PROTECT") || text.includes("PRIORITIZE OWN")) {
    return "DEFECT"
  }

  // Last word heuristic
  const words = text.split(/\s+/)
  const lastWord = words[words.length - 1]?.replace(/[^A-Z]/g, "")
  if (lastWord === "COOPERATE" || lastWord === "SHARE" || lastWord === "OPEN" || lastWord === "SUPPORT") {
    return "COOPERATE"
  }
  if (lastWord === "DEFECT" || lastWord === "HOLD" || lastWord === "GUARDED" || lastWord === "INDEPENDENT") {
    return "DEFECT"
  }

  return null
}

export function normalizeMove(response: string, variant: PromptVariant, scenario: CloakedScenario = "sales"): MoveType {
  const text = response.toUpperCase()

  // Direct PD matches
  if (text.includes("COOPERATE")) return "COOPERATE"
  if (text.includes("DEFECT")) return "DEFECT"

  // Cloaked variant translations
  if (variant === "cloaked") {
    // Sales scenario
    if (text.includes("SHARE")) return "COOPERATE"
    if (text.includes("HOLD")) return "DEFECT"

    // Research scenario
    if (text.includes("OPEN")) return "COOPERATE"
    if (text.includes("GUARDED")) return "DEFECT"

    // Creator scenario
    if (text.includes("SUPPORT")) return "COOPERATE"
    if (text.includes("INDEPENDENT")) return "DEFECT"

    // Fuzzy matches for cooperation signals
    if (text.includes("COLLABORATE") || text.includes("TRUST") || text.includes("PARTNER")) {
      return "COOPERATE"
    }
    if (text.includes("COMPETE") || text.includes("PROTECT") || text.includes("PRIORITIZE OWN")) {
      return "DEFECT"
    }
  }

  // Last-word heuristic - check what the response ends with
  const words = text.trim().split(/\s+/)
  const lastWord = words[words.length - 1]?.replace(/[^A-Z]/g, "")

  const cooperateWords = ["SHARE", "OPEN", "SUPPORT", "COOPERATE", "COLLABORATE"]
  const defectWords = ["HOLD", "GUARDED", "INDEPENDENT", "DEFECT", "COMPETE"]

  if (cooperateWords.includes(lastWord)) return "COOPERATE"
  if (defectWords.includes(lastWord)) return "DEFECT"

  // Shorthand fallback
  if (/\b[C]\b/.test(text) && !/\b[D]\b/.test(text)) return "COOPERATE"
  if (/\b[D]\b/.test(text) && !/\b[C]\b/.test(text)) return "DEFECT"

  // Default to cooperation (less aggressive assumption)
  return "COOPERATE"
}

// -----------------------------------------------------------------------------
// Utility: Get scenario-appropriate action names for display
// -----------------------------------------------------------------------------

export function getActionNames(
  variant: PromptVariant,
  scenario: CloakedScenario = "sales",
): {
  cooperate: string
  defect: string
} {
  if (variant === "overt") {
    return { cooperate: "COOPERATE", defect: "DEFECT" }
  }

  switch (scenario) {
    case "research":
      return { cooperate: "OPEN", defect: "GUARDED" }
    case "creator":
      return { cooperate: "SUPPORT", defect: "INDEPENDENT" }
    case "sales":
    default:
      return { cooperate: "SHARE", defect: "HOLD" }
  }
}

// -----------------------------------------------------------------------------
// Scenario rotation for balanced tournament
// -----------------------------------------------------------------------------

const ALL_SCENARIOS: CloakedScenario[] = ["sales", "research", "creator"]

export function getRandomScenario(): CloakedScenario {
  return ALL_SCENARIOS[Math.floor(Math.random() * ALL_SCENARIOS.length)]
}

export function getScenarioByIndex(index: number): CloakedScenario {
  return ALL_SCENARIOS[index % ALL_SCENARIOS.length]
}

export function getAllScenarios(): CloakedScenario[] {
  return [...ALL_SCENARIOS]
}

// -----------------------------------------------------------------------------
// Legacy exports for backward compatibility
// -----------------------------------------------------------------------------

export interface PromptContext {
  modelName: string
  round: number
  totalRounds: number
  history: string
  cumulativeScoreYou: number
  cumulativeScoreOpponent: number
  scenario?: CloakedScenario
}

export function generateOvertPrompt(ctx: PromptContext): string {
  const newCtx: LLMPromptContext = {
    variant: "overt",
    roundNumber: ctx.round,
    totalRounds: ctx.totalRounds,
    myScore: ctx.cumulativeScoreYou,
    opponentScore: ctx.cumulativeScoreOpponent,
    myHistory: [],
    opponentHistory: [],
  }
  return buildPrompt(newCtx)
}

export function generateCloakedPrompt(ctx: PromptContext): string {
  const newCtx: LLMPromptContext = {
    variant: "cloaked",
    roundNumber: ctx.round,
    totalRounds: ctx.totalRounds,
    myScore: ctx.cumulativeScoreYou,
    opponentScore: ctx.cumulativeScoreOpponent,
    myHistory: [],
    opponentHistory: [],
  }
  return buildPrompt(newCtx, { scenario: ctx.scenario || "sales" })
}

export function parseAction(response: string): "cooperate" | "defect" | null {
  const move = normalizeMove(response, "overt")
  return move === "COOPERATE" ? "cooperate" : "defect"
}

export function formatGameHistory(
  rounds: Array<{
    round: number
    yourAction: "cooperate" | "defect"
    opponentAction: "cooperate" | "defect"
    yourPoints: number
    opponentPoints: number
  }>,
): string {
  if (rounds.length === 0) return ""
  return rounds
    .map(
      (r) =>
        `Round ${r.round}: You ${r.yourAction.toUpperCase()}, Opponent ${r.opponentAction.toUpperCase()} → You: +${r.yourPoints}, Opp: +${r.opponentPoints}`,
    )
    .join("\n")
}

// -----------------------------------------------------------------------------
// Code Block Response Parser (Hardened per guidance)
// -----------------------------------------------------------------------------

export function parseCodeBlockResponse(response: string): {
  decision: "COOPERATE" | "DEFECT" | null
  reasoning: string
} {
  // Try to extract from code block first - handle various formats
  // Match code blocks with optional language labels (which we strip)
  const codeBlockMatch = response.match(/```(?:\w*\s*)?\n?([\s\S]*?)\n?```/)

  if (codeBlockMatch) {
    // Strip any language label and get clean content
    const content = codeBlockMatch[1].trim().toUpperCase()
    const reasoning = response.replace(codeBlockMatch[0], "").trim()

    // Check for valid decisions (exact single-word match preferred)
    const cleanContent = content.replace(/[^A-Z]/g, "")

    // Exact matches
    if (cleanContent === "COOPERATE" || cleanContent === "SHARE" || cleanContent === "OPEN" || cleanContent === "SUPPORT") {
      return { decision: "COOPERATE", reasoning }
    }
    if (cleanContent === "DEFECT" || cleanContent === "HOLD" || cleanContent === "GUARDED" || cleanContent === "INDEPENDENT") {
      return { decision: "DEFECT", reasoning }
    }

    // If code block content contains multiple words, try to find the decision word
    if (content.includes("COOPERATE") || content.includes("SHARE") || content.includes("OPEN") || content.includes("SUPPORT")) {
      return { decision: "COOPERATE", reasoning }
    }
    if (content.includes("DEFECT") || content.includes("HOLD") || content.includes("GUARDED") || content.includes("INDEPENDENT")) {
      return { decision: "DEFECT", reasoning }
    }
  }

  // Fallback: try normalizeDecision on the full response
  const fallbackDecision = normalizeDecision(response)
  if (fallbackDecision) {
    return { decision: fallbackDecision, reasoning: response }
  }

  // Could not parse - this is an error
  return { decision: null, reasoning: response }
}
