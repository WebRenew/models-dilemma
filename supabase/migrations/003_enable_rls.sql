-- ============================================================================
-- Row Level Security Policies
-- ============================================================================
-- This is a public experiment - all data is readable, controlled writes.
-- RLS prevents unauthorized modifications while allowing public access.
-- ============================================================================

-- ===================
-- game_rounds
-- ===================
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;

-- Public can read all game data
CREATE POLICY "public_read_game_rounds" ON game_rounds 
  FOR SELECT USING (true);

-- Public can insert new game rounds
CREATE POLICY "public_insert_game_rounds" ON game_rounds 
  FOR INSERT WITH CHECK (true);

-- Only service role can update/delete
CREATE POLICY "service_role_update_game_rounds" ON game_rounds 
  FOR UPDATE USING ((SELECT auth.role()) = 'service_role');

CREATE POLICY "service_role_delete_game_rounds" ON game_rounds 
  FOR DELETE USING ((SELECT auth.role()) = 'service_role');

-- ===================
-- ai_models
-- ===================
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;

-- Public read-only access to model catalog
CREATE POLICY "public_read_ai_models" ON ai_models 
  FOR SELECT USING (true);

-- ===================
-- streamer_state
-- ===================
ALTER TABLE streamer_state ENABLE ROW LEVEL SECURITY;

-- Full public access (needed for streamer coordination)
CREATE POLICY "public_all_streamer_state" ON streamer_state 
  FOR ALL USING (true) WITH CHECK (true);

-- ===================
-- game_live_status
-- ===================
ALTER TABLE game_live_status ENABLE ROW LEVEL SECURITY;

-- Full public access (needed for real-time game updates)
CREATE POLICY "public_all_game_live_status" ON game_live_status 
  FOR ALL USING (true) WITH CHECK (true);

