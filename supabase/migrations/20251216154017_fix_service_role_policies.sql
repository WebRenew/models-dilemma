-- Fix service role policies to not overlap with public policies
-- Using (select auth.role()) instead of auth.role() for performance (RLS initplan fix)

-- game_rounds: public can read and insert, service role can also update/delete
CREATE POLICY "service_role_update_game_rounds" ON game_rounds 
  FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "service_role_delete_game_rounds" ON game_rounds 
  FOR DELETE USING ((select auth.role()) = 'service_role');

-- matches: public can read, service role needs all other operations
CREATE POLICY "service_role_insert_matches" ON matches 
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "service_role_update_matches" ON matches 
  FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "service_role_delete_matches" ON matches 
  FOR DELETE USING ((select auth.role()) = 'service_role');

-- rounds: public can read, service role needs all other operations  
CREATE POLICY "service_role_insert_rounds" ON rounds 
  FOR INSERT WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "service_role_update_rounds" ON rounds 
  FOR UPDATE USING ((select auth.role()) = 'service_role');

CREATE POLICY "service_role_delete_rounds" ON rounds 
  FOR DELETE USING ((select auth.role()) = 'service_role');

