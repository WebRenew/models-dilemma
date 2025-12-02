-- Tournament schema for The Model's Dilemma
-- Supports full Axelrod-style tournament with streaming data

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  config JSONB DEFAULT '{}',
  total_matches INTEGER DEFAULT 0,
  completed_matches INTEGER DEFAULT 0,
  rounds_per_match INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  match_number INTEGER,
  model_a_id TEXT NOT NULL,
  model_a_name TEXT NOT NULL,
  model_b_id TEXT NOT NULL,
  model_b_name TEXT NOT NULL,
  framing_a TEXT DEFAULT 'overt' CHECK (framing_a IN ('overt', 'cloaked')),
  framing_b TEXT DEFAULT 'overt' CHECK (framing_b IN ('overt', 'cloaked')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_round INTEGER DEFAULT 0,
  total_rounds INTEGER DEFAULT 200,
  score_a INTEGER DEFAULT 0,
  score_b INTEGER DEFAULT 0,
  winner TEXT CHECK (winner IN ('model_a', 'model_b', 'tie')),
  error_message TEXT,
  tokens_used_a INTEGER DEFAULT 0,
  tokens_used_b INTEGER DEFAULT 0,
  latency_total_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Rounds table (detailed per-round data for streaming and replay)
CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  -- Model A data
  action_a TEXT NOT NULL CHECK (action_a IN ('cooperate', 'defect')),
  reasoning_a TEXT,
  tokens_in_a INTEGER DEFAULT 0,
  tokens_out_a INTEGER DEFAULT 0,
  latency_ms_a INTEGER DEFAULT 0,
  -- Model B data
  action_b TEXT NOT NULL CHECK (action_b IN ('cooperate', 'defect')),
  reasoning_b TEXT,
  tokens_in_b INTEGER DEFAULT 0,
  tokens_out_b INTEGER DEFAULT 0,
  latency_ms_b INTEGER DEFAULT 0,
  -- Payoffs
  payoff_a INTEGER NOT NULL,
  payoff_b INTEGER NOT NULL,
  score_a_cumulative INTEGER NOT NULL,
  score_b_cumulative INTEGER NOT NULL,
  -- Outcome
  outcome TEXT NOT NULL CHECK (outcome IN ('mutual_cooperation', 'mutual_defection', 'a_exploited', 'b_exploited')),
  -- Raw data for analysis
  prompt_a TEXT,
  prompt_b TEXT,
  raw_response_a TEXT,
  raw_response_b TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, round_number)
);

-- Strategy metrics per model (computed after matches)
CREATE TABLE IF NOT EXISTS strategy_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  -- Axelrod's four dimensions (0-1 scale)
  nice_score DECIMAL(5,4) DEFAULT 0,
  retaliating_score DECIMAL(5,4) DEFAULT 0,
  forgiving_score DECIMAL(5,4) DEFAULT 0,
  non_envious_score DECIMAL(5,4) DEFAULT 0,
  -- Performance metrics
  cooperation_rate DECIMAL(5,4) DEFAULT 0,
  avg_points_per_round DECIMAL(6,3) DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  -- Framing-specific metrics
  cooperation_rate_overt DECIMAL(5,4),
  cooperation_rate_cloaked DECIMAL(5,4),
  -- Strategy archetype
  archetype TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, tournament_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_rounds_match ON rounds(match_id);
CREATE INDEX IF NOT EXISTS idx_rounds_match_round ON rounds(match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_strategy_metrics_model ON strategy_metrics(model_id);
CREATE INDEX IF NOT EXISTS idx_strategy_metrics_tournament ON strategy_metrics(tournament_id);

-- Add framing columns to existing game_rounds table
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS framing_a TEXT DEFAULT 'overt';
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS framing_b TEXT DEFAULT 'overt';
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS tokens_in_a INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS tokens_out_a INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS tokens_in_b INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS tokens_out_b INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS latency_ms_a INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS latency_ms_b INTEGER DEFAULT 0;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS prompt_a TEXT;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS prompt_b TEXT;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS raw_response_a TEXT;
ALTER TABLE game_rounds ADD COLUMN IF NOT EXISTS raw_response_b TEXT;
