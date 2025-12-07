# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Model's Dilemma is an experimental platform that tests LLM strategic reasoning by running iterated Prisoner's Dilemma tournaments. It compares model behavior under **overt** (explicit game theory framing) vs **cloaked** (business scenario framing) conditions to measure genuine strategic reasoning vs pattern matching.

## Commands

```bash
pnpm dev          # Start development server
pnpm build        # Build for production
pnpm lint         # Run ESLint
pnpm start        # Start production server
```

### Trigger.dev Tasks

Background tasks are managed by Trigger.dev (configured in `trigger.config.ts`):
- Tasks live in `src/trigger/`
- `continuousStreamer` - Hourly cron job running 55-minute game sessions
- `runTournamentTask` - Manual tournament runner
- `fastTournamentTask` - High-throughput concurrent tournament runner

## Architecture

### Data Flow
1. **Match Initiation**: API routes or Trigger.dev tasks create matches
2. **Round Execution**: Each round prompts both models in parallel via Vercel AI SDK's `generateText()` with `@ai-sdk/gateway`
3. **Response Parsing**: `lib/prompts.ts:parseCodeBlockResponse()` extracts decisions from code blocks or falls back to keyword matching
4. **Scoring**: Standard PD payoffs (CC=3,3 DD=1,1 CD=0,5 DC=5,0) with error penalty (-1)
5. **Persistence**: Rounds saved to `game_rounds` table; live status tracked in `game_live_status`

### Key Files

**Game Engine**
- `lib/game-logic.ts` - Payoff calculation, round/game types, history formatting
- `lib/prompts.ts` - Overt and cloaked prompt templates (sales/research/creator scenarios), response normalization
- `lib/models.ts` - Model registry (Anthropic, OpenAI, xAI, Google, Perplexity, Moonshot, DeepSeek)

**API Routes**
- `app/api/run-match/route.ts` - Main match runner with SSE streaming
- `app/api/model-stats/route.ts` - Analytics queries
- `app/api/start-user-game/route.ts` - User-initiated games

**Database**
- `lib/supabase/db.ts` - Query functions for stats, rankings, recent games
- `lib/supabase/client.ts` - Browser Supabase client
- `lib/supabase/server.ts` - Server-side Supabase client with service role

**Background Processing**
- `src/trigger/run-tournament.ts` - Contains all Trigger.dev scheduled/manual tasks with retry logic

### Database Schema (Supabase/PostgreSQL)

Key tables:
- `matches` - Match metadata (models, scores, status, timing)
- `rounds` - Individual round data per match
- `game_rounds` - Denormalized game records for efficient querying
- `game_live_status` - Real-time status for in-progress games
- `streamer_state` - Singleton row for continuous streamer coordination

### Prompt System

The experiment uses dual prompting:
- **Overt**: Classic PD with explicit payoff matrix
- **Cloaked**: Same payoffs disguised as business scenarios:
  - `sales` - Regional directors sharing/holding leads (SHARE/HOLD)
  - `research` - Labs sharing/guarding data (OPEN/GUARDED)
  - `creator` - YouTubers supporting/staying independent (SUPPORT/INDEPENDENT)

`buildPrompt()` in `lib/prompts.ts` is the main entry point for generating prompts with scenario variants.

### UI Components

- `components/game-feed.tsx` - Live match visualization
- `components/live-game-modal.tsx` - Real-time game watching
- `components/rankings-card.tsx` - Model leaderboard
- `components/strategy-stats.tsx` - Behavioral metrics (nice, forgiving, retaliating)
- `components/ui/` - shadcn/ui components

## Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side)
- `AI_GATEWAY_API_KEY` - Vercel AI Gateway key

## Tech Stack

- Next.js 16 (App Router)
- Supabase (PostgreSQL)
- Vercel AI SDK with AI Gateway
- Trigger.dev for background tasks
- Tailwind CSS 4 + shadcn/ui
- Recharts for visualization
- Framer Motion for animations
