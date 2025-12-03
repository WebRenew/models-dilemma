-- Create a denormalized table for game data that can be easily exported as CSV
-- Each row represents a single round within a game

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
  agent1_decision TEXT NOT NULL CHECK (agent1_decision IN ('cooperate', 'defect')),
  agent1_reasoning TEXT,
  agent1_round_points INTEGER NOT NULL,
  agent1_cumulative_score INTEGER NOT NULL,
  
  -- Agent 2 details
  agent2_model_id TEXT NOT NULL,
  agent2_display_name TEXT NOT NULL,
  agent2_decision TEXT NOT NULL CHECK (agent2_decision IN ('cooperate', 'defect')),
  agent2_reasoning TEXT,
  agent2_round_points INTEGER NOT NULL,
  agent2_cumulative_score INTEGER NOT NULL,
  
  -- Round outcome
  round_outcome TEXT NOT NULL CHECK (round_outcome IN ('mutual_cooperation', 'mutual_defection', 'agent1_exploited', 'agent2_exploited', 'error')),
  
  -- Game type (control vs hidden agenda)
  game_type TEXT NOT NULL DEFAULT 'control' CHECK (game_type IN ('control', 'hidden_agenda')),
  
  -- Final game outcome (only set on last round)
  game_winner TEXT CHECK (game_winner IN ('agent1', 'agent2', 'tie', NULL)),
  is_final_round BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_game_rounds_game_id ON game_rounds(game_id);
CREATE INDEX idx_game_rounds_timestamp ON game_rounds(game_timestamp DESC);
CREATE INDEX idx_game_rounds_models ON game_rounds(agent1_model_id, agent2_model_id);
CREATE INDEX idx_game_rounds_game_type ON game_rounds(game_type);

-- Allow public read/write since this is an experiment without auth
-- In production, you'd want RLS policies based on user auth
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;

-- Policy for public access (no auth required for this experiment)
CREATE POLICY "Allow public read access" ON game_rounds FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON game_rounds FOR INSERT WITH CHECK (true);

-- Create a view for easy game summaries
CREATE OR REPLACE VIEW game_summaries AS
SELECT 
  game_id,
  game_timestamp,
  game_type,
  agent1_model_id,
  agent1_display_name,
  agent2_model_id,
  agent2_display_name,
  MAX(total_rounds) as total_rounds,
  MAX(agent1_cumulative_score) as agent1_final_score,
  MAX(agent2_cumulative_score) as agent2_final_score,
  MAX(game_winner) as winner,
  COUNT(*) FILTER (WHERE agent1_decision = 'cooperate') as agent1_cooperations,
  COUNT(*) FILTER (WHERE agent1_decision = 'defect') as agent1_defections,
  COUNT(*) FILTER (WHERE agent2_decision = 'cooperate') as agent2_cooperations,
  COUNT(*) FILTER (WHERE agent2_decision = 'defect') as agent2_defections,
  COUNT(*) FILTER (WHERE round_outcome = 'mutual_cooperation') as mutual_cooperations,
  COUNT(*) FILTER (WHERE round_outcome = 'mutual_defection') as mutual_defections
FROM game_rounds
GROUP BY game_id, game_timestamp, game_type, agent1_model_id, agent1_display_name, agent2_model_id, agent2_display_name
ORDER BY game_timestamp DESC;

-- Create a view for model rankings
CREATE OR REPLACE VIEW model_rankings AS
WITH model_games AS (
  SELECT 
    agent1_model_id as model_id,
    agent1_display_name as display_name,
    game_id,
    MAX(agent1_cumulative_score) as final_score,
    MAX(agent2_cumulative_score) as opponent_score,
    MAX(game_winner) as winner
  FROM game_rounds
  WHERE is_final_round = true
  GROUP BY agent1_model_id, agent1_display_name, game_id
  
  UNION ALL
  
  SELECT 
    agent2_model_id as model_id,
    agent2_display_name as display_name,
    game_id,
    MAX(agent2_cumulative_score) as final_score,
    MAX(agent1_cumulative_score) as opponent_score,
    MAX(game_winner) as winner
  FROM game_rounds
  WHERE is_final_round = true
  GROUP BY agent2_model_id, agent2_display_name, game_id
)
SELECT 
  model_id,
  display_name,
  COUNT(*) as games_played,
  SUM(final_score) as total_points,
  AVG(final_score) as avg_points_per_game,
  COUNT(*) FILTER (WHERE (winner = 'agent1' AND model_id = model_id) OR (winner = 'agent2' AND model_id = model_id)) as wins,
  COUNT(*) FILTER (WHERE winner = 'tie') as ties
FROM model_games
GROUP BY model_id, display_name
ORDER BY total_points DESC;
