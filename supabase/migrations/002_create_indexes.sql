-- ============================================================================
-- Performance Indexes
-- ============================================================================
-- These indexes optimize the most common query patterns.
-- ============================================================================

-- game_rounds indexes
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id ON game_rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_timestamp ON game_rounds(game_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_game_rounds_models ON game_rounds(agent1_model_id, agent2_model_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_type ON game_rounds(game_type);
CREATE INDEX IF NOT EXISTS idx_game_rounds_final_round ON game_rounds(is_final_round);
CREATE INDEX IF NOT EXISTS idx_game_rounds_created_at ON game_rounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_rounds_final_timestamp ON game_rounds(is_final_round, game_timestamp DESC);

