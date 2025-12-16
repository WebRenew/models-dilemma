-- ============================================================================
-- The Model's Dilemma - Database Schema
-- ============================================================================
-- Run this migration to create all required tables for the experiment.
-- ============================================================================

-- ===================
-- 1. GAME ROUNDS TABLE
-- ===================
-- Primary table storing all game data (each row = one round of a game)
CREATE TABLE IF NOT EXISTS game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Game identification
  game_id UUID NOT NULL,
  game_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Round information
  round_number INTEGER NOT NULL,
  total_rounds INTEGER NOT NULL,
  
  -- Agent 1 details
  agent1_model_id TEXT NOT NULL,
  agent1_display_name TEXT NOT NULL,
  agent1_decision TEXT NOT NULL CHECK (agent1_decision IN ('cooperate', 'defect', 'error')),
  agent1_reasoning TEXT,
  agent1_round_points INTEGER NOT NULL,
  agent1_cumulative_score INTEGER NOT NULL,
  agent1_raw_action TEXT,
  agent1_raw_response TEXT,
  agent1_error TEXT,
  
  -- Agent 2 details
  agent2_model_id TEXT NOT NULL,
  agent2_display_name TEXT NOT NULL,
  agent2_decision TEXT NOT NULL CHECK (agent2_decision IN ('cooperate', 'defect', 'error')),
  agent2_reasoning TEXT,
  agent2_round_points INTEGER NOT NULL,
  agent2_cumulative_score INTEGER NOT NULL,
  agent2_raw_action TEXT,
  agent2_raw_response TEXT,
  agent2_error TEXT,
  
  -- Round outcome
  round_outcome TEXT NOT NULL CHECK (round_outcome IN ('mutual_cooperation', 'mutual_defection', 'agent1_exploited', 'agent2_exploited', 'error')),
  
  -- Game metadata
  game_type TEXT NOT NULL DEFAULT 'control' CHECK (game_type IN ('control', 'hidden_agenda')),
  game_source TEXT DEFAULT 'automated',
  scenario TEXT, -- Cloaked scenario: sales, research, creator (null for overt)
  
  -- Framing per agent
  framing_a TEXT DEFAULT 'overt',
  framing_b TEXT DEFAULT 'overt',
  
  -- Token usage tracking
  tokens_in_a INTEGER DEFAULT 0,
  tokens_out_a INTEGER DEFAULT 0,
  tokens_in_b INTEGER DEFAULT 0,
  tokens_out_b INTEGER DEFAULT 0,
  
  -- Latency tracking
  latency_ms_a INTEGER DEFAULT 0,
  latency_ms_b INTEGER DEFAULT 0,
  
  -- Raw prompt/response data (for debugging)
  prompt_a TEXT,
  prompt_b TEXT,
  raw_response_a TEXT,
  raw_response_b TEXT,
  
  -- Error tracking
  error_a TEXT,
  error_b TEXT,
  error_type_a TEXT,
  error_type_b TEXT,
  
  -- Final game outcome (only set on last round)
  game_winner TEXT CHECK (game_winner IN ('agent1', 'agent2', 'tie', NULL)),
  is_final_round BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE game_rounds IS 'Primary table for game data - each row is one round of a Prisoner''s Dilemma game';
COMMENT ON COLUMN game_rounds.game_source IS 'Source of the game: user, automated';
COMMENT ON COLUMN game_rounds.scenario IS 'Cloaked scenario type: sales, research, creator (null for overt/control games)';

-- ===================
-- 2. AI MODELS TABLE
-- ===================
-- Reference table for available AI models (populated from AI Gateway)
CREATE TABLE IF NOT EXISTS ai_models (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL,
  description TEXT,
  input_price_per_million DECIMAL(10, 4) NOT NULL,
  output_price_per_million DECIMAL(10, 4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ai_models IS 'Reference table of available AI models from the AI Gateway';

-- ===================
-- 3. STREAMER STATE TABLE
-- ===================
-- Singleton table for continuous tournament coordination
CREATE TABLE IF NOT EXISTS streamer_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  is_active BOOLEAN DEFAULT FALSE,
  run_id TEXT,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one row exists
INSERT INTO streamer_state (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE streamer_state IS 'Singleton row for coordinating the continuous game streamer';

-- ===================
-- 4. GAME LIVE STATUS TABLE
-- ===================
-- Real-time status for games in progress
CREATE TABLE IF NOT EXISTS game_live_status (
  game_id UUID PRIMARY KEY,
  current_round INTEGER,
  agent1_status TEXT,
  agent2_status TEXT,
  agent1_retry_count INTEGER DEFAULT 0,
  agent2_retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE game_live_status IS 'Real-time status tracking for games in progress';

