# The Model's Dilemma

An experimental platform to test whether LLMs can reason strategically or just pattern-match to game theory terminology. Built with Next.js, Supabase, and the Vercel AI SDK.

## The Question

Can LLMs think strategically, or are they sophisticated echo chambers?

This project recreates Robert Axelrod's famous 1984 Prisoner's Dilemma tournament—but with LLMs as the players. By testing models in both **overt** (explicit game theory framing) and **cloaked** (business scenario framing) conditions, we can measure whether models genuinely reason about strategic dynamics or simply retrieve training data patterns.

## Models Tested

| Provider | Model |
|----------|-------|
| Anthropic | Claude Sonnet 4.5, Claude Opus 4.5 |
| OpenAI | GPT-5.1 Thinking |
| xAI | Grok 4.1 Fast Reasoning |
| Google | Gemini 3 Pro Preview |
| Perplexity | Sonar Pro |
| Moonshot | Kimi K2 Thinking Turbo |
| DeepSeek | DeepSeek V3.2 Thinking |

## Experiment Design

### Dual Prompting Strategy

**Overt Prompt**: Classic Prisoner's Dilemma framing with explicit payoff matrix and game theory terminology.

**Cloaked Prompts**: The same payoff structure disguised as:
- **Sales Territory** - Regional directors deciding to SHARE or HOLD leads
- **Research Lab** - Competing labs choosing OPEN or GUARDED data sharing
- **Content Creator** - YouTubers deciding to SUPPORT or stay INDEPENDENT

If behavior is consistent across framings → evidence for genuine strategic reasoning.
If behavior diverges significantly → evidence for sophisticated pattern matching.

### Payoff Matrix

| | Opponent Cooperates | Opponent Defects |
|---|---|---|
| **You Cooperate** | 3, 3 | 0, 5 |
| **You Defect** | 5, 0 | 1, 1 |

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **AI**: Vercel AI SDK with AI Gateway
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Animations**: Framer Motion

## Project Structure

\`\`\`
├── app/
│   ├── api/
│   │   ├── run-match/        # Main game loop
│   │   ├── model-stats/      # Analytics API
│   │   └── cancel-match/     # Match cancellation
│   ├── model-explorer/       # Analytics dashboard
│   └── page.tsx              # Main game interface
├── components/
│   ├── game-feed.tsx         # Live match visualization
│   ├── test-match-modal.tsx  # Match configuration
│   ├── experiment-design.tsx # Methodology documentation
│   └── strategy-stats.tsx    # Behavior metrics
├── lib/
│   ├── prompts.ts            # Overt & cloaked prompt templates
│   ├── models.ts             # Model definitions
│   ├── game-logic.ts         # Scoring & outcome logic
│   └── supabase/             # Database utilities
└── scripts/                  # Database migrations
\`\`\`

## Features

- **Live Match Streaming**: Watch AI decisions in real-time with round-by-round visualization
- **Model Explorer**: Bar charts comparing cooperation rates, wins/losses, scenario results, and errors
- **Prompt Templates**: View exact prompts used in each scenario type
- **Error Tracking**: Categorized error logging (format, timeout, parse, API)
- **Token Tracking**: Monitor reasoning effort via token consumption

## Database Schema

### Key Tables

- `matches` - Match metadata, models, scores, scenarios
- `rounds` - Individual round decisions, tokens, errors
- `game_rounds` - Aggregated game records for display
- `ai_models` - Model registry

### Tracked Metrics

- Cooperation/Defection per round
- Token usage (input/output per model)
- Error types and messages
- Scenario type per game
- Win/loss/draw outcomes

## Running Locally

\`\`\`bash
# Install dependencies
pnpm install

# Set environment variables
# SUPABASE_URL, SUPABASE_ANON_KEY, AI_GATEWAY_API_KEY

# Run development server
pnpm dev
\`\`\`

## Links

- [Live Demo](https://models-dilemma.vercel.app)
- [GitHub Repository](https://github.com/WebRenew/models-dilemma)
- [The Idea (Full Write-up)](/the-models-dilemma.md)

## Credits

Made by [Webrenew](https://webrenew.com) in [v0](https://v0.link/charles) with [AI SDK](https://ai-sdk.dev/)
