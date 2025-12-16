-- Consolidate duplicate RLS policies to improve query performance
-- This migration replaces multiple overlapping policies with clean, single policies

-- Drop duplicate/redundant RLS policies on game_rounds
DROP POLICY IF EXISTS "Allow anonymous read access" ON game_rounds;
DROP POLICY IF EXISTS "Allow public read" ON game_rounds;
DROP POLICY IF EXISTS "Allow public read access" ON game_rounds;
DROP POLICY IF EXISTS "Allow public insert access" ON game_rounds;
DROP POLICY IF EXISTS "Allow service role full access" ON game_rounds;

-- Recreate consolidated policies for game_rounds
CREATE POLICY "public_read_game_rounds" ON game_rounds 
  FOR SELECT USING (true);

CREATE POLICY "public_insert_game_rounds" ON game_rounds 
  FOR INSERT WITH CHECK (true);

-- Similar cleanup for matches table
DROP POLICY IF EXISTS "Allow anonymous read access" ON matches;
DROP POLICY IF EXISTS "Allow service role full access" ON matches;

CREATE POLICY "public_read_matches" ON matches 
  FOR SELECT USING (true);

-- Similar cleanup for rounds table  
DROP POLICY IF EXISTS "Allow anonymous read access" ON rounds;
DROP POLICY IF EXISTS "Allow service role full access" ON rounds;

CREATE POLICY "public_read_rounds" ON rounds 
  FOR SELECT USING (true);

-- Cleanup streamer_state policies
DROP POLICY IF EXISTS "Allow all writes" ON streamer_state;
DROP POLICY IF EXISTS "Allow public read" ON streamer_state;
DROP POLICY IF EXISTS "Allow all updates" ON streamer_state;
DROP POLICY IF EXISTS "Allow service role full access" ON streamer_state;

CREATE POLICY "public_all_streamer_state" ON streamer_state 
  FOR ALL USING (true) WITH CHECK (true);

