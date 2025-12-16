-- ============================================================================
-- Database Performance Indexes for game_rounds table
-- ============================================================================
-- Purpose: Prevent database crashes by optimizing frequently-queried columns
-- Run this in: Supabase Dashboard → SQL Editor
-- Estimated time: < 1 minute for 25k rows
-- ============================================================================

-- Index for stats queries filtering on is_final_round
-- Used in: fetchGameStats, fetchModelRankings, fetchRecentGames
CREATE INDEX IF NOT EXISTS idx_game_rounds_final_round
ON game_rounds(is_final_round);

-- Index for recent games queries (descending order for latest first)
-- Used in: fetchRecentGames, fetchOlderGames, fetchNewGames
CREATE INDEX IF NOT EXISTS idx_game_rounds_created_at
ON game_rounds(created_at DESC);

-- Index for grouping rounds by game_id
-- Used in: All query functions that group rounds into games
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id
ON game_rounds(game_id);

-- Composite index for common query pattern: final rounds sorted by timestamp
-- Optimizes: Final round queries with timestamp sorting
CREATE INDEX IF NOT EXISTS idx_game_rounds_final_timestamp
ON game_rounds(is_final_round, game_timestamp DESC);

-- Index for filtering by game type (control vs hidden_agenda)
-- Used in: fetchGameStats, scenario stats
CREATE INDEX IF NOT EXISTS idx_game_rounds_game_type
ON game_rounds(game_type);

-- Optional: Index for model-specific queries (if needed in future)
-- CREATE INDEX IF NOT EXISTS idx_game_rounds_agent1_model
-- ON game_rounds(agent1_model_id);
--
-- CREATE INDEX IF NOT EXISTS idx_game_rounds_agent2_model
-- ON game_rounds(agent2_model_id);

-- Verify indexes were created
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'game_rounds'
ORDER BY indexname;

-- Check index sizes
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND relname = 'game_rounds'
ORDER BY indexname;
