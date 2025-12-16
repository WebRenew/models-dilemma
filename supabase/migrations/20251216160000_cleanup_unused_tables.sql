-- ============================================================================
-- CLEANUP: Remove unused tournament tables and fix security issues
-- ============================================================================

-- Drop unused views first (they depend on tables)
DROP VIEW IF EXISTS model_rankings;
DROP VIEW IF EXISTS game_summaries;

-- Drop unused indexes
DROP INDEX IF EXISTS idx_ai_models_provider;
DROP INDEX IF EXISTS idx_ai_models_model_id;
DROP INDEX IF EXISTS idx_game_rounds_scenario;

-- Drop unused tables (order matters due to foreign keys)
DROP TABLE IF EXISTS strategy_metrics;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS matches;
DROP TABLE IF EXISTS tournaments;

-- ============================================================================
-- FIX SECURITY: Enable RLS on remaining tables with permissive public access
-- ============================================================================

-- ai_models: read-only public access
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_ai_models" ON ai_models FOR SELECT USING (true);

-- game_live_status: full public access (needed for live game updates)
ALTER TABLE game_live_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_all_game_live_status" ON game_live_status FOR ALL USING (true) WITH CHECK (true);

